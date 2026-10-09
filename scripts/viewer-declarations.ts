/**
 * Which visualiser renders a declared directory — read from the HARNESS
 * declarations, never from the pages.
 *
 * The owner, 2026-10-09: *"I still want the harness to be where specific
 * visualizers/pages are declared for the harness at the level. And that they
 * are all compliant of `<base URL>/<harness>/<visualizer>` … Why
 * `renders: [fsh-guts]` in visualizer? Could have multiple visualizers
 * contending for same url... so not good. Need harness to declare visualizer
 * is renderedBy …"*
 *
 * ## What this replaced
 *
 * Since #1168 B7a-2b (owner, 2026-09-24, *"page derived"*) a generated page
 * carried `renders:` (front matter) or `<meta name="renders">`, and this module
 * read every tracked page to learn which page drew which directory. That made
 * the page the declaration: a page could be written anywhere and claim any
 * directory, two pages could claim one, and a remote mount's pages had to be
 * re-read with every `renders` entry prefixed by the mount path to be found at
 * all. None of that survives. A visualiser is declared in `<instance>.json`
 * (`visualisers`, `HarnessVisualiserSchema`), its URL is
 * `visualiserRoute({ harness, visualiser })` (`schemas/visualiser-route.ts`),
 * and a page is found because the declaration says where it is.
 *
 * ## What a page still carries
 *
 * `rendered-by` — `<meta name="rendered-by">` or the front-matter scalar —
 * names the Tool that drew it. Provenance only: nothing resolves a directory
 * through it. `check:visualiser-routes` uses it to refuse a generator that
 * wrote OUTSIDE the routes its Tool is declared to render.
 *
 * @module scripts/viewer-declarations
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

import {
  declarationPathIn,
  directoriesForGraph,
  instanceDirectoryForGraph,
  instanceRootsIn,
  readDeclaration,
  repoRootFor,
  siteDirFor,
  visualisationsOf,
  type HarnessVisualiser,
  type Tile,
  type Visualisation,
} from "@litlfred/cat-harness/schemas/cat-harness.js";
import { checkoutDirectories, corpusDirectoriesForGraph, implementingRootFor } from "@litlfred/cat-harness/schemas/harness-config.js";
import { mountedInstanceRoots } from "@litlfred/cat-harness/schemas/remote-mount.js";
import { siteRootFrom, visualiserRoute, type VisualiserRouteParts } from "@litlfred/cat-harness/schemas/visualiser-route.js";

// ── Provenance: which Tool drew a page ────────────────────────────────────

const RENDERS_META = /<meta\s+name="renders"\s+content="([^"]*)"\s*\/?>/;
const BY_META = /<meta\s+name="rendered-by"\s+content="([^"]*)"\s*\/?>/;

/** A directory as a repository-relative, `/`-separated path with no trailing slash. */
export function renderedPath(repoRoot: string, absDir: string): string {
  return relative(repoRoot, absDir).split(sep).join("/").replace(/\/+$/, "");
}

/**
 * Put `<meta name="rendered-by">` into a page's `<head>`, replacing any
 * earlier one — and REMOVING any `<meta name="renders">`, the page-derived
 * declaration this module no longer reads. A page with no `<head>` is
 * returned unchanged.
 */
export function withRenderedBy(html: string, tool: string): string {
  const stripped = html.replace(new RegExp(`\\s*${RENDERS_META.source}`), "").replace(new RegExp(`\\s*${BY_META.source}`), "");
  return stripped.replace(/<head([^>]*)>/i, (h) => `${h}\n<meta name="rendered-by" content="${tool}">`);
}

/**
 * The same for a generated markdown or themed page: `rendered-by:` in its
 * front matter, any `renders:` list removed. A page with no front matter is
 * returned unchanged.
 */
export function withRenderedByFrontMatter(md: string, tool: string): string {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!m) return md;
  const kept = m[1]!
    .replace(/^renders:\n(?:\s+-\s.*\n?)*/m, "")
    .replace(/^rendered-by:.*\n?/m, "")
    .replace(/\n+$/, "");
  return `---\n${[kept, `rendered-by: ${tool}`].filter(Boolean).join("\n")}\n---\n${md.slice(m[0].length)}`;
}

/**
 * @deprecated The page no longer declares what it renders. Kept, ignoring
 * `paths`, so a generator in another repository keeps compiling until it moves
 * to {@link withRenderedBy}; it writes provenance only.
 */
export function withRenders(html: string, _paths: readonly string[], tool: string): string {
  return withRenderedBy(html, tool);
}

/** @deprecated See {@link withRenders}; use {@link withRenderedByFrontMatter}. */
export function withRendersFrontMatter(md: string, _paths: readonly string[], tool: string): string {
  return withRenderedByFrontMatter(md, tool);
}

/** @deprecated A page declares no `renders:` list any more; this returns none. */
export function rendersFrontMatter(_paths: readonly string[]): string[] {
  return [];
}

/** Which Tool drew a page, from its `<meta name="rendered-by">` or front matter. `undefined` when it does not say. */
export function renderedByOf(text: string): string | undefined {
  if (text.startsWith("---\n")) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
    const m = /^rendered-by:\s*(.+)$/m.exec(fm);
    return m ? m[1]!.trim() : undefined;
  }
  return BY_META.exec(text)?.[1] || undefined;
}

/** Whether a page still carries the retired page-derived declaration (`renders:` or `<meta name="renders">`). */
export function carriesRenders(text: string): boolean {
  if (text.startsWith("---\n")) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
    return /^renders:/m.test(fm);
  }
  return RENDERS_META.test(text);
}

// ── The declarations ──────────────────────────────────────────────────────

/** One declared visualiser, with the harness that declares it. */
export interface DeclaredVisualiser extends HarnessVisualiser {
  /** The declaring instance's `name` — the `<harness>` route segment. */
  harness: string;
  /** Its root, absolute. */
  harnessRoot: string;
}

/** A declaration read raw: generators must not throw on an instance whose other fields a newer schema refuses. */
interface RawDecl {
  name?: string;
  visualisers?: HarnessVisualiser[];
  directories?: { id: string; path?: string; graphTypologies?: string[] }[];
}

function readRaw(root: string): RawDecl | undefined {
  const p = declarationPathIn(root);
  if (p === undefined || !existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as RawDecl;
  } catch {
    return undefined;
  }
}

/** Every instance root in the checkout: top level, and every remote mount wherever it landed. */
export function checkoutInstanceRoots(repoRoot: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...instanceRootsIn(repoRoot), ...mountedInstanceRoots(repoRoot).values()]) {
    const abs = resolve(r);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

const declaredCache = new Map<string, DeclaredVisualiser[]>();

/**
 * Every visualiser every instance in the checkout declares, in instance order.
 *
 * Read from the declarations as written — the `visualisers` array of each
 * `<instance>.json` — so this answers the same in a standalone repository and
 * in the composed checkout, with no mount-path rewriting: a route is
 * `<harness>/<id>/` wherever the harness's files happen to sit.
 */
export function declaredVisualisers(repoRoot: string): DeclaredVisualiser[] {
  const key = resolve(repoRoot);
  const hit = declaredCache.get(key);
  if (hit !== undefined) return hit;
  const out: DeclaredVisualiser[] = [];
  for (const root of checkoutInstanceRoots(repoRoot)) {
    const d = readRaw(root);
    if (d?.name === undefined) continue;
    for (const v of d.visualisers ?? []) out.push({ ...v, harness: d.name, harnessRoot: root });
  }
  declaredCache.set(key, out);
  return out;
}

/** Forget what {@link declaredVisualisers} read — for a test that rewrites a declaration mid-process. */
export function clearDeclaredVisualisers(): void {
  declaredCache.clear();
}

/** The visualisers one Tool is declared to draw. */
export function visualisersRenderedBy(repoRoot: string, tool: string): DeclaredVisualiser[] {
  return declaredVisualisers(repoRoot).filter((v) => v.renderedBy === tool);
}

/**
 * The ONE visualiser a Tool draws for one harness — what a generator that
 * writes a single page per harness asks. Throws when the harness declares
 * none or several for that Tool, rather than taking the first: a generator
 * writing to a route nobody declared is the defect this module exists to end.
 */
export function visualiserFor(harnessRoot: string, tool: string, repoRoot: string = repoRootFor(harnessRoot)): DeclaredVisualiser {
  const mine = visualisersRenderedBy(repoRoot, tool).filter((v) => resolve(v.harnessRoot) === resolve(harnessRoot));
  if (mine.length === 0) {
    // The harness may not be under `repoRoot` (a standalone repository): read it directly.
    const d = readRaw(harnessRoot);
    const own = (d?.visualisers ?? []).filter((v) => v.renderedBy === tool);
    if (d?.name !== undefined && own.length === 1) return { ...own[0]!, harness: d.name, harnessRoot: resolve(harnessRoot) };
    throw new Error(
      `${harnessRoot}: declares ${own.length === 0 ? "no" : own.length} visualiser(s) rendered by \`${tool}\` — ` +
        "declare exactly one in its `visualisers` (cat-harness/schemas/cat-harness.ts, HarnessVisualiserSchema)",
    );
  }
  if (mine.length > 1) {
    throw new Error(`${harnessRoot}: declares ${mine.length} visualisers rendered by \`${tool}\` (${mine.map((v) => v.id).join(", ")}); ask by covered directory instead`);
  }
  return mine[0]!;
}

/**
 * The SITE directory every visualiser page is written into: the docs layer
 * of the instance that owns the site — cat-harness's, the Jekyll source
 * every deploy builds (`compose-docs.ts`'s base layer). A page of ANY
 * harness lives at `<site>/<harness>/<visualiser>/…`, which is the route, so
 * the file and the URL cannot disagree.
 */
export function siteOwnerDir(repoRoot: string): string {
  const owner = checkoutInstanceRoots(repoRoot).find((r) => readRaw(r)?.name === "cat-harness");
  // A checkout with no cat-harness instance is a folio standing alone: its own
  // root's site directory is the site.
  const root = owner ?? resolve(repoRoot);
  try {
    return join(root, siteDirFor(root));
  } catch {
    // No declaration there at all (a fixture, a bare directory): the
    // conventional answer `siteDir` gives every instance.
    return join(root, "docs");
  }
}

/** The absolute directory a visualiser view is written into: `<site>/<route>`. */
export function visualiserPageDir(site: string, parts: VisualiserRouteParts): string {
  return join(site, ...visualiserRoute(parts).split("/").filter(Boolean));
}

/**
 * The page file of a view, REPOSITORY-relative — `index.html`, or `index.md`
 * when that is what is on disk (Jekyll builds both to the same URL).
 * `index.html` when neither is there, which is what a publish-time page
 * (`writer`, bean `0b8c`) will be.
 */
export function visualiserPageRef(repoRoot: string, parts: VisualiserRouteParts, site: string = siteOwnerDir(repoRoot)): string {
  const dir = visualiserPageDir(site, parts);
  const file = existsSync(join(dir, "index.md")) && !existsSync(join(dir, "index.html")) ? "index.md" : "index.html";
  return renderedPath(repoRoot, join(dir, file));
}

/**
 * The directories of a kind the handler instance declares, as a page names
 * them. `corpus`: the handler AND every instance stacked on it.
 */
export function handledDirectories(
  repoRoot: string,
  handlerRoot: string,
  kind: string,
  scope: "instance" | "corpus" = "instance",
): string[] {
  const dirs = scope === "corpus" ? corpusDirectoriesForGraph(handlerRoot, kind) : directoriesForGraph(handlerRoot, kind);
  return dirs.map((d) => renderedPath(repoRoot, d));
}

/**
 * The directory a one-page viewer writes into, for the visualiser `tool`
 * draws for this harness: `<site>/<harness>/<id>/`. Replaces the old
 * `conventionalPage`, which composed `<directory basename>/index.md` from the
 * handled directory — a URL the generator chose rather than the declaration.
 */
export function visualiserPageFor(harnessRoot: string, tool: string, site: string): { dir: string; visualiser: DeclaredVisualiser } {
  const v = visualiserFor(harnessRoot, tool);
  return { dir: visualiserPageDir(site, { harness: v.harness, visualiser: v.id }), visualiser: v };
}

/**
 * Where a one-page viewer writes, RELATIVE TO THE SITE DIRECTORY, and the
 * relative path back to the site root from there: the visualiser `tool`
 * draws for the harness at `harnessRoot`, at `<harness>/<id>/<file>`.
 */
export function visualiserSitePath(harnessRoot: string, tool: string, file = "index.md"): { rel: string; up: string; visualiser: DeclaredVisualiser } {
  const v = visualiserFor(harnessRoot, tool);
  const parts = { harness: v.harness, visualiser: v.id };
  return { rel: visualiserRoute({ ...parts, asset: file }), up: siteRootFrom(parts), visualiser: v };
}

/**
 * The SITE-RELATIVE route prefix, `<harness>/<id>`, of the visualiser `tool`
 * draws for the harness at `harnessRoot` — for a generator that places a full
 * view and per-sub-graph views beneath it (`viewerPlacement(site, route)`,
 * `${route}/${subject}`). `undefined` when the harness declares none: a
 * generator then writes nothing, because no declaration means no route.
 */
export function declaredRoute(harnessRoot: string, tool: string): string | undefined {
  try {
    const v = visualiserFor(harnessRoot, tool);
    return visualiserRoute({ harness: v.harness, visualiser: v.id }).replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/** @deprecated Retained for one release: the kind's declared directory basename. Use {@link visualiserSitePath}. */
export function conventionalPage(handlerRoot: string, kind: string): string | undefined {
  const dir = instanceDirectoryForGraph(handlerRoot, kind);
  return dir === undefined ? undefined : `${basename(dir)}/index.md`;
}

// ── Reading a directory's viewers ─────────────────────────────────────────

/** The part of a declared directory {@link viewersOf} reads. */
export interface ViewedDirectory {
  id: string;
  path: string;
  scope?: string;
  graphTypologies?: readonly string[];
  coverage?: Parameters<typeof visualisationsOf>[0];
  tile?: Tile;
}

/**
 * Does visualiser `v` cover directory `d` of the instance named `owner`?
 *
 * - `covers`: only the declaring harness's own directories, by id;
 * - `coversKinds`: every declared directory of those kinds in the checkout —
 *   the "full KG" the owner's rule names, which is what a corpus-wide viewer
 *   (the library, schemas, processes) draws: it lists bootstrap's processes
 *   as readily as smart-base's.
 */
export function covers(v: DeclaredVisualiser, d: ViewedDirectory, owner: string, absDir?: string, repoRoot?: string): boolean {
  if (v.harness === owner && (v.covers ?? []).includes(d.id)) return true;
  // The SAME directory declared by another instance (`beans/`, scope
  // `repository`, is one directory however many instances name it): a
  // visualiser of it is a visualiser of it, whoever declared the entry.
  if (absDir !== undefined && repoRoot !== undefined && (v.covers ?? []).length > 0) {
    const mine = readRaw(v.harnessRoot)?.directories ?? [];
    for (const id of v.covers ?? []) {
      const e = mine.find((x) => x.id === id) as { path?: string; scope?: string } | undefined;
      if (e?.path && resolve(join(e.scope === "repository" ? repoRoot : v.harnessRoot, e.path)) === resolve(absDir)) return true;
    }
  }
  return (v.coversKinds ?? []).some((k) => (d.graphTypologies ?? []).includes(k));
}

/**
 * Every visualisation of a declared directory, normalised: one per declared
 * visualiser that covers it, the page being that visualiser's route.
 *
 * The page a tile opens is the SUB-GRAPH view when the visualiser draws
 * per-sub-graph pages (`subgraphs: "instance" | "directory"`) and that page
 * exists, else the full view. Dressed in the visualiser's tile fields, then
 * the directory's own {@link Tile} — a directory's presentation is its own
 * business. `[]` when nothing covers it.
 *
 * @param instanceRoot the root of the instance whose declaration `d` is from
 */
export function viewersOf(
  d: ViewedDirectory,
  instanceRoot: string,
  repoRoot: string = repoRootFor(instanceRoot),
  /** The site directory the routes are under; default the site owner's (`siteOwnerDir`). */
  siteDir?: string,
): Array<Visualisation & { title: string }> {
  // The OWNER is the instance whose declaration carries the entry: this one,
  // or — for an entry `siteDirectories` presented from the checkout root —
  // the root. A `repository`-scoped path resolves from the checkout either way.
  const own = readRaw(instanceRoot);
  const owner = (own?.directories ?? []).some((x) => x.id === d.id) ? own?.name : (readRaw(repoRoot)?.name ?? own?.name);
  if (owner === undefined) return [];
  const absDir = join(d.scope === "repository" ? repoRoot : instanceRoot, d.path);
  let site: string | undefined = siteDir;
  const out: Array<Visualisation & { title: string }> = [];
  for (const v of declaredVisualisers(repoRoot)) {
    if (!covers(v, d, owner, absDir, repoRoot)) continue;
    site ??= siteOwnerDir(repoRoot);
    const full = { harness: v.harness, visualiser: v.id };
    // The sub-graph a directory's tile opens. `instance`: the owner's name.
    // `directory`: the directory id — qualified by its instance first when
    // another harness owns the visualiser, because a corpus-wide view keeps
    // ids unique that way (`folio-assistant-sci-skills` beside `skills`).
    const under = (d.graphTypologies ?? []).map((k) => v.subgraphUnder?.[k]).find((u) => u !== undefined);
    const at = (seg: string): string => (under ? `${under}/${seg}` : seg);
    // A bare id is taken for another instance's directory only when the
    // declaring harness does not hold a directory of that id itself: a bare
    // `skills` is cat-harness's own, `core-skills` can only be core's.
    const harnessIds = new Set((readRaw(v.harnessRoot)?.directories ?? []).map((x) => x.id));
    const subs =
      v.subgraphs === "instance"
        ? [owner]
        : v.subgraphs === "directory"
          ? owner === v.harness
            ? [at(d.id)]
            : [at(`${owner}-${d.id}`), ...(harnessIds.has(d.id) ? [] : [at(d.id)])]
          : [];
    const subRef = subs.map((sub) => visualiserPageRef(repoRoot, { ...full, subgraph: sub }, site!)).find((r) => existsSync(join(repoRoot, r)));
    // Covered BY KIND, a visualiser that draws per-sub-graph views covers a
    // directory only where it drew that directory's view: the full KG page of
    // a viewer that never reached this instance is not its viewer.
    const byId = !(v.coversKinds ?? []).some((k) => (d.graphTypologies ?? []).includes(k));
    if (subs.length > 0 && subRef === undefined && !byId) continue;
    const ref = subRef ?? visualiserPageRef(repoRoot, full, site);
    const { id: _id, renderedBy: _by, covers: _c, coversKinds: _k, subgraphs: _s, subgraphUnder: _u, alias: _a, harness: _h, harnessRoot: _r, ...tile } = v;
    // `writer` is declared relative to the HARNESS (its own scripts), and read
    // repository-relative like `ref`, so a mount path is never written down.
    // ...where it is IMPLEMENTED: the harness's scripts live in cat-harness-tools (bean 70lx).
    const writer = v.writer?.map((w) => renderedPath(repoRoot, join(implementingRootFor(v.harnessRoot, w), w)));
    // The directory's tile is the DEFAULT dress; what the visualiser declares
    // about itself wins, since a directory drawn twice needs two names.
    out.push({ ...d.tile, ...tile, ...(writer ? { writer } : {}), ref, title: v.title ?? d.tile?.title ?? d.id });
  }
  return out;
}

/**
 * Declared directories with their viewers RESOLVED — `coverage.visualiser`
 * filled in from {@link viewersOf}, in memory, for the readers written
 * against that field (`graph-tiles.ts`, `harness-tiles.ts`). The declaration
 * on disk is untouched, and carries no such field.
 */
export function siteDirectories<T extends ViewedDirectory>(
  own: readonly T[],
  instanceRoot: string,
  repoRoot: string = repoRootFor(instanceRoot),
): T[] {
  // The site this instance builds draws the CHECKOUT, and since placement PR0
  // (bean `ejye`) the checkout's own directories — `beans/`, `todos/`,
  // `fsh-guts/`, `memory/`, the root docs overlay — are declared by the
  // checkout's ROOT instance. They are read from there and presented as
  // repository-scoped entries of this site, ids unchanged. An id this
  // instance already declares wins.
  if (resolve(repoRoot) === resolve(instanceRoot)) return [...own];
  const shared = checkoutSharedDirectories<T>(repoRoot);
  if (shared === undefined || shared.root === resolve(instanceRoot)) return [...own];
  // An own entry wins only when it GOES somewhere — the rule `navbarRow` in
  // `sync-docs-harness.ts` applies to the icon row (cat-harness#31). core
  // declares a `beans` of its own with no viewer, and letting it shadow the
  // checkout's viewed one dropped the Beans tile from the index site
  // (`beans-count-agrees.e2e.ts`, 2026-10-09).
  const viewed = (d: T) => viewersOf(d, instanceRoot, repoRoot).length > 0;
  const replaced = new Set(
    own.filter((d) => !viewed(d) && shared.directories.some((c) => c.id === d.id && viewed(c))).map((d) => d.id),
  );
  const kept = own.filter((d) => !replaced.has(d.id));
  const ids = new Set(kept.map((d) => d.id));
  return [...kept, ...shared.directories.filter((d) => !ids.has(d.id))];
}

/**
 * The checkout's own directories, as repository-scoped entries, and the
 * instance root that declares them: the checkout ROOT's instance when it has
 * one, else — the index checkout, whose root declares nothing (owner,
 * 2026-10-08) — the instance that declares the repository-scoped directories
 * (cat-harness, decision (b)), the same answer `checkoutGraphOwner` gives
 * the navbar. `undefined` when neither is readable.
 */
function checkoutSharedDirectories<T extends ViewedDirectory>(
  repoRoot: string,
): { root: string; directories: T[] } | undefined {
  const read = (p: string): { directories?: T[] } | undefined => {
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as { directories?: T[] };
    } catch {
      return undefined;
    }
  };
  const p = declarationPathIn(repoRoot);
  if (p !== undefined) {
    const root = read(p);
    if (root === undefined) return undefined;
    return { root: resolve(repoRoot), directories: (root.directories ?? []).map((d) => ({ ...d, scope: "repository" })) };
  }
  let owner: string | undefined;
  try {
    owner = checkoutDirectories(repoRoot).find((d) => d.scope === "repository" && d.own)?.declaredBy;
  } catch {
    return undefined; // an unreadable declaration is `check:harness-dirs`'s to report
  }
  const ownerRoot = owner === undefined ? undefined : instanceRootsIn(repoRoot).find((r) => readDeclaration(r)?.name === owner);
  const q = ownerRoot === undefined ? undefined : declarationPathIn(ownerRoot);
  const decl = q === undefined ? undefined : read(q);
  if (ownerRoot === undefined || decl === undefined) return undefined;
  return { root: resolve(ownerRoot), directories: (decl.directories ?? []).filter((d) => d.scope === "repository") };
}

export function withViewers<T extends ViewedDirectory>(
  dirs: readonly T[],
  instanceRoot: string,
  repoRoot: string = repoRootFor(instanceRoot),
  siteDir?: string,
): T[] {
  return dirs.map((d) => {
    const v = viewersOf(d, instanceRoot, repoRoot, siteDir);
    if (v.length === 0) return d;
    return { ...d, coverage: { ...d.coverage, visualiser: v as [Visualisation, ...Visualisation[]] } };
  });
}
