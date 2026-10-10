/**
 * Tests for post-merge regeneration check and reviewable repair PR automation.
 *
 * Bean `folio-assistant-ey1c`.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  buildPrBody,
  checkPostMergeRegen,
  resolveRepoRoot,
  type GhExecutor,
  type GitExecutor,
} from "../post-merge-regen.ts";
import type { Runner } from "../regen-after-merge.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

const ROOT = join(HARNESS_ROOT);
const REPO = resolveRepoRoot(ROOT);

describe("post-merge-regen pipeline (bean folio-assistant-ey1c)", () => {
  describe("NEGATIVE CONTROL: clean main tree triggers 0 repairs", () => {
    test("when all verify/write pairs pass, report is clean with 0 repairs and no PR opened", async () => {
      // Mock runner: all checks pass (current)
      const mockRunner: Runner = () => true;

      let gitBranchCreated = false;
      let gitCommitted = false;
      let gitPushed = false;
      let prCreated = false;

      const mockGit: GitExecutor = {
        getCurrentSha: () => "5187a4df36100000000000000000000000000000",
        getChangedFiles: () => [],
        createBranch: () => {
          gitBranchCreated = true;
        },
        commitAll: () => {
          gitCommitted = true;
        },
        pushBranch: () => {
          gitPushed = true;
        },
      };

      const mockGh: GhExecutor = {
        findExistingPr: () => undefined,
        createPr: () => {
          prCreated = true;
          return { url: "https://github.com/litlfred/cat-harness/pull/9999", number: 9999 };
        },
      };

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        git: mockGit,
        gh: mockGh,
        createPr: true,
      });

      expect(report.status).toBe("clean");
      expect(report.staleChecks).toEqual([]);
      expect(report.repairedChecks).toEqual([]);
      expect(report.unrepairedChecks).toEqual([]);
      expect(report.noWriterChecks).toEqual([]);
      expect(report.changedFiles).toEqual([]);
      expect(report.prOpened).toBe(false);
      expect(report.exitCode).toBe(0);
      expect(report.summary).toContain("Clean (negative control)");

      // Verify negative control: git and gh were never touched
      expect(gitBranchCreated).toBe(false);
      expect(gitCommitted).toBe(false);
      expect(gitPushed).toBe(false);
      expect(prCreated).toBe(false);
    });

    test("when writers run but leave no changed files, report is clean with no PR opened", async () => {
      // Check fails initially, then passes after writer runs, but git status shows no files changed
      let checkCallCount = 0;
      const mockRunner: Runner = (script: string) => {
        if (script === "readme:subgraphs:check") {
          checkCallCount++;
          return checkCallCount > 1; // fails in dryRun audit, passes in fixpoint
        }
        return true;
      };

      let prCreated = false;
      const mockGit: GitExecutor = {
        getCurrentSha: () => "5187a4df36100000000000000000000000000000",
        getChangedFiles: () => [], // 0 files changed
        createBranch: () => {},
        commitAll: () => {},
        pushBranch: () => {},
      };

      const mockGh: GhExecutor = {
        findExistingPr: () => undefined,
        createPr: () => {
          prCreated = true;
          return { url: "url", number: 1 };
        },
      };

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        git: mockGit,
        gh: mockGh,
        createPr: true,
      });

      expect(report.status).toBe("clean");
      expect(report.prOpened).toBe(false);
      expect(report.exitCode).toBe(0);
      expect(report.summary).toContain("0 changed files");
      expect(prCreated).toBe(false);
    });
  });

  describe("POSITIVE DETECTION: stale derived artefact identifies exact repair diff and targets repair PR", () => {
    test("stale derived check triggers writer, detects changed file, and creates repair PR", async () => {
      let repaired = false;
      const mockRunner: Runner = (script: string) => {
        if (script === "readme:subgraphs:check") {
          return repaired;
        }
        if (script === "readme:subgraphs") {
          repaired = true;
          return true;
        }
        return true;
      };

      const gitCalls: string[] = [];
      const mockGit: GitExecutor = {
        getCurrentSha: () => "8688288494a11111111111111111111111111111",
        getChangedFiles: () => ["uploads/README.md"],
        createBranch: (branch: string) => {
          gitCalls.push(`createBranch:${branch}`);
        },
        commitAll: (msg: string) => {
          gitCalls.push(`commitAll:${msg}`);
        },
        pushBranch: (branch: string) => {
          gitCalls.push(`pushBranch:${branch}`);
        },
      };

      let prPayloadPassed: { title: string; body: string; head: string; base: string } | undefined;
      const mockGh: GhExecutor = {
        findExistingPr: () => undefined,
        createPr: (opts) => {
          prPayloadPassed = opts;
          return { url: "https://github.com/litlfred/cat-harness/pull/1946", number: 1946 };
        },
      };

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        git: mockGit,
        gh: mockGh,
        createPr: true,
      });

      expect(report.status).toBe("repaired");
      expect(report.staleChecks).toContain("readme:subgraphs:check");
      expect(report.repairedChecks).toContain("readme:subgraphs:check");
      expect(report.unrepairedChecks).toEqual([]);
      expect(report.changedFiles).toEqual(["uploads/README.md"]);
      expect(report.repairBranch).toBe("automation/post-merge-regen-8688288494");
      expect(report.prOpened).toBe(true);
      expect(report.prUrl).toBe("https://github.com/litlfred/cat-harness/pull/1946");
      expect(report.prNumber).toBe(1946);
      expect(report.exitCode).toBe(0);

      // Verify git execution sequence
      expect(gitCalls).toEqual([
        "createBranch:automation/post-merge-regen-8688288494",
        "commitAll:fix(derived): regenerate post-merge derived artefacts (readme:subgraphs:check)",
        "pushBranch:automation/post-merge-regen-8688288494",
      ]);

      // Verify PR payload
      expect(prPayloadPassed).toBeDefined();
      expect(prPayloadPassed?.head).toBe("automation/post-merge-regen-8688288494");
      expect(prPayloadPassed?.base).toBe("main");
      expect(prPayloadPassed?.title).toContain("readme:subgraphs:check");
      expect(prPayloadPassed?.body).toContain("folio-assistant-ey1c");
      expect(prPayloadPassed?.body).toContain("uploads/README.md");
    });

    test("does not open duplicate PR if PR already exists for the branch", async () => {
      let repaired = false;
      const mockRunner: Runner = (script: string) => {
        if (script === "readme:subgraphs:check") return repaired;
        if (script === "readme:subgraphs") {
          repaired = true;
          return true;
        }
        return true;
      };

      let createPrCalled = false;
      const mockGit: GitExecutor = {
        getCurrentSha: () => "8688288494a11111111111111111111111111111",
        getChangedFiles: () => ["uploads/README.md"],
        createBranch: () => {},
        commitAll: () => {},
        pushBranch: () => {},
      };

      const mockGh: GhExecutor = {
        findExistingPr: () => 1946, // existing PR #1946 found
        createPr: () => {
          createPrCalled = true;
          return { url: "url", number: 1946 };
        },
      };

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        git: mockGit,
        gh: mockGh,
        createPr: true,
      });

      expect(report.status).toBe("repaired");
      expect(report.prNumber).toBe(1946);
      expect(report.prOpened).toBe(false);
      expect(createPrCalled).toBe(false);
      expect(report.summary).toContain("PR #1946 already open");
    });
  });

  describe("dry-run and check-only semantics", () => {
    test("--dry-run reports stale checks and generated payload without modifying git or creating PR", async () => {
      const mockRunner: Runner = (script: string) => script !== "readme:subgraphs:check";

      let gitTouched = false;
      let prCreated = false;

      const mockGit: GitExecutor = {
        getCurrentSha: () => "8688288494a",
        getChangedFiles: () => [],
        createBranch: () => {
          gitTouched = true;
        },
        commitAll: () => {
          gitTouched = true;
        },
        pushBranch: () => {
          gitTouched = true;
        },
      };

      const mockGh: GhExecutor = {
        findExistingPr: () => undefined,
        createPr: () => {
          prCreated = true;
          return { url: "", number: 0 };
        },
      };

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        git: mockGit,
        gh: mockGh,
        dryRun: true,
        createPr: true,
      });

      expect(report.status).toBe("stale");
      expect(report.staleChecks).toContain("readme:subgraphs:check");
      expect(report.prPayload).toBeDefined();
      expect(report.prPayload?.title).toContain("readme:subgraphs:check");
      expect(report.prOpened).toBe(false);
      expect(report.exitCode).toBe(0);
      expect(gitTouched).toBe(false);
      expect(prCreated).toBe(false);
    });

    test("--check-only exits 1 when stale derived checks are found", async () => {
      const mockRunner: Runner = (script: string) => script !== "readme:subgraphs:check";

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        checkOnly: true,
      });

      expect(report.status).toBe("stale");
      expect(report.exitCode).toBe(1);
      expect(report.staleChecks).toContain("readme:subgraphs:check");
      expect(report.summary).toContain("Check-only: detected 1 stale check(s)");
    });

    test("--check-only exits 0 when all derived checks are clean", async () => {
      const mockRunner: Runner = () => true;

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        checkOnly: true,
      });

      expect(report.status).toBe("clean");
      expect(report.exitCode).toBe(0);
      expect(report.staleChecks).toEqual([]);
    });
  });

  describe("honest reporting on defects and unrepaired checks", () => {
    test("check failing when its writer does NOT fix it is reported unrepaired (exit 1)", async () => {
      // Writer runs but check still fails
      const mockRunner: Runner = (script: string) => {
        if (script === "readme:subgraphs:check") return false;
        if (script === "readme:subgraphs") return true;
        return true;
      };

      const mockGit: GitExecutor = {
        getCurrentSha: () => "8688288494a",
        getChangedFiles: () => [],
        createBranch: () => {},
        commitAll: () => {},
        pushBranch: () => {},
      };

      const report = await checkPostMergeRegen({
        repoRoot: REPO,
        runner: mockRunner,
        git: mockGit,
        createPr: true,
      });

      expect(report.status).toBe("unrepaired");
      expect(report.unrepairedChecks).toContain("readme:subgraphs:check");
      expect(report.prOpened).toBe(false);
      expect(report.exitCode).toBe(1);
      expect(report.summary).toContain("Repair failed: 1 check(s) could not be repaired");
    });
  });

  describe("buildPrBody", () => {
    test("generates structured markdown referencing ey1c and reviewable PR rationale", () => {
      const body = buildPrBody({
        staleChecks: ["readme:subgraphs:check", "check:prov-qaqc"],
        commitSha: "8688288494a11111111111111111111111111111",
        branch: "automation/post-merge-regen-8688288494",
        base: "main",
      });

      expect(body).toContain("folio-assistant-ey1c");
      expect(body).toContain("8688288494");
      expect(body).toContain("- `readme:subgraphs:check`");
      expect(body).toContain("- `check:prov-qaqc`");
      expect(body).toContain("reviewable PR rather than direct push");
      expect(body).toContain("accidental-repair hazard");
    });
  });
});
