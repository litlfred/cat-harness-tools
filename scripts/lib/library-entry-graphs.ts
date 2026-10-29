/**
 * The KG sub-graphs DECLARED INSIDE one library entry, and where they are
 * published — bean 8pzh item 1.
 *
 * Owner, 2026-10-12, on where L1 extraction output lives: *"a and b"* — keep it
 * committed beside the library entry (`<entry>/l1-extraction/`) AND publish it
 * with the source — and: *"why does b not happen already? if its a part of the
 * KG it should be published."*
 *
 * It did not happen because the output was not part of the declared KG. An
 * entry's own nodes are its manifest, sections and blocks (the `library`
 * typology); a directory of other files inside it was in the repository and
 * named by no typology, so nothing published it. The fix is a declaration, not
 * a list of filenames here: an instance declares the directory inside the
 * entry, with a typology that is `within: "library"` (a content layer's
 * `l1-extraction`, say), and this module finds every such declaration. So the rule
 * the publisher follows is the owner's own — declared KG content is published —
 * and this layer never names a kind a higher layer owns.
 *
 * ## Where a file lands
 *
 * Beside the entry's manifest, at its path relative to the entry:
 * `<entry>/l1-extraction/recommendations.l1.json` is published at
 * `assets/library/jsonld/<instance>/<entry>/l1-extraction/recommendations.l1.json`.
 * That is the layout `schemas/library-iri.ts` reserved for exactly this — *"the
 * entry's other nodes have an obvious place to be published under the same
 * directory later"* — and it keeps the source layout, so a relative reference
 * between two files of the sub-graph still resolves on the site.
 *
 * The bytes are copied as they are. A graph document carries its own `@id`
 * (an L1 IRI, not a site path), so nothing here rewrites it; and the
 * committed file stays the single source, validated where it is written by
 * the layer that owns its vocabulary.
 *
 * @module scripts/lib/library-entry-graphs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { findInstanceRoot, instanceDirectories, readDeclaration } from "@litlfred/cat-harness/schemas/kg/cat-harness.ts";
import { defaultGraphTypologies, type GraphTypologyRegistry } from "@litlfred/cat-harness/schemas/kg/graph-typology-registry.ts";
import { findDeclarationFile } from "@litlfred/cat-harness/schemas/instance-roots.ts";
import { libraryAssetSitePath } from "@litlfred/cat-harness/schemas/library-iri.ts";

/** One file of a sub-graph declared inside a library entry. */
export interface EntryGraphFile {
  /** The typology of the declaring directory (e.g. `l1-extraction`). */
  kind: string;
  /** The source on disk. */
  abs: string;
  /** Its path relative to the entry directory, `/`-separated — also its path under the entry's published directory. */
  rel: string;
  /** A JSON-LD document — parses as JSON and carries `@context` — and so a graph a reader is linked to. */
  jsonld: boolean;
}

/** The nearest directory at or above `dir` that holds an instance declaration, or `undefined`. */
function declaringInstanceRoot(dir: string): string | undefined {
  for (let d = resolve(dir); ; d = dirname(d)) {
    if (findDeclarationFile(d) !== undefined) return d;
    if (dirname(d) === d) return undefined;
  }
}

type DeclaredDirectories = ReturnType<typeof instanceDirectories>;

/**
 * One instance's declared directories, read once per declaration text.
 *
 * `check:l1-complete` asks {@link entrySubgraphDirs} once per library entry,
 * and every entry of a library has the same declaring instance. Re-reading and
 * re-resolving that declaration for each one made `checkAll` over the corpus
 * slow enough to time a test out (`ingest-and-l1`, 5.8 s against bun's 5 s).
 * The key is the declaration's TEXT as well as its root, and the registry's
 * size (kinds are registered at runtime), the same key `readDeclaration` uses:
 * an edited declaration, such as a test fixture rewritten in place, is read
 * again rather than answered from a stale copy. `undefined` is an unreadable declaration, cached
 * the same way: it is `check:harness-dirs`'s finding, not this one's.
 */
const declaredDirectoriesCache = new Map<string, { text: string; registry: GraphTypologyRegistry; kinds: number; dirs: DeclaredDirectories | undefined }>();

function declaredDirectoriesOf(instRoot: string, registry: GraphTypologyRegistry): DeclaredDirectories | undefined {
  let text = "";
  try {
    const file = findDeclarationFile(instRoot);
    text = file === undefined ? "" : readFileSync(join(instRoot, file), "utf-8");
  } catch {
    text = "";
  }
  const hit = declaredDirectoriesCache.get(instRoot);
  if (hit !== undefined && hit.text === text && hit.registry === registry && hit.kinds === registry.names().length) return hit.dirs;
  let dirs: DeclaredDirectories | undefined;
  try {
    dirs = instanceDirectories(instRoot, readDeclaration(instRoot, registry), registry);
  } catch {
    dirs = undefined;
  }
  declaredDirectoriesCache.set(instRoot, { text, registry, kinds: registry.names().length, dirs });
  return dirs;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

function isJsonLd(abs: string): boolean {
  if (!/\.(json|jsonld)$/.test(abs)) return false;
  try {
    const v = JSON.parse(readFileSync(abs, "utf-8")) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v) && "@context" in v;
  } catch {
    return false;
  }
}

/** One directory DECLARED inside a library entry with a kind that is a sub-graph of `library`. */
export interface EntrySubgraphDir {
  /** The typology that makes it a library sub-graph (e.g. `l1-extraction`). */
  kind: string;
  /** The directory on disk. */
  abs: string;
  /** Whether that kind is published (`published !== false`). */
  published: boolean;
}

/**
 * Every directory DECLARED inside `entryDir` whose typology is a sub-graph of
 * `library` (`within: "library"`) and exists on disk — published or not. The
 * one declaration lookup {@link entryGraphFiles} publishes from and
 * `check:l1-complete` accepts as entry contents, so the two cannot disagree.
 * Empty when the entry holds none, or its instance cannot be read — an
 * unreadable declaration is `check:harness-dirs`'s finding, not this one's.
 */
export function entrySubgraphDirs(entryDir: string, registry: GraphTypologyRegistry = defaultGraphTypologies): EntrySubgraphDir[] {
  const entry = resolve(entryDir);
  const instRoot = declaringInstanceRoot(dirname(entry));
  if (instRoot === undefined) return [];
  const dirs = declaredDirectoriesOf(instRoot, registry);
  if (dirs === undefined) return [];
  const out: EntrySubgraphDir[] = [];
  for (const d of dirs) {
    if (d.scope === "repository") continue;
    const abs = resolve(instRoot, d.path);
    if (!abs.startsWith(entry + sep) || !existsSync(abs) || !statSync(abs).isDirectory()) continue;
    const kinds = (d.graphTypologies ?? []).filter((k) => registry.get(k)?.within === "library");
    if (kinds.length === 0) continue;
    const pub = kinds.find((k) => registry.get(k)?.published !== false);
    out.push({ kind: pub ?? kinds[0], abs, published: pub !== undefined });
  }
  return out;
}

/**
 * Every file of every directory DECLARED inside `entryDir` whose typology is a
 * sub-graph of `library` (`within: "library"`) and is published. Sorted by
 * `rel`. Empty when the entry holds none, or its instance cannot be read.
 */
export function entryGraphFiles(entryDir: string, registry: GraphTypologyRegistry = defaultGraphTypologies): EntryGraphFile[] {
  const entry = resolve(entryDir);
  const byRel = new Map<string, EntryGraphFile>();
  for (const d of entrySubgraphDirs(entry, registry)) {
    if (!d.published) continue;
    for (const f of filesUnder(d.abs)) {
      const rel = relative(entry, f).split(sep).join("/");
      if (!byRel.has(rel)) byRel.set(rel, { kind: d.kind, abs: f, rel, jsonld: isJsonLd(f) });
    }
  }
  return [...byRel.values()].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** Where `rel` (from {@link entryGraphFiles}) is published, SITE-relative: beside the entry's manifest. */
export function entryGraphSitePath(instance: string, docId: string, rel: string): string {
  const base = dirname(libraryAssetSitePath(instance, docId));
  return `${base}/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The directories directly inside the library `lib` that its instance
 * declares with kinds that do not include `library` — absolute, without a
 * trailing separator. They are other graphs kept in the library, not entries:
 * a DAK IG keeps its L1 scenario worked example at
 * `library/l1-recommendation-scenarios/` as `l1-extraction`, and a reader that
 * walked it as an entry graded it for a manifest and sections it never had.
 */
export function nonEntryDirs(lib: string, registry: GraphTypologyRegistry = defaultGraphTypologies): Set<string> {
  const out = new Set<string>();
  const inst = findInstanceRoot(lib);
  if (inst === undefined) return out;
  // The RESOLVED directories, not the declaration file alone: a library names
  // a directory of another kind FROM WITHIN (`library/library.json`'s
  // `directories`, the #980 shape `check:layout-norms` sanctions), and a
  // reader of the root file alone graded that directory as an entry missing
  // its manifest, sections and blocks (cat-harness-tools#281). The raw
  // declaration stays the fallback for a declaration the resolver refuses.
  const resolved = declaredDirectoriesOf(inst, registry);
  const entries: { path: string; graphTypologies?: readonly string[]; scope?: string }[] =
    resolved ?? readDeclaration(inst)?.directories ?? [];
  for (const e of entries) {
    if (e.scope === "repository") continue;
    const abs = join(inst, e.path).replace(/[/\\]+$/, "");
    if (resolve(abs, "..") === resolve(lib) && !(e.graphTypologies ?? []).includes("library")) out.add(abs);
  }
  return out;
}
