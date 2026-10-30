/**
 * W3C ODRL 2.2 policies: what an Actor may do, scoped by Process, Task and Role.
 *
 * Owner, 2026-09-23 (issue #1180), choosing the permission language: *"W3C
 * ODRL 2.2 and W3C PROV-O for logging"*, after asking for *"more granular
 * permissions, can inherit. options for existing json open standards. doensnt
 * necc need to be rooted acyclic graph."* The design is
 * `docs/proposals/odrl-prov-actor-model.md`, and the owner's answers to its
 * open questions: policies are their own **graph typology**; an unauthenticated
 * reader may **visualize and render only**; a relationship engine (OpenFGA)
 * is **later**.
 *
 * ## The subset, and why only this much
 *
 * ODRL is large. This is the part a folio reads today: a Policy (`Set`,
 * `Offer`, `Agreement`) holding `permission` and `prohibition` rules (plus
 * optional `duty` obligations), each naming an `assignee`, an `action`, an
 * optional `target`, optional `constraint`s and optional `duty` rules.
 * Refinements and party collections are ODRL too; none has a reader here yet,
 * so none is accepted. A key outside the subset is refused rather than dropped
 * (`.strict()`), because a rule that silently means less than it says is
 * exactly the failure a permission file must not have.
 *
 * Terms are written as compact IRIs, as ODRL's own JSON-LD context writes
 * them: `odrl:display`, `cat-harness:perform-task`, and a bare action id for one
 * the folio profile declares (`content-authoring`).
 *
 * ## Actions inherit through `includedIn`
 *
 * The folio profile is `skills/permissions/permissions.json`: every action
 * says which broader actions it is `includedIn`, ending at ODRL's own common
 * vocabulary. A permission to a broader action permits every action included
 * in it, which is ODRL's reading of `includedIn`. The graph is walked with a
 * visited set, so it need not be a tree and need not be acyclic (the owner's
 * words), and a cycle cannot hang a decision.
 *
 * @module schemas/odrl
 * @graphNode schema
 *
 * @conformsTo w3c-odrl
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * The ODRL 2.2 namespace. A policy here binds it as `@vocab` in an inline
 * context instead of referencing W3C's published `odrl.jsonld`, so the
 * document can be read with no network and every term still expands to the
 * IRI that context gives it.
 */
export const ODRL_NS = "http://www.w3.org/ns/odrl/2/" as const;

/**
 * The ODRL common-vocabulary actions the folio profile hangs off, with ODRL's
 * own `includedIn` for each. Only the ones used are listed; `odrl:use` is the
 * top of this part of ODRL's action graph.
 */
export const ODRL_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  "odrl:use": [],
  "odrl:display": ["odrl:use"],
  "odrl:derive": ["odrl:use"],
  "odrl:annotate": ["odrl:use"],
  "odrl:modify": ["odrl:use"],
  "odrl:translate": ["odrl:use"],
  "odrl:execute": ["odrl:use"],
  "odrl:delete": ["odrl:use"],
  "odrl:attribute": ["odrl:use"],
  "odrl:inform": ["odrl:use"],
  "odrl:obtainConsent": ["odrl:use"],
};

/**
 * The ODRL 2.2 duty actions supported for computable data sharing agreements
 * (bean `s4v2`, issue #2702). Both `odrl:`-prefixed and bare ODRL JSON-LD
 * spellings are accepted and normalized to `odrl:<action>`.
 */
export const ODRL_DUTY_ACTIONS = [
  "odrl:delete",
  "odrl:attribute",
  "odrl:inform",
  "odrl:obtainConsent",
  "delete",
  "attribute",
  "inform",
  "obtainConsent",
] as const;
export type OdrlDutyAction = (typeof ODRL_DUTY_ACTIONS)[number];

/**
 * HL7 v3 `ActReason` code system (`PurposeOfUse` hierarchy).
 *
 * Owner rule, 2026-10-30 14:00Z (bean `s4v2`): no draft standards unless
 * approved. W3C DPV is a Community Group report and is NOT used; `purpose`
 * constraints use HL7 `PurposeOfUse` codes, with `isA` walking this hierarchy
 * via {@link broaderOrSelf}.
 */
export const HL7_ACT_REASON_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ActReason" as const;

export const HL7_PURPOSE_OF_USE: Readonly<Record<string, readonly string[]>> = {
  PurposeOfUse: [],
  HMARKT: ["PurposeOfUse"],
  HOPERAT: ["PurposeOfUse"],
  CAREMGT: ["HOPERAT", "TREAT"],
  DONAT: ["HOPERAT"],
  FRAUD: ["HOPERAT"],
  GOV: ["HOPERAT"],
  HACCRED: ["HOPERAT"],
  HCOMPL: ["HOPERAT"],
  HDECD: ["HOPERAT"],
  HDIRECT: ["HOPERAT"],
  HDM: ["HOPERAT"],
  HLEGAL: ["HOPERAT"],
  HOUTCOMS: ["HOPERAT"],
  HPRGRP: ["HOPERAT"],
  HQUALIMP: ["HOPERAT"],
  HSYSADMIN: ["HOPERAT"],
  LABELING: ["HOPERAT"],
  METAMGT: ["HOPERAT"],
  MEMADMIN: ["HOPERAT"],
  MILCDM: ["HOPERAT"],
  PATADMIN: ["HOPERAT"],
  PATSFTY: ["HOPERAT"],
  PERFMSR: ["HOPERAT"],
  RECORDMGT: ["HOPERAT"],
  SYSDEV: ["HOPERAT"],
  HTEST: ["HOPERAT"],
  TRAIN: ["HOPERAT"],
  HPAYMT: ["PurposeOfUse"],
  CLMATTCH: ["HPAYMT"],
  COVAUTH: ["HPAYMT"],
  COVERAGE: ["HPAYMT"],
  ELIGDTRM: ["COVERAGE"],
  ELIGVER: ["COVERAGE"],
  ENROLLM: ["COVERAGE"],
  MILDCRG: ["COVERAGE"],
  HAAUTH: ["HPAYMT"],
  REMITADV: ["HPAYMT"],
  HRESCH: ["PurposeOfUse"],
  BIORCH: ["HRESCH"],
  CLINTRCH: ["HRESCH"],
  CLINTRCHNPC: ["CLINTRCH"],
  CLINTRCHPC: ["CLINTRCH"],
  PRECLINTRCH: ["CLINTRCH"],
  DSRCH: ["HRESCH"],
  POARCH: ["HRESCH"],
  TRANSRCH: ["HRESCH"],
  PATRQT: ["PurposeOfUse"],
  FAMRQT: ["PATRQT"],
  PWATRNY: ["PATRQT"],
  SUPNWK: ["PATRQT"],
  PUBHLTH: ["PurposeOfUse"],
  DISASTER: ["PUBHLTH"],
  THREAT: ["PUBHLTH"],
  TREAT: ["PurposeOfUse"],
  CLINTRL: ["TREAT"],
  ETREAT: ["TREAT"],
  BTG: ["ETREAT"],
  ERTREAT: ["ETREAT"],
  POPHLTH: ["TREAT"],
};

const PURPOSE_GRAPH: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(HL7_PURPOSE_OF_USE));

/** Normalize an HL7 PurposeOfUse code (stripping optional CodeSystem IRI or prefix). */
export function normalizePurposeCode(code: string): string {
  if (code.startsWith(`${HL7_ACT_REASON_SYSTEM}#`) || code.startsWith(`${HL7_ACT_REASON_SYSTEM}/`)) {
    return code.slice(HL7_ACT_REASON_SYSTEM.length + 1);
  }
  if (code.startsWith("v3-ActReason:") || code.startsWith("hl7:")) {
    return code.slice(code.indexOf(":") + 1);
  }
  return code;
}

/** Whether `code` is a known HL7 `PurposeOfUse` code (never a draft vocabulary such as `dpv:*`). */
export function isValidPurposeOfUse(code: string): boolean {
  if (code.startsWith("dpv:") || code.includes("/dpv")) return false;
  return PURPOSE_GRAPH.has(normalizePurposeCode(code));
}

/**
 * The folio profile's `leftOperand`s: BPMN scope (`cat-harness:process`,
 * `cat-harness:task`, `cat-harness:role`) and ODRL 2.2 DSA constraints
 * (`odrl:purpose`, `odrl:dateTime`, `odrl:elapsedTime` and their unprefixed
 * JSON-LD forms). Absent scope on a rule means everywhere.
 */
export const FOLIO_LEFT_OPERANDS = [
  "cat-harness:process",
  "cat-harness:task",
  "cat-harness:role",
  "odrl:purpose",
  "odrl:dateTime",
  "odrl:elapsedTime",
  "purpose",
  "dateTime",
  "elapsedTime",
  "pcf:securityLabel",
  "pcf:dataPeriod",
  "pcf:author",
  "pcf:encounter",
] as const;
export type FolioLeftOperand = (typeof FOLIO_LEFT_OPERANDS)[number];

/** The operators this subset evaluates: ODRL's `eq`, `neq`, `isAnyOf`, `isNoneOf`, `lt`, `lteq`, `gt`, `gteq`, `isA`. */
export const ODRL_OPERATORS = [
  "odrl:eq",
  "odrl:neq",
  "odrl:isAnyOf",
  "odrl:isNoneOf",
  "odrl:lt",
  "odrl:lteq",
  "odrl:gt",
  "odrl:gteq",
  "odrl:isA",
  "eq",
  "neq",
  "isAnyOf",
  "isNoneOf",
  "lt",
  "lteq",
  "gt",
  "gteq",
  "isA",
] as const;
export type OdrlOperator = (typeof ODRL_OPERATORS)[number];

/** Anyone, authenticated or not. Owner: such a reader may visualize and render, and nothing else. */
export const ANYONE = "cat-harness:anyone" as const;

/**
 * ODRL's conflict strategies. The folio profile's default when a policy names
 * none is `odrl:prohibit`: the safe reading, stated here as OUR rule rather
 * than claimed as ODRL's.
 *
 * ODRL 2.2 §2.10 says otherwise — "If the conflict property is not explicitly
 * set, the default of invalid will be used" — so this is a PROFILE DEPARTURE,
 * kept by owner ruling on 2026-10-01 (bean `jcet`): an unstated clash denies
 * rather than voiding the whole policy. Changing it is a policy decision, not
 * a conformance fix; `odrl.test.ts` pins the value.
 */
export const ODRL_CONFLICT = ["odrl:perm", "odrl:prohibit", "odrl:invalid"] as const;
export const FOLIO_DEFAULT_CONFLICT = "odrl:prohibit" as const;

const SET_OPERATORS = new Set<string>(["odrl:isAnyOf", "odrl:isNoneOf", "isAnyOf", "isNoneOf"]);
const isPurposeLeftOperand = (op: string): boolean => op === "odrl:purpose" || op === "purpose";

export const OdrlConstraintSchema = z
  .object({
    leftOperand: z.enum(FOLIO_LEFT_OPERANDS),
    operator: z.enum(ODRL_OPERATORS),
    rightOperand: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  })
  .strict()
  .refine(
    (c) => SET_OPERATORS.has(c.operator) === Array.isArray(c.rightOperand),
    { message: "isAnyOf/isNoneOf take a list; eq/neq/lt/lteq/gt/gteq/isA take one value" },
  )
  .refine(
    (c) =>
      !isPurposeLeftOperand(c.leftOperand) ||
      (Array.isArray(c.rightOperand) ? c.rightOperand : [c.rightOperand]).every(isValidPurposeOfUse),
    {
      message:
        "purpose rightOperand must be an HL7 PurposeOfUse code (http://terminology.hl7.org/CodeSystem/v3-ActReason); draft standards such as W3C DPV are not accepted",
      path: ["rightOperand"],
    },
  );

export type OdrlConstraint = z.infer<typeof OdrlConstraintSchema>;

export const OdrlDutySchema = z
  .object({
    uid: z.string().min(1).optional(),
    action: z.enum(ODRL_DUTY_ACTIONS),
    target: z.string().min(1).optional(),
    assigner: z.string().min(1).optional(),
    assignee: z.string().min(1).optional(),
    constraint: z.array(OdrlConstraintSchema).optional(),
  })
  .strict();

export type OdrlDuty = z.infer<typeof OdrlDutySchema>;

export const OdrlRuleSchema = z
  .object({
    /** An actor id, a party IRI/DID, or {@link ANYONE}. */
    assignee: z.string().min(1),
    action: z.string().min(1),
    /** What the rule applies to; absent means the instance's whole graph. */
    target: z.string().min(1).optional(),
    constraint: z.array(OdrlConstraintSchema).optional(),
    /** Duties attached to a Permission rule (ODRL 2.2 §2.6.5). */
    duty: z.array(OdrlDutySchema).min(1).optional(),
  })
  .strict();

export const OdrlPolicySchema = z
  .object({
    "@context": z.union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown())]),
    "@type": z.enum(["Set", "Offer", "Agreement"]),
    uid: z.string().min(1),
    /** The folio ODRL profile; required, because the actions only mean something against it. */
    profile: z.string().min(1),
    /** Policies whose rules this one inherits: ODRL's `inheritFrom`. */
    inheritFrom: z.array(z.string().min(1)).optional(),
    conflict: z.enum(ODRL_CONFLICT).optional(),
    /** An Agreement names who grants it (ODRL 2.2 §2.1.3). A Set does not have to. */
    assigner: z.string().min(1).optional(),
    /** An Agreement names who receives it (ODRL 2.2 §2.1.3). A Set does not have to. */
    assignee: z.string().min(1).optional(),
    permission: z.array(OdrlRuleSchema).default([]),
    prohibition: z.array(OdrlRuleSchema).default([]),
    /** Policy-level duties (ODRL 2.2 §2.6.4). */
    obligation: z.array(OdrlDutySchema).min(1).optional(),
  })
  .strict()
  .refine((p) => p["@type"] !== "Agreement" || !!p.assigner, {
    message: "an odrl:Agreement names its assigner",
    path: ["assigner"],
  })
  .refine((p) => p["@type"] !== "Agreement" || !!p.assignee, {
    message: "an odrl:Agreement names its assignee",
    path: ["assignee"],
  });

export type OdrlPolicy = z.infer<typeof OdrlPolicySchema>;
export type OdrlRule = z.infer<typeof OdrlRuleSchema>;

/** Where an instance keeps its policies: the `policies` graph typology's directory. */
export const POLICY_DIR = "policies";

/**
 * Every policy in a directory, keyed by `uid`. Absent directory → none. A file
 * that is not a valid policy THROWS, on the rule every declaration here
 * follows: a permission file nobody can read would leave everyone with
 * nothing, silently.
 */
export function readPolicies(dir: string): Map<string, OdrlPolicy> {
  const out = new Map<string, OdrlPolicy>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonld")).sort()) {
    const p = join(dir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(p, "utf-8"));
    } catch (e) {
      throw new Error(`${p} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (raw && typeof raw === "object") delete (raw as Record<string, unknown>)._comment;
    const parsed = OdrlPolicySchema.safeParse(raw);
    if (!parsed.success) throw new Error(`${p} is not a valid ODRL policy: ${parsed.error.message}`);
    if (out.has(parsed.data.uid)) throw new Error(`${p}: policy uid "${parsed.data.uid}" is declared twice.`);
    out.set(parsed.data.uid, parsed.data);
  }
  return out;
}

/**
 * A policy's rules with everything it inherits, depth-first, each policy once.
 * An `inheritFrom` that names no known policy throws: an inherited grant that
 * silently vanished would be a permission change nobody made.
 */
export function effectiveRules(
  policy: OdrlPolicy,
  all: ReadonlyMap<string, OdrlPolicy>,
): { permission: OdrlRule[]; prohibition: OdrlRule[] } {
  const permission: OdrlRule[] = [];
  const prohibition: OdrlRule[] = [];
  const seen = new Set<string>();
  const visit = (p: OdrlPolicy) => {
    if (seen.has(p.uid)) return;
    seen.add(p.uid);
    permission.push(...p.permission);
    prohibition.push(...p.prohibition);
    for (const uid of p.inheritFrom ?? []) {
      const parent = all.get(uid);
      if (!parent) throw new Error(`policy ${p.uid} inherits from ${uid}, which is not declared`);
      visit(parent);
    }
  };
  visit(policy);
  return { permission, prohibition };
}

/** The action graph: an action id → the actions it is `includedIn`. */
export type ActionGraph = ReadonlyMap<string, readonly string[]>;

/** The folio profile's actions joined to ODRL's. */
export function actionGraph(profile: readonly { id: string; includedIn: readonly string[] }[]): ActionGraph {
  const g = new Map<string, readonly string[]>(Object.entries(ODRL_ACTIONS));
  for (const a of profile) g.set(a.id, a.includedIn);
  return g;
}

/** `action` and every action it is included in, however reached. Cycle-safe. */
export function broaderOrSelf(action: string, graph: ActionGraph): Set<string> {
  const out = new Set<string>();
  const stack = [action];
  while (stack.length) {
    const a = stack.pop()!;
    if (out.has(a)) continue;
    out.add(a);
    for (const up of graph.get(a) ?? []) stack.push(up);
  }
  return out;
}

/**
 * A PROV-O activity record (compatible with `ProvActivity` in `./prov.ts`)
 * consulted to verify whether an ODRL Duty has been exercised.
 */
export interface ProvDutyRecord {
  "@type"?: "prov:Activity" | string;
  "@id"?: string;
  "prov:startedAtTime"?: string;
  "prov:endedAtTime"?: string;
  "prov:qualifiedAssociation"?: {
    "prov:agent": string;
    "prov:hadRole"?: string;
    "prov:hadPlan"?: string;
  };
  "prov:agent"?: string;
  "prov:actedOnBehalfOf"?: string;
  "prov:used"?: readonly string[];
  "prov:generated"?: readonly string[];
  "prov:invalidated"?: readonly string[];
  "cat-harness:underPolicy"?: string | readonly string[];
  "odrl:action"?: string;
  action?: string;
  target?: string;
}

/** The scope a request is made in. Every field is optional, and an absent one satisfies no constraint on it. */
/**
 * Status codes of a FHIR R4 `Consent` resource (`http://hl7.org/fhir/ValueSet/consent-state-codes`).
 * Only `"active"` satisfies an `odrl:obtainConsent` duty (PCF6, bean `a7c1`).
 */
export type PcfConsentStatus =
  | "draft"
  | "proposed"
  | "active"
  | "rejected"
  | "inactive"
  | "entered-in-error"
  | (string & {});

/**
 * An ODRL `Set` policy representing a translated IHE PCF / FHIR R4 `Consent`
 * (optionally annotated with `status`, `id`, and `versionId`).
 */
export interface PcfConsentPolicy extends OdrlPolicy {
  status?: PcfConsentStatus;
  id?: string;
  versionId?: string;
}

export interface FhirConsentProvisionLike {
  type?: "permit" | "deny";
  period?: { start?: string; end?: string };
  actor?: readonly { role?: unknown; reference?: { reference?: string; identifier?: { system?: string; value?: string } } }[];
  action?: readonly { coding?: readonly { system?: string; code?: string }[] }[];
  securityLabel?: readonly { system?: string; code?: string }[];
  purpose?: readonly { system?: string; code?: string }[];
  dataPeriod?: { start?: string; end?: string };
  data?: readonly { meaning?: string; reference?: { reference?: string; identifier?: { system?: string; value?: string } } }[];
  provision?: readonly FhirConsentProvisionLike[];
}

/**
 * Minimal structural shape of a FHIR R4 `Consent` resource accepted directly
 * when evaluating an `odrl:obtainConsent` duty (PCF6, bean `a7c1`).
 */
export interface FhirConsentLike {
  resourceType: "Consent";
  id?: string;
  meta?: { versionId?: string; profile?: readonly string[] };
  status: PcfConsentStatus;
  patient?: { reference?: string; identifier?: { system?: string; value?: string } };
  performer?: readonly { reference?: string; identifier?: { system?: string; value?: string } }[];
  provision?: FhirConsentProvisionLike;
}

export type SingleConsentInput = PcfConsentPolicy | OdrlPolicy | FhirConsentLike;

export type ConsentInput =
  | SingleConsentInput
  | readonly SingleConsentInput[]
  | ReadonlyMap<string, SingleConsentInput>
  | null
  | undefined;

export interface RequestScope {
  "cat-harness:process"?: string;
  "cat-harness:task"?: string;
  "cat-harness:role"?: string;
  "odrl:purpose"?: string;
  purpose?: string;
  "odrl:dateTime"?: string;
  dateTime?: string;
  "odrl:elapsedTime"?: string | number;
  elapsedTime?: string | number;
  "pcf:securityLabel"?: string | readonly string[];
  securityLabel?: string | readonly string[];
  "pcf:dataPeriod"?: string;
  dataPeriod?: string;
  "pcf:author"?: string;
  author?: string;
  "pcf:encounter"?: string;
  encounter?: string;
  target?: string;
  /** Optional PROV-O records for duty verification when passed inside scope. */
  provRecords?: readonly ProvDutyRecord[];
  /** Optional PCF Consent policy/resource (or collection) used to evaluate `odrl:obtainConsent` duties (PCF6, bean `a7c1`). */
  consent?: ConsentInput;
  /** Optional PCF Consent policies/resources used to evaluate `odrl:obtainConsent` duties (PCF6, bean `a7c1`). */
  consents?: ConsentInput;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;
const SEC_MS = 1_000;

/**
 * Parse an ISO-8601 duration (`P90D`, `PT24H`, `P1Y2M3DT4H5M6S`) or unit
 * shorthand (`90d`, `24h`, numeric ms) into milliseconds.
 */
export function parseDurationMs(value: string | number): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  const s = value.trim();
  const iso =
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
      s,
    );
  if (iso && s.length > 1 && s.toUpperCase() !== "PT") {
    const [, y, mo, w, d, h, m, sec] = iso;
    return (
      (y ? Number(y) * 365 * DAY_MS : 0) +
      (mo ? Number(mo) * 30 * DAY_MS : 0) +
      (w ? Number(w) * 7 * DAY_MS : 0) +
      (d ? Number(d) * DAY_MS : 0) +
      (h ? Number(h) * HOUR_MS : 0) +
      (m ? Number(m) * MIN_MS : 0) +
      (sec ? Number(sec) * SEC_MS : 0)
    );
  }
  const unit =
    /^(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i.exec(
      s,
    );
  if (unit) {
    const n = Number(unit[1]!);
    const u = unit[2]!.toLowerCase();
    if (u === "ms") return n;
    if (u.startsWith("s")) return n * SEC_MS;
    if (u.startsWith("m")) return n * MIN_MS;
    if (u.startsWith("h")) return n * HOUR_MS;
    if (u.startsWith("d")) return n * DAY_MS;
    if (u.startsWith("w")) return n * 7 * DAY_MS;
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return undefined;
}

function canonicalLeftOperand(op: FolioLeftOperand): string {
  if (op === "purpose" || op === "dateTime" || op === "elapsedTime") return `odrl:${op}`;
  return op;
}

function canonicalOperator(op: OdrlOperator): string {
  return op.startsWith("odrl:") ? op : `odrl:${op}`;
}

function scopeValue(
  leftOperand: FolioLeftOperand,
  scope: RequestScope,
): string | number | readonly string[] | undefined {
  switch (canonicalLeftOperand(leftOperand)) {
    case "odrl:purpose":
      return scope["odrl:purpose"] ?? scope.purpose;
    case "odrl:dateTime":
      return scope["odrl:dateTime"] ?? scope.dateTime;
    case "odrl:elapsedTime":
      return scope["odrl:elapsedTime"] ?? scope.elapsedTime;
    case "pcf:securityLabel":
      return scope["pcf:securityLabel"] ?? scope.securityLabel;
    case "pcf:dataPeriod":
      return scope["pcf:dataPeriod"] ?? scope.dataPeriod;
    case "pcf:author":
      return scope["pcf:author"] ?? scope.author;
    case "pcf:encounter":
      return scope["pcf:encounter"] ?? scope.encounter;
    case "cat-harness:process":
      return scope["cat-harness:process"];
    case "cat-harness:task":
      return scope["cat-harness:task"];
    case "cat-harness:role":
      return scope["cat-harness:role"];
    default:
      return undefined;
  }
}

function isBpmnScopeOperand(leftOperand: FolioLeftOperand): boolean {
  const k = canonicalLeftOperand(leftOperand);
  return k === "cat-harness:process" || k === "cat-harness:task" || k === "cat-harness:role";
}

function compareNumbers(lhs: number, rhs: number, op: string): boolean {
  switch (op) {
    case "odrl:eq":
      return lhs === rhs;
    case "odrl:neq":
      return lhs !== rhs;
    case "odrl:lt":
      return lhs < rhs;
    case "odrl:lteq":
      return lhs <= rhs;
    case "odrl:gt":
      return lhs > rhs;
    case "odrl:gteq":
      return lhs >= rhs;
    default:
      return false;
  }
}

function constraintHolds(c: OdrlConstraint, scope: RequestScope): boolean {
  const raw = scopeValue(c.leftOperand, scope);
  // A constraint on something the request does not say is NOT met. Reading
  // "unknown process" as "any process" would widen every scoped grant.
  if (raw === undefined) return false;
  const left = canonicalLeftOperand(c.leftOperand);
  const op = canonicalOperator(c.operator);
  const rhs = c.rightOperand;

  if (left === "odrl:purpose") {
    const v = String(raw);
    if (!isValidPurposeOfUse(v)) return false;
    const normV = normalizePurposeCode(v);
    if (op === "odrl:isA") {
      if (Array.isArray(rhs) || !isValidPurposeOfUse(rhs)) return false;
      return broaderOrSelf(normV, PURPOSE_GRAPH).has(normalizePurposeCode(rhs));
    }
    if (op === "odrl:eq") return !Array.isArray(rhs) && normV === normalizePurposeCode(rhs);
    if (op === "odrl:neq") return !Array.isArray(rhs) && normV !== normalizePurposeCode(rhs);
    if (op === "odrl:isAnyOf") return (rhs as string[]).map(normalizePurposeCode).includes(normV);
    if (op === "odrl:isNoneOf") return !(rhs as string[]).map(normalizePurposeCode).includes(normV);
    return false;
  }

  if (left === "odrl:dateTime" || left === "pcf:dataPeriod") {
    if (Array.isArray(rhs)) {
      const s = String(raw);
      return op === "odrl:isAnyOf" ? rhs.includes(s) : op === "odrl:isNoneOf" ? !rhs.includes(s) : false;
    }
    const parseBoundMs = (iso: string, endOfDay: boolean): number => {
      const t = iso.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        return Date.parse(endOfDay ? `${t}T23:59:59.999Z` : `${t}T00:00:00.000Z`);
      }
      return Date.parse(t);
    };
    const lhsMs = parseBoundMs(String(raw), false);
    const rhsMs = parseBoundMs(rhs, op === "odrl:lteq");
    if (Number.isNaN(lhsMs) || Number.isNaN(rhsMs)) return false;
    return compareNumbers(lhsMs, rhsMs, op);
  }

  if (left === "odrl:elapsedTime") {
    if (Array.isArray(rhs) || Array.isArray(raw)) return false;
    const lhsMs = parseDurationMs(raw as string | number);
    const rhsMs = parseDurationMs(rhs);
    if (lhsMs === undefined || rhsMs === undefined) return false;
    return compareNumbers(lhsMs, rhsMs, op);
  }

  if (left === "pcf:securityLabel") {
    const tags = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    if (op === "odrl:eq") return !Array.isArray(rhs) && tags.includes(rhs);
    if (op === "odrl:neq") return !Array.isArray(rhs) && !tags.includes(rhs);
    if (op === "odrl:isAnyOf") return Array.isArray(rhs) && tags.some((t) => rhs.includes(t));
    if (op === "odrl:isNoneOf") return Array.isArray(rhs) && !tags.some((t) => rhs.includes(t));
    return false;
  }

  const v = String(raw);
  switch (op) {
    case "odrl:eq":
      return !Array.isArray(rhs) && v === rhs;
    case "odrl:neq":
      return !Array.isArray(rhs) && v !== rhs;
    case "odrl:isAnyOf":
      return (rhs as string[]).includes(v);
    case "odrl:isNoneOf":
      return !(rhs as string[]).includes(v);
    case "odrl:lt":
      return !Array.isArray(rhs) && v < rhs;
    case "odrl:lteq":
      return !Array.isArray(rhs) && v <= rhs;
    case "odrl:gt":
      return !Array.isArray(rhs) && v > rhs;
    case "odrl:gteq":
      return !Array.isArray(rhs) && v >= rhs;
    case "odrl:isA":
      return !Array.isArray(rhs) && v === rhs;
    default:
      return false;
  }
}

function normalizeDutyAction(action: string): string {
  return action.startsWith("odrl:") ? action.slice("odrl:".length) : action;
}

function recordMatchesDutyAction(rec: ProvDutyRecord, dutyAction: OdrlDutyAction): boolean {
  const bare = normalizeDutyAction(dutyAction);
  const kebab = bare.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const explicit = rec["odrl:action"] ?? rec.action;
  if (explicit !== undefined) {
    const normExplicit = normalizeDutyAction(explicit).toLowerCase();
    return normExplicit === bare.toLowerCase() || normExplicit === kebab;
  }
  const plan = rec["prov:qualifiedAssociation"]?.["prov:hadPlan"];
  if (plan !== undefined) {
    const fragment = (plan.includes("#") ? plan.split("#")[1] : plan) ?? "";
    const normTask = fragment.replace(/^(?:Task_|odrl[:._-])/i, "").toLowerCase();
    if (normTask === bare.toLowerCase() || normTask === kebab) return true;
  }
  if (bare === "delete" && (rec["prov:invalidated"]?.length ?? 0) > 0) return true;
  return false;
}

function dutyFulfilledByRecord(
  duty: OdrlDuty,
  rule: OdrlRule,
  policyUids: ReadonlySet<string>,
  rec: ProvDutyRecord,
): boolean {
  if (!recordMatchesDutyAction(rec, duty.action)) return false;
  const obligated = duty.assignee ?? rule.assignee;
  const agent = rec["prov:qualifiedAssociation"]?.["prov:agent"] ?? rec["prov:agent"];
  if (obligated !== ANYONE && agent !== undefined && agent !== obligated) return false;
  const under = rec["cat-harness:underPolicy"];
  if (under !== undefined) {
    const list = Array.isArray(under) ? under : [under];
    if (!list.some((u) => policyUids.has(u))) return false;
  }
  const target = duty.target ?? rule.target;
  if (target !== undefined) {
    const entities = [
      ...(rec["prov:used"] ?? []),
      ...(rec["prov:invalidated"] ?? []),
      ...(rec.target ? [rec.target] : []),
    ];
    if (entities.length > 0 && !entities.includes(target)) return false;
  }
  return true;
}

function isFhirConsentLike(x: unknown): x is FhirConsentLike {
  return Boolean(x && typeof x === "object" && (x as { resourceType?: unknown }).resourceType === "Consent");
}

function isOdrlPolicyLike(x: unknown): x is PcfConsentPolicy {
  return Boolean(
    x &&
      typeof x === "object" &&
      "@type" in (x as Record<string, unknown>) &&
      Array.isArray((x as { permission?: unknown }).permission),
  );
}

function fhirRefToString(
  ref: { reference?: string; identifier?: { system?: string; value?: string } } | undefined,
): string | undefined {
  if (!ref) return undefined;
  if (ref.reference && ref.reference.trim()) return ref.reference.trim();
  if (ref.identifier?.value && ref.identifier.value.trim()) {
    return ref.identifier.system
      ? `${ref.identifier.system}|${ref.identifier.value.trim()}`
      : ref.identifier.value.trim();
  }
  return undefined;
}

function fhirActionToOdrl(concept: { coding?: readonly { code?: string }[] }): string {
  const code = concept.coding?.[0]?.code?.toLowerCase();
  if (code === "read") return "odrl:display";
  if (code === "correct") return "odrl:modify";
  return "odrl:use";
}

function convertFhirConsentToSet(consent: FhirConsentLike): PcfConsentPolicy {
  const id = consent.id?.trim() || "anonymous";
  const versionId = consent.meta?.versionId?.trim();
  const uid = versionId ? `urn:ihe:pcf:consent:${id}:v${versionId}` : `urn:ihe:pcf:consent:${id}`;
  const assigner = fhirRefToString(consent.performer?.[0]) ?? fhirRefToString(consent.patient);
  if (consent.status !== "active" || !consent.provision) {
    return {
      "@context": "http://www.w3.org/ns/odrl.jsonld",
      "@type": "Set",
      uid,
      profile: "https://profiles.ihe.net/ITI/PCF",
      conflict: FOLIO_DEFAULT_CONFLICT,
      status: consent.status,
      id,
      ...(versionId ? { versionId } : {}),
      ...(assigner ? { assigner } : {}),
      permission: [],
      prohibition: [],
    };
  }

  const expand = (
    prov: FhirConsentProvisionLike,
    inheritedType: "permit" | "deny",
  ): { permission: OdrlRule[]; prohibition: OdrlRule[] } => {
    const t: "permit" | "deny" = prov.type ?? inheritedType;
    const assignees = (prov.actor ?? [])
      .map((a) => fhirRefToString(a.reference))
      .filter((s): s is string => Boolean(s));
    const effectiveAssignees = assignees.length > 0 ? assignees : [ANYONE];
    const actions = (prov.action ?? []).map(fhirActionToOdrl);
    const effectiveActions = actions.length > 0 ? actions : ["odrl:use"];
    const targets = (prov.data ?? [])
      .filter((d) => !d.meaning || d.meaning === "instance" || d.meaning === "related" || d.meaning === "dependents")
      .map((d) => fhirRefToString(d.reference))
      .filter((s): s is string => Boolean(s));
    const effectiveTargets: (string | undefined)[] = targets.length > 0 ? targets : [undefined];

    const shared: OdrlConstraint[] = [];
    if (prov.period?.start) {
      shared.push({ leftOperand: "odrl:dateTime", operator: "odrl:gteq", rightOperand: prov.period.start });
    }
    if (prov.period?.end) {
      shared.push({ leftOperand: "odrl:dateTime", operator: "odrl:lteq", rightOperand: prov.period.end });
    }
    if (prov.dataPeriod?.start) {
      shared.push({ leftOperand: "pcf:dataPeriod", operator: "odrl:gteq", rightOperand: prov.dataPeriod.start });
    }
    if (prov.dataPeriod?.end) {
      shared.push({ leftOperand: "pcf:dataPeriod", operator: "odrl:lteq", rightOperand: prov.dataPeriod.end });
    }
    const labels = (prov.securityLabel ?? [])
      .map((c) => c.code?.trim())
      .filter((s): s is string => Boolean(s));
    if (labels.length === 1) {
      shared.push({ leftOperand: "pcf:securityLabel", operator: "odrl:eq", rightOperand: labels[0]! });
    } else if (labels.length > 1) {
      shared.push({ leftOperand: "pcf:securityLabel", operator: "odrl:isAnyOf", rightOperand: labels });
    }

    const purposes = (prov.purpose ?? [])
      .map((p) => p.code?.trim())
      .filter((s): s is string => Boolean(s));
    const effectivePurposes: (string | undefined)[] = purposes.length > 0 ? purposes : [undefined];

    const rules: OdrlRule[] = [];
    for (const assignee of effectiveAssignees) {
      for (const action of effectiveActions) {
        for (const target of effectiveTargets) {
          for (const purpose of effectivePurposes) {
            const cList: OdrlConstraint[] = [
              ...(purpose
                ? [
                    {
                      leftOperand: "odrl:purpose" as const,
                      operator: (isValidPurposeOfUse(purpose) ? "odrl:isA" : "odrl:eq") as OdrlOperator,
                      rightOperand: purpose,
                    },
                  ]
                : []),
              ...shared,
            ];
            rules.push({
              assignee,
              action,
              ...(target !== undefined ? { target } : {}),
              ...(cList.length > 0 ? { constraint: cList } : {}),
            });
          }
        }
      }
    }

    const permission: OdrlRule[] = t === "permit" ? [...rules] : [];
    const prohibition: OdrlRule[] = t === "deny" ? [...rules] : [];
    for (const child of prov.provision ?? []) {
      const childDefault: "permit" | "deny" = t === "permit" ? "deny" : "permit";
      const sub = expand(child, childDefault);
      permission.push(...sub.permission);
      prohibition.push(...sub.prohibition);
    }
    return { permission, prohibition };
  };

  const rootType: "permit" | "deny" = consent.provision.type ?? "permit";
  const { permission, prohibition } = expand(consent.provision, rootType);
  const conflict = rootType === "deny" && permission.length > 0 ? "odrl:perm" : FOLIO_DEFAULT_CONFLICT;
  return {
    "@context": "http://www.w3.org/ns/odrl.jsonld",
    "@type": "Set",
    uid,
    profile: "https://profiles.ihe.net/ITI/PCF",
    conflict,
    status: consent.status,
    id,
    ...(versionId ? { versionId } : {}),
    ...(assigner ? { assigner } : {}),
    permission,
    prohibition,
  };
}

function evaluateSingleConsentSet(
  consentSet: PcfConsentPolicy,
  req: PermitRequest,
  scope: RequestScope,
  graph: ActionGraph,
): Decision {
  if (consentSet.status !== undefined && consentSet.status !== "active") {
    return "unknown";
  }
  if (consentSet.permission.length === 0 && consentSet.prohibition.length === 0) {
    return "unknown";
  }

  const actorMatches = (assignee: string): boolean => {
    if (assignee === ANYONE) return true;
    if (req.actor !== null && req.actor !== undefined && assignee === req.actor) return true;
    if (req.actorGroups && req.actorGroups.includes(assignee)) return true;
    if (req.actorRoles && req.actorRoles.includes(assignee)) return true;
    return false;
  };
  const hasActorIdentity =
    (req.actor !== null && req.actor !== undefined) ||
    Boolean(req.actorGroups?.length) ||
    Boolean(req.actorRoles?.length);

  const evalPerm = (r: OdrlRule): "permitted" | "violated" | "unknown" => {
    if (!broaderOrSelf(req.action, graph).has(r.action)) return "violated";
    let hasUnknown = false;
    if (r.assignee !== ANYONE) {
      if (!hasActorIdentity) hasUnknown = true;
      else if (!actorMatches(r.assignee)) return "violated";
    }
    if (r.target !== undefined) {
      if (scope.target === undefined) hasUnknown = true;
      else if (scope.target !== r.target) return "violated";
    }
    for (const c of r.constraint ?? []) {
      if (scopeValue(c.leftOperand, scope) === undefined) hasUnknown = true;
      else if (!constraintHolds(c, scope)) return "violated";
    }
    return hasUnknown ? "unknown" : "permitted";
  };

  const evalProh = (r: OdrlRule): "prohibited" | "not-prohibited" | "unknown" => {
    if (!broaderOrSelf(req.action, graph).has(r.action)) return "not-prohibited";
    let hasUnknown = false;
    if (r.assignee !== ANYONE) {
      if (!hasActorIdentity) hasUnknown = true;
      else if (!actorMatches(r.assignee)) return "not-prohibited";
    }
    if (r.target !== undefined) {
      if (scope.target === undefined) hasUnknown = true;
      else if (scope.target !== r.target) return "not-prohibited";
    }
    for (const c of r.constraint ?? []) {
      if (scopeValue(c.leftOperand, scope) === undefined) hasUnknown = true;
      else if (!constraintHolds(c, scope)) return "not-prohibited";
    }
    return hasUnknown ? "unknown" : "prohibited";
  };

  const permOutcomes = consentSet.permission.map(evalPerm);
  const prohOutcomes = consentSet.prohibition.map(evalProh);

  const permitted = permOutcomes.includes("permitted");
  const permViolated = permOutcomes.includes("violated");
  const permUnknown = permOutcomes.includes("unknown");
  const prohibited = prohOutcomes.includes("prohibited");
  const prohUnknown = prohOutcomes.includes("unknown");

  if (prohibited && permitted) {
    const strategy = consentSet.conflict ?? FOLIO_DEFAULT_CONFLICT;
    return strategy === "odrl:perm" ? "permit" : "deny";
  }
  if (prohibited) {
    if (consentSet.conflict === "odrl:perm" && permUnknown) return "unknown";
    return "deny";
  }
  if (prohUnknown && (permitted || consentSet.permission.length === 0)) {
    return "unknown";
  }
  if (permitted) return "permit";
  if (permUnknown) return "unknown";
  if (permViolated) return "deny";
  return "unknown";
}

function collectConsentSets(input: ConsentInput): { activeSets: PcfConsentPolicy[]; hadExpiredActive: boolean } {
  const items: SingleConsentInput[] = [];
  if (input === null || input === undefined) {
    // none
  } else if (input instanceof Map) {
    for (const v of input.values()) items.push(v);
  } else if (Array.isArray(input)) {
    items.push(...input);
  } else if (isFhirConsentLike(input) || isOdrlPolicyLike(input)) {
    items.push(input as SingleConsentInput);
  }

  const activeSets: PcfConsentPolicy[] = [];
  for (const item of items) {
    if (isFhirConsentLike(item)) {
      if (item.status !== "active") continue;
      const converted = convertFhirConsentToSet(item);
      if (converted.permission.length > 0 || converted.prohibition.length > 0) {
        activeSets.push(converted);
      }
    } else if (isOdrlPolicyLike(item)) {
      if (item.status !== undefined && item.status !== "active") continue;
      if (item.permission.length > 0 || item.prohibition.length > 0) {
        activeSets.push(item);
      }
    }
  }
  return { activeSets, hadExpiredActive: false };
}

/**
 * Evaluate one or more IHE PCF / FHIR R4 Consents (or translated ODRL `Set`
 * policies) against a {@link PermitRequest} (PCF6, bean `a7c1`):
 * - No active Consent → `"unknown"`.
 * - Any active Consent evaluating to `"deny"` → `"deny"`.
 * - Any active Consent evaluating to `"permit"` (and none `"deny"`) → `"permit"`.
 */
export function evaluatePcfConsent(
  consentInput: ConsentInput,
  req: PermitRequest,
  graph: ActionGraph = actionGraph([]),
): Decision {
  const scope = req.scope ?? {};
  const { activeSets } = collectConsentSets(consentInput);
  if (activeSets.length === 0) return "unknown";
  let anyPermit = false;
  for (const set of activeSets) {
    const d = evaluateSingleConsentSet(set, req, scope, graph);
    if (d === "deny") return "deny";
    if (d === "permit") anyPermit = true;
  }
  return anyPermit ? "permit" : "unknown";
}

function isConsentSetInPolicyMap(p: OdrlPolicy, dsaPolicy: OdrlPolicy, policyUids: ReadonlySet<string>): boolean {
  if (p["@type"] !== "Set" || policyUids.has(p.uid)) return false;
  if (dsaPolicy["@type"] === "Agreement") return true;
  const prof = p.profile.toLowerCase();
  const uid = p.uid.toLowerCase();
  return prof.includes("pcf") || prof.includes("consent") || uid.includes("consent");
}

type DutyStatus = "satisfied" | "unmet" | "unknowable";

function evaluateObtainConsentDuty(
  duty: OdrlDuty,
  rule: OdrlRule,
  policy: OdrlPolicy,
  policyUids: ReadonlySet<string>,
  all: ReadonlyMap<string, OdrlPolicy>,
  req: PermitRequest,
  scope: RequestScope,
  graph: ActionGraph,
  records: readonly ProvDutyRecord[] | undefined,
): DutyStatus {
  const explicitConsent = req.consent ?? req.consents ?? scope.consent ?? scope.consents;
  const hasExplicitConsentArg =
    req.consent !== undefined ||
    req.consents !== undefined ||
    scope.consent !== undefined ||
    scope.consents !== undefined;

  let candidateInput: ConsentInput = explicitConsent;
  if (!hasExplicitConsentArg) {
    const mapConsents: OdrlPolicy[] = [];
    for (const p of all.values()) {
      if (duty.target && p.uid === duty.target && !policyUids.has(p.uid)) {
        mapConsents.push(p);
      } else if (duty.uid && p.uid === duty.uid && !policyUids.has(p.uid)) {
        mapConsents.push(p);
      } else if (isConsentSetInPolicyMap(p, policy, policyUids)) {
        mapConsents.push(p);
      }
    }
    if (mapConsents.length > 0) {
      candidateInput = mapConsents;
    }
  }

  const effectiveTarget =
    scope.target ??
    (duty.target && !all.has(duty.target) ? duty.target : undefined) ??
    rule.target;
  const effectiveScope: RequestScope =
    effectiveTarget !== undefined && scope.target === undefined
      ? { ...scope, target: effectiveTarget }
      : scope;

  const { activeSets } = collectConsentSets(candidateInput);
  if (activeSets.length === 0) {
    if (!hasExplicitConsentArg && records && records.some((rec) => dutyFulfilledByRecord(duty, rule, policyUids, rec))) {
      return "satisfied";
    }
    // PCF6 (bean a7c1): DSA + no active Consent gives unknown, never permit or deny.
    return "unknowable";
  }

  let anyPermit = false;
  for (const set of activeSets) {
    const d = evaluateSingleConsentSet(set, req, effectiveScope, graph);
    if (d === "deny") return "unmet";
    if (d === "permit") anyPermit = true;
  }
  if (!anyPermit) return "unknowable";

  const constraints = duty.constraint ?? [];
  for (const c of constraints) {
    if (scopeValue(c.leftOperand, effectiveScope) === undefined) return "unknowable";
    if (!constraintHolds(c, effectiveScope)) return "unmet";
  }
  return "satisfied";
}

function evaluateDuty(
  duty: OdrlDuty,
  rule: OdrlRule,
  policy: OdrlPolicy,
  policyUids: ReadonlySet<string>,
  all: ReadonlyMap<string, OdrlPolicy>,
  req: PermitRequest,
  scope: RequestScope,
  graph: ActionGraph,
  records: readonly ProvDutyRecord[] | undefined,
): DutyStatus {
  if (normalizeDutyAction(duty.action) === "obtainConsent") {
    return evaluateObtainConsentDuty(duty, rule, policy, policyUids, all, req, scope, graph, records);
  }
  if (records && records.some((rec) => dutyFulfilledByRecord(duty, rule, policyUids, rec))) {
    return "satisfied";
  }
  const constraints = duty.constraint ?? [];
  if (constraints.length > 0) {
    if (constraints.some((c) => scopeValue(c.leftOperand, scope) === undefined)) {
      return "unknowable";
    }
    // Inside the duty's window (e.g. elapsedTime <= P90D): the deadline has not
    // passed yet, so the duty does not block the permission.
    if (constraints.every((c) => constraintHolds(c, scope))) {
      return "satisfied";
    }
  }
  // Duty is now due (either immediate or past its deadline window): without
  // PROV records its fulfilment is unknowable; with records and no match it is
  // unmet.
  return records === undefined ? "unknowable" : "unmet";
}

function ruleApplies(
  r: OdrlRule,
  who: string | null,
  action: string,
  scope: RequestScope,
  graph: ActionGraph,
): boolean {
  if (r.assignee !== ANYONE && r.assignee !== who) return false;
  if (!broaderOrSelf(action, graph).has(r.action)) return false;
  if (r.target !== undefined && r.target !== scope.target) return false;
  return (r.constraint ?? []).every((c) => constraintHolds(c, scope));
}

type PermissionOutcome = "no-match" | "permitted" | "violated" | "unknown";

function evaluatePermissionRule(
  r: OdrlRule,
  req: PermitRequest,
  policy: OdrlPolicy,
  all: ReadonlyMap<string, OdrlPolicy>,
  scope: RequestScope,
  graph: ActionGraph,
  policyDuties: readonly OdrlDuty[],
  policyUids: ReadonlySet<string>,
  records: readonly ProvDutyRecord[] | undefined,
): PermissionOutcome {
  const who = req.actor;
  const action = req.action;
  if (r.assignee !== ANYONE && r.assignee !== who) return "no-match";
  if (!broaderOrSelf(action, graph).has(r.action)) return "no-match";
  if (r.target !== undefined && r.target !== scope.target) return "no-match";

  const constraints = r.constraint ?? [];
  const bpmnConstraints = constraints.filter((c) => isBpmnScopeOperand(c.leftOperand));
  if (!bpmnConstraints.every((c) => constraintHolds(c, scope))) return "no-match";

  const usageConstraints = constraints.filter((c) => !isBpmnScopeOperand(c.leftOperand));
  let usageUnknown = false;
  for (const c of usageConstraints) {
    if (scopeValue(c.leftOperand, scope) === undefined) {
      usageUnknown = true;
    } else if (!constraintHolds(c, scope)) {
      return "violated";
    }
  }
  if (usageUnknown) return "unknown";

  const duties = [...policyDuties, ...(r.duty ?? [])];
  let dutyUnknowable = false;
  for (const d of duties) {
    const status = evaluateDuty(d, r, policy, policyUids, all, req, scope, graph, records);
    if (status === "unmet") return "violated";
    if (status === "unknowable") dutyUnknowable = true;
  }
  if (dutyUnknowable) return "unknown";
  return "permitted";
}

/**
 * THREE answers, never two. `unknown` means no rule speaks to the request, and
 * it is never permit: a caller that treats it as permit has built an open
 * door, and one that treats it as deny cannot tell "forbidden" from "nobody
 * has decided", which is the question the QA/QC report asks.
 */
export type Decision = "permit" | "deny" | "unknown";

export interface PermitRequest {
  /** The actor asking, or `null` for an unauthenticated reader. */
  actor: string | null;
  /** The roles the actor may act as (`ActorDef.roles`); empty or absent means unconstrained. */
  actorRoles?: readonly string[];
  /** Groups or organizations the actor belongs to (e.g. PCF `Group/ex-privilegedUsers`). */
  actorGroups?: readonly string[];
  action: string;
  scope?: RequestScope;
  /**
   * PROV-O activity records used to verify whether duties on a matching
   * permission have been fulfilled. When omitted (`undefined`) and a duty is
   * due, `permits()` returns `"unknown"`.
   */
  provRecords?: readonly ProvDutyRecord[];
  /**
   * Active IHE PCF / FHIR R4 `Consent` resource or translated ODRL `Set` policy
   * (or collection) consulted to evaluate an `odrl:obtainConsent` duty (PCF6,
   * bean `a7c1`).
   */
  consent?: ConsentInput;
  /**
   * Collection of IHE PCF / FHIR R4 `Consent` resources or translated ODRL `Set`
   * policies consulted to evaluate an `odrl:obtainConsent` duty (PCF6, bean `a7c1`).
   */
  consents?: ConsentInput;
}

/**
 * May this actor do this, here? Evaluated against one policy and everything it
 * inherits.
 *
 * - A matching prohibition and no matching permission: `deny`.
 * - A matching permission whose usage constraint (`purpose`, `dateTime`,
 *   `elapsedTime`) is violated or whose due duty is unmet: `deny`.
 * - A matching permission whose usage constraint or due duty cannot be
 *   determined from the provided scope / PROV records: `unknown`.
 * - A matching permission with all constraints and duties satisfied and no
 *   prohibition: `permit`, unless the request names a `cat-harness:role` the
 *   actor is not eligible for.
 * - Both: the policy's `conflict` decides (the folio default is
 *   `odrl:prohibit`); `odrl:invalid` voids the policy, which is `deny`.
 * - Neither: `unknown`.
 */
export function permits(
  req: PermitRequest,
  policy: OdrlPolicy,
  all: ReadonlyMap<string, OdrlPolicy>,
  graph: ActionGraph,
): Decision {
  const scope = req.scope ?? {};
  const records = req.provRecords ?? scope.provRecords;
  const { permission, prohibition } = effectiveRules(policy, all);
  const policyUids = new Set<string>([policy.uid, ...(policy.inheritFrom ?? [])]);
  const policyDuties = policy.obligation ?? [];

  const outcomes = permission.map((r) =>
    evaluatePermissionRule(r, req, policy, all, scope, graph, policyDuties, policyUids, records),
  );
  const permitted = outcomes.includes("permitted");
  const violated = outcomes.includes("violated");
  const prohibited = prohibition.some((r) => ruleApplies(r, req.actor, req.action, scope, graph));

  if (prohibited && permitted) {
    const strategy = policy.conflict ?? FOLIO_DEFAULT_CONFLICT;
    if (strategy !== "odrl:perm") return "deny";
  } else if (prohibited) {
    return "deny";
  } else if (!permitted) {
    return violated ? "deny" : "unknown";
  }

  const role = scope["cat-harness:role"];
  if (role && req.actorRoles && req.actorRoles.length > 0 && !req.actorRoles.includes(role)) return "deny";
  return "permit";
}

/**
 * Every action an actor holds with NO scope: the old `permissions: [...]`
 * list, derived from the policies instead of stored on the actor. What the
 * existing readers (kg-audit, kg-export, the QA-reviewer gate) consume while
 * they move to {@link permits}.
 */
export function unscopedGrants(
  policy: OdrlPolicy,
  all: ReadonlyMap<string, OdrlPolicy>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of effectiveRules(policy, all).permission) {
    if (
      r.assignee === ANYONE ||
      r.target !== undefined ||
      (r.constraint ?? []).length > 0 ||
      (r.duty ?? []).length > 0
    ) {
      continue;
    }
    const list = out.get(r.assignee) ?? [];
    if (!list.includes(r.action)) list.push(r.action);
    out.set(r.assignee, list);
  }
  return out;
}

/**
 * Every actor's unscoped grants across every policy in a directory: the
 * `permissions` list the readers of actor files used to find on the actor.
 * `readActors(dir, readPolicyGrants(policiesDir))` restores it for them.
 */
export function readPolicyGrants(dir: string): Map<string, string[]> {
  return policyGrants(readPolicies(dir));
}

/**
 * {@link readPolicyGrants} over policies already read — from one directory, or
 * from several instances' directories overlaid into one map.
 */
export function policyGrants(all: ReadonlyMap<string, OdrlPolicy>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const policy of all.values()) {
    for (const [actor, actions] of unscopedGrants(policy, all)) {
      const list = out.get(actor) ?? [];
      for (const a of actions) if (!list.includes(a)) list.push(a);
      out.set(actor, list);
    }
  }
  return out;
}

/**
 * The action every BPMN task execution asks for (owner, 2026-09-23, issue
 * #1207): one action for every task, narrowed by the `cat-harness:process`,
 * `cat-harness:task` and `cat-harness:role` constraints a rule carries and by
 * its `target`. A task that needs a more specific right says so in the POLICY,
 * as a constrained `perform-task` rule, never in the diagram.
 */
export const PERFORM_TASK = "perform-task" as const;

/**
 * {@link permits} across every policy an instance holds, which is the question
 * a caller actually has: not "does this one policy allow it" but "does
 * anything here speak to it". A `deny` from any policy wins (the folio default
 * conflict strategy is `odrl:prohibit`, and a prohibition in one file must not
 * be outvoted by a permission in another); otherwise any `permit` permits; and
 * silence everywhere stays `unknown`, never permit.
 */
function policyHasObtainConsentDuty(p: OdrlPolicy): boolean {
  const duties = [
    ...(p.obligation ?? []),
    ...p.permission.flatMap((r) => r.duty ?? []),
  ];
  return duties.some((d) => normalizeDutyAction(d.action) === "obtainConsent");
}

export function decide(
  req: PermitRequest,
  all: ReadonlyMap<string, OdrlPolicy>,
  graph: ActionGraph,
): Decision {
  const agreementsWithConsent = [...all.values()].filter(policyHasObtainConsentDuty);
  let permitted = false;
  for (const policy of all.values()) {
    if (
      agreementsWithConsent.length > 0 &&
      agreementsWithConsent.some((ag) => {
        const uids = new Set<string>([ag.uid, ...(ag.inheritFrom ?? [])]);
        return isConsentSetInPolicyMap(policy, ag, uids);
      })
    ) {
      continue;
    }
    const d = permits(req, policy, all, graph);
    if (d === "deny") return "deny";
    if (d === "permit") permitted = true;
  }
  return permitted ? "permit" : "unknown";
}
