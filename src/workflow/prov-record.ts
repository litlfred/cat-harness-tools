/**
 * The engine's own PROV-O record: one `prov:Activity` written as each step is
 * recorded, under the verdict that let it be recorded.
 *
 * Issue #1180 step 5 built the AFTER-check (`scripts/prov-qaqc.ts`), which
 * derives activities from history and re-runs `authorizeTask` with the actor
 * `asserted`, because history carried only a name. Since the engine went
 * strict (issue #1207, owner 2026-09-24) the engine knows more than history
 * did: the principal GitHub vouched for, the lane's role, and every policy the
 * verdict was computed under. This writes that down at the moment it is true,
 * so the after-check reads a record rather than reconstructing one.
 *
 * For computable Data Sharing Agreements (DSA B4, bean `3z44`, issue #2702),
 * decision records also cite their agreement (`url` + `sha256` digest, and
 * optional `grant` id for B5) and form an append-only hash chain
 * (`cat-harness:previousHash` → `cat-harness:recordHash`) verified by
 * {@link verifyProvHashChain}.
 *
 * Same rule as the after-check, and for the same reason: **no activity is
 * invented.** A step with no actor, or in a lane that binds no role, gets none,
 * because `ProvActivitySchema` requires both and a guessed value is
 * fabrication. A refused step gets none either: it did not happen.
 *
 * @module folio-assistant/workflow/prov-record
 */

import { basename } from "node:path";
import {
  ProvActivitySchema,
  ProvDecisionRecordSchema,
  appendProvDecisionRecord,
  buildProvHashChain,
  canonicalProvRecord,
  computeProvRecordHash,
  stampProvDecisionRecord,
  stampProvRecord,
  verifyProvHashChain,
  type ProvActivity,
  type ProvAgreementRef,
  type ProvChainError,
  type ProvChainErrorKind,
  type ProvChainVerification,
  type ProvChainVerifyOptions,
  type ProvDecisionRecord,
} from "@litlfred/cat-harness/schemas/content/prov.js";
import type { TaskAuthVerdict } from "./authorize.js";

export {
  ProvDecisionRecordSchema,
  appendProvDecisionRecord,
  buildProvHashChain,
  canonicalProvRecord,
  computeProvRecordHash,
  stampProvDecisionRecord,
  stampProvRecord,
  verifyProvHashChain,
  type ProvAgreementRef,
  type ProvChainError,
  type ProvChainErrorKind,
  type ProvChainVerification,
  type ProvChainVerifyOptions,
  type ProvDecisionRecord,
};

/** `code-change-review.bpmn` → `code-change-review`: the `hadPlan` prefix, as the after-check writes it. */
export function planStem(source: string): string {
  return basename(source).replace(/\.bpmn$/i, "").toLowerCase();
}

export interface ProvRecordInput {
  /** `<instance id>#<history index>`: the same `@id` the after-check derives. */
  id: string;
  at: string;
  /** The `.bpmn` the instance runs, for the plan reference. */
  source: string;
  node: string;
  verdict: TaskAuthVerdict;
  /** Every policy uid in force, which is what `decide` evaluated. */
  policies: readonly string[];
  /** The content the step acted on. */
  target?: string;
  /**
   * The Data Sharing Agreement (URL + SHA-256 digest, and optional grant id)
   * when the step/decision was evaluated under an agreement (DSA B4, bean `3z44`).
   */
  agreement?: ProvAgreementRef;
  /** Optional grant identifier (DSA B5). */
  grant?: string;
  /**
   * SHA-256 hex digest of the preceding PROV record in the log (`null` for the
   * first record in a chain). When supplied (or when `agreement` or `chain` is
   * set), stamps `cat-harness:previousHash` and `cat-harness:recordHash`.
   */
  previousHash?: string | null;
  /** Explicitly opt into hash-chaining even when no `agreement` is supplied. */
  chain?: boolean;
}

export interface ProvDecisionRecordInput extends ProvRecordInput {
  /** Required on every decision record: the agreement URL + SHA-256 digest. */
  agreement: ProvAgreementRef;
  /** Optional preceding record in the chain, from which `previousHash` is read. */
  previousRecord?: Pick<ProvActivity, "cat-harness:recordHash"> | null;
}

/** The activity for an allowed step, or `undefined` when one would have to be invented. */
export function provActivityFor(input: ProvRecordInput): ProvActivity | undefined {
  const { verdict: v } = input;
  if (!v.allowed || !v.actor || !v.role || input.policies.length === 0) return undefined;
  const policies = [...input.policies].sort();
  const baseActivity = {
    "@type": "prov:Activity" as const,
    "@id": input.id,
    "prov:startedAtTime": input.at,
    "prov:qualifiedAssociation": {
      "prov:agent": v.actor,
      "prov:hadRole": v.role,
      "prov:hadPlan": `${planStem(input.source)}#${input.node}`,
    },
    ...(input.target ? { "prov:used": [input.target] } : {}),
    "cat-harness:underPolicy": policies.length === 1 ? policies[0]! : policies,
    ...(input.agreement ? { "cat-harness:agreement": input.agreement } : {}),
    ...(input.grant ? { "cat-harness:grant": input.grant } : {}),
  };
  const shouldChain =
    input.agreement !== undefined || input.previousHash !== undefined || input.chain === true;
  if (shouldChain) {
    const previousHash = input.previousHash ?? null;
    const withPrev = {
      ...baseActivity,
      "cat-harness:previousHash": previousHash,
    };
    const recordHash = computeProvRecordHash(withPrev);
    const chained = {
      ...withPrev,
      "cat-harness:recordHash": recordHash,
    };
    return input.agreement
      ? ProvDecisionRecordSchema.parse(chained)
      : ProvActivitySchema.parse(chained);
  }
  // Validated here, so an invalid record is a thrown bug at the step that
  // produced it rather than a finding discovered later by the after-check.
  return ProvActivitySchema.parse(baseActivity);
}

/**
 * Build a hash-chained PROV decision record (DSA B4, bean `3z44`) naming its
 * agreement (URL + SHA-256 digest, and optional grant id) and chained to
 * `previousRecord` / `previousHash`. Returns `undefined` when the verdict was
 * refused or lacks actor/role/policies.
 */
export function provDecisionRecordFor(
  input: ProvDecisionRecordInput,
): ProvDecisionRecord | undefined {
  const previousHash =
    input.previousRecord !== undefined
      ? (input.previousRecord?.["cat-harness:recordHash"] ?? null)
      : (input.previousHash ?? null);
  const act = provActivityFor({
    ...input,
    previousHash,
    chain: true,
  });
  return act ? ProvDecisionRecordSchema.parse(act) : undefined;
}
