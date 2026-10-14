/**
 * A checkout-level graph that a MOUNTED instance declares and the root does
 * not: absent, not a failed mount.
 *
 * Found on smart-ra#59 (2026-10-14). cat-harness declares `issue-marks` with
 * `scope: "repository"` on `cat/cat-harness/issue-marks`. A repository-scoped
 * graph is the checkout's own, so it is read from the checkout's `origin`.
 * folio-assistant's origin carries that branch; smart-ra's does not, and
 * smart-ra's root declaration (unlike for beans, todos and fsh-guts) does not
 * override the path. The mount reported `miss` and failed the run. Owner,
 * 2026-10-14: "Report as absent".
 *
 * What is pinned:
 *
 * | test | the rule |
 * |---|---|
 * | tipLocations | only a repository-scoped location of a non-root instance carries `unownedBy` |
 * | origin lacks the branch | `absent`, and the mount as a whole is `mounted` |
 * | origin carries the branch | it mounts as before (the folio-assistant case) |
 * | the root declares the path | the root's declaration wins, and ITS miss is still a failure |
 *
 * Real repositories, as in `state-mount-shared-id.test.ts`: the outcome turns on
 * a fetch that does or does not find a branch.
 *
 * @module scripts/tests/state-mount-unowned
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { tipLocations } from "../branch-store.ts";
import { mountState, report } from "../state-mount.ts";

const NOGPG = ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t"];
const MANIFEST = JSON.stringify({ $schema: "state-manifest/v1", status: "seed", authoritative: false, keyedBy: "tip" });

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", [...NOGPG, ...args], { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} → ${r.status}\n${r.stderr}`);
  return r.stdout;
}

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function seed(base: string, bare: string, branch: string, files: Record<string, string>): void {
  const dir = mkdtempSync(join(base, "seed-"));
  git(dir, "init", "-q", "-b", "seed");
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), t);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", `seed ${branch}`);
  git(dir, "push", "-q", `file://${bare}`, `HEAD:refs/heads/${branch}`);
}

const MARKS_BRANCH = "cat/lower/issue-marks";
const ROOT_MARKS_BRANCH = "cat/root/issue-marks";
const BEANS_BRANCH = "cat/root/beans";

interface Opts {
  /** Seed the lower instance's `issue-marks` branch on the checkout's origin. */
  originCarriesMarks?: boolean;
  /** The root declares `issue-marks/` itself, on its own branch (seeded only if `rootMarksSeeded`). */
  rootDeclaresMarks?: boolean;
  rootMarksSeeded?: boolean;
}

/**
 * An index checkout: a root instance that declares `beans/` (seeded), and a
 * mounted instance `lower/` that declares `issue-marks/` with
 * `scope: "repository"`.
 */
function index(o: Opts = {}) {
  const base = mkdtempSync(join(tmpdir(), "state-mount-unowned-"));
  made.push(base);
  const origin = join(base, "origin.git");
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  seed(base, origin, BEANS_BRANCH, { "manifest.json": MANIFEST, "beans/a.md": "A\n" });
  if (o.originCarriesMarks) seed(base, origin, MARKS_BRANCH, { "manifest.json": MANIFEST, "issue-marks/1.json": "{}\n" });
  if (o.rootMarksSeeded) seed(base, origin, ROOT_MARKS_BRANCH, { "manifest.json": MANIFEST, "issue-marks/2.json": "{}\n" });

  const work = join(base, "work");
  mkdirSync(work);
  git(work, "init", "-q", "-b", "main");
  const rootDirs: object[] = [{ id: "beans", path: "beans/", scope: "repository", graphTypologies: ["beans"], storage: { branch: BEANS_BRANCH, keyedBy: "tip" } }];
  if (o.rootDeclaresMarks) {
    rootDirs.push({ id: "issue-marks", path: "issue-marks/", scope: "repository", graphTypologies: ["issue-marks"], storage: { branch: ROOT_MARKS_BRANCH, keyedBy: "tip" } });
  }
  writeFileSync(join(work, "root.json"), JSON.stringify({ $schema: "cat-harness-declaration/1.0.0", name: "root", directories: rootDirs }));
  mkdirSync(join(work, "lower"));
  writeFileSync(
    join(work, "lower", "lower.json"),
    JSON.stringify({
      $schema: "cat-harness-declaration/1.0.0",
      name: "lower",
      directories: [{ id: "issue-marks", path: "issue-marks/", scope: "repository", graphTypologies: ["issue-marks"], storage: { branch: MARKS_BRANCH, keyedBy: "tip" } }],
    }),
  );
  git(work, "add", "root.json");
  git(work, "commit", "-q", "-m", "root");
  git(work, "remote", "add", "origin", `file://${origin}`);
  return { base, origin, work };
}

describe("a repository-scoped graph a mounted instance declares and the root does not", () => {
  test("tipLocations marks it unowned, and only it", () => {
    const f = index();
    const locs = tipLocations(f.work);
    expect(locs.find((l) => l.id === "issue-marks")).toMatchObject({ path: "issue-marks", branch: MARKS_BRANCH, unownedBy: "lower" });
    expect(locs.find((l) => l.id === "beans")?.unownedBy).toBeUndefined();
  });

  test("its branch missing from the checkout's origin is ABSENT, and the mount still succeeds", () => {
    const f = index();
    const r = mountState({ repoRoot: f.work });
    expect(r.graphs.map((g) => [g.id, g.state])).toEqual([
      ["beans", "mounted"],
      ["issue-marks", "absent"],
    ]);
    expect(r.state).toBe("mounted");
    expect(existsSync(join(f.work, "issue-marks"))).toBe(false);
    const text = report(r);
    expect(text).not.toContain("FAILED");
    expect(text).toContain("`issue-marks`: absent");
  });

  test("its branch on the checkout's origin mounts as before", () => {
    const f = index({ originCarriesMarks: true });
    const r = mountState({ repoRoot: f.work });
    expect(r.state).toBe("mounted");
    expect(r.graphs.find((g) => g.id === "issue-marks")?.state).toBe("mounted");
    expect(existsSync(join(f.work, "issue-marks", "1.json"))).toBe(true);
  });

  test("a root that declares the path owns it: its branch mounts, and its miss is still a failure", () => {
    const ok = index({ rootDeclaresMarks: true, rootMarksSeeded: true });
    expect(tipLocations(ok.work).find((l) => l.id === "issue-marks")).toMatchObject({ branch: ROOT_MARKS_BRANCH });
    expect(tipLocations(ok.work).find((l) => l.id === "issue-marks")?.unownedBy).toBeUndefined();
    expect(mountState({ repoRoot: ok.work }).graphs.find((g) => g.id === "issue-marks")?.state).toBe("mounted");

    const missing = index({ rootDeclaresMarks: true });
    const r = mountState({ repoRoot: missing.work });
    expect(r.graphs.find((g) => g.id === "issue-marks")?.state).toBe("miss");
    expect(r.state).toBe("partial");
  });
});
