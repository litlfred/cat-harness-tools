/**
 * What a kg-audit rewrite of a sidecar must keep: the judgements it did not
 * compute.
 *
 * @module cat-harness-tools/scripts/lib/kg-qa-carry
 */
import { existsSync, readFileSync } from "node:fs";

import type { KgQaReport } from "@litlfred/cat-harness/schemas/kg-qa.js";

/**
 * `r`, carrying forward the `adversarial_reviews` the sidecar at `path`
 * already holds (owner, 2026-10-14). They are AGENT judgements, recorded by
 * `adversarial-backfill` or a reviewer, never computed here, so a rewrite
 * that dropped them lost them: the 3c604106 regeneration did exactly that to
 * every lvlv review. A report that brings reviews of its own keeps those; an
 * unreadable prior is left to the caller's other guards, never guessed at.
 */
export function withPriorAdversarialReviews(r: KgQaReport, path: string): KgQaReport {
  if ((r.adversarial_reviews ?? []).length > 0 || !existsSync(path)) return r;
  let prior: unknown;
  try {
    prior = (JSON.parse(readFileSync(path, "utf-8")) as { adversarial_reviews?: unknown }).adversarial_reviews;
  } catch {
    return r;
  }
  return Array.isArray(prior) && prior.length > 0 ? { ...r, adversarial_reviews: prior as KgQaReport["adversarial_reviews"] } : r;
}
