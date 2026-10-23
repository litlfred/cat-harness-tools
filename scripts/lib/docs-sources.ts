/**
 * Every DOCS SOURCE the checkout declares: the base instance's, then each
 * instance above it that declares one of its own.
 *
 * Owner, 2026-10-23 ("A1"): ONE docs-page build run that reads the
 * docs-source directory EVERY mounted instance declares — not one run per
 * instance. Until then `gen-docs-pages.ts` took its one root from
 * `HARNESS_ROOT`, so a page about a higher layer's process could only be
 * authored here, in the layer below it, which is the wrong direction.
 *
 * ## Where a docs source is declared, and where its pages land
 *
 * The same place the base instance declares its own: a `docs-source` entry
 * in the `docs.json` of a directory the instance declares with graph typology
 * `docs`. Its pages render into THAT directory (`<docs dir>/<slug>.md`),
 * exactly as the base instance's render into its site directory. So an
 * instance publishes its pages wherever that directory is published — for a
 * `composed` one, inside the one Jekyll site, under the instance's own name.
 *
 * ## Which instances, and in what order
 *
 * The base first, then the checkout's instances that DEPEND on it, deepest
 * first ({@link checkoutDependentsOf}) — the order `scenario-overlay` reads
 * higher layers' scenarios in. This file names no instance: which ones exist
 * is the checkout's answer, never a list written down here.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { declarationPathIn, docsSourceDirFor, siteDirFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { checkoutDependentsOf } from "@litlfred/cat-harness/schemas/harness-config.ts";

/** One declared docs source: where its pages are authored and where they render. */
export interface DocsSource {
  /** The declaring instance's name. */
  instance: string;
  /** The declaring instance's root, absolute. */
  root: string;
  /** The docs source directory, absolute. */
  srcDir: string;
  /** The docs directory its pages render into, absolute. */
  outDir: string;
  /** True for the base instance — the one the site is built from. */
  base: boolean;
}

interface RawEntry {
  id?: string;
  path?: string;
  graphTypologies?: string[];
  scope?: string;
}

/** The `docs-source` entry of the `docs.json` in `docsDir`, if it declares one. */
function declaredSourceIn(docsDir: string): string | undefined {
  const file = join(docsDir, "docs.json");
  if (!existsSync(file)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as { directories?: RawEntry[] };
    const entry = (raw.directories ?? []).find((d) => d.id === "docs-source");
    return entry?.path ? join(docsDir, entry.path.replace(/\/+$/, "")) : undefined;
  } catch {
    // Unparseable is `check:declared-dirs`' finding, not this reader's.
    return undefined;
  }
}

/**
 * The docs sources ONE instance declares, read RAW from its declaration (a
 * validating read throws on a typology this layer does not register, and a
 * higher instance is free to register its own). Only instance-scoped `docs`
 * directories, and only a source that exists on disk: a declared-but-absent
 * one is `check:declared-dirs`' to report.
 */
export function declaredDocsSources(root: string, fallbackName = root): DocsSource[] {
  const declPath = declarationPathIn(root);
  if (declPath === undefined) return [];
  let decl: { name?: string; directories?: RawEntry[] };
  try {
    decl = JSON.parse(readFileSync(declPath, "utf-8"));
  } catch {
    return [];
  }
  const out: DocsSource[] = [];
  for (const d of decl.directories ?? []) {
    if (!d.path || d.scope === "repository" || !(d.graphTypologies ?? []).includes("docs")) continue;
    const outDir = resolve(root, d.path.replace(/\/+$/, ""));
    const srcDir = declaredSourceIn(outDir);
    if (srcDir === undefined || !existsSync(srcDir)) continue;
    out.push({ instance: decl.name ?? fallbackName, root: resolve(root), srcDir: resolve(srcDir), outDir, base: false });
  }
  return out;
}

/**
 * The base instance's docs source — {@link docsSourceDirFor} and
 * {@link siteDirFor}, unchanged, so its pages keep the routes they have.
 */
export function baseDocsSource(root: string): DocsSource {
  let instance = root;
  try {
    const p = declarationPathIn(root);
    if (p) instance = (JSON.parse(readFileSync(p, "utf-8")) as { name?: string }).name ?? root;
  } catch {
    // named by path
  }
  return {
    instance,
    root: resolve(root),
    srcDir: resolve(docsSourceDirFor(root)),
    outDir: resolve(join(root, siteDirFor(root))),
    base: true,
  };
}

/**
 * Every docs source in the checkout: the base instance's first, then each
 * dependent's, deepest first. `dependents` is injectable for tests; by
 * default it is the checkout's own answer.
 */
export function docsSources(
  baseRoot: string,
  dependents: ReadonlyArray<{ name: string; root: string }> = checkoutDependentsOf(baseRoot),
): DocsSource[] {
  const base = baseDocsSource(baseRoot);
  const out = [base];
  const seen = new Set([base.srcDir]);
  for (const dep of dependents) {
    for (const s of declaredDocsSources(dep.root, dep.name)) {
      if (seen.has(s.srcDir)) continue;
      seen.add(s.srcDir);
      out.push(s);
    }
  }
  return out;
}
