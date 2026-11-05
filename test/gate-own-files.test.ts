/**
 * A check of a layer's own committed files judges only the caller's own
 * instances in a layer's PR checks (owner ruling 2026-11-05, "Move the
 * checks"; `scripts/lib/gate-own.ts`).
 *
 * `check:schema-nodes` walked every declared `schemas/` in the root, the
 * mounted layers' included, so cat-harness-tools#1478 (two untagged modules
 * on its main) was a NEW failure in every root that mounts it (smart-ra#228).
 * These pin the three halves: the runner names the own instances, the
 * reader parses them, and the audit keeps only those instances' directories.
 *
 * @module test/gate-own-files.test
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { GATE_OWN_ENV, gateOwnInstances } from "../scripts/lib/gate-own.ts";
import { HARNESS_ROOT } from "../scripts/lib/roots.ts";
import { auditSchemaNodes } from "../scripts/schema-nodes.ts";

const RUN_GATES = resolve(import.meta.dir, "..", ".github", "scripts", "layer-pr-checks", "run-gates.py");
// The tools layer as the checkout composes it: the harness's sibling, which is
// what the declarations resolve (in CI, this layer's own mount).
const TOOLS = resolve(HARNESS_ROOT, "..", "cat-harness-tools");

describe("gateOwnInstances", () => {
  test("unset or blank is undefined: the whole checkout is judged, as before", () => {
    expect(gateOwnInstances({})).toBeUndefined();
    expect(gateOwnInstances({ [GATE_OWN_ENV]: " , " })).toBeUndefined();
  });

  test("a comma list is the set of own instances", () => {
    expect([...gateOwnInstances({ [GATE_OWN_ENV]: "smart-base, smart-ra" })!].sort()).toEqual(["smart-base", "smart-ra"]);
  });
});

describe("run-gates.py hands every gate the caller's own instances", () => {
  test("it names the same variable and sets it from the own instances", () => {
    const src = readFileSync(RUN_GATES, "utf-8");
    expect(src).toContain(`GATE_OWN_ENV = "${GATE_OWN_ENV}"`);
    expect(src).toMatch(/os\.environ\.setdefault\(GATE_OWN_ENV, ","\.join\(own\)\)/);
  });
});

describe("auditSchemaNodes with own instances", () => {
  const all = auditSchemaNodes(HARNESS_ROOT, "checkout");
  const modules = (a: ReturnType<typeof auditSchemaNodes>) =>
    [...a.nodes, ...a.exempt, ...a.undeclared, ...a.undeclaredTests, ...a.reasonless].map((m) => m.module).sort();

  test("an instance that declares no schemas/ reads nothing, and is not the schemas/ fallback", () => {
    const a = auditSchemaNodes(HARNESS_ROOT, "checkout", new Set(["no-such-instance"]));
    expect(a.directories).toEqual([]);
    expect(modules(a)).toEqual([]);
  });

  test("this layer's own run reads only this layer's directories, a subset of the whole", () => {
    const a = auditSchemaNodes(HARNESS_ROOT, "checkout", new Set(["cat-harness-tools"]));
    expect(a.directories.length).toBeGreaterThan(0);
    for (const d of a.directories) expect(relative(TOOLS, d).startsWith("..")).toBe(false);
    const whole = new Set(modules(all));
    for (const m of modules(a)) expect(whole.has(m)).toBe(true);
    expect(modules(a).length).toBeGreaterThan(0);
  });
});
