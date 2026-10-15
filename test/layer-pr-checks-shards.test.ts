/**
 * The layer PR-check gates split across jobs (bean `lpcs`, step 3) judge the
 * same set as one job, and a missing shard is never a pass.
 *
 * `run-gates.py` runs shard `i` of `N` when `GATE_SHARD=i/N` is set;
 * `merge-shards.py` joins one side's shards for the compare step and exits 2
 * when any is missing or they do not cover the set exactly once. These drive
 * both through python3, as `layer-pr-checks.yml` does, over a fixture root
 * whose declared gates run `true` (its `cat` script), so they are fast.
 *
 * @module test/layer-pr-checks-shards.test
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DIR = resolve(import.meta.dir, "..", ".github", "scripts", "layer-pr-checks");
const RUN_GATES = join(DIR, "run-gates.py");
const MERGE = join(DIR, "merge-shards.py");
/** One RUNNER_TEMP for every run here: kg-export's command names it, and the runs are compared. */
const RUNNER_TEMP = mkdtempSync(join(tmpdir(), "gate-runner-temp-"));

/** A root declaring instance `a`, with 17 declared gates that all pass. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "gate-shards-"));
  writeFileSync(join(root, "a.json"), JSON.stringify({ name: "a", needs: [] }));
  const scripts: Record<string, string> = { cat: "true" };
  for (let k = 0; k < 15; k++) scripts[`check:g${String(k).padStart(2, "0")}`] = "true";
  scripts["zz:check"] = "true";
  scripts["lint:check"] = "true";
  scripts["build"] = "true"; // not a gate
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "a", scripts }));
  return root;
}

function env(shard?: string): NodeJS.ProcessEnv {
  const { GATE_SHARD: _drop, ...rest } = process.env;
  return shard === undefined ? rest : { ...rest, GATE_SHARD: shard };
}

function list(root: string, shard?: string): { gates: Record<string, string>; skipped: object; shard?: { shard: number; of: number; total: number } } {
  const r = spawnSync("python3", ["-I", RUN_GATES, root, "--list"], { encoding: "utf-8", env: env(shard) });
  if (r.status !== 0) throw new Error(`--list exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Run shard `i/n` of `root` into `<results>/results-<side>-<i>/`, as the workflow's upload lays it out. */
function runShard(root: string, results: string, side: string, i: number, n: number): void {
  const out = join(results, `results-${side}-${i}`);
  mkdirSync(out, { recursive: true });
  const r = spawnSync("python3", ["-I", RUN_GATES, root, join(out, "gates.json")], {
    encoding: "utf-8",
    env: { ...env(`${i}/${n}`), RUNNER_TEMP },
  });
  if (r.status !== 0) throw new Error(`run-gates.py exited ${r.status}: ${r.stderr}`);
  writeFileSync(join(out, "junit.xml"), `<?xml version="1.0"?><testsuites tests="${i}"><testsuite name="s${i}"><testcase name="t${i}"/></testsuite></testsuites>`);
}

function merge(results: string, side: string, n: number): { status: number | null; out: string; stdout: string } {
  const out = mkdtempSync(join(tmpdir(), "gate-merged-"));
  const r = spawnSync("python3", ["-I", MERGE, results, side, String(n), out], { encoding: "utf-8", env: env() });
  return { status: r.status, out, stdout: r.stdout + r.stderr };
}

describe("run-gates.py GATE_SHARD", () => {
  const root = fixtureRoot();
  const whole = list(root);
  const names = Object.keys(whole.gates);

  test("the fixture derives a gate set big enough to split", () => {
    expect(names.length).toBeGreaterThan(17);
    expect(names).not.toContain("a:build");
  });

  test("1/1 is today's set, in today's order", () => {
    const one = list(root, "1/1");
    expect(Object.keys(one.gates)).toEqual(names);
    expect(one.gates).toEqual(whole.gates);
    expect(one.skipped).toEqual(whole.skipped);
  });

  for (const n of [2, 3, 4, 7]) {
    test(`${n} shards are disjoint, and their union is the unsharded set`, () => {
      const seen: string[] = [];
      for (let i = 1; i <= n; i++) {
        const part = list(root, `${i}/${n}`);
        expect(part.shard).toEqual({ shard: i, of: n, total: names.length });
        const mine = Object.keys(part.gates);
        for (const g of mine) expect(part.gates[g]).toBe(whole.gates[g]);
        // Balanced to within one gate: a round-robin of the sorted names.
        expect(Math.abs(mine.length - names.length / n)).toBeLessThan(1);
        seen.push(...mine);
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect([...seen].sort()).toEqual([...names].sort());
    });
  }

  test("the slice is the same on every call (base and head split alike)", () => {
    expect(list(root, "2/3").gates).toEqual(list(root, "2/3").gates);
  });

  for (const bad of ["0/4", "5/4", "1/0", "x", "1/2/3", "-1/4"]) {
    test(`a malformed GATE_SHARD (${bad}) exits 2, never a guessed slice`, () => {
      const r = spawnSync("python3", ["-I", RUN_GATES, root, "--list"], { encoding: "utf-8", env: env(bad) });
      expect(r.status).toBe(2);
      expect(r.stdout).toBe("");
    });
  }
});

describe("merge-shards.py", () => {
  const root = fixtureRoot();
  const unsharded = mkdtempSync(join(tmpdir(), "gate-whole-"));
  runShard(root, unsharded, "head", 1, 1);
  const wholeGates = JSON.parse(readFileSync(join(unsharded, "results-head-1", "gates.json"), "utf-8"));
  const results = mkdtempSync(join(tmpdir(), "gate-results-"));
  for (let i = 1; i <= 4; i++) runShard(root, results, "head", i, 4);

  test("every gate records its wall time", () => {
    for (const entry of Object.values(wholeGates) as { seconds?: number }[]) expect(typeof entry.seconds).toBe("number");
  });

  test("four joined shards hold the same verdicts as one unsharded run", () => {
    const m = merge(results, "head", 4);
    expect(m.status).toBe(0);
    const merged = JSON.parse(readFileSync(join(m.out, "gates.json"), "utf-8"));
    const verdicts = (g: Record<string, { exit?: number; command: string }>) =>
      Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [v.command, v.exit]]));
    expect(verdicts(merged)).toEqual(verdicts(wholeGates));
    const junit = readFileSync(join(m.out, "junit.xml"), "utf-8");
    expect(junit).toContain('tests="10"'); // 1+2+3+4: every shard's suites, under one root
    for (let i = 1; i <= 4; i++) expect(junit).toContain(`name="t${i}"`);
  });

  test("a missing shard is could-not-determine, never a pass", () => {
    const partial = mkdtempSync(join(tmpdir(), "gate-partial-"));
    for (const i of [1, 2, 4]) cpSync(join(results, `results-head-${i}`), join(partial, `results-head-${i}`), { recursive: true });
    const m = merge(partial, "head", 4);
    expect(m.status).toBe(2);
    expect(m.stdout).toContain("results-head-3 is missing");
    expect(existsSync(join(m.out, "gates.json"))).toBe(false);
  });

  test("a shard missing one of its files is could-not-determine", () => {
    const partial = mkdtempSync(join(tmpdir(), "gate-partial-"));
    cpSync(results, partial, { recursive: true });
    rmSync(join(partial, "results-head-2", "gates.json"));
    expect(merge(partial, "head", 4).status).toBe(2);
  });

  test("shards of another N, or a side with fewer shards than expected, are could-not-determine", () => {
    expect(merge(results, "head", 3).status).toBe(2); // shard 1 says 1/4
    expect(merge(results, "head", 5).status).toBe(2);
    expect(merge(results, "base", 4).status).toBe(2); // no base shards at all
  });

  test("a shard that dropped a gate it was given is could-not-determine", () => {
    const partial = mkdtempSync(join(tmpdir(), "gate-partial-"));
    cpSync(results, partial, { recursive: true });
    const p = join(partial, "results-head-3", "gates-shard.json");
    const meta = JSON.parse(readFileSync(p, "utf-8"));
    meta.ran = meta.ran.slice(1);
    writeFileSync(p, JSON.stringify(meta));
    const m = merge(partial, "head", 4);
    expect(m.status).toBe(2);
    expect(m.stdout).toContain("of a set of");
  });
});
