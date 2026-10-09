/**
 * The deletion path: the preflight's verdicts, and the dispatch job's guards.
 *
 * ## What each group is defending
 *
 * - **The guard** — a deletion trigger reachable by a typo, or by a
 *   confirmation copied from a previous run, is not a confirmation.
 * - **The preflight** — a dispatch that removes a preview still in use is bean
 *   `w2g5` one level out, and worse, because the sweep only proposes while
 *   this acts.
 * - **The shell** — `pull_request_target` carries the base repository's token,
 *   which is why the `cleanup` job binds `head.ref` to `env`. The same shape
 *   must not come back through an input that reaches `rm`.
 *
 * The workflow half — the dispatch job's guards, the close-event gate, and how
 * both removal paths load the platform — parses the index repository's own
 * `.github/workflows/feature-staging.yml`, so it lives in that repository's
 * `test/workflows/staging-cleanup.test.ts` (owner's ruling 2026-10-09,
 * litlfred/folio-assistant#2521, ruling 1(c)). What stays here is the
 * preflight, which the workflow runs.
 *
 * @module scripts/tests/staging-cleanup.test
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "bun:test";

import type { BranchEvidenceSet, Probe } from "../../test/health/checks.ts";
import { preflight, slugProblem } from "../staging-cleanup-preflight.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

const ROOT = resolve(HARNESS_ROOT);

const NOW = new Date("2026-09-19T12:00:00Z");
const branches = (over: Partial<BranchEvidenceSet> = {}): Probe<BranchEvidenceSet> => ({
  state: "ok",
  value: { candidates: [], defaultBranch: "main", command: "fixture", ...over },
});

describe("the preflight's verdicts", () => {
  it("allows removal when every signal was evaluated and every one said no", () => {
    const v = preflight(
      "claude-merged-last-week",
      { state: "ok", value: [] },
      branches({
        candidates: [
          { ref: "claude/merged-last-week", mergedIntoDefault: true, headCommittedAt: "2026-09-08T09:00:00Z" },
        ],
      }),
      NOW,
    );
    expect(v.decision).toBe("remove");
  });

  it("REFUSES the `brave-hypatia` shape — the case the health check was rewritten for", () => {
    const v = preflight(
      "claude-brave-hypatia-r820sf",
      { state: "ok", value: [] },
      branches({
        candidates: [
          { ref: "claude/brave-hypatia-r820sf", mergedIntoDefault: false, headCommittedAt: "2026-09-19T11:58:00Z" },
        ],
      }),
      NOW,
    );
    expect(v.decision).toBe("refuse-live");
    if (v.decision !== "refuse-live") return;
    expect(v.why).toContain("unmerged-branch");
    expect(v.why).toContain("recent-commit");
  });

  it("REFUSES on could-not-tell — the opposite direction to the sweep, and for the same reason", () => {
    // In the health check `unknown` means "do not accuse". Here it means "do
    // not delete". Both err away from removal, which is the only recoverable
    // direction.
    const rateLimited = preflight(
      "claude-anything",
      { state: "unknown", reason: "GitHub API returned 403" },
      branches(),
      NOW,
    );
    expect(rateLimited.decision).toBe("refuse-unknown");

    const noGit = preflight(
      "claude-anything",
      { state: "ok", value: [] },
      { state: "unknown", reason: "git ls-remote --heads origin exited 128" },
      NOW,
    );
    expect(noGit.decision).toBe("refuse-unknown");

    const blindBranch = preflight(
      "claude-unreadable",
      { state: "ok", value: [] },
      branches({
        candidates: [
          {
            ref: "claude/unreadable",
            headCommittedAt: "2026-09-01T00:00:00Z",
            unevaluated: "git merge-base --is-ancestor exited 128: bad object",
          },
        ],
      }),
      NOW,
    );
    expect(blindBranch.decision).toBe("refuse-unknown");
    if (blindBranch.decision !== "refuse-unknown") return;
    expect(blindBranch.why).toContain("bad object");
  });

  it("refuses a slug that is a path or carries an impossible character, before asking anything", () => {
    for (const bad of ["", ".", "..", "_retired", "../../etc", "a/b", "a b", "a;rm -rf /", "*"]) {
      expect(slugProblem(bad)).toBeDefined();
      expect(preflight(bad, { state: "ok", value: [] }, branches(), NOW).decision).toBe("refuse-unknown");
    }
    expect(slugProblem("claude-health-checks")).toBeUndefined();
    expect(slugProblem("release.v1-0-rc1")).toBeUndefined();
  });

  it("REFUSES removal when another open PR is reusing or claiming the slug (bean oz5w)", () => {
    const v = preflight(
      "claude-shared-slug",
      { state: "ok", value: ["claude/shared-slug"] },
      branches({
        candidates: [
          { ref: "claude/shared-slug", mergedIntoDefault: true, headCommittedAt: "2026-09-08T09:00:00Z" },
        ],
      }),
      NOW,
    );
    expect(v.decision).toBe("refuse-live");
    if (v.decision !== "refuse-live") return;
    expect(v.why).toContain("open-pr");
  });

  it("REFUSES removal when a candidate branch has unmerged work claiming the slug", () => {
    const v = preflight(
      "claude-reused-branch",
      { state: "ok", value: [] },
      branches({
        candidates: [
          { ref: "claude/reused-branch", mergedIntoDefault: false, headCommittedAt: "2026-09-08T09:00:00Z" },
        ],
      }),
      NOW,
    );
    expect(v.decision).toBe("refuse-live");
    if (v.decision !== "refuse-live") return;
    expect(v.why).toContain("unmerged-branch");
  });

  it("REFUSES removal when a candidate branch has a recent commit claiming the slug", () => {
    const v = preflight(
      "claude-reused-branch",
      { state: "ok", value: [] },
      branches({
        candidates: [
          { ref: "claude/reused-branch", mergedIntoDefault: true, headCommittedAt: "2026-09-19T11:55:00Z" },
        ],
      }),
      NOW,
    );
    expect(v.decision).toBe("refuse-live");
    if (v.decision !== "refuse-live") return;
    expect(v.why).toContain("recent-commit");
  });
});

describe("skills documentation covers bean oz5w failure modes", () => {
  it("ci-health documents that cancelled is NOT benign when previous state is a deletion", () => {
    const ciHealthText = readFileSync(resolve(ROOT, "skills/sdlc/sdlc-core/ci-health.md"), "utf-8");
    expect(ciHealthText).toContain("folio-assistant-oz5w");
    expect(ciHealthText).toContain("never when the previous state is a deletion");
  });

  it("staging-review documents checking gh-pages commit log for newer staging(cleanup) and the re-publish command", () => {
    const stagingReviewText = readFileSync(resolve(ROOT, "skills/sdlc/sdlc-core/staging-review.md"), "utf-8");
    expect(stagingReviewText).toContain("bean oz5w");
    expect(stagingReviewText).toContain("staging(cleanup)");
    expect(stagingReviewText).toContain("gh workflow run feature-staging.yml -f branch=<branch>");
  });
});

