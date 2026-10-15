#!/usr/bin/env bun
/**
 * A built site carries a page for every declared visualiser that has something
 * to show, in this checkout: the root instance and every instance it needs.
 *
 * @module scripts/site-coverage
 * @graphNode none — a guard over a built site, run by `build-instance-site.ts`
 *
 * ## The failure this exists for (owner, 2026-10-15)
 *
 * smart-ra's own site was published without `en/cat-harness/library/`
 * although smart-ra has a library: `build-instance-site.ts` never ran the
 * library viewer, and nothing compared the built site with what the
 * declarations say it should hold. The parity guard (`site-parity.ts`) only
 * measures a build against the root it replaces, so a page that was never
 * published is never missed. The owner: *"a harness should combine its
 * library/ (or whatever) sites of it and all its dependencies and use the url
 * path pattern"*, and *"please fix processes so this doesnt fail again"*.
 *
 * ## What is expected
 *
 * For each visualiser `declaredVisualisers` reads in the checkout (which, in a
 * repository's own index, is that repository and its `needs`):
 *   - `<locale>/<harness>/<visualiser>/` when a directory it covers holds
 *     anything;
 *   - with `subgraphs: "instance"`, also `…/<instance>/` for each instance
 *     whose covered directory holds an ENTRY (a sub-directory): a library
 *     whose only file is its `library.json` has no entries to show.
 * A page is there when the route holds `index.html` (the built site) or
 * `index.md` (a Jekyll source).
 *
 * Usage: bun run cat-harness-tools/scripts/site-coverage.ts <site dir> [--root <checkout>] [--staging] [--json]
 * Exit: 0 every expected page is there · 1 a page is missing.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { checkoutDirectories } from "@litlfred/cat-harness/schemas/harness-config.js";
import { visualiserRoute } from "@litlfred/cat-harness/schemas/visualiser-route.js";
import { declaredVisualisers, forwardingParts, pageParts, type DeclaredVisualiser } from "./viewer-declarations.ts";

/** One page the declarations say the site must carry. */
export interface ExpectedPage {
  /** Site-relative directory, `en/<harness>/<visualiser>/[<instance>/]`. */
  route: string;
  harness: string;
  visualiser: string;
  /** The instance sub-graph, for a `subgraphs: "instance"` view. */
  instance?: string;
  /**
   * That instance's root, absolute. A writer run for ONE instance at a time
   * (a Tool with an `instance` input, `visualiser-writers.ts`) writes this
   * page only when it is run for this root, not for the declaring harness's.
   */
  instanceRoot?: string;
  /** The same view at its address before the locale segment (`forwardingParts`). */
  legacyRoute: string;
  /**
   * On the site OF the instance that declares it, the same view at that site's
   * own root: a folio's site reads `/<instance>/…` as `/…` (`ownHref` in
   * `lib/foreign-site-scope.ts`), so who-iris's catalogue tile,
   * `/who-iris/catalogue/`, lands on `catalogue/`. Set only for that instance.
   */
  ownSiteRoute?: string;
}

const visible = (name: string): boolean => !name.startsWith(".") && !name.startsWith("_");

function children(dir: string): { files: number; dirs: number } {
  try {
    const all = readdirSync(dir, { withFileTypes: true }).filter((d) => visible(d.name));
    return { files: all.filter((d) => !d.isDirectory()).length, dirs: all.filter((d) => d.isDirectory()).length };
  } catch {
    return { files: 0, dirs: 0 };
  }
}

/**
 * The root of the instance a resolved directory belongs to: the checkout for a
 * `repository`-scoped entry, else its absolute path with the declared path
 * taken off (a member's `absPath` is its own root joined with the declarer's path).
 */
function rootOf(d: { absPath: string; path: string; scope?: string }, checkout: string): string {
  if (d.scope === "repository") return resolve(checkout);
  const up = d.path.split("/").filter((s) => s !== "" && s !== ".").map(() => "..");
  return resolve(d.absPath, ...up);
}

/** The covered directories of one visualiser, with the instance each belongs to. */
function coveredDirectories(v: DeclaredVisualiser, checkout: string): { instance: string; instanceRoot: string; absPath: string }[] {
  return checkoutDirectories(v.harnessRoot, { stackedOn: v.harnessRoot })
    .filter((d) =>
      (v.coversKinds ?? []).some((k) => (d.graphTypologies as readonly string[]).includes(k)) ||
      ((v.covers ?? []) as readonly string[]).includes(d.id) && (d.member ?? d.declaredBy) === v.harness)
    .map((d) => ({ instance: d.member ?? d.declaredBy, instanceRoot: rootOf(d, checkout), absPath: d.absPath }));
}

/**
 * Every page the declarations of the checkout at `root` say a built site must
 * carry. A visualiser declared `publish: "staging-only"` (fsh-guts, the
 * trashcan kept but not published) is expected in a preview and never on a
 * root publish.
 */
export function expectedPages(root: string, opts: { staging?: boolean; ownInstance?: string } = {}): ExpectedPage[] {
  const out: ExpectedPage[] = [];
  const own = (harness: string, legacy: string): { ownSiteRoute?: string } =>
    opts.ownInstance !== undefined && harness === opts.ownInstance && legacy.startsWith(`${harness}/`) ? { ownSiteRoute: legacy.slice(harness.length + 1) } : {};
  for (const v of declaredVisualisers(root)) {
    if (!opts.staging && v.publish === "staging-only") continue;
    const dirs = coveredDirectories(v, root).filter((d) => existsSync(d.absPath));
    const withAnything = dirs.filter((d) => { const c = children(d.absPath); return c.files + c.dirs > 0; });
    if (withAnything.length === 0) continue;
    const parts = pageParts({ harness: v.harness, visualiser: v.id });
    const legacy = visualiserRoute(forwardingParts(parts));
    out.push({ route: visualiserRoute(parts), legacyRoute: legacy, ...own(v.harness, legacy), harness: v.harness, visualiser: v.id });
    if (v.subgraphs !== "instance") continue;
    const rootOfInstance = new Map<string, string>();
    for (const d of dirs) if (children(d.absPath).dirs > 0 && !rootOfInstance.has(d.instance)) rootOfInstance.set(d.instance, d.instanceRoot);
    for (const instance of [...rootOfInstance.keys()].sort()) {
      const sub = { ...parts, subgraph: instance };
      const subLegacy = visualiserRoute(forwardingParts(sub));
      out.push({ route: visualiserRoute(sub), legacyRoute: subLegacy, ...own(v.harness, subLegacy), harness: v.harness, visualiser: v.id, instance, instanceRoot: rootOfInstance.get(instance)! });
    }
  }
  return out;
}

const holds = (has: (path: string) => boolean, route: string): boolean => has(`${route}index.html`) || has(`${route}index.md`);

/** The expected pages `has` finds at neither address. `has` answers for a site-relative file path. */
export function missingPages(expected: readonly ExpectedPage[], has: (path: string) => boolean): ExpectedPage[] {
  return expected.filter((p) => !holds(has, p.route) && !holds(has, p.legacyRoute) && !(p.ownSiteRoute !== undefined && holds(has, p.ownSiteRoute)));
}

/**
 * The expected pages found ONLY at the old address: counted and printed, never
 * a finding, as `check:visualiser-routes` treats them, because the generator
 * that moves a page runs in the site's own repository.
 */
export function legacyOnlyPages(expected: readonly ExpectedPage[], has: (path: string) => boolean): ExpectedPage[] {
  return expected.filter((p) => !holds(has, p.route) && holds(has, p.legacyRoute));
}

/** The guard as `build-instance-site.ts` calls it: the missing pages of a built site directory. */
export function siteCoverageShortfall(root: string, site: string, opts: { staging?: boolean; ownInstance?: string } = {}): ExpectedPage[] {
  return missingPages(expectedPages(root, opts), (p) => existsSync(join(site, p)));
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--root");
  const root = resolve(at >= 0 ? argv[at + 1]! : ".");
  const site = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--root");
  if (site === undefined) {
    console.error("usage: site-coverage.ts <site dir> [--root <checkout>] [--staging] [--json]");
    process.exit(2);
  }
  const expected = expectedPages(root, { staging: argv.includes("--staging") });
  const has = (p: string): boolean => existsSync(join(resolve(site), p));
  const missing = missingPages(expected, has);
  const legacy = legacyOnlyPages(expected, has);
  if (argv.includes("--json")) console.log(JSON.stringify({ expected: expected.length, missing, legacy }, null, 2));
  else {
    for (const l of legacy) console.log(`· ${l.legacyRoute}  (only at the old address; its generator has not run since the locale segment)`);
    for (const m of missing) console.log(`✗ ${m.route}  (${m.harness} declares \`${m.visualiser}\`${m.instance ? `; ${m.instance} has entries` : ""})`);
    console.log(missing.length ? `site coverage: ${missing.length} of ${expected.length} declared page(s) missing` : `site coverage: ✓ all ${expected.length} declared page(s) present`);
  }
  process.exit(missing.length ? 1 : 0);
}
