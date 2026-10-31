/**
 * The layer PR-check gate runner gives a gate the input this run has, and
 * says why when it has none — it never runs one bare to read its usage error.
 *
 * smart-ra#65 (run 38640286019): `check:corpus-gate` run with no arguments
 * printed its usage and exited 2, `check:test-budgets` exited 2 with no junit
 * report, and `uml:overview:check` ended "/usr/bin/cat: 'qa:refresh': No such
 * file or directory" because the root declared no `cat` script. These drive
 * `.github/scripts/layer-pr-checks/` through python3, as the workflow does.
 *
 * @module test/layer-pr-checks-gate-inputs.test
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DIR = resolve(import.meta.dir, "..", ".github", "scripts", "layer-pr-checks");

/** Load `<file>` from DIR as a module and print the JSON of `expr` over it (`m`). */
function py(file: string, expr: string): unknown {
  const code = [
    "import importlib.util, json, sys",
    `spec = importlib.util.spec_from_file_location("m", ${JSON.stringify(join(DIR, file))})`,
    "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
    `print(json.dumps(${expr}))`,
  ].join("\n");
  const r = spawnSync("python3", ["-I", "-c", code], { encoding: "utf-8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

const junit = (cases: number): string => {
  const dir = mkdtempSync(join(tmpdir(), "gate-inputs-"));
  const path = join(dir, "junit.xml");
  const tc = Array.from({ length: cases }, (_, i) => `<testcase name="t${i}" file="a.test.ts" time="0.1"/>`).join("");
  writeFileSync(path, `<?xml version="1.0"?><testsuites tests="${cases}"><testsuite name="a.test.ts">${tc}</testsuite></testsuites>`);
  return path;
};

describe("run-gates.py gate inputs", () => {
  test("corpus-gate is given --since the PR's diff base", () => {
    const sha = "a".repeat(40);
    expect(py("run-gates.py", `m.gate_args("check:corpus-gate", {"GATE_DIFF_BASE": "${sha}"})`)).toEqual([["--since", sha], null]);
  });

  test("corpus-gate with no diff base is skipped with a reason, never run bare", () => {
    const [args, why] = py("run-gates.py", `m.gate_args("check:corpus-gate", {})`) as [unknown, string];
    expect(args).toBeNull();
    expect(why).toContain("--since");
  });

  test("translation:catalogue:check is given --base the PR's diff base, not a three-dot default", () => {
    const sha = "b".repeat(40);
    expect(py("run-gates.py", `m.gate_args("translation:catalogue:check", {"GATE_DIFF_BASE": "${sha}"})`)).toEqual([["--base", sha], null]);
    const [args, why] = py("run-gates.py", `m.gate_args("translation:catalogue:check", {})`) as [unknown, string];
    expect(args).toBeNull();
    expect(why).toContain("--base");
  });

  test("test-budgets is given the junit report the tests step wrote", () => {
    const path = junit(3);
    expect(py("run-gates.py", `m.gate_args("check:test-budgets", {"GATE_JUNIT": ${JSON.stringify(path)}})`)).toEqual([[path], null]);
  });

  test("test-budgets over a report of no cases, or none, is skipped with a reason", () => {
    const empty = junit(0);
    const [a1, w1] = py("run-gates.py", `m.gate_args("check:test-budgets", {"GATE_JUNIT": ${JSON.stringify(empty)}})`) as [unknown, string];
    expect(a1).toBeNull();
    expect(w1).toContain("no test cases");
    const [a2, w2] = py("run-gates.py", `m.gate_args("check:test-budgets", {"GATE_JUNIT": "/nonexistent/junit.xml"})`) as [unknown, string];
    expect(a2).toBeNull();
    expect(w2).toContain("absent");
  });

  test("a gate that takes no input runs as declared", () => {
    expect(py("run-gates.py", `m.gate_args("check:workflows", {})`)).toEqual([[], null]);
  });

  test("the supplied gates are no longer in the never-supplied list", () => {
    expect(py("run-gates.py", `sorted(set(m.SUPPLIED_INPUTS) & set(m.NEEDS_INPUT_SCRIPTS))`)).toEqual([]);
  });

  test("post-merge:regen:check is skipped as live-state so it does not run the gates inside the gates (bean lpcs)", () => {
    const [kind, why] = py("run-gates.py", `m.skip_reason(".", "post-merge:regen:check")`) as [string, string];
    expect(kind).toBe("live-state");
    expect(why).toContain("live state");
  });

  test("ingest:ig-chrome:check is skipped as needs-input because it requires external --layer template checkouts (smart-base#239)", () => {
    const [kind, why] = py("run-gates.py", `m.skip_reason(".", "ingest:ig-chrome:check")`) as [string, string];
    expect(kind).toBe("needs-input");
    expect(why).toContain("--layer");
  });
});

describe("root-cat-script.py", () => {
  const root = (pkg: object | null, runner = "cat-harness-tools/scripts/run-script.ts"): string => {
    const dir = mkdtempSync(join(tmpdir(), "root-cat-"));
    if (pkg) writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    if (runner) {
      mkdirSync(join(dir, runner, ".."), { recursive: true });
      writeFileSync(join(dir, runner), "");
    }
    return dir;
  };

  test("a root with no `cat` script gets one that runs the harness's runner", () => {
    const dir = root({ name: "smart-ra", scripts: { "check:archimate": "x" } });
    expect(py("root-cat-script.py", `m.ensure(${JSON.stringify(dir)})`)).toEqual(["added", "bun cat-harness-tools/scripts/run-script.ts"]);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    expect(pkg.scripts).toEqual({ "check:archimate": "x", cat: "bun cat-harness-tools/scripts/run-script.ts" });
  });

  test("a root that declares `cat` keeps its own", () => {
    const dir = root({ scripts: { cat: "bun cat-harness/scripts/run-script.ts" } });
    expect(py("root-cat-script.py", `m.ensure(${JSON.stringify(dir)})`)).toEqual(["kept", "bun cat-harness/scripts/run-script.ts"]);
  });

  test("before bean 70lx the runner is cat-harness's", () => {
    const dir = root({}, "cat-harness/scripts/run-script.ts");
    expect(py("root-cat-script.py", `m.ensure(${JSON.stringify(dir)})`)).toEqual(["added", "bun cat-harness/scripts/run-script.ts"]);
  });

  test("no runner anywhere is reported, not papered over", () => {
    const dir = root({}, "");
    expect(py("root-cat-script.py", `m.ensure(${JSON.stringify(dir)})`)).toEqual(["missing", null]);
  });
});

describe("empty-baseline.py (cat-harness-tools#1139)", () => {
  const runCheck = (files: Record<string, string>, mainSha = "abc1234") => {
    const work = mkdtempSync(join(tmpdir(), "empty-baseline-"));
    const root = join(work, "fa");
    const out = join(work, "base-results");
    const ghOut = join(work, "gh-output");
    const ghSum = join(work, "gh-summary");
    mkdirSync(root, { recursive: true });
    writeFileSync(ghOut, "");
    writeFileSync(ghSum, "");
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(root, name), content);
    }
    const r = spawnSync("python3", ["-I", join(DIR, "empty-baseline.py"), "check", root, out, mainSha], {
      encoding: "utf-8",
      env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: ghOut, GITHUB_STEP_SUMMARY: ghSum },
    });
    if (r.status !== 0) throw new Error(r.stderr);
    return {
      out,
      output: readFileSync(ghOut, "utf-8").trim(),
      summary: readFileSync(ghSum, "utf-8"),
    };
  };

  test("a base with both index.lock.json and index.config.json is not empty", () => {
    const r = runCheck({ "index.lock.json": "{}", "index.config.json": "{}" });
    expect(r.output).toBe("empty=false");
    expect(r.summary).toBe("");
  });

  test("a base missing index.lock.json or index.config.json writes an empty baseline and reports it", () => {
    for (const files of [
      {},
      { "index.config.json": "{}" },
      { "index.lock.json": "{}" },
    ] as Record<string, string>[]) {
      const r = runCheck(files, "deadbeef");
      expect(r.output).toBe("empty=true");
      expect(r.summary).toContain("main has no harness: compared against an empty baseline");
      expect(JSON.parse(readFileSync(join(r.out, "gates.json"), "utf-8"))).toEqual({});
      expect(JSON.parse(readFileSync(join(r.out, "from.json"), "utf-8"))).toMatchObject({
        no_harness: true,
        main: "deadbeef",
      });

      const sumFile = join(r.out, "compare-summary");
      writeFileSync(sumFile, "");
      const s = spawnSync(
        "python3",
        ["-I", join(DIR, "empty-baseline.py"), "summary", join(r.out, "from.json"), "no-harness", "empty"],
        { encoding: "utf-8", env: { PATH: process.env.PATH ?? "", GITHUB_STEP_SUMMARY: sumFile } },
      );
      expect(s.status).toBe(0);
      const compareSummary = readFileSync(sumFile, "utf-8");
      expect(compareSummary).toContain("### Main's side: empty baseline");
      expect(compareSummary).toContain("main has no harness: compared against an empty baseline");
      expect(compareSummary).toContain("`deadbeef`");
    }
  });

  test("compared against the empty baseline, PR passes pass and PR failures count as new", () => {
    const r = runCheck({});
    const headPassGates = join(r.out, "head-pass-gates.json");
    const headFailGates = join(r.out, "head-fail-gates.json");
    writeFileSync(headPassGates, JSON.stringify({ "dth-sc:check:ig": { command: "c", exit: 0, tail: "ok" } }));
    writeFileSync(
      headFailGates,
      JSON.stringify({
        "dth-sc:check:ig": { command: "c", exit: 0, tail: "ok" },
        "dth-sc:check:broken": { command: "c", exit: 1, tail: "bad" },
      }),
    );

    const gPass = spawnSync("python3", ["-I", join(DIR, "compare-gates.py"), join(r.out, "gates.json"), headPassGates], {
      encoding: "utf-8",
    });
    expect(gPass.status).toBe(0);
    expect(gPass.stdout).toContain("| `dth-sc:check:ig` | — | 0 | pass |");

    const gFail = spawnSync("python3", ["-I", join(DIR, "compare-gates.py"), join(r.out, "gates.json"), headFailGates], {
      encoding: "utf-8",
    });
    expect(gFail.status).toBe(1);
    expect(gFail.stdout).toContain("| `dth-sc:check:broken` | — | 1 | NEW FAILURE |");

    const headPassJunit = join(r.out, "head-pass.xml");
    const headFailJunit = join(r.out, "head-fail.xml");
    writeFileSync(
      headPassJunit,
      `<?xml version="1.0"?><testsuites tests="2"><testsuite name="s"><testcase name="t1"/><testcase name="t2"/></testsuite></testsuites>`,
    );
    writeFileSync(
      headFailJunit,
      `<?xml version="1.0"?><testsuites tests="2"><testsuite name="s"><testcase name="t1"/><testcase name="t2"><failure message="boom"/></testcase></testsuite></testsuites>`,
    );

    const tPass = spawnSync("python3", ["-I", join(DIR, "compare-test-failures.py"), join(r.out, "junit.xml"), headPassJunit], {
      encoding: "utf-8",
    });
    expect(tPass.status).toBe(0);
    expect(tPass.stdout).toContain("| main | 0 | 0 |");
    expect(tPass.stdout).toContain("**New failures: 0**");

    const tFail = spawnSync("python3", ["-I", join(DIR, "compare-test-failures.py"), join(r.out, "junit.xml"), headFailJunit], {
      encoding: "utf-8",
    });
    expect(tFail.status).toBe(1);
    expect(tFail.stdout).toContain("**New failures: 1**");
    expect(tFail.stdout).toContain("`s > t2`");
  });

  test("summary preserves stored-main formatting for exact and stored tiers", () => {
    const work = mkdtempSync(join(tmpdir(), "empty-baseline-stored-"));
    const fromPath = join(work, "from.json");
    writeFileSync(
      fromPath,
      JSON.stringify({
        main: "11112222",
        pinned_at: "2026-10-31T12:00:00Z",
        index: "",
        run: "https://github.com/litlfred/dth-sc/actions/runs/1",
      }),
    );
    const exact = py("empty-baseline.py", `m.format_summary(${JSON.stringify(fromPath)}, "exact", "k1")`) as string;
    expect(exact).toContain("### Main's side: stored, not recomputed");
    expect(exact).toContain("Main's answer for exactly these inputs was cached");
    expect(exact).not.toContain("re-run **all** jobs");

    const stored = py("empty-baseline.py", `m.format_summary(${JSON.stringify(fromPath)}, "this PR's main", "k2")`) as string;
    expect(stored).toContain("stored for **this PR's main**");
    expect(stored).toContain("re-run **all** jobs");
  });
});
