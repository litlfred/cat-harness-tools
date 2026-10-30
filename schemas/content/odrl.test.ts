/**
 * ODRL 2.2 policies (issue #1180): the schema refuses what it cannot mean, the
 * migration moved every actor's permissions without losing or adding one, and
 * `permits()` answers three ways.
 */
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

import {
  ANYONE,
  FOLIO_DEFAULT_CONFLICT,
  OdrlPolicySchema,
  actionGraph,
  broaderOrSelf,
  decide,
  effectiveRules,
  evaluatePcfConsent,
  permits,
  readPolicies,
  readPolicyGrants,
  type FhirConsentLike,
  type OdrlPolicy,
} from "./odrl.ts";
import { ProvActivitySchema } from "./prov.ts";
import { readActors, readPermissions } from "../process/role-graph.ts";
import { actorsDir } from "../process/role-graph.ts";
import { checkoutActors, checkoutPolicies } from "../process/scenario-overlay.ts";

import { requireHarnessRoot } from "../harness-root.ts";
const INSTANCE = requireHarnessRoot();
const REPO = resolve(INSTANCE, "..");
const POLICY_DIR = join(INSTANCE, "policies");
const ACTOR_DIR = actorsDir(REPO)!;

/**
 * Each actor's `permissions` list as the actor files carried it before the
 * migration (2026-09-23), copied from the files before they were edited.
 * The migration must reproduce it exactly: a permission lost or gained in a
 * file move is a permission change nobody decided.
 *
 * Two agent actors left this map with move M4 (2026-10-23): the evidence and
 * onboarding agents, which listed `content-authoring` here, moved up to the
 * dependent instance whose lanes they play, and their grants moved with them
 * into that instance's own `policies/`. The grant is unchanged; it is read
 * there, by the scenario overlay, not here.
 */
const BEFORE: Record<string, string[]> = {
  admin: ["admin-settings", "role-management", "release-authorization"],
  author: ["content-authoring"],
  "authoring-agent": ["content-authoring"],
  "board-renderer": [],
  "ci-health-watcher": ["qa-reporting"],
  "ci-pipeline": ["qa-reporting"],
  "clinical-sme": ["clinical-validation"],
  "content-reviewer": ["approval-authority", "adjudication"],
  "end-user": ["adjudication"],
  "ingestion-agent": ["content-authoring"],
  librarian: ["content-authoring"],
  "local-sweep": ["qa-reporting"],
  "platform-boundary-guard": ["qa-reporting"],
  "programme-manager": ["project-governance", "release-authorization"],
  "publication-manager": ["release-management"],
  "qc-reviewer": ["qa-reporting"],
  "review-agent": ["review-comments"],
  reviewer: ["review-comments"],
  "technical-officer": ["first-pass-review", "sme-coordination"],
  translator: ["translation"],
  "untainted-adjudicator": ["qa-reporting", "adjudication"],
  "untainted-checker": [],
};

const POLICIES = readPolicies(POLICY_DIR);
const DEFAULTS = [...POLICIES.values()][0]!;
const GRAPH = actionGraph(readPermissions(join(INSTANCE, "skills"))!.permissions);

function policy(over: Partial<OdrlPolicy> & Record<string, unknown> = {}): OdrlPolicy {
  return OdrlPolicySchema.parse({
    "@context": "http://www.w3.org/ns/odrl.jsonld",
    "@type": "Set",
    uid: "urn:test",
    profile: "urn:folio-odrl",
    ...over,
  });
}
const one = (p: OdrlPolicy) => new Map([[p.uid, p]]);

describe("the policies in this repository", () => {
  test("there is a policy, and it parses (vacuity guard)", () => {
    expect(POLICIES.size).toBeGreaterThan(0);
  });

  test("no actor file still carries its own permissions list", () => {
    const stale = readActors(ACTOR_DIR).filter((a) => a.permissions !== undefined).map((a) => a.id);
    expect(stale).toEqual([]);
  });

  test("the migration moved every permission, and added none", () => {
    const grants = readPolicyGrants(POLICY_DIR);
    const after = Object.fromEntries(
      readActors(ACTOR_DIR, grants)
        .filter((a) => a.id in BEFORE)
        .map((a) => [a.id, [...(a.permissions ?? [])].sort()]),
    );
    const before = Object.fromEntries(Object.entries(BEFORE).map(([k, v]) => [k, [...v].sort()]));
    expect(after).toEqual(before);
  });

  test("every assignee is an actor or anyone, and every action is in the profile", () => {
    const ids = new Set(readActors(ACTOR_DIR).map((a) => a.id));
    const { permission, prohibition } = effectiveRules(DEFAULTS, POLICIES);
    const bad = [...permission, ...prohibition].flatMap((r) => [
      ...(r.assignee === ANYONE || ids.has(r.assignee) ? [] : [`assignee ${r.assignee}`]),
      ...(GRAPH.has(r.action) ? [] : [`action ${r.action}`]),
    ]);
    expect(bad).toEqual([]);
  });

  test("in the checkout, every assignee of every instance's policy is an actor the checkout declares", () => {
    // A dependent that adds an actor writes its grants in its own policies/;
    // read alone, this instance sees neither, and the check above is the same.
    const all = checkoutPolicies(INSTANCE, POLICY_DIR);
    const ids = new Set(checkoutActors(INSTANCE, ACTOR_DIR).map((a) => a.id));
    const bad = [...all.values()].flatMap((p) =>
      [...p.permission, ...p.prohibition]
        .filter((r) => r.assignee !== ANYONE && !ids.has(r.assignee))
        .map((r) => `${p.uid}: ${r.assignee}`),
    );
    expect(bad).toEqual([]);
  });

  test("every profile action reaches odrl:use", () => {
    const stranded = [...GRAPH.keys()].filter((a) => !broaderOrSelf(a, GRAPH).has("odrl:use"));
    expect(stranded).toEqual([]);
  });

  test("an unauthenticated reader may visualize and render, and nothing else (owner, 2026-09-23)", () => {
    const anon = (action: string) => permits({ actor: null, action }, DEFAULTS, POLICIES, GRAPH);
    expect(anon("visualize")).toBe("permit");
    expect(anon("render")).toBe("permit");
    const others = [...GRAPH.keys()].filter((a) => !["visualize", "render"].includes(a) && !a.startsWith("odrl:"));
    expect(others.filter((a) => anon(a) === "permit")).toEqual([]);
  });

  test("a migrated grant still holds: admin may administer roles, author may not", () => {
    expect(permits({ actor: "admin", action: "role-management" }, DEFAULTS, POLICIES, GRAPH)).toBe("permit");
    expect(permits({ actor: "author", action: "role-management" }, DEFAULTS, POLICIES, GRAPH)).toBe("unknown");
  });
});

describe("permits(): three answers", () => {
  const g = actionGraph([
    { id: "perform-task", includedIn: ["odrl:execute"] },
    { id: "approve", includedIn: ["perform-task"] },
  ]);

  test("a grant of a broader action permits the actions included in it, not the reverse", () => {
    const broad = policy({ permission: [{ assignee: "a", action: "perform-task" }] });
    expect(permits({ actor: "a", action: "approve" }, broad, one(broad), g)).toBe("permit");
    const narrow = policy({ permission: [{ assignee: "a", action: "approve" }] });
    expect(permits({ actor: "a", action: "perform-task" }, narrow, one(narrow), g)).toBe("unknown");
  });

  test("no rule is unknown, never permit", () => {
    const p = policy();
    expect(permits({ actor: "a", action: "approve" }, p, one(p), g)).toBe("unknown");
  });

  test("a scoped grant holds only in its scope, and an unstated scope does not satisfy it", () => {
    const p = policy({
      permission: [
        {
          assignee: "a",
          action: "approve",
          constraint: [{ leftOperand: "cat-harness:process", operator: "odrl:eq", rightOperand: "release" }],
        },
      ],
    });
    const ask = (scope?: Record<string, string>) => permits({ actor: "a", action: "approve", scope }, p, one(p), g);
    expect(ask({ "cat-harness:process": "release" })).toBe("permit");
    expect(ask({ "cat-harness:process": "authoring" })).toBe("unknown");
    expect(ask()).toBe("unknown");
  });

  test("performing a task in a lane needs the lane's role as well as the permission", () => {
    const p = policy({ permission: [{ assignee: "a", action: "approve" }] });
    const ask = (roles: string[]) =>
      permits({ actor: "a", actorRoles: roles, action: "approve", scope: { "cat-harness:role": "reviewer" } }, p, one(p), g);
    expect(ask(["reviewer"])).toBe("permit");
    expect(ask(["author"])).toBe("deny");
    expect(ask([])).toBe("permit"); // no roles declared = unconstrained (ActorDef.roles)
  });

  test("the default conflict strategy is prohibit — a ruled profile departure from ODRL's invalid (bean jcet)", () => {
    // ODRL 2.2 §2.10 defaults to invalid; the owner ruled 2026-10-01 to keep
    // prohibit. A change here is a policy decision: update the ruling, the
    // comment on FOLIO_DEFAULT_CONFLICT and methodologies/odrl-policies.md too.
    expect(FOLIO_DEFAULT_CONFLICT).toBe("odrl:prohibit");
  });

  test("permission and prohibition together: prohibit by default, perm when the policy says so, invalid voids", () => {
    const rules = {
      permission: [{ assignee: "a", action: "approve" }],
      prohibition: [{ assignee: "a", action: "approve" }],
    };
    const ask = (p: OdrlPolicy) => permits({ actor: "a", action: "approve" }, p, one(p), g);
    expect(ask(policy(rules))).toBe("deny");
    expect(ask(policy({ ...rules, conflict: "odrl:perm" }))).toBe("permit");
    expect(ask(policy({ ...rules, conflict: "odrl:invalid" }))).toBe("deny");
  });

  test("an includedIn cycle does not hang, and the graph need not have one root", () => {
    const cyc = actionGraph([
      { id: "x", includedIn: ["y"] },
      { id: "y", includedIn: ["x", "odrl:use"] },
    ]);
    expect([...broaderOrSelf("x", cyc)].sort()).toEqual(["odrl:use", "x", "y"]);
  });

  test("inheritFrom brings the parent's rules; a dangling one throws", () => {
    const parent = policy({ uid: "urn:parent", permission: [{ assignee: "a", action: "approve" }] });
    const child = policy({ uid: "urn:child", inheritFrom: ["urn:parent"] });
    const all = new Map([
      [parent.uid, parent],
      [child.uid, child],
    ]);
    expect(permits({ actor: "a", action: "approve" }, child, all, g)).toBe("permit");
    const orphan = policy({ uid: "urn:orphan", inheritFrom: ["urn:nowhere"] });
    expect(() => effectiveRules(orphan, one(orphan))).toThrow(/not declared/);
  });
});

describe("the schema refuses what it cannot mean", () => {
  const bad = (v: Record<string, unknown>) => OdrlPolicySchema.safeParse({
    "@context": "x", "@type": "Set", uid: "u", profile: "p", ...v,
  }).success;

  test("an unknown key on a rule is refused, not dropped", () => {
    expect(bad({ permission: [{ assignee: "a", action: "b", remedy: [] }] })).toBe(false);
    expect(bad({ permission: [{ assignee: "a", action: "b", duty: [] }] })).toBe(false);
  });
  test("an Agreement names both its assigner and its assignee (ODRL 2.2 §2.1.3)", () => {
    expect(bad({ "@type": "Agreement" })).toBe(false);
    expect(bad({ "@type": "Agreement", assigner: "org:x" })).toBe(false);
    expect(bad({ "@type": "Agreement", assignee: "org:y" })).toBe(false);
    expect(bad({ "@type": "Agreement", assigner: "org:x", assignee: "org:y" })).toBe(true);
  });
  test("isAnyOf takes a list and eq takes one value", () => {
    const c = (operator: string, rightOperand: unknown) =>
      bad({ permission: [{ assignee: "a", action: "b", constraint: [{ leftOperand: "cat-harness:task", operator, rightOperand }] }] });
    expect(c("odrl:isAnyOf", "t")).toBe(false);
    expect(c("odrl:isAnyOf", ["t"])).toBe(true);
    expect(c("odrl:eq", ["t"])).toBe(false);
  });
  test("a scope outside Process, Task, Role, purpose, dateTime and elapsedTime is refused", () => {
    expect(bad({ permission: [{ assignee: "a", action: "b", constraint: [{ leftOperand: "odrl:spatial", operator: "odrl:eq", rightOperand: "x" }] }] })).toBe(false);
  });
  test("a purpose constraint accepts HL7 PurposeOfUse codes and refuses draft vocabularies (DPV)", () => {
    expect(
      bad({
        permission: [
          {
            assignee: "a",
            action: "b",
            constraint: [{ leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "HRESCH" }],
          },
        ],
      }),
    ).toBe(true);
    expect(
      bad({
        permission: [
          {
            assignee: "a",
            action: "b",
            constraint: [{ leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "dpv:ResearchAndDevelopment" }],
          },
        ],
      }),
    ).toBe(false);
  });
  test("a duty accepts only the supported ODRL duty actions (delete, attribute, inform, obtainConsent)", () => {
    for (const action of ["odrl:delete", "odrl:attribute", "odrl:inform", "odrl:obtainConsent"]) {
      expect(bad({ permission: [{ assignee: "a", action: "b", duty: [{ action }] }] })).toBe(true);
    }
    expect(bad({ permission: [{ assignee: "a", action: "b", duty: [{ action: "odrl:compensate" }] }] })).toBe(false);
  });
});

describe("computable DSA constraints and duties (bean s4v2)", () => {
  const g = actionGraph([{ id: "read-dataset", includedIn: ["odrl:use"] }]);

  test("purpose isA HL7 PurposeOfUse HRESCH permits a subclass purpose and denies an unrelated one", () => {
    const dsa = policy({
      "@type": "Agreement",
      assigner: "org:who",
      assignee: "org:ministry",
      permission: [
        {
          assignee: "org:ministry",
          action: "odrl:use",
          constraint: [{ leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "HRESCH" }],
        },
      ],
    });
    const ask = (purpose?: string) =>
      permits(
        {
          actor: "org:ministry",
          action: "read-dataset",
          scope: purpose ? { "odrl:purpose": purpose } : {},
        },
        dsa,
        one(dsa),
        g,
      );
    // HRESCH itself and its subclasses (direct and transitive) are permitted
    expect(ask("HRESCH")).toBe("permit");
    expect(ask("BIORCH")).toBe("permit");
    expect(ask("CLINTRCH")).toBe("permit");
    expect(ask("CLINTRCHPC")).toBe("permit");
    // Unrelated HL7 PurposeOfUse codes are denied
    expect(ask("TREAT")).toBe("deny");
    expect(ask("PUBHLTH")).toBe("deny");
    expect(ask("HMARKT")).toBe("deny");
    // Absent purpose is unknown
    expect(ask()).toBe("unknown");
  });

  test("dateTime lt permits before and denies after (and lteq/gt/gteq evaluate boundaries)", () => {
    const dsa = policy({
      "@type": "Agreement",
      assigner: "org:who",
      assignee: "org:ministry",
      permission: [
        {
          assignee: "org:ministry",
          action: "odrl:use",
          constraint: [{ leftOperand: "odrl:dateTime", operator: "odrl:lt", rightOperand: "2026-12-31T00:00:00Z" }],
        },
      ],
    });
    const ask = (dateTime?: string) =>
      permits(
        {
          actor: "org:ministry",
          action: "read-dataset",
          scope: dateTime ? { "odrl:dateTime": dateTime } : {},
        },
        dsa,
        one(dsa),
        g,
      );
    expect(ask("2026-06-15T12:00:00Z")).toBe("permit");
    expect(ask("2026-12-31T00:00:00Z")).toBe("deny");
    expect(ask("2027-01-01T00:00:00Z")).toBe("deny");
    expect(ask()).toBe("unknown");
  });

  test("a 90-day delete duty: permit inside 90 days; after, deny without a deletion PROV record, permit with one, unknown when records are absent", () => {
    const dsa = policy({
      "@type": "Agreement",
      uid: "urn:dsa:90d",
      assigner: "org:who",
      assignee: "org:ministry",
      permission: [
        {
          assignee: "org:ministry",
          action: "odrl:use",
          target: "dataset: cholera-2026",
          duty: [
            {
              action: "odrl:delete",
              constraint: [{ leftOperand: "odrl:elapsedTime", operator: "odrl:lteq", rightOperand: "P90D" }],
            },
          ],
        },
      ],
    });

    const deletionProv = ProvActivitySchema.parse({
      "@type": "prov:Activity",
      "@id": "urn:run:delete-1",
      "prov:startedAtTime": "2026-11-15T10:00:00Z",
      "prov:qualifiedAssociation": {
        "prov:agent": "org:ministry",
        "prov:hadRole": "data-custodian",
        "prov:hadPlan": "dsa-lifecycle#Task_delete",
      },
      "prov:used": ["dataset: cholera-2026"],
      "cat-harness:underPolicy": "urn:dsa:90d",
    });

    const otherProv = ProvActivitySchema.parse({
      "@type": "prov:Activity",
      "@id": "urn:run:other-1",
      "prov:startedAtTime": "2026-10-01T10:00:00Z",
      "prov:qualifiedAssociation": {
        "prov:agent": "org:ministry",
        "prov:hadRole": "data-custodian",
        "prov:hadPlan": "dsa-lifecycle#Task_analyze",
      },
      "prov:used": ["dataset: cholera-2026"],
      "cat-harness:underPolicy": "urn:dsa:90d",
    });

    const ask = (elapsedTime: string, provRecords?: (typeof deletionProv)[]) =>
      permits(
        {
          actor: "org:ministry",
          action: "read-dataset",
          scope: { target: "dataset: cholera-2026", "odrl:elapsedTime": elapsedTime },
          provRecords,
        },
        dsa,
        one(dsa),
        g,
      );

    // Inside 90 days -> permit (even with no deletion PROV record yet)
    expect(ask("P30D")).toBe("permit");
    expect(ask("P90D", [])).toBe("permit");

    // After 90 days -> deny without a deletion PROV record
    expect(ask("P91D", [])).toBe("deny");
    expect(ask("P100D", [otherProv])).toBe("deny");

    // After 90 days -> permit with a deletion PROV record
    expect(ask("P91D", [deletionProv])).toBe("permit");
    expect(ask("P120D", [otherProv, deletionProv])).toBe("permit");

    // After 90 days -> unknown when PROV records are absent
    expect(ask("P91D", undefined)).toBe("unknown");
  });

  test("immediate duties (attribute, inform, obtainConsent): permit when fulfilled, deny when unmet, unknown when records are absent", () => {
    const dsa = policy({
      "@type": "Agreement",
      uid: "urn:dsa:attr",
      assigner: "org:who",
      assignee: "org:ministry",
      permission: [
        {
          assignee: "org:ministry",
          action: "odrl:use",
          duty: [{ action: "odrl:attribute" }, { action: "odrl:inform" }],
        },
      ],
    });
    const attrProv = ProvActivitySchema.parse({
      "@type": "prov:Activity",
      "@id": "urn:run:attr",
      "prov:startedAtTime": "2026-10-01T10:00:00Z",
      "prov:qualifiedAssociation": {
        "prov:agent": "org:ministry",
        "prov:hadRole": "recipient",
        "prov:hadPlan": "dsa-lifecycle#Task_attribute",
      },
      "cat-harness:underPolicy": "urn:dsa:attr",
    });
    const informProv = ProvActivitySchema.parse({
      "@type": "prov:Activity",
      "@id": "urn:run:inform",
      "prov:startedAtTime": "2026-10-01T10:05:00Z",
      "prov:qualifiedAssociation": {
        "prov:agent": "org:ministry",
        "prov:hadRole": "recipient",
        "prov:hadPlan": "dsa-lifecycle#Task_inform",
      },
      "cat-harness:underPolicy": "urn:dsa:attr",
    });

    expect(permits({ actor: "org:ministry", action: "read-dataset" }, dsa, one(dsa), g)).toBe("unknown");
    expect(permits({ actor: "org:ministry", action: "read-dataset", provRecords: [attrProv] }, dsa, one(dsa), g)).toBe("deny");
    expect(
      permits({ actor: "org:ministry", action: "read-dataset", provRecords: [attrProv, informProv] }, dsa, one(dsa), g),
    ).toBe("permit");
  });
});

describe("odrl:obtainConsent duty met by a matching active PCF Consent (PCF6, bean a7c1)", () => {
  const g = actionGraph([{ id: "read-dataset", includedIn: ["odrl:use"] }]);

  const dsaWithConsentDuty = policy({
    "@type": "Agreement",
    uid: "urn:dsa:pcf6",
    assigner: "org:who",
    assignee: "org:ministry",
    permission: [
      {
        assignee: "org:ministry",
        action: "odrl:use",
        target: "Patient/pat-1",
        constraint: [{ leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "PurposeOfUse" }],
        duty: [{ action: "odrl:obtainConsent" }],
      },
    ],
  });

  const activePermitConsentSet = policy({
    "@type": "Set",
    uid: "urn:ihe:pcf:consent:c-permit:v1",
    profile: "https://profiles.ihe.net/ITI/PCF",
    assigner: "Patient/pat-1",
    permission: [
      {
        assignee: "org:ministry",
        action: "odrl:use",
        target: "Patient/pat-1",
        constraint: [
          { leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "TREAT" },
          { leftOperand: "odrl:dateTime", operator: "odrl:gteq", rightOperand: "2026-01-01" },
          { leftOperand: "odrl:dateTime", operator: "odrl:lteq", rightOperand: "2026-12-31" },
        ],
      },
    ],
  });

  const activeDenyConsentSet = policy({
    "@type": "Set",
    uid: "urn:ihe:pcf:consent:c-deny:v1",
    profile: "https://profiles.ihe.net/ITI/PCF",
    assigner: "Patient/pat-1",
    permission: [],
    prohibition: [
      {
        assignee: ANYONE,
        action: "odrl:use",
        target: "Patient/pat-1",
      },
    ],
  });

  const inactiveEmptyConsentSet = policy({
    "@type": "Set",
    uid: "urn:ihe:pcf:consent:c-inactive:v1",
    profile: "https://profiles.ihe.net/ITI/PCF",
    assigner: "Patient/pat-1",
    permission: [],
    prohibition: [],
  });

  test("DSA + no Consent (or inactive/draft Consent) gives unknown, never permit or deny", () => {
    const baseReq = {
      actor: "org:ministry",
      action: "read-dataset",
      scope: {
        target: "Patient/pat-1",
        "odrl:purpose": "TREAT",
        "odrl:dateTime": "2026-06-15T12:00:00Z",
      },
    };

    // No Consent supplied at all -> unknown
    expect(permits(baseReq, dsaWithConsentDuty, one(dsaWithConsentDuty), g)).toBe("unknown");
    expect(decide(baseReq, one(dsaWithConsentDuty), g)).toBe("unknown");

    // Explicit null / empty array -> unknown
    expect(permits({ ...baseReq, consent: null }, dsaWithConsentDuty, one(dsaWithConsentDuty), g)).toBe("unknown");
    expect(permits({ ...baseReq, consents: [] }, dsaWithConsentDuty, one(dsaWithConsentDuty), g)).toBe("unknown");

    // Empty Set produced by consentToOdrl() for a non-active Consent -> unknown
    expect(
      permits({ ...baseReq, consent: inactiveEmptyConsentSet }, dsaWithConsentDuty, one(dsaWithConsentDuty), g),
    ).toBe("unknown");

    // Non-active FHIR R4 Consent (status: "inactive" or "draft") -> unknown
    const inactiveFhirConsent: FhirConsentLike = {
      resourceType: "Consent",
      id: "c-inactive",
      meta: { versionId: "1" },
      status: "inactive",
      patient: { reference: "Patient/pat-1" },
      provision: {
        type: "permit",
        actor: [{ reference: { reference: "org:ministry" } }],
        purpose: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "TREAT" }],
      },
    };
    expect(
      permits({ ...baseReq, consent: inactiveFhirConsent }, dsaWithConsentDuty, one(dsaWithConsentDuty), g),
    ).toBe("unknown");
    expect(
      permits(
        { ...baseReq, consent: { ...inactiveFhirConsent, status: "draft" } },
        dsaWithConsentDuty,
        one(dsaWithConsentDuty),
        g,
      ),
    ).toBe("unknown");
  });

  test("DSA + deny Consent gives deny (explicit prohibition or violated Consent constraint)", () => {
    const baseScope = {
      target: "Patient/pat-1",
      "odrl:purpose": "TREAT",
      "odrl:dateTime": "2026-06-15T12:00:00Z",
    };

    // 1. Explicit prohibition in active Consent Set -> deny
    expect(
      permits(
        { actor: "org:ministry", action: "read-dataset", scope: baseScope, consent: activeDenyConsentSet },
        dsaWithConsentDuty,
        one(dsaWithConsentDuty),
        g,
      ),
    ).toBe("deny");

    // Also when passed via the policy map `all` -> deny
    const mapWithDeny = new Map<string, OdrlPolicy>([
      [dsaWithConsentDuty.uid, dsaWithConsentDuty],
      [activeDenyConsentSet.uid, activeDenyConsentSet],
    ]);
    expect(permits({ actor: "org:ministry", action: "read-dataset", scope: baseScope }, dsaWithConsentDuty, mapWithDeny, g)).toBe(
      "deny",
    );
    expect(decide({ actor: "org:ministry", action: "read-dataset", scope: baseScope }, mapWithDeny, g)).toBe("deny");

    // 2. Active permit Consent for TREAT, but request asks for HMARKT (purpose not permitted by Consent) -> deny
    expect(
      permits(
        {
          actor: "org:ministry",
          action: "read-dataset",
          scope: { ...baseScope, "odrl:purpose": "HMARKT" },
          consent: activePermitConsentSet,
        },
        dsaWithConsentDuty,
        one(dsaWithConsentDuty),
        g,
      ),
    ).toBe("deny");

    // 3. Active permit Consent expired at request dateTime -> deny
    expect(
      permits(
        {
          actor: "org:ministry",
          action: "read-dataset",
          scope: { ...baseScope, "odrl:dateTime": "2027-02-01T00:00:00Z" },
          consent: activePermitConsentSet,
        },
        dsaWithConsentDuty,
        one(dsaWithConsentDuty),
        g,
      ),
    ).toBe("deny");

    // 4. Active FHIR R4 Consent with root deny provision -> deny
    const fhirDenyConsent: FhirConsentLike = {
      resourceType: "Consent",
      id: "c-dissent",
      meta: { versionId: "2" },
      status: "active",
      patient: { reference: "Patient/pat-1" },
      provision: {
        type: "deny",
      },
    };
    expect(
      permits(
        { actor: "org:ministry", action: "read-dataset", scope: baseScope, consent: fhirDenyConsent },
        dsaWithConsentDuty,
        one(dsaWithConsentDuty),
        g,
      ),
    ).toBe("deny");
  });

  test("DSA + matching active permit Consent gives permit (for exact and subclass HL7 PurposeOfUse)", () => {
    const reqForPurpose = (purpose: string) => ({
      actor: "org:ministry",
      action: "read-dataset",
      scope: {
        target: "Patient/pat-1",
        "odrl:purpose": purpose,
        "odrl:dateTime": "2026-06-15T12:00:00Z",
      },
    });

    // Exact purpose TREAT and subclass ETREAT / BTG permitted by activePermitConsentSet
    expect(
      permits({ ...reqForPurpose("TREAT"), consent: activePermitConsentSet }, dsaWithConsentDuty, one(dsaWithConsentDuty), g),
    ).toBe("permit");
    expect(
      permits({ ...reqForPurpose("ETREAT"), consent: activePermitConsentSet }, dsaWithConsentDuty, one(dsaWithConsentDuty), g),
    ).toBe("permit");
    expect(
      permits({ ...reqForPurpose("BTG"), consent: activePermitConsentSet }, dsaWithConsentDuty, one(dsaWithConsentDuty), g),
    ).toBe("permit");

    // Also when the Consent Set is supplied in the policy map `all`
    const mapWithPermit = new Map<string, OdrlPolicy>([
      [dsaWithConsentDuty.uid, dsaWithConsentDuty],
      [activePermitConsentSet.uid, activePermitConsentSet],
    ]);
    expect(permits(reqForPurpose("TREAT"), dsaWithConsentDuty, mapWithPermit, g)).toBe("permit");
    expect(decide(reqForPurpose("TREAT"), mapWithPermit, g)).toBe("permit");

    // Also when an active FHIR R4 Consent resource is supplied directly
    const activeFhirConsent: FhirConsentLike = {
      resourceType: "Consent",
      id: "c-basic-treat",
      meta: { versionId: "1" },
      status: "active",
      patient: { reference: "Patient/pat-1" },
      provision: {
        type: "permit",
        period: { start: "2026-01-01", end: "2026-12-31" },
        actor: [{ reference: { reference: "org:ministry" } }],
        purpose: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "TREAT" }],
        data: [{ meaning: "instance", reference: { reference: "Patient/pat-1" } }],
      },
    };
    expect(
      permits({ ...reqForPurpose("TREAT"), consent: activeFhirConsent }, dsaWithConsentDuty, one(dsaWithConsentDuty), g),
    ).toBe("permit");
    expect(evaluatePcfConsent(activeFhirConsent, reqForPurpose("TREAT"), g)).toBe("permit");
  });
});

describe("PROV-O activity", () => {
  const run = {
    "@type": "prov:Activity",
    "@id": "urn:run:1",
    "prov:startedAtTime": "2026-09-23T19:36:08Z",
    "prov:qualifiedAssociation": {
      "prov:agent": "authoring-agent",
      "prov:hadRole": "author",
      "prov:hadPlan": "content-lifecycle#Task_author",
    },
    "cat-harness:underPolicy": "https://litlfred.github.io/folio-assistant/policies/folio-defaults",
  };
  test("a task run parses", () => {
    expect(ProvActivitySchema.safeParse(run).success).toBe(true);
  });
  test("hadPlan must name a BPMN process and task", () => {
    const r = { ...run, "prov:qualifiedAssociation": { ...run["prov:qualifiedAssociation"], "prov:hadPlan": "author" } };
    expect(ProvActivitySchema.safeParse(r).success).toBe(false);
  });
  test("a run under no policy cannot be checked, so it is refused", () => {
    const { "cat-harness:underPolicy": _drop, ...r } = run;
    expect(ProvActivitySchema.safeParse(r).success).toBe(false);
  });
  test("several policies in force are listed, and an empty list is still no policy", () => {
    expect(ProvActivitySchema.safeParse({ ...run, "cat-harness:underPolicy": ["urn:a", "urn:b"] }).success).toBe(true);
    expect(ProvActivitySchema.safeParse({ ...run, "cat-harness:underPolicy": [] }).success).toBe(false);
  });
  test("it cannot end before it starts", () => {
    expect(ProvActivitySchema.safeParse({ ...run, "prov:endedAtTime": "2026-09-23T19:00:00Z" }).success).toBe(false);
  });
});
