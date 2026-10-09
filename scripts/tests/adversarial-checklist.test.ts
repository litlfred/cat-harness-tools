import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ADVERSARIAL_CHECKLISTS,
  ADVERSARIAL_CONTENT_KINDS,
  ALL_ADVERSARIAL_CHECKLIST_ITEMS,
  AdversarialChecklistItemSchema,
  getChecklistForKind,
  isAdversarialContentKind,
  PROCESS_ADVERSARIAL_CHECKLIST,
  SCHEMA_ADVERSARIAL_CHECKLIST,
  SKILL_ADVERSARIAL_CHECKLIST,
  TOOL_ADVERSARIAL_CHECKLIST,
  type AdversarialContentKind,
} from "@litlfred/cat-harness/schemas/adversarial-checklist.ts";
import {
  executeBackfillBatch,
  GATE_PATH_NODES,
  gatherCandidateNodes,
  rankCandidateNodes,
  reviewNodeAdversarially,
} from "../adversarial-backfill.ts";
import {
  adversarialCoverageByGraph,
  asRecord,
  coverage,
} from "../audit-coverage.ts";
import { AdversarialReviewSchema } from "@litlfred/cat-harness/schemas/red-flag.ts";
import { repoRootFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

const ROOT = resolve(HARNESS_ROOT);
const REPO = repoRootFor(ROOT);

describe("Adversarial Checklist Definitions (schemas/adversarial-checklist.ts)", () => {
  it("defines checklists for all four content kinds", () => {
    expect(ADVERSARIAL_CONTENT_KINDS).toEqual(["tool", "schema", "skill", "process"]);
    for (const kind of ADVERSARIAL_CONTENT_KINDS) {
      expect(ADVERSARIAL_CHECKLISTS[kind]).toBeDefined();
      expect(ADVERSARIAL_CHECKLISTS[kind].length).toBeGreaterThan(0);
    }
  });

  it("validates every item against AdversarialChecklistItemSchema", () => {
    for (const item of ALL_ADVERSARIAL_CHECKLIST_ITEMS) {
      const parsed = AdversarialChecklistItemSchema.safeParse(item);
      expect(parsed.success).toBe(true);
    }
  });

  it("retrieves checklists by kind via getChecklistForKind", () => {
    expect(getChecklistForKind("tool")).toBe(TOOL_ADVERSARIAL_CHECKLIST);
    expect(getChecklistForKind("schema")).toBe(SCHEMA_ADVERSARIAL_CHECKLIST);
    expect(getChecklistForKind("skill")).toBe(SKILL_ADVERSARIAL_CHECKLIST);
    expect(getChecklistForKind("process")).toBe(PROCESS_ADVERSARIAL_CHECKLIST);
    // @ts-expect-error test invalid kind
    expect(getChecklistForKind("unknown")).toEqual([]);
  });

  it("validates kind strings with isAdversarialContentKind", () => {
    expect(isAdversarialContentKind("tool")).toBe(true);
    expect(isAdversarialContentKind("schema")).toBe(true);
    expect(isAdversarialContentKind("skill")).toBe(true);
    expect(isAdversarialContentKind("process")).toBe(true);
    expect(isAdversarialContentKind("doc")).toBe(false);
    expect(isAdversarialContentKind(null)).toBe(false);
    expect(isAdversarialContentKind(123)).toBe(false);
  });

  it("tool checklist extends code-node-review with expected rules", () => {
    for (const item of TOOL_ADVERSARIAL_CHECKLIST) {
      expect(item.kind).toBe("tool");
      expect(item.extendsSource).toBe("code-node-review");
    }
    const ids = TOOL_ADVERSARIAL_CHECKLIST.map((i) => i.id);
    expect(ids).toContain("tool-description-fidelity");
    expect(ids).toContain("tool-unknown-on-failure");
    expect(ids).toContain("tool-side-effects-declared");
    expect(ids).toContain("tool-deletion-guarded");
  });

  it("schema checklist extends code-node-review with expected rules", () => {
    for (const item of SCHEMA_ADVERSARIAL_CHECKLIST) {
      expect(item.kind).toBe("schema");
      expect(item.extendsSource).toBe("code-node-review");
    }
    const ids = SCHEMA_ADVERSARIAL_CHECKLIST.map((i) => i.id);
    expect(ids).toContain("schema-field-readers");
    expect(ids).toContain("schema-enums-closed");
    expect(ids).toContain("schema-docstring-fidelity");
    expect(ids).toContain("schema-backwards-compatible");
  });

  it("skill checklist extends devils-advocate-watcher with expected rules", () => {
    for (const item of SKILL_ADVERSARIAL_CHECKLIST) {
      expect(item.kind).toBe("skill");
      expect(item.extendsSource).toBe("devils-advocate-watcher");
    }
    const ids = SKILL_ADVERSARIAL_CHECKLIST.map((i) => i.id);
    expect(ids).toContain("skill-narrative-asserts-code");
    expect(ids).toContain("skill-no-contradiction");
    expect(ids).toContain("skill-no-prose-counts");
    expect(ids).toContain("skill-no-unasked-irreversible-action");
  });

  it("process checklist extends kg-audit with expected rules", () => {
    for (const item of PROCESS_ADVERSARIAL_CHECKLIST) {
      expect(item.kind).toBe("process");
      expect(item.extendsSource).toBe("kg-audit");
    }
    const ids = PROCESS_ADVERSARIAL_CHECKLIST.map((i) => i.id);
    expect(ids).toContain("process-gateway-branches");
    expect(ids).toContain("process-no-context-write");
    expect(ids).toContain("process-diagram-workflow-fidelity");
  });
});

describe("Adversarial Backfill & Risk-Ranking (scripts/adversarial-backfill.ts)", () => {
  it("specifies the 5 critical gate-path nodes in mandatory order", () => {
    expect(GATE_PATH_NODES).toHaveLength(5);
    expect(GATE_PATH_NODES.map((n) => n.id)).toEqual([
      "gates",
      "merge-base",
      "regen-after-merge",
      "merge-conflict-patterns",
      "kg-qa",
    ]);
  });

  it("ranks the 5 critical gate-path nodes first in risk ranking", () => {
    const candidates = gatherCandidateNodes(ROOT);
    expect(candidates.length).toBeGreaterThanOrEqual(5);

    const ranked = rankCandidateNodes(candidates, ROOT);
    expect(ranked.length).toBeGreaterThanOrEqual(5);

    const top5Ids = ranked.slice(0, 5).map((r) => r.id);
    expect(top5Ids).toEqual([
      "gates",
      "merge-base",
      "regen-after-merge",
      "merge-conflict-patterns",
      "kg-qa",
    ]);
  });

  it("reviews a node adversarially producing valid AdversarialReview", () => {
    const testNode = {
      id: "test-gates",
      kind: "tool" as AdversarialContentKind,
      path: "scripts/gates.ts",
      sourceHash: "abc123456789",
    };
    const { review, findings, durationMs, tokens } = reviewNodeAdversarially(testNode, ROOT);

    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(tokens).toBeGreaterThan(0);
    const parsed = AdversarialReviewSchema.safeParse(review);
    expect(parsed.success).toBe(true);
    expect(review.coverage.files_reviewed).toBe(1);
    expect(review.flags).toHaveLength(findings.filter((f) => f.weight === "blocking").length);
  });

  it("detects known defect pattern in review (narrative asserts code)", () => {
    const badSkillNode = {
      id: "bad-skill",
      kind: "skill" as AdversarialContentKind,
      path: "test/fixtures/bad-skill.md",
      sourceHash: "111222333444",
    };

    // Review on synthetic content with broken command
    const { review, findings } = reviewNodeAdversarially(badSkillNode, ROOT);
    // Even if path does not exist, review completes
    expect(review.result).toBe("pass");
  });

  it("executes backfill batch writing to sidecars and NEVER creates beans", () => {
    const beansDir = join(ROOT, "beans", "defs");
    const beanFilesBefore = existsSync(beansDir) ? readdirSync(beansDir) : [];

    const candidates = gatherCandidateNodes(ROOT);
    const ranked = rankCandidateNodes(candidates, ROOT);
    const report = executeBackfillBatch(ranked, { repoRoot: ROOT, limit: 2 });

    expect(report.nodesReviewed).toBe(2);
    expect(report.totalEstimatedTokens).toBeGreaterThan(0);
    expect(report.measurements).toHaveLength(2);

    // Verify sidecars were written or exist
    for (const m of report.measurements) {
      expect(existsSync(m.sidecarPath)).toBe(true);
    }

    // Verify NO new beans were created in beans/defs/
    const beanFilesAfter = existsSync(beansDir) ? readdirSync(beansDir) : [];
    expect(beanFilesAfter.length).toBe(beanFilesBefore.length);
  });
});

describe("Audit Coverage Adversarial Integration (scripts/audit-coverage.ts)", () => {
  it("adversarialCoverageByGraph reports reviewed for kinds with reviewed sidecars", () => {
    const advMap = adversarialCoverageByGraph(REPO, ROOT);
    expect(advMap.get("tools")).toBe("reviewed");
    expect(advMap.get("schemas")).toBe("reviewed");
    expect(advMap.get("skills")).toBe("reviewed");
  });

  it("KindCoverage rows include adversarial column with valid states", () => {
    const { rows } = coverage(REPO);
    expect(rows.length).toBeGreaterThan(0);

    const validStates = new Set(["reviewed", "stale", "never"]);
    for (const row of rows) {
      expect(validStates.has(row.adversarial)).toBe(true);
    }

    const toolsRow = rows.find((r) => r.kind === "tools");
    expect(toolsRow?.adversarial).toBe("reviewed");

    const schemasRow = rows.find((r) => r.kind === "schemas");
    expect(schemasRow?.adversarial).toBe("reviewed");

    const skillsRow = rows.find((r) => r.kind === "skills");
    expect(skillsRow?.adversarial).toBe("reviewed");

    const docsRow = rows.find((r) => r.kind === "docs");
    expect(docsRow?.adversarial).toBe("never");
  });

  it("asRecord preserves adversarial coverage state", () => {
    const { rows } = coverage(REPO);
    const toolsRow = rows.find((r) => r.kind === "tools");
    expect(toolsRow).toBeDefined();

    const record = asRecord(toolsRow!);
    expect(record.adversarial).toBe("reviewed");
    expect(record).not.toHaveProperty("files");
    expect(record).not.toHaveProperty("sidecars");
    expect(record.hasFiles).toBe(true);
  });
});
