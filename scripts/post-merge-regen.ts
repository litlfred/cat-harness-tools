#!/usr/bin/env bun
/**
 * Post-merge regeneration check and automated repair PR pipeline.
 *
 * @module scripts/post-merge-regen
 * @graphNode none — SDLC maintenance and repair automation
 *
 * ## The failure this exists for (bean `folio-assistant-ey1c`)
 *
 * `.github/workflows/merge-main.yml` runs `bun run cat merge:main` on an opted-in
 * PR branch when `main` moves, resolving declared conflicts and regenerating. But
 * after a PR merges into `main`, nothing regenerates `main`.
 *
 * Any merge changing an enumerated or counted directory can leave `main` red
 * (e.g. `readme:subgraphs:check` step 65 counting files in `uploads/`).
 *
 * The accidental-repair pattern: PR branches that happen to carry regenerated
 * files incidentally repair `main`, creating untrustworthy gate histories
 * (observed 3 times in 2 hours on 2026-10-03).
 *
 * ## Principles
 *
 * 1. Detected and ACTED on: main going stale on a derived artefact is detected
 *    and an automated repair action is generated.
 * 2. Reviewable PR, never direct push to main: the repair is a PR rather than a
 *    push to main, so it is reviewable and cannot bypass CI gates.
 * 3. NEGATIVE CONTROL: a merge that changes nothing counted triggers 0 repairs
 *    and opens NO repair PR, preventing churn.
 * 4. Honest reporting: if a check has no writer or its writer fails, it is
 *    reported as unrepaired/defect (exit 1), not claimed as a repair.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadGates } from "./gates.ts";
import {
  DEFAULT_MAX_PASSES,
  UNGATED_INPUTS,
  regenPass,
  regenToFixpoint,
  repairableGates,
  type Pair,
  type Runner,
} from "./regen-after-merge.ts";
import { repoRootFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { scriptsOf as scriptTableOf } from "@litlfred/cat-harness/schemas/script-table.ts";
import { pairIO } from "./task-io.ts";
import { HARNESS_ROOT } from "./lib/roots.ts";

const ROOT = join(HARNESS_ROOT);

/**
 * Resolve the repository root containing the gating workflows and scripts.
 * Walks up if inside a submodule or isolated worktree.
 */
export function resolveRepoRoot(instanceRoot: string): string {
  let cur = resolve(instanceRoot);
  while (cur !== "/" && !existsSync(join(cur, ".github/workflows/code-quality-gates.yml"))) {
    const parent = join(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  if (existsSync(join(cur, ".github/workflows/code-quality-gates.yml"))) {
    return cur;
  }
  return repoRootFor(instanceRoot);
}

/** Git operations interface to allow clean testing and mocking. */
export interface GitExecutor {
  getCurrentSha: () => string | Promise<string>;
  getChangedFiles: () => string[] | Promise<string[]>;
  createBranch: (branch: string) => void | Promise<void>;
  commitAll: (message: string) => void | Promise<void>;
  pushBranch: (branch: string) => void | Promise<void>;
}

/** GitHub CLI operations interface to allow clean testing and mocking. */
export interface GhExecutor {
  findExistingPr: (opts: { head: string; base: string }) => number | undefined | Promise<number | undefined>;
  createPr: (opts: { title: string; body: string; head: string; base: string }) => { url: string; number?: number } | Promise<{ url: string; number?: number }>;
}

/** Options for post-merge regen check. */
export interface PostMergeRegenOptions {
  repoRoot?: string;
  dryRun?: boolean;
  checkOnly?: boolean;
  createPr?: boolean;
  branchName?: string;
  baseBranch?: string;
  fast?: boolean;
  maxPasses?: number;
  pairs?: readonly Pair[];
  explain?: boolean;
  runner?: Runner;
  git?: GitExecutor;
  gh?: GhExecutor;
}

/** Structured report of a post-merge check and repair action. */
export interface PostMergeRegenReport {
  status: "clean" | "stale" | "repaired" | "unrepaired" | "error";
  staleChecks: string[];
  repairedChecks: string[];
  unrepairedChecks: string[];
  noWriterChecks: string[];
  changedFiles: string[];
  prOpened: boolean;
  prUrl?: string;
  prNumber?: number;
  repairBranch?: string;
  prPayload?: {
    title: string;
    body: string;
    branch: string;
    base: string;
  };
  summary: string;
  exitCode: number;
}

export function defaultGit(repoRoot: string): GitExecutor {
  return {
    getCurrentSha: () => {
      const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf-8" });
      return (r.stdout ?? "").trim();
    },
    getChangedFiles: () => {
      const r = spawnSync("git", ["-C", repoRoot, "status", "--porcelain"], { encoding: "utf-8" });
      const lines = (r.stdout ?? "").split("\n").filter(Boolean);
      return lines.map((l) => l.slice(3).trim());
    },
    createBranch: (branch: string) => {
      const r = spawnSync("git", ["-C", repoRoot, "checkout", "-B", branch], { encoding: "utf-8" });
      if (r.status !== 0) throw new Error(`git checkout -B ${branch} failed: ${r.stderr || r.stdout}`);
    },
    commitAll: (message: string) => {
      const a = spawnSync("git", ["-C", repoRoot, "add", "-A"], { encoding: "utf-8" });
      if (a.status !== 0) throw new Error(`git add -A failed: ${a.stderr || a.stdout}`);
      const r = spawnSync("git", ["-C", repoRoot, "commit", "-m", message], { encoding: "utf-8" });
      if (r.status !== 0) throw new Error(`git commit failed: ${r.stderr || r.stdout}`);
    },
    pushBranch: (branch: string) => {
      const r = spawnSync("git", ["-C", repoRoot, "push", "-u", "origin", branch], { encoding: "utf-8" });
      if (r.status !== 0) throw new Error(`git push failed: ${r.stderr || r.stdout}`);
    },
  };
}

export function defaultGh(repoRoot: string): GhExecutor {
  return {
    findExistingPr: (opts) => {
      const r = spawnSync(
        "gh",
        ["pr", "list", "--head", opts.head, "--base", opts.base, "--json", "number", "--jq", ".[0].number"],
        { cwd: repoRoot, encoding: "utf-8" },
      );
      if (r.status === 0 && r.stdout?.trim()) {
        const num = Number(r.stdout.trim());
        if (Number.isInteger(num)) return num;
      }
      return undefined;
    },
    createPr: (opts) => {
      const r = spawnSync(
        "gh",
        ["pr", "create", "--title", opts.title, "--body", opts.body, "--head", opts.head, "--base", opts.base],
        { cwd: repoRoot, encoding: "utf-8" },
      );
      if (r.status !== 0) throw new Error(`gh pr create failed: ${r.stderr || r.stdout}`);
      const url = (r.stdout ?? "").trim();
      const m = /\/pull\/(\d+)/.exec(url);
      return { url, number: m ? Number(m[1]) : undefined };
    },
  };
}

/** Build the PR description body for an automated post-merge repair. */
export function buildPrBody(params: {
  staleChecks: readonly string[];
  commitSha: string;
  branch: string;
  base: string;
  changedFiles?: readonly string[];
}): string {
  const checkLines = params.staleChecks.map((c) => `- \`${c}\``).join("\n");
  const fileSection =
    params.changedFiles && params.changedFiles.length > 0
      ? `\n\n### Regenerated files\n\n${params.changedFiles.map((f) => `- \`${f}\``).join("\n")}`
      : "";
  return (
    `## Summary\n\n` +
    `Automated post-merge regeneration pipeline (bean \`folio-assistant-ey1c\`) detected stale ` +
    `derived artefacts on \`${params.base}\` following merge into commit \`${params.commitSha.slice(0, 10)}\`.\n\n` +
    `### Stale gate checks\n\n` +
    `${checkLines}` +
    fileSection +
    `\n\n### Why a reviewable PR rather than direct push\n\n` +
    `Following the SDLC merge-pipeline rules:\n` +
    `1. A post-merge repair is opened as a PR targeting \`${params.base}\` so it is reviewable and cannot bypass CI gates.\n` +
    `2. It eliminates the accidental-repair hazard where unrelated PRs incidentally repair \`main\` and corrupt gate history.\n` +
    `3. CI on this PR will verify that all derived gates are green before merging.`
  );
}

/**
 * Execute the post-merge regeneration check and generate/open repair PRs as needed.
 */
export async function checkPostMergeRegen(opts: PostMergeRegenOptions = {}): Promise<PostMergeRegenReport> {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot(ROOT);
  const git = opts.git ?? defaultGit(repoRoot);
  const gh = opts.gh ?? defaultGh(repoRoot);
  const baseBranch = opts.baseBranch ?? "main";
  const fast = opts.fast ?? false;
  const maxPasses = opts.maxPasses ?? DEFAULT_MAX_PASSES;

  let pairs: Pair[];
  if (opts.pairs !== undefined) {
    pairs = [...opts.pairs];
  } else {
    const scripts = scriptTableOf(repoRoot);
    const gates = loadGates(repoRoot, { all: !fast });
    const gated = repairableGates(gates, scripts);
    const extra = UNGATED_INPUTS.filter((p) => !gated.some((g) => g.check === p.check));
    pairs = [
      ...extra.map((p) => ({ ...p, io: { inputs: pairIO(p.check)?.inputs } })),
      ...gated.map((p) => ({ ...p, io: pairIO(p.check) })),
    ];
  }

  const runner: Runner =
    opts.runner ??
    (async (script: string): Promise<boolean> => {
      const r = spawnSync("bun", ["run", "cat", script], {
        cwd: repoRoot,
        encoding: "utf-8",
        env: process.env,
      });
      return r.status === 0;
    });

  // Step 1: Audit pass with dryRun: true to inspect current state of derived artefacts
  const { results: auditResults } = await regenPass(pairs, runner, { dryRun: true });

  const stale = auditResults.filter((r) => r.outcome === "regenerated");
  const noWriter = auditResults.filter((r) => r.outcome === "no-writer");
  const staleCheckNames = stale.map((s) => s.check);
  const noWriterCheckNames = noWriter.map((n) => n.check);

  // Negative control check: If no files are stale and no checks failed without a writer, clean!
  if (stale.length === 0 && noWriter.length === 0) {
    return {
      status: "clean",
      staleChecks: [],
      repairedChecks: [],
      unrepairedChecks: [],
      noWriterChecks: [],
      changedFiles: [],
      prOpened: false,
      summary: `Clean (negative control): all ${pairs.length} verify/write pair(s) are current. No repair needed, 0 PRs opened.`,
      exitCode: 0,
    };
  }

  // If there are failures with no writer counterpart, this is a real defect
  if (noWriter.length > 0 && stale.length === 0) {
    return {
      status: "error",
      staleChecks: [],
      repairedChecks: [],
      unrepairedChecks: [],
      noWriterChecks: noWriterCheckNames,
      changedFiles: [],
      prOpened: false,
      summary: `Defect: ${noWriter.length} check(s) failed with no writer counterpart: ${noWriterCheckNames.join(", ")}`,
      exitCode: 1,
    };
  }

  // Stale derived artefacts detected!
  let currentSha = "";
  try {
    currentSha = await git.getCurrentSha();
  } catch {
    currentSha = "unknown";
  }
  const shortSha = currentSha && currentSha !== "unknown" ? currentSha.slice(0, 10) : Date.now().toString(36);
  const branch = opts.branchName ?? `automation/post-merge-regen-${shortSha}`;
  const prTitle = `fix(derived): regenerate post-merge derived artefacts (${staleCheckNames.join(", ")})`;
  const prBody = buildPrBody({
    staleChecks: staleCheckNames,
    commitSha: currentSha,
    branch,
    base: baseBranch,
  });

  const prPayload = {
    title: prTitle,
    body: prBody,
    branch,
    base: baseBranch,
  };

  // If in dry-run mode or check-only mode:
  if (opts.dryRun) {
    return {
      status: "stale",
      staleChecks: staleCheckNames,
      repairedChecks: [],
      unrepairedChecks: [],
      noWriterChecks: noWriterCheckNames,
      changedFiles: [],
      prOpened: false,
      repairBranch: branch,
      prPayload,
      summary: `Dry-run: detected ${stale.length} stale check(s) (${staleCheckNames.join(", ")}). Repair PR prepared for branch "${branch}".`,
      exitCode: 0,
    };
  }

  if (opts.checkOnly) {
    return {
      status: "stale",
      staleChecks: staleCheckNames,
      repairedChecks: [],
      unrepairedChecks: [],
      noWriterChecks: noWriterCheckNames,
      changedFiles: [],
      prOpened: false,
      repairBranch: branch,
      prPayload,
      summary: `Check-only: detected ${stale.length} stale check(s): ${staleCheckNames.join(", ")}`,
      exitCode: 1,
    };
  }

  // Execute repair: run regenToFixpoint to apply writers and verify convergence
  const fixpoint = await regenToFixpoint(pairs, runner, maxPasses);
  const unrepaired = fixpoint.results.filter(
    (r) => r.outcome === "unrepaired" || r.outcome === "writer-failed" || r.outcome === "no-writer",
  );
  const repaired = fixpoint.results.filter((r) => r.outcome === "regenerated");
  const repairedCheckNames = repaired.map((r) => r.check);
  const unrepairedCheckNames = unrepaired.map((u) => u.check);

  if (unrepaired.length > 0) {
    return {
      status: "unrepaired",
      staleChecks: staleCheckNames,
      repairedChecks: repairedCheckNames,
      unrepairedChecks: unrepairedCheckNames,
      noWriterChecks: noWriterCheckNames,
      changedFiles: [],
      prOpened: false,
      repairBranch: branch,
      prPayload,
      summary: `Repair failed: ${unrepaired.length} check(s) could not be repaired by generators: ${unrepairedCheckNames.join(", ")}`,
      exitCode: 1,
    };
  }

  const changedFiles = await git.getChangedFiles();

  if (changedFiles.length === 0) {
    return {
      status: "clean",
      staleChecks: staleCheckNames,
      repairedChecks: repairedCheckNames,
      unrepairedChecks: [],
      noWriterChecks: noWriterCheckNames,
      changedFiles: [],
      prOpened: false,
      summary: `Writers ran but left 0 changed files in working copy. Negative control: no repair PR needed.`,
      exitCode: 0,
    };
  }

  let prOpened = false;
  let prUrl: string | undefined;
  let prNumber: number | undefined;

  if (opts.createPr) {
    const existingPr = await gh.findExistingPr({ head: branch, base: baseBranch });
    if (existingPr !== undefined) {
      prNumber = existingPr;
      return {
        status: "repaired",
        staleChecks: staleCheckNames,
        repairedChecks: repairedCheckNames,
        unrepairedChecks: [],
        noWriterChecks: noWriterCheckNames,
        changedFiles,
        prOpened: false,
        prNumber,
        repairBranch: branch,
        prPayload,
        summary: `Repaired ${repairedCheckNames.length} check(s). PR #${existingPr} already open for branch "${branch}".`,
        exitCode: 0,
      };
    }

    await git.createBranch(branch);
    await git.commitAll(prTitle);
    await git.pushBranch(branch);
    const prBodyWithFiles = buildPrBody({
      staleChecks: staleCheckNames,
      commitSha: currentSha,
      branch,
      base: baseBranch,
      changedFiles,
    });
    const created = await gh.createPr({
      title: prTitle,
      body: prBodyWithFiles,
      head: branch,
      base: baseBranch,
    });
    prOpened = true;
    prUrl = created.url;
    prNumber = created.number;
  }

  return {
    status: "repaired",
    staleChecks: staleCheckNames,
    repairedChecks: repairedCheckNames,
    unrepairedChecks: [],
    noWriterChecks: noWriterCheckNames,
    changedFiles,
    prOpened,
    prUrl,
    prNumber,
    repairBranch: branch,
    prPayload,
    summary: prOpened
      ? `Repaired ${repairedCheckNames.length} check(s). Opened repair PR #${prNumber ?? prUrl} on branch "${branch}".`
      : `Repaired ${repairedCheckNames.length} check(s) across ${changedFiles.length} file(s). PR creation not requested (--create-pr).`,
    exitCode: 0,
  };
}

// CLI entry point
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const checkOnly = argv.includes("--check") || argv.includes("--check-only");
  const createPr = argv.includes("--create-pr");
  const json = argv.includes("--json");
  const fast = argv.includes("--fast");
  const explain = argv.includes("--explain");

  let branchName: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--branch" && argv[i + 1]) {
      branchName = argv[i + 1];
    }
  }

  const report = await checkPostMergeRegen({
    dryRun,
    checkOnly,
    createPr,
    branchName,
    fast,
    explain,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.summary);
    if (report.staleChecks.length > 0) {
      console.log(`Stale check(s): ${report.staleChecks.join(", ")}`);
    }
    if (report.changedFiles.length > 0) {
      console.log(`Changed file(s) (${report.changedFiles.length}):\n${report.changedFiles.map((f) => `  ${f}`).join("\n")}`);
    }
    if (report.prOpened && report.prUrl) {
      console.log(`Repair PR: ${report.prUrl}`);
    }
  }

  process.exit(report.exitCode);
}
