/**
 * W3C PROV-O: the record of a task or decision being performed. Issue #1180,
 * extended for computable Data Sharing Agreements (DSA B4, bean `3z44`,
 * issue #2702).
 *
 * Owner, 2026-09-23: *"W3C ODRL 2.2 and W3C PROV-O for logging"*. The
 * deterministic BPMN engine checks a policy BEFORE a task and refuses; the
 * agentic swarm acts, and a QA/QC report checks the policy AFTER, from this
 * log (`docs/agentic-harness.html#bpmn-execution`). Both need the same
 * record, so it is PROV-O's, not ours.
 *
 * One `prov:Activity` per task run or decision:
 *
 * | PROV-O / extension | means here |
 * |---|---|
 * | `prov:qualifiedAssociation.prov:agent` | the Actor that performed it |
 * | `prov:qualifiedAssociation.prov:hadRole` | the Role it acted in (the lane's) |
 * | `prov:qualifiedAssociation.prov:hadPlan` | the BPMN task: `<process>#<task id>` |
 * | `prov:actedOnBehalfOf` | the person an agent worked for |
 * | `prov:used` / `prov:generated` | the graph nodes read and written |
 * | `cat-harness:underPolicy` | the ODRL policy (or policies) it acted under |
 * | `cat-harness:agreement` | the DSA Agreement URL/IRI + SHA-256 digest (and optional grant id) |
 * | `cat-harness:grant` | optional grant identifier (DSA B5) |
 * | `cat-harness:previousHash` | SHA-256 hex digest of the preceding record in the chain (`null` at genesis) |
 * | `cat-harness:recordHash` | SHA-256 hex digest of this record's canonical JSON |
 *
 * `hadPlan` is PROV-O's own term for "the plan an agent followed". A BPMN task
 * is exactly that, so no new term is minted for it.
 *
 * @module schemas/prov
 * @graphNode schema
 */
import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The JSON-LD context PROV is emitted with: PROV-JSONLD's (W3C Member
 * Submission 2024-08-25), by owner decision 2026-10-01 (bean `jcet`) — W3C
 * publishes no JSON-LD context for PROV-O. Until then this held
 * `http://www.w3.org/ns/prov-o`, the ontology DOCUMENT's address, which is
 * neither the namespace (`…/ns/prov#`) nor a context. Held locally and pinned;
 * see `prov-jsonld.ts`, which builds on this module and so imports it from here.
 */
export const PROV_CONTEXT = "https://openprovenance.org/prov-jsonld/context.jsonld" as const;

/** `<process>#<task>`: a BPMN process id and one of its task ids. */
export const PLAN_REF = /^[a-z0-9][a-z0-9-]*#[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Lowercase 64-character hex SHA-256 digest. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Absolute URI/IRI scheme pattern for agreement URLs/IRIs. */
export const AGREEMENT_URI = /^[a-z][a-z0-9+.-]*:\S+$/i;

export const Sha256HexSchema = z
  .string()
  .regex(SHA256_HEX, "sha256 must be a 64-character lowercase hex digest");

/**
 * Citation of a computable Data Sharing Agreement (DSA B3/B4, bean `3z44`):
 * the agreement's URL/IRI, its SHA-256 digest, and an optional grant id (once
 * B5 exists).
 */
export const ProvAgreementRefSchema = z
  .object({
    url: z.string().regex(AGREEMENT_URI, "agreement url must be an absolute URI/IRI"),
    sha256: Sha256HexSchema,
    grant: z.string().min(1).optional(),
  })
  .strict();

export type ProvAgreementRef = z.infer<typeof ProvAgreementRefSchema>;

/**
 * Citation of an IHE PCF / FHIR R4 `Consent` resource (`id` + `versionId`,
 * PCF8, bean `2egb`, issue #2702). Every consent-based decision record names
 * the logical `id` and `meta.versionId` of the Consent in force when the
 * decision was made.
 */
export const ProvConsentRefSchema = z
  .object({
    id: z.string().min(1, "consent id must be non-empty"),
    versionId: z.string().min(1, "consent versionId must be non-empty"),
  })
  .strict();

export type ProvConsentRef = z.infer<typeof ProvConsentRefSchema>;

/** Whether a policy UID names an IHE PCF / FHIR Consent policy (`urn:ihe:pcf:consent:*`). */
export function isConsentPolicyUid(uid: string): boolean {
  const lower = uid.toLowerCase();
  return lower.startsWith("urn:ihe:pcf:consent:") || lower.includes(":consent:");
}

function recordUnderPolicies(rec: Record<string, unknown>): string[] {
  const u = rec["cat-harness:underPolicy"];
  if (typeof u === "string") return [u];
  if (Array.isArray(u)) return u.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Whether a PROV activity/decision record is consent-based and therefore must
 * cite `cat-harness:consent` (`id` + `versionId`, PCF8, bean `2egb`).
 */
export function isConsentBasedRecord(
  rec: Record<string, unknown>,
  opts?: { requireConsent?: boolean; consentPolicyUids?: ReadonlySet<string> | readonly string[] },
): boolean {
  if (opts?.requireConsent === true) return true;
  if (rec["cat-harness:consentBased"] === true) return true;
  const under = recordUnderPolicies(rec);
  if (under.some(isConsentPolicyUid)) return true;
  if (opts?.consentPolicyUids) {
    const set =
      opts.consentPolicyUids instanceof Set
        ? opts.consentPolicyUids
        : new Set(opts.consentPolicyUids);
    if (under.some((u) => set.has(u))) return true;
  }
  return false;
}

const Iso = z.string().datetime({ offset: true });

export const ProvAssociationSchema = z
  .object({
    "prov:agent": z.string().min(1),
    "prov:hadRole": z.string().min(1),
    "prov:hadPlan": z.string().regex(PLAN_REF, "hadPlan is <process>#<task>"),
  })
  .strict();

function canonicalValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalValue);
  if (v !== null && typeof v === "object") {
    const rec = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(rec)
        .filter((k) => rec[k] !== undefined)
        .sort()
        .map((k) => [k, canonicalValue(rec[k])]),
    );
  }
  return v;
}

/**
 * Canonical JSON string for a PROV activity/decision record: keys sorted
 * recursively, no extra whitespace, `cat-harness:recordHash` omitted, and
 * `cat-harness:previousHash` normalized to `string | null`.
 */
export function canonicalProvRecord(record: Record<string, unknown>): string {
  const { "cat-harness:recordHash": _drop, ...rest } = record;
  const normalized: Record<string, unknown> = {
    ...rest,
    "cat-harness:previousHash":
      (rest["cat-harness:previousHash"] as string | null | undefined) ?? null,
  };
  return JSON.stringify(canonicalValue(normalized));
}

/**
 * Compute the 64-character lowercase hex SHA-256 digest of a PROV record over
 * its {@link canonicalProvRecord} representation.
 */
export function computeProvRecordHash(record: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalProvRecord(record)).digest("hex");
}

const ProvActivityObjectSchema = z
  .object({
    "@type": z.literal("prov:Activity"),
    "@id": z.string().min(1),
    "prov:startedAtTime": Iso,
    "prov:endedAtTime": Iso.optional(),
    "prov:qualifiedAssociation": ProvAssociationSchema,
    "prov:actedOnBehalfOf": z.string().min(1).optional(),
    "prov:used": z.array(z.string().min(1)).optional(),
    "prov:generated": z.array(z.string().min(1)).optional(),
    /**
     * The ODRL policy uid(s) the run was under. Required: a run under no policy
     * cannot be checked. An array when several policies were in force, which is
     * how JSON-LD writes several values of one property: `decide` evaluates
     * every policy an instance holds, so naming only one would misstate what
     * the verdict was computed against.
     */
    "cat-harness:underPolicy": z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    /**
     * The Data Sharing Agreement (URL + SHA-256 digest, and optional grant id)
     * cited by a decision record (DSA B4, bean `3z44`). Required on
     * {@link ProvDecisionRecordSchema}; optional on general task activities.
     */
    "cat-harness:agreement": ProvAgreementRefSchema.optional(),
    /**
     * Optional grant identifier (DSA B5) when a decision was made under an
     * issued grant.
     */
    "cat-harness:grant": z.string().min(1).optional(),
    /**
     * The IHE PCF / FHIR R4 `Consent` (`id` + `versionId`) cited when a
     * decision is consent-based (PCF8, bean `2egb`). Required whenever the
     * decision is consent-based (`cat-harness:consentBased: true` or under a
     * consent policy).
     */
    "cat-harness:consent": ProvConsentRefSchema.optional(),
    /**
     * Marks a decision record as consent-based (evaluated under a policy with
     * an `odrl:obtainConsent` duty). When `true`, `cat-harness:consent`
     * (`id` + `versionId`) is required.
     */
    "cat-harness:consentBased": z.boolean().optional(),
    /**
     * SHA-256 hex digest of the preceding record in the hash-chained log, or
     * `null` for the first (genesis) record in a chain.
     */
    "cat-harness:previousHash": Sha256HexSchema.nullable().optional(),
    /**
     * SHA-256 hex digest of this record's canonical JSON (excluding
     * `cat-harness:recordHash` and including `cat-harness:previousHash`).
     */
    "cat-harness:recordHash": Sha256HexSchema.optional(),
  })
  .strict();

export const ProvActivitySchema = ProvActivityObjectSchema.refine(
  (a) => !a["prov:endedAtTime"] || a["prov:endedAtTime"] >= a["prov:startedAtTime"],
  {
    message: "endedAtTime is before startedAtTime",
    path: ["prov:endedAtTime"],
  },
)
  .refine(
    (a) =>
      !isConsentBasedRecord(a as unknown as Record<string, unknown>) ||
      a["cat-harness:consent"] !== undefined,
    {
      message: "every consent-based decision record must name its Consent (cat-harness:consent with id + versionId)",
      path: ["cat-harness:consent"],
    },
  )
  .refine(
    (a) =>
      a["cat-harness:recordHash"] === undefined ||
      a["cat-harness:previousHash"] !== undefined,
    {
      message: "a hash-chained record with cat-harness:recordHash must also declare cat-harness:previousHash (string or null)",
      path: ["cat-harness:previousHash"],
    },
  )
  .refine(
    (a) =>
      a["cat-harness:recordHash"] === undefined ||
      a["cat-harness:recordHash"] === computeProvRecordHash(a),
    {
      message: "cat-harness:recordHash does not match the canonical SHA-256 digest of the record",
      path: ["cat-harness:recordHash"],
    },
  );

export type ProvActivity = z.infer<typeof ProvActivitySchema>;

/**
 * A PROV decision record under a computable Data Sharing Agreement (DSA B4,
 * bean `3z44`): every decision record names its agreement (URL + SHA-256
 * digest, and optional grant id) and carries its hash-chain fields
 * (`cat-harness:previousHash` and `cat-harness:recordHash`). When the decision
 * is consent-based (PCF8, bean `2egb`), it must also name its Consent
 * (`cat-harness:consent` with `id` + `versionId`).
 */
export const ProvDecisionRecordSchema = ProvActivityObjectSchema.extend({
  "cat-harness:agreement": ProvAgreementRefSchema,
  "cat-harness:previousHash": Sha256HexSchema.nullable(),
  "cat-harness:recordHash": Sha256HexSchema,
})
  .strict()
  .refine((a) => !a["prov:endedAtTime"] || a["prov:endedAtTime"] >= a["prov:startedAtTime"], {
    message: "endedAtTime is before startedAtTime",
    path: ["prov:endedAtTime"],
  })
  .refine(
    (a) =>
      !isConsentBasedRecord(a as unknown as Record<string, unknown>) ||
      a["cat-harness:consent"] !== undefined,
    {
      message: "every consent-based decision record must name its Consent (cat-harness:consent with id + versionId)",
      path: ["cat-harness:consent"],
    },
  )
  .refine((a) => a["cat-harness:recordHash"] === computeProvRecordHash(a), {
    message: "cat-harness:recordHash does not match the canonical SHA-256 digest of the record",
    path: ["cat-harness:recordHash"],
  });

export type ProvDecisionRecord = z.infer<typeof ProvDecisionRecordSchema>;

/**
 * A consent-based PROV decision record (PCF8, bean `2egb`): requires both
 * `cat-harness:agreement` (`url` + `sha256`) and `cat-harness:consent`
 * (`id` + `versionId`), plus the hash-chain fields.
 */
export const ProvConsentDecisionRecordSchema = ProvActivityObjectSchema.extend({
  "cat-harness:agreement": ProvAgreementRefSchema,
  "cat-harness:consent": ProvConsentRefSchema,
  "cat-harness:previousHash": Sha256HexSchema.nullable(),
  "cat-harness:recordHash": Sha256HexSchema,
})
  .strict()
  .refine((a) => !a["prov:endedAtTime"] || a["prov:endedAtTime"] >= a["prov:startedAtTime"], {
    message: "endedAtTime is before startedAtTime",
    path: ["prov:endedAtTime"],
  })
  .refine((a) => a["cat-harness:recordHash"] === computeProvRecordHash(a), {
    message: "cat-harness:recordHash does not match the canonical SHA-256 digest of the record",
    path: ["cat-harness:recordHash"],
  });

export type ProvConsentDecisionRecord = z.infer<typeof ProvConsentDecisionRecordSchema>;

export type UnchainedProvActivity = Omit<
  ProvActivity,
  "@type" | "cat-harness:previousHash" | "cat-harness:recordHash"
> & {
  "@type": "prov:Activity" | string;
};

export type UnchainedProvDecisionRecord = Omit<
  ProvDecisionRecord,
  "@type" | "cat-harness:previousHash" | "cat-harness:recordHash"
> & {
  "@type": "prov:Activity" | string;
};

/**
 * Stamp a PROV activity with `cat-harness:previousHash` and
 * `cat-harness:recordHash` and validate it against {@link ProvActivitySchema}.
 */
export function stampProvRecord(
  record: UnchainedProvActivity,
  previousHash: string | null = null,
): ProvActivity {
  const withPrev = {
    ...record,
    "cat-harness:previousHash": previousHash,
  };
  const recordHash = computeProvRecordHash(withPrev);
  return ProvActivitySchema.parse({
    ...withPrev,
    "cat-harness:recordHash": recordHash,
  });
}

/**
 * Stamp a PROV decision record (requiring `cat-harness:agreement`) with
 * `cat-harness:previousHash` and `cat-harness:recordHash` and validate it
 * against {@link ProvDecisionRecordSchema}.
 */
export function stampProvDecisionRecord(
  record: UnchainedProvDecisionRecord,
  previousHash: string | null = null,
): ProvDecisionRecord {
  const withPrev = {
    ...record,
    "cat-harness:previousHash": previousHash,
  };
  const recordHash = computeProvRecordHash(withPrev);
  return ProvDecisionRecordSchema.parse({
    ...withPrev,
    "cat-harness:recordHash": recordHash,
  });
}

/**
 * Link an ordered sequence of decision records into a hash-chained log where
 * record 0 has `cat-harness:previousHash: null` (or `initialPreviousHash`) and
 * each subsequent record points to the preceding record's
 * `cat-harness:recordHash`.
 */
export function buildProvHashChain(
  records: readonly UnchainedProvDecisionRecord[],
  initialPreviousHash: string | null = null,
): ProvDecisionRecord[] {
  const out: ProvDecisionRecord[] = [];
  let prev: string | null = initialPreviousHash;
  for (const r of records) {
    const stamped = stampProvDecisionRecord(r, prev);
    out.push(stamped);
    prev = stamped["cat-harness:recordHash"];
  }
  return out;
}

/**
 * Append a new decision record to the end of an existing hash-chained log.
 */
export function appendProvDecisionRecord(
  chain: readonly ProvDecisionRecord[],
  next: UnchainedProvDecisionRecord,
): ProvDecisionRecord[] {
  const prev = chain.length > 0 ? chain[chain.length - 1]!["cat-harness:recordHash"] : null;
  return [...chain, stampProvDecisionRecord(next, prev)];
}

export type ProvChainErrorKind =
  | "invalid-record"
  | "missing-agreement"
  | "missing-consent"
  | "missing-hash"
  | "hash-mismatch"
  | "broken-link"
  | "head-mismatch"
  | "count-mismatch";

export interface ProvChainError {
  index: number;
  id?: string;
  kind: ProvChainErrorKind;
  detail: string;
}

export interface ProvChainVerifyOptions {
  /**
   * Whether every record in the chain must cite a `cat-harness:agreement`
   * (URL + SHA-256 digest). Defaults to `true` (every decision record names its
   * agreement and hash).
   */
  requireAgreement?: boolean;
  /**
   * Whether every record in the chain is consent-based and must cite a
   * `cat-harness:consent` (`id` + `versionId`, PCF8, bean `2egb`). Even when
   * `false`/omitted, any record with `cat-harness:consentBased: true` or whose
   * `cat-harness:underPolicy` names a consent policy in `consentPolicyUids`
   * must cite its Consent.
   */
  requireConsent?: boolean;
  /**
   * Policy UIDs that require Consent (e.g. policies with an `odrl:obtainConsent`
   * duty). Any record evaluated under one of these policies must cite
   * `cat-harness:consent` (`id` + `versionId`).
   */
  consentPolicyUids?: ReadonlySet<string> | readonly string[];
  /** Expected `cat-harness:previousHash` on the first record (`null` by default). */
  expectedGenesisPreviousHash?: string | null;
  /**
   * Optional expected `cat-harness:recordHash` of the final record in the
   * chain. When supplied, truncating/removing the tail record is also caught.
   */
  expectedHeadHash?: string;
  /**
   * Optional expected number of records in the chain. When supplied, removing
   * any record (including the final record) fails with `count-mismatch`.
   */
  expectedCount?: number;
}

export interface ProvChainVerification {
  valid: boolean;
  errors: ProvChainError[];
  headHash: string | null;
  count: number;
}

/**
 * Verify a hash-chained log of PROV decision records (DSA B4, bean `3z44`):
 *
 * 1. Every record validates against {@link ProvDecisionRecordSchema} (when
 *    `requireAgreement` is `true`, the default) or {@link ProvActivitySchema},
 *    naming its agreement (URL + SHA-256) and hash (`cat-harness:recordHash`).
 * 2. Every record's `cat-harness:recordHash` equals
 *    {@link computeProvRecordHash} over the record's canonical JSON — so
 *    editing any field of any past record fails with `hash-mismatch`.
 * 3. Record 0's `cat-harness:previousHash` equals `expectedGenesisPreviousHash`
 *    (`null` by default), and each record `i > 0` has
 *    `cat-harness:previousHash === records[i - 1]["cat-harness:recordHash"]` —
 *    so removing or reordering any past record fails with `broken-link`.
 * 4. When `expectedHeadHash` or `expectedCount` is supplied, truncating the
 *    tail of the log also fails (`head-mismatch` / `count-mismatch`).
 */
export function verifyProvHashChain(
  records: readonly unknown[],
  opts: ProvChainVerifyOptions = {},
): ProvChainVerification {
  const requireAgreement = opts.requireAgreement ?? true;
  const expectedGenesis =
    opts.expectedGenesisPreviousHash === undefined ? null : opts.expectedGenesisPreviousHash;
  const errors: ProvChainError[] = [];

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        index: i,
        kind: "invalid-record",
        detail: `record[${i}] is not an object`,
      });
      continue;
    }
    const rec = raw as Record<string, unknown>;
    const id = typeof rec["@id"] === "string" ? rec["@id"] : undefined;

    if (requireAgreement && rec["cat-harness:agreement"] === undefined) {
      errors.push({
        index: i,
        id,
        kind: "missing-agreement",
        detail: `record[${i}] (${id ?? "unidentified"}) does not name a cat-harness:agreement (url + sha256)`,
      });
    }

    if (isConsentBasedRecord(rec, opts) || rec["cat-harness:consent"] !== undefined) {
      const consentParsed = ProvConsentRefSchema.safeParse(rec["cat-harness:consent"]);
      if (!consentParsed.success) {
        errors.push({
          index: i,
          id,
          kind: "missing-consent",
          detail: `record[${i}] (${id ?? "unidentified"}) is a consent-based decision but does not name a valid cat-harness:consent (id + versionId)`,
        });
      }
    }

    const recordHash = rec["cat-harness:recordHash"];
    const previousHash = rec["cat-harness:previousHash"];
    if (typeof recordHash !== "string" || !SHA256_HEX.test(recordHash)) {
      errors.push({
        index: i,
        id,
        kind: "missing-hash",
        detail: `record[${i}] (${id ?? "unidentified"}) is missing a valid 64-char hex cat-harness:recordHash`,
      });
    } else {
      const computed = computeProvRecordHash(rec);
      if (recordHash !== computed) {
        errors.push({
          index: i,
          id,
          kind: "hash-mismatch",
          detail: `record[${i}] (${id ?? "unidentified"}) cat-harness:recordHash ${recordHash} does not match computed ${computed}`,
        });
      }
    }

    if (previousHash === undefined) {
      errors.push({
        index: i,
        id,
        kind: "missing-hash",
        detail: `record[${i}] (${id ?? "unidentified"}) is missing cat-harness:previousHash`,
      });
    } else if (i === 0) {
      if (previousHash !== expectedGenesis) {
        errors.push({
          index: 0,
          id,
          kind: "broken-link",
          detail: `record[0] (${id ?? "unidentified"}) has cat-harness:previousHash ${String(previousHash)}, expected genesis ${String(expectedGenesis)} (first record removed or tampered)`,
        });
      }
    } else {
      const prevRaw = records[i - 1];
      const prevRec =
        prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
          ? (prevRaw as Record<string, unknown>)
          : undefined;
      const prevHash = prevRec?.["cat-harness:recordHash"];
      if (typeof prevHash !== "string" || previousHash !== prevHash) {
        errors.push({
          index: i,
          id,
          kind: "broken-link",
          detail: `record[${i}] (${id ?? "unidentified"}) has cat-harness:previousHash ${String(previousHash)}, which does not match record[${i - 1}] cat-harness:recordHash ${String(prevHash)} (past record edited, removed or reordered)`,
        });
      }
    }

    const schema = requireAgreement ? ProvDecisionRecordSchema : ProvActivitySchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const alreadyReported = errors.some((e) => e.index === i);
      if (!alreadyReported) {
        errors.push({
          index: i,
          id,
          kind: "invalid-record",
          detail: parsed.error.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`).join("; "),
        });
      }
    }
  }

  if (opts.expectedCount !== undefined && records.length !== opts.expectedCount) {
    errors.push({
      index: records.length,
      kind: "count-mismatch",
      detail: `chain has ${records.length} record(s), expected ${opts.expectedCount}`,
    });
  }

  const lastRec =
    records.length > 0 &&
    records[records.length - 1] &&
    typeof records[records.length - 1] === "object" &&
    !Array.isArray(records[records.length - 1])
      ? (records[records.length - 1] as Record<string, unknown>)
      : undefined;
  const headHash =
    typeof lastRec?.["cat-harness:recordHash"] === "string"
      ? (lastRec["cat-harness:recordHash"] as string)
      : null;

  if (opts.expectedHeadHash !== undefined && headHash !== opts.expectedHeadHash) {
    errors.push({
      index: Math.max(0, records.length - 1),
      id: typeof lastRec?.["@id"] === "string" ? (lastRec["@id"] as string) : undefined,
      kind: "head-mismatch",
      detail: `chain headHash is ${String(headHash)}, expected ${opts.expectedHeadHash}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    headHash,
    count: records.length,
  };
}
