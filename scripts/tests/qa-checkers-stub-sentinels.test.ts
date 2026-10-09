/**
 * Tests that unconditional n/a QA stub checkers return a distinguishable
 * sentinel note so that downstream consumers and aggregators can distinguish
 * an unimplemented stub from a genuine decline (folio-assistant-89wq).
 */
import { describe, test, expect } from "bun:test";
import type { CheckerResult } from "@litlfred/cat-harness/schemas/block-qa.ts";
import {
  checkDetanglerNoXChapterFwd,
  checkDetanglerArchimedeanWall,
  checkProofNoAxiomGrowth,
  checkProofBuildGreen,
} from "../../content/pipeline/qa-checkers-extended";

describe("QA stub checkers distinguishable sentinels (folio-assistant-89wq)", () => {
  const EXPECTED_SENTINEL: CheckerResult = {
    result: "n/a",
    hits: [],
    notes: "not implemented: stub checker",
  };

  test("checkDetanglerNoXChapterFwd returns distinguishable stub sentinel", () => {
    expect(checkDetanglerNoXChapterFwd(undefined)).toEqual(EXPECTED_SENTINEL);
    expect(checkDetanglerNoXChapterFwd("some/path/to/block.ts")).toEqual(EXPECTED_SENTINEL);
  });

  test("checkDetanglerArchimedeanWall returns distinguishable stub sentinel", () => {
    expect(checkDetanglerArchimedeanWall(undefined, undefined)).toEqual(EXPECTED_SENTINEL);
    expect(
      checkDetanglerArchimedeanWall("some/path/to/block.ts", "some/path/to/block.lean")
    ).toEqual(EXPECTED_SENTINEL);
  });

  test("checkProofNoAxiomGrowth returns distinguishable stub sentinel", () => {
    expect(checkProofNoAxiomGrowth(undefined)).toEqual(EXPECTED_SENTINEL);
    expect(checkProofNoAxiomGrowth("some/path/to/block.lean")).toEqual(EXPECTED_SENTINEL);
  });

  test("checkProofBuildGreen returns distinguishable stub sentinel", () => {
    expect(checkProofBuildGreen(undefined)).toEqual(EXPECTED_SENTINEL);
    expect(checkProofBuildGreen("some/path/to/block.lean")).toEqual(EXPECTED_SENTINEL);
  });
});
