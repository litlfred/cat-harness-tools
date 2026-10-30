/**
 * @graphNode schema
 *
 * Whether a glossary term the extractor MINTED already exists as a concept
 * somebody else is authoritative for — bean `7wou`, under `5yhm`.
 *
 * ## The gap this closes
 *
 * `glossary-extract.ts` mints a `candidate` from every knowledge-graph asset
 * carrying a title and a description: 2 594 of them across five schemes here,
 * against 7 authored terms. Every one of those candidates is asserted by the
 * extraction and checked against nothing. The owner's sentence, 2026-09-29:
 * *"extracting exsiting glossary needs compaision to existing
 * termonology/coding."*
 *
 * The MODEL for a mapping already existed —
 * [`vocabulary-authority`](../skills/kg/kg-core/vocabulary-authority.md) names
 * SKOS the hub and `exactMatch` / `closeMatch` / `broadMatch` / `relatedMatch`
 * the predicates, and authored terms already carry `exactMatch` to ODRL URIs.
 * What did not exist is anything that performs the comparison.
 *
 * ## TWO targets, and they are not interchangeable
 *
 * Owner, 2026-09-30: **"OCL is only for FHIR. not a constraint on SKOS."**
 * That is `vocabulary-authority`'s table, enforced:
 *
 * | target | authoritative for | resolved against |
 * |---|---|---|
 * | `skos` | what a term MEANS | SKOS concept schemes — the instance's own authored terms, plus any external scheme it declares |
 * | `fhir` | a clinical code's OPERATIONAL semantics | the pinned published IG snapshot (`cat-harness/external-schemas/who-smart-base.terminology.json`, `who-smart-base@v1.0.0`, 12 CodeSystems / 585 concepts; owner ruling 2026-09-30, bean `ejug`: a published IG at a version, not a live collection; OCL remains the terminology-management tool for the SMART Guidelines side) |
 *
 * A term matched in SKOS and a term matched in FHIR are **different
 * assertions with different authorities**, so a result carries which target
 * it came from and the two are never merged into one verdict. Collapsing them
 * would be the composite `vocabulary-authority` exists to prevent: OCL would
 * silently become an authority on meaning, which it is not.
 *
 * ## Three states, and the third is the whole point
 *
 * `mapped` · `unmapped` · `undetermined`. The third is NEVER rendered as
 * `unmapped`: a terminology that could not be reached has said nothing, and
 * recording silence as "no match" is bean `dh4f` — a consumer that reports a
 * clean run over a check that never ran.
 *
 * Measured 2026-09-30 (`7wou`), cloud sessions are refused
 * `api.openconceptlab.org:443` by network policy (`403 to CONNECT`); measured
 * 2026-10-24 (`q7ds`) from an open internet connection, `api.openconceptlab.org`
 * (`v2.3.234-3e606025`) itself answers HTTP 403 (`"Authentication required.
 * Anonymous API access is disabled."`) on `/orgs/`, `/sources/`,
 * `/collections/`, `/concepts/`, and `/orgs/WHO/*`. On the owner's 2026-09-30
 * ruling (`ejug`), the `fhir` half resolves offline against the pinned
 * `who-smart-base@v1.0.0` snapshot (`external-schemas/who-smart-base.terminology.json`,
 * 12 code systems, 585 concepts), so both targets return determined verdicts
 * (`0 undetermined`) whenever the pin and snapshot are present and valid, while
 * an absent or unusable snapshot still yields `undetermined` with its reason.
 * Probing all 33 published CodeSystems (1 892 concepts) across
 * `smart.who.int/{base,trust,immunizations}` on 2026-10-24 (`q7ds`) likewise
 * returned 0 matches against the extracted glossary candidates.
 *
 * ## `exact` and `concept` are a PAIR, from the start
 *
 * Both are always present, and the GAP between them is the finding. From
 * [`consensus-grounded-subject-evaluation`](../methodologies/consensus-grounded-subject-evaluation.md):
 * a high concept score with a low exact score means the right idea under the
 * wrong authorised label — a different and specifiable outcome from no match
 * at all. A single boolean cannot express it, and widening one later is how a
 * measurement loses the distinction it was built for.
 *
 * **What each means here is SKOS's own, not LCSH's.** That benchmark splits on
 * the subdivision separator `--`, which these labels do not have. So:
 *
 * - `exact` — the normalised `prefLabel` matches a concept's `prefLabel`.
 * - `concept` — the normalised label matches that concept's `prefLabel` **or
 *   any of its `altLabel`s**: the same concept reached by a different name.
 *
 * Normalisation is stated rather than assumed, and is the benchmark's:
 * NFC, lower-case, whitespace collapsed, a trailing period stripped — so a
 * term is judged on substance rather than typography.
 *
 * ## Validated in memory, committed as a projection
 *
 * The full file — two rows per candidate — is built and validated
 * against this schema on every run, and then PROJECTED into
 * `test/results/term-mapping.qa-results.json`, which keeps the per-target
 * summaries and only the rows a reader can act on. Committing thousands of
 * per-candidate rows that all say `unmapped` (or, when a target is
 * unreachable, the same `undetermined_reason`) would bury the handful that are
 * findings, and the per-scheme counts and scope already state that fact once.
 *
 * The schema still earns its place: it is what refuses an `undetermined` row
 * with no reason, and that refusal runs before the projection rather than
 * after, so the defect cannot reach the committed file.
 *
 * ## It reports and never grades
 *
 * No ratio of mapped to total is computed, and none should be. `m4xy`'s rule
 * carries over: an unmapped candidate may be a term this corpus is right to
 * coin, and a mapped one may be a coincidence of wording. The counts are for
 * a reader, not for a threshold.
 */
import { z } from "zod";

/**
 * Which authority answered. See the table above — these are not two sources
 * for one question, they are two questions.
 */
export const MAPPING_TARGETS = ["skos", "fhir"] as const;
export type MappingTarget = (typeof MAPPING_TARGETS)[number];

/** `undetermined` is never rendered as `unmapped`. */
export const MATCH_STATES = ["mapped", "unmapped", "undetermined"] as const;
export type MatchState = (typeof MATCH_STATES)[number];

/** The SKOS mapping predicates, as `vocabulary-authority` declares them. */
export const MAPPING_PREDICATES = [
  "skos:exactMatch",
  "skos:closeMatch",
  "skos:broadMatch",
  "skos:relatedMatch",
] as const;

export const ConceptMatchSchema = z
  .object({
    /** The concept's URI, or its in-repo term id where it has no URI yet. */
    uri: z.string().min(1),
    predicate: z.enum(MAPPING_PREDICATES),
    /** The label that matched, so a reader can see WHY without re-deriving it. */
    via: z.string().min(1),
    /** The scheme the concept belongs to. */
    scheme: z.string().min(1),
  })
  .strict();

export const TermMappingSchema = z
  .object({
    /** The candidate's id, as its glossary scheme records it. */
    term: z.string().min(1),
    /**
     * The instance that owns the scheme. A scheme id such as `kg-tools` is
     * shared by every instance's extraction, so a scheme is keyed by
     * (instance, scheme): bean `q3n9`, owner ruling A, 2026-10-24. The
     * instance is derived from the scheme's source, never from where its
     * glossary file sits, so a file that moves keeps its key.
     */
    instance: z.string().min(1),
    /** The scheme the candidate came from — `kg-skills`, `kg-tools`, … */
    scheme: z.string().min(1),
    target: z.enum(MAPPING_TARGETS),
    exact: z.enum(MATCH_STATES),
    concept: z.enum(MATCH_STATES),
    /** Present when either state is `mapped`; the concepts that matched. */
    matches: z.array(ConceptMatchSchema).min(1).optional(),
    /** Required when either state is `undetermined`. */
    undetermined_reason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const undetermined = m.exact === "undetermined" || m.concept === "undetermined";
    if (undetermined && !m.undetermined_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["undetermined_reason"],
        message:
          "an undetermined result must carry its reason — without one it cannot be told from a " +
          "bug, and a reader has no way to know the check did not run (bean dh4f)",
      });
    }
    if (!undetermined && m.undetermined_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["undetermined_reason"],
        message: "both states were determined, so there is no undetermined reason to give",
      });
    }
    if ((m.exact === "mapped" || m.concept === "mapped") && !m.matches) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["matches"],
        message: "a `mapped` result must name what it matched, or it is an assertion with no subject",
      });
    }
    // `exact` implies `concept`: a label that matches a prefLabel exactly also
    // matches the concept. The reverse does not hold, and that asymmetry is
    // the whole reason both are recorded.
    if (m.exact === "mapped" && m.concept === "unmapped") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["concept"],
        message:
          "`exact: mapped` with `concept: unmapped` is not reachable — an exact label match is a " +
          "concept match by construction",
      });
    }
  });

/** What a run consulted, per target. A result with no scope cannot be read. */
export const MappingScopeSchema = z
  .object({
    target: z.enum(MAPPING_TARGETS),
    /**
     * The schemes or collections consulted. **May be empty**, and an empty
     * list is a determined finding — this instance declares nothing to check
     * against for that target — rather than a missing field.
     */
    consulted: z.array(z.string().min(1)),
    /** How they were reached: `local` for in-repo schemes, a host for a service. */
    via: z.string().min(1),
    /** Present when the target could not be consulted at all. */
    unreachable_reason: z.string().min(1).optional(),
  })
  .strict();

export const TERM_MAPPINGS_SCHEMA_ID = "folio-term-mappings/v1";

export const TermMappingsFileSchema = z
  .object({
    $schema: z.literal(TERM_MAPPINGS_SCHEMA_ID),
    _comment: z.string().optional(),
    checked_at: z.string().min(1),
    /** One entry per target, always both, so a reader sees what was NOT asked. */
    scope: z.array(MappingScopeSchema).min(1),
    mappings: z.array(TermMappingSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const targets = new Set(f.scope.map((s) => s.target));
    for (const t of MAPPING_TARGETS) {
      if (!targets.has(t)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scope"],
          message:
            `no scope recorded for target \`${t}\` — a run that did not ask must say so, or its ` +
            "silence reads as nothing to find",
        });
      }
    }
  });

export type ConceptMatch = z.infer<typeof ConceptMatchSchema>;
export type TermMapping = z.infer<typeof TermMappingSchema>;
export type MappingScope = z.infer<typeof MappingScopeSchema>;
export type TermMappingsFile = z.infer<typeof TermMappingsFileSchema>;

/**
 * NFC, lower-case, whitespace collapsed, one trailing period stripped.
 *
 * The benchmark's rule, so a term is judged on substance rather than
 * typography. Exported because the check and its tests must not each have
 * their own idea of what "the same label" means.
 */
export function normaliseLabel(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim().replace(/\.$/, "").trim();
}
