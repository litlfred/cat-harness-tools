/**
 * The standing repin's PR step, run for real against stub `gh` and `git`:
 * who may ask for auto-merge (owner, 2026-11-13, card "Standing re-pin
 * workflows: MM dispatches, auto-merge OK").
 *
 * The step's own `run:` script is read out of
 * `.github/workflows/standing-repin.yml` and executed with bash, with `gh`
 * and `git` on PATH replaced by stubs that log their arguments. So the test
 * judges what the workflow does, not a copy of it.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

const WORKFLOW = join(import.meta.dir, "..", "..", "..", ".github", "workflows", "standing-repin.yml");
const STEP = "Open or update the one repin PR";

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

function step(): Step {
  const wf = parse(readFileSync(WORKFLOW, "utf8")) as { jobs: { repin: { steps: Step[] } } };
  const s = wf.jobs.repin.steps.find((x) => x.name === STEP);
  if (!s?.run) throw new Error(`no "${STEP}" step with a run script`);
  return s;
}

/** Run the step as `event` would; `existing` is an open repin PR, or none. */
function runStep(event: string, existing?: number, labelFails = false): { code: number; calls: string[]; summary: string } {
  const dir = mkdtempSync(join(tmpdir(), "standing-repin-"));
  const log = join(dir, "calls.log");
  const stub = (name: string, body: string) => {
    const p = join(dir, name);
    writeFileSync(p, `#!/usr/bin/env bash\necho "${name} $*" >> "${log}"\n${body}\n`);
    chmodSync(p, 0o755);
  };
  stub("git", `case "$1" in status) echo " M index.lock.json";; diff) echo index.lock.json;; esac`);
  const listed = existing ? `{"number":${existing},"headRefName":"repin/standing-2026-11-01"}` : "";
  stub(
    "gh",
    [
      `if [ "$1 $2" = "pr list" ]; then echo '${listed}'; fi`,
      `if [ "$1 $2" = "pr view" ]; then echo 42; fi`,
      labelFails ? `if [ "$1 $2" = "pr edit" ] && [[ "$*" == *--add-label* ]]; then exit 1; fi` : "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "repin.md"), "moved cat-harness\n");
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  const s = step();
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: `${dir}:${process.env.PATH}`,
    RUNNER_TEMP: dir,
    GITHUB_STEP_SUMMARY: summary,
    BASE: "main",
    METHOD: "squash",
    HAS_TOKEN: "true",
    GH_TOKEN: "x",
    EVENT: event,
    // The step's own literal env (the label name), as the workflow sets it.
    ...Object.fromEntries(Object.entries(s.env ?? {}).filter(([, v]) => !String(v).includes("${{"))),
  };
  const r = spawnSync("bash", ["-c", s.run!], { cwd: dir, env, encoding: "utf8" });
  let calls: string[] = [];
  try {
    calls = readFileSync(log, "utf8").trim().split("\n");
  } catch {
    calls = [];
  }
  return { code: r.status ?? -1, calls, summary: readFileSync(summary, "utf8") };
}

const ghCalls = (calls: readonly string[]) => calls.filter((c) => c.startsWith("gh pr merge") || c.startsWith("gh pr edit"));

describe("standing repin: only the merge manager's dispatch asks for auto-merge", () => {
  test("the step reads the caller's event and labels with needs-repin", () => {
    const s = step();
    expect(s.env?.EVENT).toBe("${{ github.event_name }}");
    expect(s.env?.REPIN_LABEL).toBe("needs-repin");
  });

  test("workflow_dispatch (the merge manager started it): auto-merge, no label", () => {
    const r = runStep("workflow_dispatch");
    expect(r.code).toBe(0);
    expect(r.calls.some((c) => c.startsWith("gh pr create --base main --head repin/standing-"))).toBe(true);
    expect(ghCalls(r.calls)).toEqual(["gh pr merge 42 --auto --squash"]);
  });

  test.each(["schedule", "repository_dispatch"])("%s: the PR is labelled needs-repin, and auto-merge is never asked for", (event) => {
    const r = runStep(event);
    expect(r.code).toBe(0);
    expect(ghCalls(r.calls)).toEqual(["gh pr edit 42 --add-label needs-repin", "gh pr merge 42 --disable-auto"]);
    expect(r.calls.some((c) => c.includes("--auto"))).toBe(false);
    expect(r.summary).toContain(`labelled \`needs-repin\` for the merge manager; no auto-merge on a ${event} run`);
  });

  test("a scheduled run updating the open repin PR labels that PR and turns its auto-merge off", () => {
    const r = runStep("schedule", 7);
    expect(r.code).toBe(0);
    expect(r.calls.some((c) => c.startsWith("gh pr create"))).toBe(false);
    expect(ghCalls(r.calls)).toEqual([
      expect.stringMatching(/^gh pr edit 7 --title /),
      "gh pr edit 7 --add-label needs-repin",
      "gh pr merge 7 --disable-auto",
    ]);
  });

  test("a label that cannot be added fails the run, so the merge manager is not left unaware", () => {
    const r = runStep("schedule", undefined, true);
    expect(r.code).not.toBe(0);
    expect(r.calls.some((c) => c.includes("--auto"))).toBe(false);
  });
});
