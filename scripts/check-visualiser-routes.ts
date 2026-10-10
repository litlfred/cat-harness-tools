#!/usr/bin/env bun
/**
 * Every declared visualiser has ONE route, and every visualiser page is drawn
 * inside the route its Tool is declared to render.
 *
 * @module scripts/check-visualiser-routes
 * @covers cat-harness — the `visualisers` of every instance declaration in the
 *   checkout, and the pages under the site directory that name a `rendered-by`
 *
 * ## The rule, in the owner's words (2026-10-09)
 *
 * > I still want the harness to be where specific visualizers/pages are
 * > declared for the harness at the level. And that they are all compliant of
 * > `<base URL>/<harness>/<visualizer>` … Could have multiple visualizers
 * > contending for same url... so not good. Need harness to declare
 * > visualizer is renderedBy ....
 *
 * The route is `visualiserRoute({ harness, visualiser })`
 * (`schemas/visualiser-route.ts`). This gate is what makes a collision a
 * DECLARATION error rather than a page that silently wins.
 *
 * ## The locale goes in front (folio-assistant#2527)
 *
 * Owner, 2026-10-05: *"ALL rendered visualizer pages for the CDN need to
 * follow /<locale>/<declaring>/<kind>/…"*. A page is drawn at
 * `<locale>/<harness>/<visualiser>/` for each published locale
 * (`PUBLISHED_LOCALES`), and the old `<harness>/<visualiser>/` address is
 * where compose-docs writes a forwarding page. So the routes claimed and
 * checked here are the LOCALISED ones; a locale's top-level segment is a claim
 * an alias may not take; and a page still committed at the old address — a
 * site not yet regenerated — is COUNTED and printed (`legacyPages`), never a
 * finding, because the generators that move it run in the site's own
 * repository.
 *
 * | finding | what it means |
 * |---|---|
 * | `route-collision` | two declarations resolve to one route, or one inside another's subtree |
 * | `alias-collision` | an alias (bean `t4xb`) names another alias, a harness, or something the site already carries at its top level |
 * | `unknown-tool` | `renderedBy` names no discovered Tool node |
 * | `kind-not-rendered` | the visualiser covers a kind its Tool does not declare it `renders` |
 * | `outside-route` | a page names a `rendered-by` Tool, and lies under no route that Tool is declared to render |
 * | `foreign-page` | a page under a declared route names a different Tool than the route's `renderedBy` |
 * | `harness-docs-collision` | a harness's own docs already publish something at `<harness>/<visualiser>` |
 * | `page-declares-renders` | a page still carries `renders:` / `<meta name="renders">`, retired 2026-10-09 |
 * | `directory-declares-visualiser` | a declaration still carries `coverage.visualiser` on disk, retired 2026-10-09 |
 *
 * ## Exit codes
 *
 * 0 clean · 1 any finding · 2 could not determine (no declared visualiser at
 * all, or the Tools would not load). 2 is never a pass: a gate that found
 * nothing to check has not checked anything.
 *
 * Usage: bun run cat check:visualiser-routes [--json]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { declarationPathIn, isPublishedGraphTypology } from "@litlfred/cat-harness/schemas/cat-harness.js";
import { PUBLISHED_LOCALES } from "@litlfred/cat-harness/schemas/translation.js";
import { aliasRoute, routeCollisions, routeOf, visualiserRoute, type RouteClaim } from "@litlfred/cat-harness/schemas/visualiser-route.js";
import { discoverTools } from "../tools/discover.js";
import {
  carriesRenders,
  checkoutInstanceRoots,
  declaredVisualisers,
  forwardingParts,
  pageParts,
  renderedByOf,
  siteOwnerDir,
  type DeclaredVisualiser,
} from "./viewer-declarations.js";

export interface RouteFinding {
  kind:
    | "route-collision"
    | "alias-collision"
    | "unknown-tool"
    | "kind-not-rendered"
    | "outside-route"
    | "foreign-page"
    | "harness-docs-collision"
    | "page-declares-renders"
    | "directory-declares-visualiser";
  subject: string;
  detail: string;
}

export interface RouteReport {
  visualisers: number;
  pages: number;
  /**
   * Pages a visualiser's own Tool drew at the OLD, unlocalised address
   * `<harness>/<visualiser>/` (folio-assistant#2527). Not a finding: the site
   * has not been regenerated yet, and compose-docs leaves such a page standing
   * instead of writing its forwarding page there. Repo-relative.
   */
  legacyPages: string[];
  /** The old routes those pages lie under, `<harness>/<visualiser>/`. */
  legacyRoutes: string[];
  findings: RouteFinding[];
  undetermined?: string;
}

const label = (v: DeclaredVisualiser): string => `${v.harness}.visualisers[${v.id}]`;

/** Collisions among declared routes and aliases — pure, so a test can hand it any set. */
export function declarationFindings(
  vis: readonly DeclaredVisualiser[],
  siteTopLevel: readonly string[],
  harnessNames: readonly string[],
): RouteFinding[] {
  const out: RouteFinding[] = [];
  const routes: RouteClaim[] = vis.map((v) => ({ route: visualiserRoute(pageParts({ harness: v.harness, visualiser: v.id })), by: label(v) }));
  for (const c of routeCollisions(routes)) {
    out.push({ kind: "route-collision", subject: c.route, detail: `${c.kind === "same" ? "claimed by" : "nested claims"}: ${c.claimants.join(", ")}` });
  }
  // Aliases share the site's TOP LEVEL with every harness route (where the
  // forwarding pages sit), every published locale (where the pages sit), and
  // every top-level path the site already carries, so all four are claims there.
  const locales: readonly string[] = PUBLISHED_LOCALES;
  const top: RouteClaim[] = [
    ...vis.filter((v) => v.alias !== undefined).map((v) => ({ route: aliasRoute(v.alias!), by: `alias of ${label(v)}` })),
    ...harnessNames.map((h) => ({ route: `${h}/`, by: `harness ${h}` })),
    ...locales.map((l) => ({ route: `${l}/`, by: `locale ${l}` })),
    ...siteTopLevel.filter((s) => !harnessNames.includes(s) && !locales.includes(s)).map((s) => ({ route: `${s}/`, by: `site: ${s}/` })),
  ];
  for (const c of routeCollisions(top)) {
    if (!c.claimants.some((x) => x.startsWith("alias of "))) continue; // only an alias is this gate's to refuse
    out.push({ kind: "alias-collision", subject: c.route, detail: `claimed by: ${c.claimants.join(", ")}` });
  }
  return out;
}

/** Where one page sits relative to the declared routes — see {@link pagePlacement}. */
export type PagePlacement =
  | { kind: "ok" }
  | { kind: "legacy"; route: string }
  | { kind: "outside-route" | "foreign-page"; detail: string };

/**
 * Where a page drawn by Tool `by` sits, given the declared visualisers — pure,
 * so a test can hand it any layout.
 *
 * A page under `<locale>/<harness>/<visualiser>/` for a published locale is
 * placed (`ok`) when that visualiser is rendered by `by`. The same page at the
 * OLD `<harness>/<visualiser>/` is `legacy`: a site not yet regenerated since
 * the locale moved in front (folio-assistant#2527), counted rather than
 * failed. A page that names no Tool, or names one nothing discovered, is not
 * this gate's to place.
 */
export function pagePlacement(
  rel: string,
  by: string | undefined,
  vis: readonly DeclaredVisualiser[],
  toolIds: ReadonlySet<string>,
): PagePlacement {
  if (by === undefined || !toolIds.has(by)) return { kind: "ok" };
  // The FIRST route a page lies under: localised before legacy, because a
  // locale segment is never a harness name (`declarationFindings`).
  const routes = vis.flatMap((v) => [
    ...PUBLISHED_LOCALES.map((locale) => ({ parts: pageParts({ harness: v.harness, visualiser: v.id, locale }), v, legacy: false })),
    { parts: forwardingParts({ harness: v.harness, visualiser: v.id }), v, legacy: true },
  ]);
  const hit = routes.find((r) => routeOf(rel, [r.parts]) !== undefined);
  if (hit === undefined) {
    const allowed = vis.filter((v) => v.renderedBy === by).map((v) => visualiserRoute(pageParts({ harness: v.harness, visualiser: v.id })));
    return {
      kind: "outside-route",
      detail: `drawn by ${by}, outside every route it is declared to render${allowed.length ? ` (${allowed.join(", ")})` : " — it renders no declared visualiser"}`,
    };
  }
  if (hit.v.renderedBy !== by) {
    return { kind: "foreign-page", detail: `drawn by ${by} under ${label(hit.v)}, which is rendered by ${hit.v.renderedBy}` };
  }
  return hit.legacy ? { kind: "legacy", route: visualiserRoute(hit.parts) } : { kind: "ok" };
}

/** Every `.md` / `.html` file under `dir`, `/`-separated and relative to it. */
function pagesUnder(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(dir, prefix));
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules" || name === "_site") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const abs = join(dir, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...pagesUnder(dir, rel));
    else if (/\.(md|html)$/.test(name)) out.push(rel);
  }
  return out;
}

export function checkVisualiserRoutes(repoRoot: string): RouteReport {
  const vis = declaredVisualisers(repoRoot);
  const roots = checkoutInstanceRoots(repoRoot);
  const declOf = (r: string): Record<string, unknown> | undefined => {
    const p = declarationPathIn(r);
    if (p === undefined || !existsSync(p)) return undefined;
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };
  const harnessNames = roots.map((r) => declOf(r)?.name).filter((n): n is string => typeof n === "string");
  if (vis.length === 0) {
    return { visualisers: 0, pages: 0, legacyPages: [], legacyRoutes: [], findings: [], undetermined: "no instance in this checkout declares a visualiser" };
  }

  const site = siteOwnerDir(repoRoot);
  // What the site ALREADY ANSWERS at `<x>/`: a top-level directory serving an
  // index, or the Jekyll namespaces. A directory holding only deeper pages
  // (`todos/<item>/`, the todo node IRIs) leaves `<x>/` itself free, which is
  // exactly where an alias's redirect goes.
  const siteTop = existsSync(site)
    ? readdirSync(site).filter(
        (n) =>
          !n.startsWith(".") &&
          (n.startsWith("_") || n === "assets" || existsSync(join(site, n, "index.html")) || existsSync(join(site, n, "index.md"))),
      )
    : [];
  const findings = declarationFindings(vis, [...new Set(siteTop)], harnessNames);

  // Tools: every `renderedBy` resolves, and covers only what its Tool renders.
  const disc = discoverTools(repoRoot);
  if (disc.tools.length === 0) {
    return { visualisers: vis.length, pages: 0, legacyPages: [], legacyRoutes: [], findings, undetermined: `no Tool loaded (${disc.failures.length} failure(s))` };
  }
  const byId = new Map(disc.tools.map((t) => [t.id, t]));
  for (const v of vis) {
    const t = byId.get(v.renderedBy);
    if (t === undefined) {
      findings.push({ kind: "unknown-tool", subject: label(v), detail: `renderedBy "${v.renderedBy}" names no discovered Tool node` });
      continue;
    }
    const decl = declOf(v.harnessRoot) as { directories?: { id: string; graphTypologies?: string[]; graphs?: string[] }[] } | undefined;
    const renders = new Set(t.renders ?? []);
    // A Tool node is published; it cannot name an unpublished kind without
    // linking to it, so the gate does not ask that of it (`staging-graph-viewer`).
    const owed = (kinds: readonly string[]): string[] => kinds.filter((k) => isPublishedGraphTypology(k));
    // `coversKinds`: every published kind is one the Tool renders.
    const missingKinds = owed(v.coversKinds ?? []).filter((k) => !renders.has(k));
    if (missingKinds.length > 0) {
      findings.push({ kind: "kind-not-rendered", subject: label(v), detail: `covers kind(s) ${missingKinds.join(", ")}, which Tool ${t.id} does not declare it renders` });
    }
    // `covers`: each directory holds at least one kind the Tool renders.
    for (const id of v.covers ?? []) {
      const d = decl?.directories?.find((x) => x.id === id);
      const kinds = owed(d?.graphTypologies ?? d?.graphs ?? []);
      if (kinds.length > 0 && !kinds.some((k) => renders.has(k))) {
        findings.push({ kind: "kind-not-rendered", subject: label(v), detail: `covers ${id} (${kinds.join(", ")}), none of which Tool ${t.id} declares it renders` });
      }
    }
  }

  // A harness's OWN docs are mounted at `/<harness>/` (mount-instance-docs);
  // a visualiser route beneath it must not be a path those docs already hold.
  // Which of its directories is served there is the declaration's: its `docs`
  // directory, and any it marks `instanceRoot`.
  for (const v of vis) {
    const d = declOf(v.harnessRoot) as { directories?: { path?: string; graphTypologies?: string[]; instanceRoot?: boolean }[] } | undefined;
    const served = (d?.directories ?? [])
      .filter((x) => x.path && (x.instanceRoot === true || (x.graphTypologies ?? []).includes("docs")))
      .map((x) => join(v.harnessRoot, x.path!));
    for (const dir of served) {
      if (resolve(siteOwnerDir(repoRoot)) === resolve(dir)) continue;
      for (const p of [join(dir, v.id), `${join(dir, v.id)}.html`, `${join(dir, v.id)}.md`]) {
        if (existsSync(p)) {
          findings.push({ kind: "harness-docs-collision", subject: label(v), detail: `${relative(repoRoot, p).split(sep).join("/")} is also published at /${v.harness}/${v.id}` });
        }
      }
    }
  }

  // Pages: placement, provenance, and the retired page-side declaration. A
  // page belongs under a localised route — one per published locale — or, not
  // yet regenerated, under the old unlocalised one (`legacy`).
  const toolIds = new Set(disc.tools.map((t) => t.id));
  const legacyPages: string[] = [];
  const legacyRoutes = new Set<string>();
  const pages = pagesUnder(site);
  for (const rel of pages) {
    let text: string;
    try {
      text = readFileSync(join(site, rel), "utf-8");
    } catch {
      continue;
    }
    const where = relative(repoRoot, join(site, rel)).split(sep).join("/");
    if (carriesRenders(text)) {
      findings.push({ kind: "page-declares-renders", subject: where, detail: "a page no longer says what it renders; the harness declares it (`visualisers`)" });
    }
    const placed = pagePlacement(rel, renderedByOf(text), vis, toolIds);
    if (placed.kind === "legacy") {
      legacyPages.push(where);
      legacyRoutes.add(placed.route);
    } else if (placed.kind !== "ok") {
      findings.push({ kind: placed.kind, subject: where, detail: placed.detail });
    }
  }

  // The retired directory-side declaration, read raw (the schema still
  // carries the field, because `withViewers` fills it IN MEMORY).
  for (const r of roots) {
    const d = declOf(r) as { name?: string; directories?: { id: string; coverage?: { visualiser?: unknown } }[] } | undefined;
    for (const e of d?.directories ?? []) {
      if (e.coverage?.visualiser !== undefined) {
        findings.push({
          kind: "directory-declares-visualiser",
          subject: `${d?.name ?? relative(repoRoot, r)}/${e.id}`,
          detail: "declare it in the harness's `visualisers` instead (covers / coversKinds, renderedBy)",
        });
      }
    }
  }

  return { visualisers: vis.length, pages: pages.length, legacyPages, legacyRoutes: [...legacyRoutes].sort(), findings };
}

function main(): number {
  const repoRoot = resolve(process.env.CAT_CHECKOUT_ROOT ?? process.cwd());
  const r = checkVisualiserRoutes(repoRoot);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  }
  if (r.undetermined !== undefined) {
    console.error(`check:visualiser-routes: UNDETERMINED — ${r.undetermined}. This is not a pass.`);
    return 2;
  }
  // Counted, never failed: a page at the OLD address is a site not yet
  // regenerated (folio-assistant#2527), and compose-docs keeps it rather than
  // write its forwarding page over it.
  if (r.legacyPages.length > 0 && !process.argv.includes("--json")) {
    console.error(
      `check:visualiser-routes: ${r.legacyPages.length} page(s) still at the old unlocalised address, under ${r.legacyRoutes.length} route(s) ` +
        `(${r.legacyRoutes.join(", ")}) — ` +
        `regenerate them under ${PUBLISHED_LOCALES.map((l) => `${l}/`).join(", ")}; compose-docs leaves them standing until then.`,
    );
  }
  if (r.findings.length === 0) {
    if (!process.argv.includes("--json")) {
      console.log(`check:visualiser-routes: ${r.visualisers} declared visualiser(s), ${r.pages} page(s) — one route each, every page inside its Tool's routes`);
    }
    return 0;
  }
  if (!process.argv.includes("--json")) {
    const byKind = new Map<string, RouteFinding[]>();
    for (const f of r.findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    for (const [k, fs] of byKind) {
      console.error(`\n${k} (${fs.length}):`);
      for (const f of fs) console.error(`  ${f.subject}: ${f.detail}`);
    }
    console.error(`\ncheck:visualiser-routes: ${r.findings.length} finding(s) over ${r.visualisers} declared visualiser(s).`);
  }
  return 1;
}

if (import.meta.main || process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
