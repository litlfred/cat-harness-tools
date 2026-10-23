/**
 * `lib/docs-sources.ts` — which docs sources one `gen-docs-pages` run renders
 * (owner, 2026-10-23, "A1": one run, every mounted instance's declared
 * docs-source).
 *
 * @module scripts/tests/docs-sources
 * @graphNode none — a test
 *
 * On throwaway trees, so each rule is falsified on its own: a dependent that
 * declares a docs source is found and renders into the directory that
 * declares it; one that declares none, declares an absent one, or declares it
 * under a non-`docs` or repository-scoped directory contributes nothing; and
 * the base instance's own source is always first and never read twice.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { declaredDocsSources, docsSources } from "../lib/docs-sources.ts";

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tree(): string {
  const d = mkdtempSync(join(tmpdir(), "docs-sources-"));
  made.push(d);
  return d;
}

function instance(
  at: string,
  name: string,
  directories: Array<{ id: string; path: string; graphTypologies: string[]; scope?: string }>,
): string {
  const root = join(at, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, `${name}.json`), JSON.stringify({ name, directories }));
  return root;
}

function docsJson(dir: string, sourcePath: string | undefined, makeSource = true): void {
  mkdirSync(dir, { recursive: true });
  const directories = sourcePath === undefined ? [] : [{ id: "docs-source", path: sourcePath, graphTypologies: ["docs"] }];
  writeFileSync(join(dir, "docs.json"), JSON.stringify({ name: "x", directories }));
  if (sourcePath !== undefined && makeSource) mkdirSync(join(dir, sourcePath), { recursive: true });
}

describe("declaredDocsSources", () => {
  test("a docs directory whose docs.json declares a docs-source: pages render into that directory", () => {
    const t = tree();
    const root = instance(t, "upper", [{ id: "upper-docs", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(root, "docs"), "source/");
    expect(declaredDocsSources(root)).toEqual([
      { instance: "upper", root, srcDir: join(root, "docs", "source"), outDir: join(root, "docs"), base: false },
    ]);
  });

  test("any instance-scoped docs directory may declare one, not only `docs/`", () => {
    const t = tree();
    const root = instance(t, "ig", [
      { id: "ig-pages", path: "docs/", graphTypologies: ["docs", "ig-pages"] },
      { id: "ig-site-docs", path: "site-docs/", graphTypologies: ["docs"] },
    ]);
    docsJson(join(root, "site-docs"), "source");
    const found = declaredDocsSources(root);
    expect(found.map((s) => s.outDir)).toEqual([join(root, "site-docs")]);
    expect(found[0]!.srcDir).toBe(join(root, "site-docs", "source"));
  });

  test("nothing declared, an absent source, a non-docs directory or a repository-scoped one: no source", () => {
    const t = tree();
    const none = instance(t, "none", [{ id: "d", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(none, "docs"), undefined);
    const absent = instance(t, "absent", [{ id: "d", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(absent, "docs"), "source", false);
    const notDocs = instance(t, "notdocs", [{ id: "d", path: "library/", graphTypologies: ["library"] }]);
    docsJson(join(notDocs, "library"), "source");
    const repo = instance(t, "repo", [{ id: "d", path: "docs/", graphTypologies: ["docs"], scope: "repository" }]);
    docsJson(join(repo, "docs"), "source");
    for (const r of [none, absent, notDocs, repo]) expect(declaredDocsSources(r)).toEqual([]);
    expect(declaredDocsSources(join(t, "no-such-instance"))).toEqual([]);
  });
});

describe("docsSources", () => {
  test("the base instance first, unchanged; then each dependent that declares one, in the order given", () => {
    const t = tree();
    const base = instance(t, "base", [{ id: "docs", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(base, "docs"), "source");
    const a = instance(t, "a", [{ id: "a-docs", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(a, "docs"), "source");
    const silent = instance(t, "silent", [{ id: "s", path: "docs/", graphTypologies: ["docs"] }]);
    const b = instance(t, "b", [{ id: "b-docs", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(b, "docs"), "source");

    const found = docsSources(base, [
      { name: "a", root: a },
      { name: "silent", root: silent },
      { name: "b", root: b },
    ]);
    expect(found.map((s) => [s.instance, s.base])).toEqual([
      ["base", true],
      ["a", false],
      ["b", false],
    ]);
    expect(found[0]!.srcDir).toBe(join(base, "docs", "source"));
    expect(found[0]!.outDir).toBe(join(base, "docs"));
  });

  test("a source reached twice is read once", () => {
    const t = tree();
    const base = instance(t, "base", [{ id: "docs", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(base, "docs"), "source");
    const a = instance(t, "a", [{ id: "a-docs", path: "docs/", graphTypologies: ["docs"] }]);
    docsJson(join(a, "docs"), "source");
    const found = docsSources(base, [
      { name: "a", root: a },
      { name: "a", root: a },
      { name: "base", root: base },
    ]);
    expect(found.map((s) => s.instance)).toEqual(["base", "a"]);
  });
});
