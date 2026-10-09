/**
 * Which visualiser renders a directory is read from the HARNESS declarations
 * (owner, 2026-10-09), never from the pages.
 *
 * Two halves: provenance (`rendered-by`) on fixtures, and the reader —
 * `declaredVisualisers` / `viewersOf` — over a fixture checkout of two
 * instances, one declaring a corpus-wide visualiser over the other's
 * directory. The tests of this file that read the whole checkout live in
 * `cat-harness-tools/test/coordinator/viewer-declarations-checkout.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  carriesRenders,
  clearDeclaredVisualisers,
  declaredRoute,
  declaredVisualisers,
  renderedByOf,
  renderedPath,
  viewersOf,
  withRenderedBy,
  withRenderedByFrontMatter,
} from "../viewer-declarations.js";
import { declarationFindings } from "../check-visualiser-routes.js";

describe("provenance: a page names the Tool that drew it, and nothing else", () => {
  test("HTML: inserted after <head>, replaced not duplicated, and any `renders` meta removed", () => {
    const legacy = '<html><head>\n<meta name="renders" content="a/b">\n<meta name="rendered-by" content="old"><title>t</title></head></html>';
    const once = withRenderedBy(legacy, "t");
    expect(renderedByOf(once)).toBe("t");
    expect(carriesRenders(once)).toBe(false);
    expect(withRenderedBy(once, "u").match(/name="rendered-by"/g)).toHaveLength(1);
  });

  test("markdown: into the front matter, `renders:` list removed", () => {
    const md = "---\ntitle: T\nrenders:\n  - a/b\nrendered-by: x\n---\nbody\n";
    expect(carriesRenders(md)).toBe(true);
    const out = withRenderedByFrontMatter(md, "t");
    expect(out).toBe("---\ntitle: T\nrendered-by: t\n---\nbody\n");
    expect(renderedByOf(out)).toBe("t");
    expect(carriesRenders(out)).toBe(false);
    expect(withRenderedByFrontMatter("no front matter", "t")).toBe("no front matter");
  });

  test("a directory is named repository-relative, with no trailing slash", () => {
    expect(renderedPath("/r", "/r/who-iris/library/")).toBe("who-iris/library");
  });
});

/** A checkout: `base` (the site owner, named cat-harness) declares visualisers; `top` needs it. */
function fixture(): string {
  const repo = mkdtempSync(join(tmpdir(), "viewer-decl-"));
  const files: Record<string, unknown> = {
    "base/cat-harness.json": {
      name: "cat-harness",
      directories: [
        { id: "library", path: "library/", graphTypologies: ["library"] },
        { id: "todos", path: "todos/", graphTypologies: ["todos"], tile: { icon: "todo" } },
      ],
      visualisers: [
        { id: "library", renderedBy: "library-viewer", coversKinds: ["library"], subgraphs: "instance" },
        { id: "todos", renderedBy: "state-viewer", covers: ["todos"], title: "Todos", alias: "todos" },
      ],
    },
    "top/top.json": {
      name: "top",
      needs: ["cat-harness"],
      directories: [{ id: "top-library", path: "library/", graphTypologies: ["library"] }],
    },
  };
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(repo, dirname(f)), { recursive: true });
    writeFileSync(join(repo, f), JSON.stringify(body));
  }
  for (const d of ["base/library", "base/todos", "top/library", "base/docs/cat-harness/library/top", "base/docs/cat-harness/todos"]) {
    mkdirSync(join(repo, d), { recursive: true });
  }
  writeFileSync(join(repo, "base/docs/cat-harness/library/top/index.html"), "<html><head></head></html>");
  writeFileSync(join(repo, "base/docs/cat-harness/todos/index.html"), "<html><head></head></html>");
  clearDeclaredVisualisers();
  return repo;
}

describe("the declaration is the only source of a visualiser and its route", () => {
  test("every instance's `visualisers`, with the harness that declares them", () => {
    const repo = fixture();
    const v = declaredVisualisers(repo);
    expect(v.map((x) => `${x.harness}/${x.id}:${x.renderedBy}`).sort()).toEqual([
      "cat-harness/library:library-viewer",
      "cat-harness/todos:state-viewer",
    ]);
    expect(declaredRoute(join(repo, "base"), "library-viewer")).toBe("cat-harness/library");
    expect(declaredRoute(join(repo, "base"), "no-such-tool")).toBeUndefined();
  });

  test("`covers`: the harness's own directory, at the full view", () => {
    const repo = fixture();
    const got = viewersOf({ id: "todos", path: "todos/", graphTypologies: ["todos"], tile: { icon: "todo" } }, join(repo, "base"), repo);
    expect(got.map((g) => g.ref)).toEqual(["base/docs/cat-harness/todos/index.html"]);
    expect(got[0]!.title).toBe("Todos");
    expect(got[0]!.icon).toBe("todo");
  });

  test("`coversKinds` + `subgraphs: instance`: another instance's directory opens its sub-graph view", () => {
    const repo = fixture();
    const got = viewersOf({ id: "top-library", path: "library/", graphTypologies: ["library"] }, join(repo, "top"), repo);
    expect(got.map((g) => g.ref)).toEqual(["base/docs/cat-harness/library/top/index.html"]);
  });

  test("a directory nothing covers has no viewer — no page can claim one", () => {
    const repo = fixture();
    expect(viewersOf({ id: "x", path: "x/", graphTypologies: ["voices"] }, join(repo, "top"), repo)).toEqual([]);
  });
});

describe("collisions are declaration errors", () => {
  const v = (harness: string, id: string, alias?: string) => ({
    harness,
    harnessRoot: `/r/${harness}`,
    id,
    renderedBy: "t",
    covers: ["d"] as [string, ...string[]],
    ...(alias ? { alias } : {}),
  });

  test("two declarations of one route", () => {
    const f = declarationFindings([v("a", "x"), v("a", "x")], [], ["a"]);
    expect(f.map((x) => x.kind)).toEqual(["route-collision"]);
    expect(f[0]!.subject).toBe("a/x/");
  });

  test("an alias naming another alias, a harness, or something the site already carries", () => {
    const f = declarationFindings([v("a", "x", "x"), v("a", "y", "x"), v("a", "z", "b"), v("a", "w", "guides")], ["guides"], ["a", "b"]);
    expect(f.map((x) => `${x.kind}:${x.subject}`).sort()).toEqual([
      "alias-collision:b/",
      "alias-collision:guides/",
      "alias-collision:x/",
    ]);
  });

  test("distinct routes and free aliases are clean", () => {
    expect(declarationFindings([v("a", "x", "x"), v("b", "x")], ["guides"], ["a", "b"])).toEqual([]);
  });
});
