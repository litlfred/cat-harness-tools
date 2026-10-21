#!/usr/bin/env bun
/**
 * Run bootstrap-tools' standalone rehearsal when bootstrap arrives by remote
 * mount from lock (bean `nn8e`, #2462).
 *
 * ## Why this wrapper exists
 *
 * `rehearse-standalone.ts` (Phase 4 of bean `xsqm`) tests that bootstrap-tools
 * passes its checks when isolated beside bootstrap in an empty scratch directory.
 * To know which files a standalone clone would hold, it queries `gitFiles()`.
 *
 * When bootstrap and bootstrap-tools were submodules, each directory was its own
 * git worktree. Under bean `nn8e`, they arrive by remote mount from the lock and
 * are ignored by the enclosing repository's `.gitignore` and `.git/info/exclude`.
 * In that state, `git ls-files` inside them asks the enclosing repository, which
 * ignores them, returning zero files.
 *
 * ## It works on COPIES, never on the mounts
 *
 * The gates run concurrently over one tree, and no gate may change it. This
 * wrapper used to `git init` inside the shared `bootstrap/` and
 * `bootstrap-tools/` mounts for its whole run. Meanwhile
 * `check:cat-harness-standalone` read the same tree: `instanceRootsIn`
 * (cat-harness `schemas/instance-roots.ts`) drops a subdirectory with its own
 * `.git` as a foreign checkout, and `closureOf` (`seed-ready.ts`) skips a
 * missing need without a word. So cat-harness was laid out without bootstrap,
 * and its five `render-exemption.test.ts` tests failed in every index that runs
 * both gates in one shard (a content layer's harness checks, 2026-10-20). It
 * reproduced exactly: no failures as laid out, the five after `git init` in the
 * two mounts.
 *
 * So bootstrap and bootstrap-tools are copied (without `.git` and
 * `node_modules`) into a fresh temporary directory, the COPIES are given git
 * metadata, the root `node_modules` is linked beside them, and the copy's own
 * rehearsal runs there. Nothing is written into a mount, and the directory is
 * removed afterwards.
 *
 * @module scripts/rehearse-bootstrap-standalone
 * @covers code — bootstrap-tools standalone rehearsal across remote-mounted bootstrap
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { HARNESS_ROOT } from "./lib/roots.ts";

const REPO = dirname(HARNESS_ROOT);

/** `name` copied from the checkout into `into`, as a git repository of its own. */
function copyAsRepository(name: string, into: string): void {
  const from = join(REPO, name);
  const to = join(into, name);
  cpSync(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (p) => !/(^|[\\/])(\.git|node_modules)$/.test(relative(from, p)),
  });
  for (const args of [["init", "-q"], ["add", "-A"]]) {
    const r = spawnSync("git", args, { cwd: to, encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} in ${to}: ${r.stderr}`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), "bootstrap-standalone-src-"));
try {
  copyAsRepository("bootstrap", scratch);
  copyAsRepository("bootstrap-tools", scratch);
  if (existsSync(join(REPO, "node_modules"))) symlinkSync(join(REPO, "node_modules"), join(scratch, "node_modules"), "dir");

  const proc = spawnSync("bun", ["run", join(scratch, "bootstrap-tools/scripts/rehearse-standalone.ts"), ...process.argv.slice(2)], {
    cwd: scratch,
    stdio: "inherit",
  });
  process.exitCode = proc.status ?? (proc.error ? 1 : 0);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
