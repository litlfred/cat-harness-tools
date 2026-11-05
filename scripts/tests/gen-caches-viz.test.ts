/**
 * The caches viewer (`scripts/gen-caches-viz.ts`): the implied key is computed
 * where the recipe allows, every other cell says where it would come from,
 * and the committed page is current.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashFilesOf, impliedKey, loadCaches, render, VIEW_FILE } from "../gen-caches-viz.ts";

const sha = (s: string) => createHash("sha256").update(s).digest();

describe("impliedKey", () => {
  test("hashFiles is the runner's: sha256 over each file's raw sha256, in path order", () => {
    const d = mkdtempSync(join(tmpdir(), "cv-"));
    writeFileSync(join(d, "b"), "B");
    writeFileSync(join(d, "a"), "A");
    expect(hashFilesOf(d, ["b", "a"])).toBe(createHash("sha256").update(sha("A")).update(sha("B")).digest("hex"));
  });
  test("what cannot be computed here says why, never a value", () => {
    for (const r of [
      { source: "per-run" as const, expression: "k-${run_id}" },
      { source: "hand-listed" as const, expression: "k-$judge" },
      { source: "script" as const, implementation: "key.sh" },
      { source: "cache:key" as const, script: "(each gate)" },
    ]) expect(typeof impliedKey(r, "/nonexistent")).toBe("object");
    const d = mkdtempSync(join(tmpdir(), "cv-"));
    expect(impliedKey({ source: "hashFiles", files: ["absent.json"] }, d)).toEqual({ undetermined: "absent.json is not a file in this checkout" });
  });
});

describe("render", () => {
  test("a node that does not parse is listed as refused, not dropped", () => {
    const d = mkdtempSync(join(tmpdir(), "cv-dir-"));
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "bad.cache.json"), JSON.stringify({ $schema: "cache/1.0.0", id: "bad" }));
    const loaded = loadCaches(d);
    expect(loaded.refused.map((r) => r.file)).toEqual(["bad.cache.json"]);
    expect(render(loaded, d, undefined)).toContain("## Refused");
  });
  test("without a report every stored cell says where it comes from; with one, staleness is computed", () => {
    const d = mkdtempSync(join(tmpdir(), "cv-dir-"));
    writeFileSync(join(d, "lock.json"), "{}");
    const node = {
      $schema: "cache/1.0.0", id: "demo", title: "Demo", instance: "x", kind: "actions-cache", trustClass: "a",
      location: "cs1-demo-", keyRecipe: { source: "hashFiles", files: ["lock.json"] }, derivedInputs: "the lock",
      holds: "h", producer: "p", consumers: ["c"], savePolicy: "s", verify: "v", uses: ["a.yml:1"],
    };
    mkdirSync(join(d, "caches"));
    writeFileSync(join(d, "caches", "demo.cache.json"), JSON.stringify(node));
    const loaded = loadCaches(join(d, "caches"));
    const bare = render(loaded, d, undefined);
    expect(bare).toContain("from the daily report (not read)");
    expect(bare).toContain("undetermined — no stored key read");
    const implied = hashFilesOf(d, ["lock.json"]) as string;
    expect(render(loaded, d, { demo: { key: `cs1-demo-${implied}` } })).toContain("| current |");
    expect(render(loaded, d, { demo: { key: "cs1-demo-old" } })).toContain("**stale**");
  });
});

test("the committed viewer.md is current", () => {
  const LAYER = join(import.meta.dir, "..", "..");
  expect(readFileSync(VIEW_FILE, "utf8")).toBe(render(loadCaches(), LAYER, undefined) + "\n");
});
