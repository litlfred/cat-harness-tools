/**
 * The docs site's dependency-cone deploy, dry run (bean `fwtz`, option C):
 * the inputs since the DEPLOYED stamp, the stamp-blind measurement, and the
 * verdict that must never call an under-carried cone safe.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { RENDERED_IMPACT_TAG, RenderedImpactSchema } from "@litlfred/cat-harness/schemas/rendered-impact.js";
import { collectInputs, intoCheckout, judge, measureDeploy, nameStatus, stampedHash, summary } from "../docs-cone-dryrun.js";

const tmp = mkdtempSync(join(tmpdir(), "docs-cone-dryrun-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function site(name: string, files: Record<string, string>): string {
  const root = join(tmp, name);
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

const page = (body: string, sha: string, v: string) =>
  `<html><head><link href="/r/a.css?v=179274877${v}"></head><body><main>${body}</main><footer><p class="text-small mb-0 fa-build-stamp">   deployed   <a href="https://x/runs/${sha}"><code>${sha}</code></a> &middot; 2026-10-23T14:03:16Z</p></footer></body></html>`;

const impact = (files: string[], undetermined: { input: string; reason: string }[] = []) =>
  RenderedImpactSchema.parse({ $schema: RENDERED_IMPACT_TAG, renderer: "docs-site", method: "cone", files: files.map((path) => ({ path, change: "changed", role: path.endsWith(".html") ? "content" : "data" })), undetermined });

describe("nameStatus", () => {
  test("reads adds, removals, renames and copies as REST-style statuses", () => {
    expect(nameStatus("M\ta.md\nA\tb.md\nD\tc.md\nR087\told.md\tnew.md\nC100\tx\ty\n")).toEqual([
      { status: "modified", path: "a.md" },
      { status: "added", path: "b.md" },
      { status: "removed", path: "c.md" },
      { status: "renamed", path: "new.md", from: "old.md" },
      { status: "added", path: "y" },
    ]);
  });
});

describe("intoCheckout", () => {
  test("maps a branch path under the mount's subtree to its checkout path, and nothing else", () => {
    expect(intoCheckout("beans/defs/x.md", { path: "beans", into: "beans" })).toBe("beans/defs/x.md");
    expect(intoCheckout("graph/a.json", { path: "graph", into: "fsh-guts" })).toBe("fsh-guts/a.json");
    expect(intoCheckout("README.md", { path: "beans", into: "beans" })).toBeUndefined();
    expect(intoCheckout("a.json", { path: "", into: "todos" })).toBe("todos/a.json");
  });
});

describe("collectInputs", () => {
  const marker = { id: "beans", branch: "cat/cat-harness/beans", path: "beans", into: "beans", tip: "t2" };
  const diffs: Record<string, string> = { "s1..h": "M\tcat-harness/docs/a.md\n", "t1..t2": "M\tbeans/defs/x.md\nM\tmanifest.json\n" };
  const diff = (a: string, b: string) => {
    const d = diffs[`${a}..${b}`];
    if (d === undefined) throw new Error(`no diff ${a}..${b}`);
    return d;
  };

  test("diffs from the DEPLOYED commit, and a moved branch mount at its mount path", () => {
    const r = collectInputs({ stamp: { sha: "s1", mounts: { beans: "t1" } }, head: "h", markers: [marker], diff });
    expect(r.doubts).toEqual([]);
    expect(r.changed).toEqual([
      { status: "modified", path: "cat-harness/docs/a.md" },
      { status: "modified", path: "beans/defs/x.md" },
    ]);
  });

  test("an unmoved mount adds nothing", () => {
    const r = collectInputs({ stamp: { sha: "s1", mounts: { beans: "t2" } }, head: "h", markers: [marker], diff });
    expect(r.changed.map((c) => c.path)).toEqual(["cat-harness/docs/a.md"]);
  });

  test("a stamp with no recorded tip is a doubt, never 'the mount did not move'", () => {
    const r = collectInputs({ stamp: { sha: "s1" }, head: "h", markers: [marker], diff });
    expect(r.doubts).toHaveLength(1);
    expect(r.doubts[0]).toContain("records no tip");
  });

  test("no stamp at all, or an unreadable diff, is a doubt", () => {
    expect(collectInputs({ stamp: undefined, head: "h", markers: [], diff }).doubts[0]).toContain("no base");
    expect(collectInputs({ stamp: { sha: "zz" }, head: "h", markers: [], diff }).doubts[0]).toContain("could not be read");
  });
});

describe("measureDeploy", () => {
  test("a page that differs only in the deploy stamps measures as untouched", () => {
    expect(stampedHash("a.html", Buffer.from(page("x", "aaa1111", "1")))).toBe(stampedHash("a.html", Buffer.from(page("x", "bbb2222", "2"))));
    expect(stampedHash("a.html", Buffer.from(page("x", "aaa1111", "1")))).not.toBe(stampedHash("a.html", Buffer.from(page("y", "aaa1111", "1"))));
  });

  test("a schema's build provenance block is a stamp; its content is not", () => {
    const doc = (run: string, title: string) => `{"title":"${title}","staging":{"branch":"main","sha":"${run}abc","pr":"main","run":"${run}"}}`;
    expect(stampedHash("s.json", Buffer.from(doc("1", "x")))).toBe(stampedHash("s.json", Buffer.from(doc("2", "x"))));
    expect(stampedHash("s.json", Buffer.from(doc("1", "x")))).not.toBe(stampedHash("s.json", Buffer.from(doc("1", "y"))));
  });

  test("compares the main site only: other previews, the render log and build.json are left out", () => {
    const before = site("m-before", {
      "a.html": page("x", "aaa", "1"),
      "b.html": page("old", "aaa", "1"),
      "gone.html": page("g", "aaa", "1"),
      "STAGING/pr/a.html": "preview",
      "_render-log/x.txt": "log",
      "build.json": '{"sha":"aaa"}',
    });
    const after = site("m-after", {
      "a.html": page("x", "bbb", "2"),
      "b.html": page("new", "bbb", "2"),
      "c.json": "{}",
      "build.json": '{"sha":"bbb"}',
    });
    expect(measureDeploy(before, after).map((f) => `${f.change} ${f.path}`)).toEqual(["changed b.html", "added c.json", "removed gone.html"]);
  });
});

describe("judge", () => {
  const measured = [
    { path: "assets/beans/index.json", change: "changed" as const, role: "data" as const, via: [] },
    { path: "en/beans/index.html", change: "changed" as const, role: "content" as const, via: [] },
  ];

  test("a determined cone that covers every measured file is cone-safe", () => {
    const d = judge({ predicted: impact(["assets/beans/index.json", "en/beans/index.html", "extra.json"]), sources: { repins: [] }, doubts: [], measured });
    expect(d.verdict).toBe("cone-safe");
    expect(d.unconfirmed).toBe(1);
    expect(d.pages).toBe(1);
  });

  test("a determined cone that misses a measured file is cone-unsafe, and names it", () => {
    const d = judge({ predicted: impact(["assets/beans/index.json"]), sources: { repins: [] }, doubts: [], measured });
    expect(d.verdict).toBe("cone-unsafe");
    expect(d.missed).toEqual([{ path: "en/beans/index.html", change: "changed" }]);
    expect(summary(d)).toContain("en/beans/index.html");
  });

  test("any doubt falls back to the full build, whatever the measurement", () => {
    const covered = impact(["assets/beans/index.json", "en/beans/index.html"]);
    expect(judge({ predicted: impact([], [{ input: "_config.yml", reason: "site-wide" }]), sources: undefined, doubts: [], measured }).verdict).toBe("full");
    expect(judge({ predicted: covered, sources: { repins: [{ instance: "x", files: null, doubt: "unreadable" }] }, doubts: [], measured }).verdict).toBe("full");
    expect(judge({ predicted: covered, sources: undefined, doubts: ["no tip"], measured }).verdict).toBe("full");
    expect(judge({ predicted: undefined, sources: undefined, doubts: [], measured }).verdict).toBe("full");
  });

  test("no input since the deploy is an empty cone: safe only when the build changed nothing", () => {
    expect(judge({ predicted: undefined, sources: { repins: [] }, doubts: [], measured: [], noInputs: true }).verdict).toBe("cone-safe");
    expect(judge({ predicted: undefined, sources: { repins: [] }, doubts: [], measured, noInputs: true }).verdict).toBe("cone-unsafe");
  });
});
