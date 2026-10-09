/**
 * `viewer-declarations` tests about the WHOLE CHECKOUT (bean `7zz1`): each
 * reads every instance's declared visualisers, which only the checkout holds.
 *
 * Since 2026-10-09 a visualiser is declared by the HARNESS, in its own
 * `<instance>.json` `visualisers`, and published at the route
 * `visualiserRoute` computes — `<base>/<harness>/<visualiser>/` — so these
 * pin the routes a directory's tile resolves to, read from the declarations.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { declarationPathIn, instanceRootsIn, visualisationResolves } from "../../../cat-harness/schemas/cat-harness.js";
import { declaredVisualisers, viewersOf, type ViewedDirectory } from "../../../cat-harness/scripts/viewer-declarations.js";

/** The directory these tests were written in (`cat-harness/scripts/tests/`). */
const ORIGIN_DIR = join(import.meta.dir, "../../../cat-harness/scripts/tests");

describe("the corpus: viewers are read from the harness declarations (owner, 2026-10-09)", () => {
  const REPO = resolve(ORIGIN_DIR, "..", "..", "..");

  type Dir = ViewedDirectory;
  const dirs: { root: string; instance: string; dir: Dir; raw: { coverage?: { visualiser?: unknown } } }[] = [];
  for (const root of instanceRootsIn(REPO)) {
    const p = declarationPathIn(root);
    if (!p) continue;
    const decl = JSON.parse(readFileSync(p, "utf-8")) as { name?: string; directories?: Dir[] };
    for (const dir of decl.directories ?? []) dirs.push({ root, instance: decl.name ?? root.split("/").pop()!, dir, raw: dir });
  }

  test("the corpus is non-empty, so the assertions below are not vacuous", () => {
    expect(dirs.length).toBeGreaterThan(0);
    expect(declaredVisualisers(REPO).length).toBeGreaterThan(0);
  });

  test("no directory declares its own viewer — the harness does", () => {
    // `coverage.visualiser` on disk was the directory pointing at its page,
    // and `renders:` on a page was the page claiming the directory. Both are
    // retired: neither can stop two pages contending for one URL.
    expect(dirs.filter(({ raw }) => raw.coverage?.visualiser !== undefined).map(({ instance, dir }) => `${instance}/${dir.id}`)).toEqual([]);
  });

  test("known directories resolve to their declared route", () => {
    const resolveFor = (instance: string, id: string): string | undefined => {
      const row = dirs.find((d) => d.instance === instance && d.dir.id === id)!;
      return viewersOf(row.dir, row.root, REPO)[0]?.ref;
    };
    expect(resolveFor("cat-harness", "tools")).toBe("cat-harness/docs/cat-harness/tools/index.md");
    expect(resolveFor("cat-harness", "processes")).toBe("cat-harness/docs/cat-harness/processes/index.md");
    // A corpus-wide visualiser with per-instance sub-graphs opens the subject's view.
    expect(resolveFor("who-iris", "library")).toBe("cat-harness/docs/cat-harness/library/who-iris/index.html");
    // A declared nested sub-graph path (`subgraphUnder`), never one inferred from the pages.
    expect(resolveFor("cat-harness", "skills")).toBe("cat-harness/docs/cat-harness/auto-docs/index/skills/skills/index.html");
    expect(resolveFor("cat-harness", "beans")).toBe("cat-harness/docs/cat-harness/beans/index.html");
    // Built at publish, never committed: still its declared route.
    expect(resolveFor("cat-harness", "fsh-guts")).toMatch(/^cat-harness\/docs\/cat-harness\/fsh-guts\/index\.(html|md)$/);
  });

  // "Exists" includes a page BUILT AT PUBLISH (bean 0b8c): never committed,
  // so it resolves by its declared writer rather than by the disk.
  test("every resolved page exists, or is built at publish by a writer that exists", () => {
    const missing = dirs.flatMap(({ root, instance, dir }) =>
      viewersOf(dir, root, REPO)
        .filter((v) => !visualisationResolves(v, (p) => existsSync(join(REPO, p))))
        .map((v) => `${instance}/${dir.id} → ${v.ref}`),
    );
    expect(missing).toEqual([]);
  });
});
