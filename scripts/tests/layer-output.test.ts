/**
 * The layer output resolver (bean `cat-tools-sm8r`, item 4, plan step 1):
 * a mounted layer's computed files go to `build/layers/<instance>/`, a local
 * layer's stay inside it, and a reader sees the computed file over the
 * pinned bytes.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LAYER_OUTPUT_ROOT, mountedInstances, outputPathFor, outputTwinOf, readPathAt, readPathFor, writePathAt } from "../lib/layer-output.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function checkout(lock?: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "layer-output-"));
  dirs.push(root);
  if (lock !== undefined) writeFileSync(join(root, "index.lock.json"), typeof lock === "string" ? lock : JSON.stringify(lock));
  return root;
}

const LOCK = {
  instances: [
    { instance: "upper-ig", path: "upper-ig", sha: "a".repeat(40) },
    { instance: "lower", path: "lower", sha: "b".repeat(40) },
  ],
};

describe("mountedInstances", () => {
  test("reads the lock's instances and their mount paths", () => {
    expect([...mountedInstances(checkout(LOCK))]).toEqual([
      ["upper-ig", "upper-ig"],
      ["lower", "lower"],
    ]);
  });

  test("no lock: nothing is mounted", () => {
    expect(mountedInstances(checkout()).size).toBe(0);
  });

  test("a lock that does not parse throws rather than reading as 'nothing mounted'", () => {
    expect(() => mountedInstances(checkout("{ not json"))).toThrow(/cannot be determined/);
  });
});

describe("outputPathFor", () => {
  test("a mounted instance writes under build/layers/<instance>/", () => {
    const root = checkout(LOCK);
    expect(outputPathFor(root, { instance: "upper-ig", path: "upper-ig" }, "fhir-artifact-index/index.json")).toBe(
      join(root, LAYER_OUTPUT_ROOT, "upper-ig", "fhir-artifact-index/index.json"),
    );
  });

  test("a local instance writes inside itself, as before", () => {
    const root = checkout(LOCK);
    expect(outputPathFor(root, { instance: "own", path: "own" }, "glossary/generated/x.json")).toBe(join(root, "own", "glossary/generated/x.json"));
    expect(outputPathFor(root, { instance: "root-instance", path: "" }, "test/results/a.json")).toBe(join(root, "test/results/a.json"));
  });
});

describe("readPathFor", () => {
  test("the computed file wins over the pinned bytes", () => {
    const root = checkout(LOCK);
    mkdirSync(join(root, "upper-ig/fhir-artifact-index"), { recursive: true });
    writeFileSync(join(root, "upper-ig/fhir-artifact-index/index.json"), "pinned");
    const out = join(root, LAYER_OUTPUT_ROOT, "upper-ig/fhir-artifact-index");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "index.json"), "computed");
    expect(readPathFor(root, { instance: "upper-ig", path: "upper-ig" }, "fhir-artifact-index/index.json")).toBe(join(out, "index.json"));
  });

  test("with nothing computed, the reader falls back to the mount", () => {
    const root = checkout(LOCK);
    expect(readPathFor(root, { instance: "lower", path: "lower" }, "a.json")).toBe(join(root, "lower", "a.json"));
  });
});

describe("outputTwinOf / readPathAt — a reader holding an absolute path", () => {
  test("a path in a mounted layer has a twin under the output root; a local or outside path has none", () => {
    const root = checkout(LOCK);
    expect(outputTwinOf(root, join(root, "upper-ig", "fhir-artifact-index"))).toBe(join(root, LAYER_OUTPUT_ROOT, "upper-ig", "fhir-artifact-index"));
    expect(outputTwinOf(root, join(root, "upper-ig"))).toBe(join(root, LAYER_OUTPUT_ROOT, "upper-ig"));
    expect(outputTwinOf(root, join(root, "upper-ig-other", "x"))).toBeUndefined();
    expect(outputTwinOf(root, join(root, "own", "x"))).toBeUndefined();
    expect(outputTwinOf(root, "/elsewhere/x")).toBeUndefined();
  });

  test("the twin when it exists, else the path itself — no writer at the output root changes nothing", () => {
    const root = checkout(LOCK);
    const abs = join(root, "upper-ig", "fhir-artifact-index", "index.json");
    expect(readPathAt(root, abs)).toBe(abs);
    const twin = join(root, LAYER_OUTPUT_ROOT, "upper-ig", "fhir-artifact-index");
    mkdirSync(twin, { recursive: true });
    writeFileSync(join(twin, "index.json"), "{}");
    expect(readPathAt(root, abs)).toBe(join(twin, "index.json"));
    expect(readPathAt(root, join(root, "upper-ig", "fhir-artifact-index"))).toBe(twin);
    expect(readPathAt(root, join(root, "own", "a.json"))).toBe(join(root, "own", "a.json"));
  });
});

describe("writePathAt — a writer holding an absolute path", () => {
  test("a path in a mounted layer is written at its twin; a local or outside path where it is", () => {
    const root = checkout(LOCK);
    expect(writePathAt(root, join(root, "upper-ig", "docs", "_data", "x.json"))).toBe(join(root, LAYER_OUTPUT_ROOT, "upper-ig", "docs", "_data", "x.json"));
    expect(writePathAt(root, join(root, "own", "docs", "x.json"))).toBe(join(root, "own", "docs", "x.json"));
    expect(writePathAt(root, "/elsewhere/x")).toBe("/elsewhere/x");
  });

  test("what a writer wrote is what readPathAt reads back", () => {
    const root = checkout(LOCK);
    const abs = join(root, "lower", "docs", "page.html");
    const at = writePathAt(root, abs);
    mkdirSync(join(at, ".."), { recursive: true });
    writeFileSync(at, "computed");
    expect(readPathAt(root, abs)).toBe(at);
  });
});

describe("derive-at-publish built() — an artefact of a mounted layer built at its output root", () => {
  test("a declared artefact counts as built when only its output-root twin holds it", async () => {
    const { built } = await import("../derive-at-publish.ts");
    const root = checkout(LOCK);
    const file = { abs: join(root, "lower", "docs", "_data", "x.json"), path: "docs/_data/x.json" };
    const dir = { abs: join(root, "lower", "docs", "pages"), path: "docs/pages/" };
    expect(built(file, root)).toBe(false);
    expect(built(dir, root)).toBe(false);
    for (const [at, body] of [[writePathAt(root, file.abs), "{}"], [join(writePathAt(root, dir.abs), "a", "index.html"), "<p>"]] as const) {
      mkdirSync(join(at, ".."), { recursive: true });
      writeFileSync(at, body);
    }
    expect(built(file, root)).toBe(true);
    expect(built(dir, root)).toBe(true);
  });
});
