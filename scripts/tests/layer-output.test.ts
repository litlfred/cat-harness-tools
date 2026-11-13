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

import {
  LAYER_OUTPUT_ROOT,
  checkoutRoot,
  clearMountedCache,
  mountedInstances,
  outputPathFor,
  outputTwinOf,
  overlayPath,
  readPathAt,
  readPathFor,
} from "../lib/layer-output.js";
import { movedInventory } from "../qa-verify-moved.js";
import { overlayEntries } from "../qa-store.js";

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

describe("overlayPath (step 5: the QA readers)", () => {
  test("the checkout is the nearest directory holding .git, not a mount carrying its own lock", () => {
    const root = checkout(LOCK);
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "lower", "test"), { recursive: true });
    writeFileSync(join(root, "lower", "index.lock.json"), "{}");
    expect(checkoutRoot(join(root, "lower", "test"))).toBe(root);
  });

  test("outside a checkout the path is unchanged", () => {
    expect(overlayPath("/x/lower/test/results/a.json", undefined)).toBe("/x/lower/test/results/a.json");
  });

  test("reads the computed twin over the pinned bytes, and the mount when there is none", () => {
    clearMountedCache();
    const root = checkout(LOCK);
    const pinned = join(root, "lower", "test", "results", "a.qa-results.json");
    expect(overlayPath(pinned, root)).toBe(pinned);
    const twin = join(root, LAYER_OUTPUT_ROOT, "lower", "test", "results", "a.qa-results.json");
    mkdirSync(join(twin, ".."), { recursive: true });
    writeFileSync(twin, "{}");
    expect(overlayPath(pinned, root)).toBe(twin);
  });

  test("an unparseable lock: a reader falls back to the pinned path", () => {
    clearMountedCache();
    const root = checkout("{ not json");
    const p = join(root, "lower", "x.json");
    expect(overlayPath(p, root)).toBe(p);
  });
});

describe("the QA inventory and publish see the overlay (step 5)", () => {
  function composed(): string {
    clearMountedCache();
    const root = checkout(LOCK);
    const res = join(root, "lower", "test", "results");
    mkdirSync(res, { recursive: true });
    writeFileSync(join(res, "pinned.json"), "1");
    writeFileSync(join(res, "both.json"), "old");
    const out = join(root, LAYER_OUTPUT_ROOT, "lower", "test", "results", "sub");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "computed.json"), "22");
    writeFileSync(join(out, "..", "both.json"), "newer");
    return root;
  }

  test("movedInventory is the union, keyed by the layer's own path, the output root winning", () => {
    const root = composed();
    const inv = movedInventory(root, ["lower/test/results"]);
    expect(inv.directories[0]!.files).toEqual([
      { path: "lower/test/results/both.json", bytes: 5, at: `${LAYER_OUTPUT_ROOT}/lower/test/results/both.json` },
      { path: "lower/test/results/pinned.json", bytes: 1 },
      { path: "lower/test/results/sub/computed.json", bytes: 2, at: `${LAYER_OUTPUT_ROOT}/lower/test/results/sub/computed.json` },
    ]);
    expect(inv.files).toBe(3);
  });

  test("overlayEntries names each computed file at its logical path", () => {
    const root = composed();
    expect(overlayEntries(root, ["lower/test/results"])).toEqual([
      { path: "lower/test/results/both.json", at: `${LAYER_OUTPUT_ROOT}/lower/test/results/both.json` },
      { path: "lower/test/results/sub/computed.json", at: `${LAYER_OUTPUT_ROOT}/lower/test/results/sub/computed.json` },
    ]);
  });

  test("with nothing mounted, both are what they were", () => {
    clearMountedCache();
    const root = checkout();
    mkdirSync(join(root, "own", "test", "results"), { recursive: true });
    writeFileSync(join(root, "own", "test", "results", "a.json"), "x");
    expect(movedInventory(root, ["own/test/results"]).directories[0]!.files).toEqual([{ path: "own/test/results/a.json", bytes: 1 }]);
    expect(overlayEntries(root, ["own/test/results"])).toEqual([]);
  });
});
