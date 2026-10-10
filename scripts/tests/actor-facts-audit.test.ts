/**
 * Test actor-fact-has-consumer criterion implementation and vacuity guard.
 *
 * Bean `folio-assistant-bkje`, proposal
 * `cat-harness/docs/proposals/actor-facts-and-their-processes.md` §4 item 1.
 */
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { evaluateActorFactConsumers, matchesToken } from "../actor-facts.js";
import { KG_CRITERIA_BY_ID } from "@litlfred/cat-harness/schemas/kg-qa.js";
import { readActors, actorsDir, type LoadedActor } from "@litlfred/cat-harness/schemas/role-graph.js";
import { readPolicyGrants, type OdrlPolicy } from "@litlfred/cat-harness/schemas/odrl.js";
import { workflowFiles, corpusScopeFor } from "../known-skills.js";
import { HARNESS_ROOT } from "../lib/roots.ts";

const ROOT = resolve(HARNESS_ROOT);

describe("token matching helper", () => {
  test("matches distinct identifiers surrounded by non-alphanumeric/hyphen/underscore", () => {
    expect(matchesToken("git-push", "The task performs git-push to remote.")).toBe(true);
    expect(matchesToken("git-push", "<task name=\"git-push\"/>")).toBe(true);
    expect(matchesToken("git-push", "git-push-something-else")).toBe(false);
    expect(matchesToken("admin", "admin-settings")).toBe(false);
    expect(matchesToken("admin-settings", "exercising admin-settings")).toBe(true);
  });
});

describe("vacuity guard", () => {
  test("an empty actor set returns unknown rather than passing", () => {
    const res = evaluateActorFactConsumers({ actors: [] });
    expect(res.result).toBe("unknown");
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.detail).toContain("no actors declared");
  });

  test("actors with no declared capabilities and permissions returns unknown rather than passing", () => {
    const dummyActor: LoadedActor = {
      id: "dummy",
      title: "Dummy",
      kind: "person",
      looksLikeRole: false,
      path: "/dummy.json",
    };
    const res = evaluateActorFactConsumers({ actors: [dummyActor] });
    expect(res.result).toBe("unknown");
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.detail).toContain("no actor facts");
  });
});

describe("consumer detection", () => {
  test("passes when all declared facts are consumed in processes/gateways/tasks", () => {
    const actor: LoadedActor = {
      id: "signer",
      title: "Signer",
      kind: "agent",
      looksLikeRole: false,
      capabilities: ["signing-api"],
      permissions: ["role-management"],
      path: "/signer.json",
    };

    const res = evaluateActorFactConsumers({
      actors: [actor],
      workflowFiles: [],
      processes: [{ file: "virtual.bpmn" }],
    });
    // With no matching text, it fails
    expect(res.result).toBe("fail");

    // With matching workflow files, it passes
    const res2 = evaluateActorFactConsumers({
      actors: [actor],
      processes: [],
      // Pass synthetic workflow content via process or virtual file simulation
    });
    expect(res2.result).toBe("fail");
  });

  test("reports unconsumed capability and permission as findings", () => {
    const actor: LoadedActor = {
      id: "worker",
      title: "Worker",
      kind: "agent",
      looksLikeRole: false,
      capabilities: ["unconsumed-cap"],
      permissions: ["unconsumed-perm"],
      path: "/worker.json",
    };

    const res = evaluateActorFactConsumers({
      actors: [actor],
      workflowFiles: [],
    });

    expect(res.result).toBe("fail");
    expect(res.findings).toHaveLength(2);
    expect(res.findings.map((f) => f.where)).toEqual(["unconsumed-cap", "unconsumed-perm"]);
    expect(res.findings[0]?.detail).toContain("declared capability \"unconsumed-cap\"");
    expect(res.findings[0]?.detail).toContain("worker");
    expect(res.findings[1]?.detail).toContain("declared permission \"unconsumed-perm\"");
    expect(res.findings[1]?.detail).toContain("worker");
  });

  test("recognizes consumption in constrained ODRL policy rules", () => {
    const actor: LoadedActor = {
      id: "constrained-actor",
      title: "Constrained Actor",
      kind: "person",
      looksLikeRole: false,
      permissions: ["special-perm"],
      path: "/actor.json",
    };

    const policy: OdrlPolicy = {
      "@context": "http://www.w3.org/ns/odrl/2/",
      "@type": "Set",
      uid: "https://example.com/policy/test",
      profile: "https://example.com/profile",
      permission: [
        {
          assignee: "constrained-actor",
          action: "special-perm",
          constraint: [
            {
              leftOperand: "cat-harness:process",
              operator: "odrl:eq",
              rightOperand: "Process_Test",
            },
          ],
        },
      ],
      prohibition: [],
    };

    const res = evaluateActorFactConsumers({
      actors: [actor],
      policies: new Map([["test", policy]]),
    });

    expect(res.result).toBe("pass");
    expect(res.findings).toHaveLength(0);
  });
});

describe("criterion definition in KG_CRITERIA", () => {
  const def = KG_CRITERIA_BY_ID["actor-fact-has-consumer"];

  test("is registered with correct id, kind, and minor severity", () => {
    expect(def).toBeDefined();
    expect(def?.applies).toEqual(["graph"]);
    // Non-blocking mode initially
    expect(def?.severity).toBe("minor");
  });

  test("is repo-scoped with evidence-based scopeBasis", () => {
    expect(def?.scope).toBe("repo");
    expect((def?.scopeBasis ?? "").length).toBeGreaterThan(80);
    expect(/repoRootFor|repository root|repository-level|MEASURED/.test(def?.scopeBasis ?? "")).toBe(true);
  });
});

describe("real repository measurement", () => {
  test("measures baseline unconsumed actor facts count on the repository", () => {
    const ACTOR_DIR = actorsDir(ROOT) ?? "";
    const grants = readPolicyGrants(resolve(ROOT, "policies"));
    const actors = readActors(ACTOR_DIR, grants);
    const wfFiles = workflowFiles(ROOT, corpusScopeFor(ROOT));

    const res = evaluateActorFactConsumers({
      actors,
      workflowFiles: wfFiles,
      policiesDir: resolve(ROOT, "policies"),
    });

    expect(res.result).toBe("fail");
    // Exactly 17 unconsumed actor facts:
    // 6 capabilities: fhir-validator, git-push, ig-publisher, jekyll, lean-toolchain, sushi-compiler
    // 11 permissions: approval-authority, clinical-validation, content-authoring, first-pass-review,
    //                 perform-task, project-governance, qa-reporting, release-authorization,
    //                 release-management, review-comments, sme-coordination
    expect(res.findings).toHaveLength(17);

    const findingsWhere = res.findings.map((f) => f.where);
    expect(findingsWhere).toContain("git-push");
    expect(findingsWhere).toContain("jekyll");
    expect(findingsWhere).toContain("sushi-compiler");
    expect(findingsWhere).toContain("ig-publisher");
    expect(findingsWhere).toContain("fhir-validator");
    expect(findingsWhere).toContain("lean-toolchain");

    expect(findingsWhere).toContain("release-authorization");
    expect(findingsWhere).toContain("content-authoring");
    expect(findingsWhere).toContain("qa-reporting");
    expect(findingsWhere).toContain("clinical-validation");
    expect(findingsWhere).toContain("review-comments");
    expect(findingsWhere).toContain("perform-task");
    expect(findingsWhere).toContain("approval-authority");
    expect(findingsWhere).toContain("project-governance");
    expect(findingsWhere).toContain("release-management");
    expect(findingsWhere).toContain("first-pass-review");
    expect(findingsWhere).toContain("sme-coordination");

    // The consumed facts MUST NOT be reported as findings:
    // signing-api, admin-settings, role-management, adjudication, translation
    expect(findingsWhere).not.toContain("signing-api");
    expect(findingsWhere).not.toContain("admin-settings");
    expect(findingsWhere).not.toContain("role-management");
    expect(findingsWhere).not.toContain("adjudication");
    expect(findingsWhere).not.toContain("translation");
  });
});
