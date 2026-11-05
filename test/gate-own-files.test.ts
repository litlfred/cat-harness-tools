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
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import { GATE_OWN_ENV, gateDirectoriesForGraph, gateOwnInstances } from "../scripts/lib/gate-own.ts";
import { corpusDirectoriesForGraph } from "../schemas/kg/harness-config.ts";
import { HARNESS_ROOT } from "../scripts/lib/roots.ts";
import { auditSchemaNodes } from "../scripts/schema-nodes.ts";

const RUN_GATES = resolve(import.meta.dir, "..", ".github", "scripts", "layer-pr-checks", "run-gates.py");
// Where this layer can sit: this file's own layer root (the standalone
// rehearsal, where the layer IS the checkout root, and a mounted index), or
// the harness's sibling as a composing checkout resolves it. Real paths, so a
// symlinked mount compares as itself.
const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
const TOOLS_ROOTS = [...new Set([resolve(import.meta.dir, ".."), resolve(HARNESS_ROOT, "..", "cat-harness-tools")].map(real))];
const underTools = (d: string) => TOOLS_ROOTS.some((t) => !relative(t, real(d)).startsWith(".."));

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
    for (const d of a.directories) expect(underTools(d)).toBe(true);
    const whole = new Set(modules(all));
    for (const m of modules(a)) expect(whole.has(m)).toBe(true);
    // Whether this layer is in the harness's corpus at all depends on the
    // composition: a composing index stacks it on the harness, while the
    // standalone rehearsal lays the layers out as siblings with no root
    // above them, so from the harness this layer is not there. The scoped
    // audit must find it exactly when the whole corpus holds it.
    const wholeHasTools = auditSchemaNodes(HARNESS_ROOT, "checkout").directories.some(underTools);
    expect(a.directories.length > 0).toBe(wholeHasTools);
    expect(modules(a).length > 0).toBe(wholeHasTools);
  });
});

describe("gateDirectoriesForGraph: the subjects a scoped check judges", () => {
  test("unset is the whole corpus, unscoped", () => {
    const g = gateDirectoriesForGraph(HARNESS_ROOT, "methodology", {});
    expect(g.scoped).toBeUndefined();
    expect(g.dirs).toEqual(corpusDirectoriesForGraph(HARNESS_ROOT, "methodology"));
  });

  test("scoped to an instance that commits none is empty, and says it was scoped", () => {
    const g = gateDirectoriesForGraph(HARNESS_ROOT, "methodology", { [GATE_OWN_ENV]: "no-such-instance" });
    expect([...g.scoped!]).toEqual(["no-such-instance"]);
    expect(g.dirs).toEqual([]);
  });
});

describe("a scoped check whose caller commits none of its subjects passes, never exits 2 or 78", () => {
  // Exit 2 or 78 against a base that passed is a NEW failure in compare-gates.py.
  const env = { ...process.env, [GATE_OWN_ENV]: "no-such-instance" };
  for (const [script, what] of [
    ["check-methodology-evidence.ts", "methodology directory"],
    ["check-tabular-stubs.ts", "library directory"],
    ["check-translation-officiality.ts", "translations directory"],
    ["check-schema-nodes.ts", "schemas/*.ts"],
  ] as const) {
    test(script, () => {
      const r = spawnSync("bun", [resolve(import.meta.dir, "..", "scripts", script)], { encoding: "utf-8", env });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`commits no ${what}`);
    });
  }
});
