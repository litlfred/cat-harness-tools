/**
 * state-pin.sh serves the branch-kept graphs at the run's pinned tips. When a
 * PR's first attempt takes main's record's tips, a branch seeded after main's
 * last push is not in the record: it is served at the live read's tip
 * (state-live.json), not by an empty mirror (dth-sfp#13: cat/dth-sfp/beans
 * and todos read "unmounted" on both sides).
 *
 * The script is driven through bash, as the workflow does, against local
 * repositories that stand in for GitHub (a `url.<file>.insteadOf` rewrite).
 *
 * @module test/layer-state-pin.test
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dir, "..");
const SCRIPT = join(ROOT, ".github", "scripts", "layer-pr-checks", "state-pin.sh");
const WORKFLOW = join(ROOT, ".github", "workflows", "layer-pr-checks.yml");
const REPO = "o/r";

let dir: string;
let remotes: string;
let oldBeans: string;
let newBeans: string;
let todos: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "push.negotiate=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_COUNT: "0" } }).trim();

/** A commit on `branch` of the stand-in remote, returning its sha. */
function commit(branch: string, file: string): string {
  const work = join(dir, "work");
  git(work, "checkout", "-q", "--orphan", `${branch}-${file}`);
  writeFileSync(join(work, file), file);
  git(work, "add", file);
  git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", file);
  const sha = git(work, "rev-parse", "HEAD");
  git(work, "push", "-q", "-f", join(remotes, `${REPO}.git`), `HEAD:refs/heads/${branch}`);
  return sha;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "state-pin-"));
  remotes = join(dir, "remotes");
  mkdirSync(join(remotes, "o"), { recursive: true });
  execFileSync("git", ["init", "-q", "--bare", join(remotes, `${REPO}.git`)]);
  execFileSync("git", ["init", "-q", join(dir, "work")]);
  oldBeans = commit("cat/r/beans", "a");
  newBeans = commit("cat/r/beans", "b");
  todos = commit("cat/r/todos", "c");
});

/** Run state-pin.sh; return the branches each rewritten repository serves. */
function pin(state: unknown, live?: unknown): Record<string, Record<string, string>> {
  const run = mkdtempSync(join(dir, "run-"));
  const pins = join(run, "state.json");
  writeFileSync(pins, JSON.stringify(state));
  const args = [SCRIPT, pins, join(run, "mirror")];
  if (live !== undefined) {
    writeFileSync(join(run, "state-live.json"), JSON.stringify(live));
    args.push(join(run, "state-live.json"));
  }
  // GitHub is the stand-in remotes directory for the script's own fetches.
  const out = execFileSync("bash", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.file://${remotes}/.insteadOf`,
      GIT_CONFIG_VALUE_0: "https://github.com/",
    },
  });
  const served: Record<string, Record<string, string>> = {};
  for (const m of out.matchAll(/GIT_CONFIG_KEY_\d+='url\.file:\/\/(.+?)\.insteadOf' GIT_CONFIG_VALUE_\d+='https:\/\/github\.com\/(.+?)\.git'/g)) {
    const refs: Record<string, string> = {};
    for (const line of git(m[1], "for-each-ref", "--format=%(objectname) %(refname)").split("\n").filter(Boolean)) {
      const [sha, ref] = line.split(" ");
      refs[ref.replace("refs/heads/", "")] = sha;
    }
    served[m[2]] = refs;
  }
  return served;
}

describe("state-pin.sh and branches seeded after main's record", () => {
  test("pinned tips are served as pinned, not at the remote's tip", () => {
    expect(pin({ [REPO]: { "cat/r/beans": oldBeans } })).toEqual({ [REPO]: { "cat/r/beans": oldBeans } });
  });

  test("without a live read, a branch the record lacks is absent, as before", () => {
    expect(pin({ [REPO]: {} })).toEqual({ [REPO]: {} });
  });

  test("a branch the record lacks is served at the live read's tip", () => {
    const live = { [REPO]: { "cat/r/beans": newBeans, "cat/r/todos": todos } };
    expect(pin({ [REPO]: {} }, live)).toEqual(live);
  });

  test("the record's tips win over the live read for a branch both name", () => {
    const live = { [REPO]: { "cat/r/beans": newBeans, "cat/r/todos": todos } };
    expect(pin({ [REPO]: { "cat/r/beans": oldBeans } }, live)).toEqual({
      [REPO]: { "cat/r/beans": oldBeans, "cat/r/todos": todos },
    });
  });

  test("a repository the record does not name is pinned at the live read", () => {
    expect(pin({}, { [REPO]: { "cat/r/todos": todos } })).toEqual({ [REPO]: { "cat/r/todos": todos } });
  });

  test("a live-read path that does not exist changes nothing", () => {
    const run = mkdtempSync(join(dir, "run-"));
    const pins = join(run, "state.json");
    writeFileSync(pins, JSON.stringify({ [REPO]: {} }));
    const out = execFileSync("bash", [SCRIPT, pins, join(run, "mirror"), join(run, "absent.json")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.file://${remotes}/.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/" },
    });
    expect(out).toContain("GIT_CONFIG_COUNT=1");
  });

  test("the workflow keeps the live read before the record replaces it, and hands it to the mount", () => {
    const text = readFileSync(WORKFLOW, "utf8");
    const wf = parse(text) as { jobs: Record<string, { steps?: { run?: string }[] }> };
    const runs = Object.values(wf.jobs).flatMap((j) => (j.steps ?? []).map((s) => s.run ?? ""));
    const write = runs.find((r) => r.includes('cp "$rec/state.json" "$RUNNER_TEMP/pin/state.json"'));
    expect(write).toBeDefined();
    const keep = write!.indexOf('cp "$RUNNER_TEMP/pin/state.json" "$RUNNER_TEMP/pin/state-live.json"');
    expect(keep).toBeGreaterThan(-1);
    expect(keep).toBeLessThan(write!.indexOf('cp "$rec/state.json"'));
    const mounts = runs.filter((r) => r.includes("state-pin.sh"));
    expect(mounts.length).toBeGreaterThan(0);
    for (const m of mounts) expect(m).toContain('"$RUNNER_TEMP/pin/state-live.json"');
  });
});
