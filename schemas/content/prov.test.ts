/**
 * W3C PROV-O decision records: agreement + grant citations and hash-chained log
 * (DSA B4, bean `3z44`) and IHE PCF Consent `id` + `versionId` citations on
 * consent-based decisions (PCF8, bean `2egb`).
 */
import { describe, expect, test } from "bun:test";
import {
  ProvActivitySchema,
  ProvConsentDecisionRecordSchema,
  ProvConsentRefSchema,
  ProvDecisionRecordSchema,
  appendProvDecisionRecord,
  buildProvHashChain,
  stampProvDecisionRecord,
  verifyProvHashChain,
} from "./prov.ts";

const run = {
  "@type": "prov:Activity" as const,
  "@id": "urn:uuid:00000000-0000-4000-8000-000000000001",
  "prov:startedAtTime": "2026-09-23T19:30:00Z",
  "prov:qualifiedAssociation": {
    "prov:agent": "owner",
    "prov:hadRole": "maintainer",
    "prov:hadPlan": "code-change-review#Task_merge",
  },
  "prov:used": ["cat-harness/schemas/content/odrl.ts"],
  "prov:generated": ["cat-harness/policies/cat-harness.jsonld"],
  "cat-harness:underPolicy": "https://litlfred.github.io/notebooks/vocab/cat-harness/policies/cat-harness",
};

describe("PROV-O decision records and hash chain (DSA B4, bean 3z44)", () => {
  test("DSA B4 decision records cite agreement URL + SHA-256 (and optional grant) and enforce the hash chain", () => {
    const agreement = {
      url: "https://example.org/agreements/who-ministry-dsa-v1.pdf",
      sha256: "a".repeat(64),
      grant: "urn:uuid:grant-001",
    };

    // Every decision record must name its agreement (url + sha256) and hash
    expect(ProvDecisionRecordSchema.safeParse(run).success).toBe(false);

    const chain = buildProvHashChain([
      { ...run, "@id": "urn:run:1", "cat-harness:agreement": agreement, "cat-harness:grant": "urn:uuid:grant-001" },
      { ...run, "@id": "urn:run:2", "prov:startedAtTime": "2026-09-23T19:40:00Z", "cat-harness:agreement": agreement },
    ]);
    const fullChain = appendProvDecisionRecord(chain, {
      ...run,
      "@id": "urn:run:3",
      "prov:startedAtTime": "2026-09-23T19:45:00Z",
      "cat-harness:agreement": agreement,
    });

    expect(fullChain).toHaveLength(3);
    expect(fullChain[0]!["cat-harness:previousHash"]).toBeNull();
    expect(fullChain[1]!["cat-harness:previousHash"]).toBe(fullChain[0]!["cat-harness:recordHash"]);
    expect(fullChain[2]!["cat-harness:previousHash"]).toBe(fullChain[1]!["cat-harness:recordHash"]);
    expect(verifyProvHashChain(fullChain).valid).toBe(true);

    // Editing any past record fails the chain check
    const edited = [
      { ...fullChain[0]!, "prov:used": ["tampered-dataset"] },
      fullChain[1]!,
      fullChain[2]!,
    ];
    const editRes = verifyProvHashChain(edited);
    expect(editRes.valid).toBe(false);
    expect(editRes.errors.some((e) => e.kind === "hash-mismatch")).toBe(true);

    // Removing the first record fails the chain check (genesis previousHash !== null)
    const removedFirst = [fullChain[1]!, fullChain[2]!];
    const remFirstRes = verifyProvHashChain(removedFirst);
    expect(remFirstRes.valid).toBe(false);
    expect(remFirstRes.errors.some((e) => e.kind === "broken-link")).toBe(true);

    // Removing a middle record fails the chain check (previousHash link mismatch)
    const removedMiddle = [fullChain[0]!, fullChain[2]!];
    const remMiddleRes = verifyProvHashChain(removedMiddle);
    expect(remMiddleRes.valid).toBe(false);
    expect(remMiddleRes.errors.some((e) => e.kind === "broken-link")).toBe(true);

    // Removing a record when expectedHeadHash or expectedCount is pinned also fails
    const removedLast = [fullChain[0]!, fullChain[1]!];
    expect(
      verifyProvHashChain(removedLast, { expectedHeadHash: fullChain[2]!["cat-harness:recordHash"] }).valid,
    ).toBe(false);
    expect(verifyProvHashChain(removedLast, { expectedCount: 3 }).valid).toBe(false);
  });
});

describe("PROV decision record cites Consent id + versionId (PCF8, bean 2egb)", () => {
  const agreement = {
    url: "https://example.org/agreements/who-ministry-dsa-v1.pdf",
    sha256: "b".repeat(64),
  };

  test("ProvConsentRefSchema requires non-empty id and versionId", () => {
    expect(ProvConsentRefSchema.safeParse({ id: "consent-basic-1", versionId: "3" }).success).toBe(true);
    expect(ProvConsentRefSchema.safeParse({ id: "consent-basic-1" }).success).toBe(false);
    expect(ProvConsentRefSchema.safeParse({ versionId: "3" }).success).toBe(false);
    expect(ProvConsentRefSchema.safeParse({ id: "", versionId: "3" }).success).toBe(false);
    expect(ProvConsentRefSchema.safeParse({ id: "consent-basic-1", versionId: "" }).success).toBe(false);
  });

  test("every consent-based decision names its Consent (id + versionId)", () => {
    const consent = { id: "ex-consent-basic-treat", versionId: "2" };

    // A consent-based decision record WITH Consent id + versionId validates
    const stamped = stampProvDecisionRecord({
      ...run,
      "@id": "urn:run:consent-1",
      "cat-harness:underPolicy": ["urn:dsa:pcf6", "urn:ihe:pcf:consent:ex-consent-basic-treat:v2"],
      "cat-harness:agreement": agreement,
      "cat-harness:consent": consent,
      "cat-harness:consentBased": true,
    });
    expect(stamped["cat-harness:consent"]).toEqual(consent);
    expect(ProvConsentDecisionRecordSchema.safeParse(stamped).success).toBe(true);

    // A consent-based decision record WITHOUT Consent fails schema validation
    expect(
      ProvActivitySchema.safeParse({
        ...run,
        "cat-harness:consentBased": true,
      }).success,
    ).toBe(false);
    expect(
      ProvActivitySchema.safeParse({
        ...run,
        "cat-harness:underPolicy": ["urn:dsa:pcf6", "urn:ihe:pcf:consent:ex-consent-basic-treat:v2"],
      }).success,
    ).toBe(false);
    expect(() =>
      stampProvDecisionRecord({
        ...run,
        "cat-harness:agreement": agreement,
        "cat-harness:consentBased": true,
      }),
    ).toThrow(/Consent/);

    // verifyProvHashChain enforces Consent citation on consent-based decisions and detects tampering
    const chain = buildProvHashChain([
      {
        ...run,
        "@id": "urn:run:c1",
        "cat-harness:underPolicy": "urn:dsa:pcf6",
        "cat-harness:agreement": agreement,
        "cat-harness:consent": { id: "c-101", versionId: "1" },
        "cat-harness:consentBased": true,
      },
      {
        ...run,
        "@id": "urn:run:c2",
        "prov:startedAtTime": "2026-09-23T19:40:00Z",
        "cat-harness:underPolicy": "urn:dsa:pcf6",
        "cat-harness:agreement": agreement,
        "cat-harness:consent": { id: "c-101", versionId: "2" },
        "cat-harness:consentBased": true,
      },
    ]);
    expect(verifyProvHashChain(chain, { requireConsent: true }).valid).toBe(true);
    expect(verifyProvHashChain(chain, { consentPolicyUids: ["urn:dsa:pcf6"] }).valid).toBe(true);

    // Stripping cat-harness:consent or altering versionId fails verifyProvHashChain
    const strippedConsent = [
      (() => {
        const copy = { ...chain[0]! } as Record<string, unknown>;
        delete copy["cat-harness:consent"];
        return copy;
      })(),
      chain[1]!,
    ];
    const strippedRes = verifyProvHashChain(strippedConsent, { consentPolicyUids: ["urn:dsa:pcf6"] });
    expect(strippedRes.valid).toBe(false);
    expect(strippedRes.errors.some((e) => e.kind === "missing-consent")).toBe(true);

    const tamperedVersion = [
      { ...chain[0]!, "cat-harness:consent": { id: "c-101", versionId: "99" } },
      chain[1]!,
    ];
    const tamperedRes = verifyProvHashChain(tamperedVersion, { requireConsent: true });
    expect(tamperedRes.valid).toBe(false);
    expect(tamperedRes.errors.some((e) => e.kind === "hash-mismatch")).toBe(true);
  });
});
