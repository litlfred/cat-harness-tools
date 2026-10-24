/**
 * Tests for post-merge regeneration check and reviewable repair PR automation.
 *
 * Bean `folio-assistant-ey1c`.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildPrBody,
  builtAtPublishIn,
  checkPostMergeRegen,
  FIXITY_CHECKS,
  postMergePairs,
  resolveRepoRoot,
  treeMoveTracker,
  type GhExecutor,
  type GitExecutor,
  type PublishTimeDeclaration,
} from "../../post-merge-regen.ts";
import type { Runner } from "../../regen-after-merge.ts";
import { HARNESS_ROOT } from "../../lib/roots.ts";

// declared-path-literal: a mocked changed-file name — never read.
const CHANGED_FILE_VECTOR = "uploads/README.md";

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
        getChangedFiles: () => [CHANGED_FILE_VECTOR],
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
      expect(report.changedFiles).toEqual([CHANGED_FILE_VECTOR]);
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
      expect(prPayloadPassed?.body).toContain(CHANGED_FILE_VECTOR);
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
        getChangedFiles: () => [CHANGED_FILE_VECTOR],
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

  describe("fixity gates are not asked", () => {
    test("the mount checks are left out, and every other pair is kept in order", () => {
      const pairs = [
        { check: "library:viz:check", writer: "library:viz" },
        { check: "mount:remote:check", writer: "mount:remote" },
        { check: "readme:subgraphs:check", writer: "readme:subgraphs" },
        { check: "mount:lock:check", writer: "mount:lock" },
      ];
      expect(postMergePairs(pairs).map((p) => p.check)).toEqual(["library:viz:check", "readme:subgraphs:check"]);
    });

    test("each excluded gate says why", () => {
      expect(Object.keys(FIXITY_CHECKS).sort()).toEqual(["mount:lock:check", "mount:remote:check"]);
      for (const reason of Object.values(FIXITY_CHECKS)) expect(reason.length).toBeGreaterThan(20);
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

/**
 * Bean `folio-assistant-p7mb`: an output an instance declares `builtAtPublish`
 * is gitignored and never committed, so post-merge regen must not report it
 * stale. Measured on cat-harness run 39786173033 (2026-10-22): `library:viz`,
 * `uploads:viz`, `voices:viz`, `document-kinds:viz` and `slice:sqlite` were
 * listed stale and "repaired" only because their publish-time pages were absent.
 */
describe("builtAtPublish outputs are never stale (bean folio-assistant-p7mb)", () => {
  // A scratch composed tree: one instance `inst` declaring one directory and one file built at publish.
  const PUBLISH_DIR = "out/pages/";
  const PUBLISH_FILE = "out/index.json";
  const COMMITTED = "notes.txt";

  const scratch = (): { repo: string; decls: PublishTimeDeclaration[]; done: () => void } => {
    const repo = mkdtempSync(join(tmpdir(), "post-merge-regen-p7mb-"));
    mkdirSync(join(repo, "inst"), { recursive: true });
    writeFileSync(join(repo, "inst", COMMITTED), "committed\n");
    const decls = [{ root: join(repo, "inst"), builtAtPublish: [{ path: PUBLISH_DIR }, { path: PUBLISH_FILE }] }];
    return { repo, decls, done: () => rmSync(repo, { recursive: true, force: true }) };
  };

  const quietGit = (changed: string[] = []): GitExecutor => ({
    getCurrentSha: () => "39786173033000000000000000000000000000ab",
    getChangedFiles: () => changed,
    createBranch: () => {},
    commitAll: () => {},
    pushBranch: () => {},
  });
  const noPr: GhExecutor = {
    findExistingPr: () => undefined,
    createPr: () => {
      throw new Error("no repair PR may be opened for a builtAtPublish output");
    },
  };

  test("builtAtPublishIn asks isBuiltAtPublish of the owning instance, with the instance-relative path", () => {
    const decls: PublishTimeDeclaration[] = [
      { root: "/r/inst", builtAtPublish: [{ path: PUBLISH_DIR }, { path: PUBLISH_FILE }] },
      { root: "/r/inst/nested", builtAtPublish: [] },
    ];
    expect(builtAtPublishIn("inst/out/pages/a/index.html", decls, "/r")).toBe(true);
    expect(builtAtPublishIn("inst/out/index.json", decls, "/r")).toBe(true);
    expect(builtAtPublishIn("inst/notes.txt", decls, "/r")).toBe(false);
    // Another instance's tree, and the deepest instance declaring nothing, are not this one's declaration.
    expect(builtAtPublishIn("other/out/pages/a.html", decls, "/r")).toBe(false);
    expect(builtAtPublishIn("inst/nested/out/pages/a.html", decls, "/r")).toBe(false);
  });

  test("the tracker tells a builtAtPublish write from a committed one, and a same-bytes rewrite moves nothing", () => {
    const { repo, decls, done } = scratch();
    try {
      const t = treeMoveTracker(repo, decls);
      expect(t.take()).toEqual({ builtAtPublish: [], committed: [] }); // the baseline
      mkdirSync(join(repo, "inst/out/pages"), { recursive: true });
      writeFileSync(join(repo, "inst/out/pages/index.html"), "<p>built</p>");
      writeFileSync(join(repo, "inst", COMMITTED), "committed\n"); // same bytes
      expect(t.take()).toEqual({ builtAtPublish: ["inst/out/pages/index.html"], committed: [] });
      writeFileSync(join(repo, "inst", COMMITTED), "changed\n");
      expect(t.take()).toEqual({ builtAtPublish: [], committed: ["inst/notes.txt"] });
    } finally {
      done();
    }
  });

  test("a check red only because its builtAtPublish outputs are absent is NOT reported stale, and opens no PR", async () => {
    const { repo, decls, done } = scratch();
    try {
      let built = false;
      const runner: Runner = (script) => {
        if (script === "library:viz:check") return built;
        if (script === "library:viz") {
          mkdirSync(join(repo, "inst/out/pages"), { recursive: true });
          writeFileSync(join(repo, "inst/out/pages/index.html"), "<p>built</p>");
          writeFileSync(join(repo, "inst", PUBLISH_FILE), "{}");
          built = true;
          return true;
        }
        return true;
      };
      const report = await checkPostMergeRegen({
        repoRoot: repo,
        pairs: [{ check: "library:viz:check", writer: "library:viz" }],
        runner,
        tracker: treeMoveTracker(repo, decls),
        git: quietGit(),
        gh: noPr,
        createPr: true,
      });
      expect(report.status).toBe("clean");
      expect(report.staleChecks).toEqual([]);
      expect(report.repairedChecks).toEqual([]);
      expect(report.builtAtPublishChecks).toEqual(["library:viz:check"]);
      expect(report.prOpened).toBe(false);
      expect(report.exitCode).toBe(0);
      expect(report.summary).toContain("builtAtPublish");
    } finally {
      done();
    }
  });

  test("control: a writer that also moves a COMMITTED file is still a stale check, repaired", async () => {
    const { repo, decls, done } = scratch();
    try {
      let built = false;
      const runner: Runner = (script) => {
        if (script === "render:bpmn:check") return built;
        if (script === "render:bpmn") {
          mkdirSync(join(repo, "inst/out/pages"), { recursive: true });
          writeFileSync(join(repo, "inst/out/pages/other.svg"), "<svg/>");
          writeFileSync(join(repo, "inst", COMMITTED), "redrawn\n");
          built = true;
          return true;
        }
        return true;
      };
      const report = await checkPostMergeRegen({
        repoRoot: repo,
        pairs: [{ check: "render:bpmn:check", writer: "render:bpmn" }],
        runner,
        tracker: treeMoveTracker(repo, decls),
        git: quietGit(["inst/notes.txt"]),
        gh: noPr,
      });
      expect(report.status).toBe("repaired");
      expect(report.staleChecks).toEqual(["render:bpmn:check"]);
      expect(report.repairedChecks).toEqual(["render:bpmn:check"]);
      expect(report.builtAtPublishChecks).toEqual([]);
    } finally {
      done();
    }
  });
});
