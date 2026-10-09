/**
 * Verification for bean folio-assistant-3025:
 * folio-paper-adapter 44 of 47 skills modelled into roles.
 *
 * Asserts:
 * 1. The 3 paper roles (lean-authoring-agent, proof-review-agent, compute-authoring-agent)
 *    exist in cat-harness/scenarios/roles.json with personas and descriptions.
 * 2. Every skill in folio-paper-adapter is bound to a role or carries `consulted: true`.
 * 3. 0% unbound skills in folio-paper-adapter.
 *
 * @module scripts/tests/paper-adapter-roles.test
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HARNESS_ROOT } from "../lib/roots.ts";

const ROOT = resolve(HARNESS_ROOT);
function findCoordinatorRoot(startDir: string): string {
  let curr = resolve(startDir, "..");
  while (curr !== resolve(curr, "..")) {
    if (existsSync(join(curr, "folio-assistant-sci"))) {
      return curr;
    }
    curr = resolve(curr, "..");
  }
  return resolve(startDir, "..");
}
const COORDINATOR = findCoordinatorRoot(ROOT);

describe("folio-paper-adapter role modelling (bean 3025)", () => {
  const harnessRolesPath = join(ROOT, "scenarios", "roles.json");
  const harnessRoles = JSON.parse(readFileSync(harnessRolesPath, "utf-8")) as {
    roles: Array<{ id: string; persona?: string; description?: string; actorKinds?: string[] }>;
  };

  test("the three paper roles are declared in cat-harness/scenarios/roles.json with personas", () => {
    const roleIds = new Set(harnessRoles.roles.map((r) => r.id));
    for (const id of ["lean-authoring-agent", "proof-review-agent", "compute-authoring-agent"]) {
      expect(roleIds.has(id)).toBe(true);
      const role = harnessRoles.roles.find((r) => r.id === id)!;
      expect(role.description).toBeDefined();
      expect(role.description!.length).toBeGreaterThan(10);
      expect(role.persona).toBeDefined();
      expect(role.persona!.length).toBeGreaterThan(10);
      expect(role.actorKinds).toContain("agent");
    }
  });

  test("all 47 skills in folio-paper-adapter are accounted for (bound or consulted: true)", () => {
    // Locate folio-paper-adapter package manifest
    const manifestCandidates = [
      join(COORDINATOR, "folio-assistant-sci", "skills", "content", "folio-paper-adapter", "package-manifest.json"),
      join(ROOT, "skills", "content", "folio-paper-adapter", "package-manifest.json"),
    ];
    const manifestPath = manifestCandidates.find((p) => existsSync(p));
    if (!manifestPath) {
      console.warn("folio-paper-adapter not found at expected paths, skipping package check");
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { skills: string[] };
    expect(manifest.skills.length).toBe(47);

    // Locate sci scenarios/roles.json extensions
    const sciRolesPathCandidates = [
      join(COORDINATOR, "folio-assistant-sci", "scenarios", "roles.json"),
      join(ROOT, "scenarios", "roles.json"),
    ];
    const sciRolesPath = sciRolesPathCandidates.find((p) => existsSync(p));
    expect(sciRolesPath).toBeDefined();

    const sciRoles = JSON.parse(readFileSync(sciRolesPath!, "utf-8")) as {
      extensions?: Array<{ role: string; skills: string[] }>;
    };

    const boundSkills = new Set<string>();
    for (const r of harnessRoles.roles) {
      for (const s of (r as { skills?: string[] }).skills || []) boundSkills.add(s);
    }
    for (const ext of sciRoles.extensions || []) {
      for (const s of ext.skills || []) boundSkills.add(s);
    }

    const adapterDir = resolve(manifestPath, "..");
    const unbound: string[] = [];

    for (const skill of manifest.skills) {
      if (boundSkills.has(skill)) continue;

      // Check if skill is marked consulted: true
      const mdPath = join(adapterDir, `${skill}.md`);
      if (existsSync(mdPath)) {
        const content = readFileSync(mdPath, "utf-8");
        if (/^consulted:\s*true/m.test(content)) {
          continue; // Reference skill, exempt from role binding
        }
      }

      unbound.push(skill);
    }

    expect(unbound).toEqual([]);
  });
});
