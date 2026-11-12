/**
 * A check resolving a MOUNTED layer sees the opt-in sub-graphs the root that
 * mounted it switched on — not the mounted layer's own list.
 *
 * Owner, 2026-11-12, card Q-OPTIN-DIRS A: "CI checks should align on opt
 * in/out". `up` switches `up.ops` on for itself and leaves `up.extra` off. A
 * consumer that has `ops` off and `extra` on must see exactly that in every
 * reader of the mounted `up`: the directories, the skills that exist
 * (check:tools' `satisfies`, check:workflow-refs' skill refs) and the
 * workflows read. The same `up` resolved where no mount placed it keeps its
 * own list.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultEnabledSubgraphs, resolveDirectories } from "../../../schemas/kg/cat-harness.js";
import { WHOLE_INSTANCE_ID } from "../../../schemas/kg/remote-mount.js";
import { knownSkills, workflowFiles } from "../../known-skills.js";
import { writeDeclaration } from "../../../test/support/instance-fixture.js";

const made: string[] = [];
afterAll(() => {
  for (const p of made) rmSync(p, { recursive: true, force: true });
});

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

/** `up` at `root`: always-on `skills/`, opt-in `ops/` (on for itself) and `extra/` (off for itself), each with a skill and a workflow. */
function upstream(root: string, groups: readonly string[]): void {
  mkdirSync(root, { recursive: true });
  writeDeclaration(root, {
    name: "up",
    enableSubgraphs: ["up.ops"],
    directories: [
      { id: "skills", path: "skills/", graphTypologies: ["cat-harness"] },
      { id: "ops", path: "ops/", graphTypologies: ["cat-harness"], optIn: true },
      { id: "extra", path: "extra/", graphTypologies: ["cat-harness"], optIn: true },
    ],
  });
  const put = (rel: string, body: string): void => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), body);
  };
  put("skills/base.md", "# base\n");
  for (const g of groups) {
    put(`${g}/${g}-skill.md`, `# ${g}\n`);
    put(`${g}/processes/${g}.bpmn`, "<definitions/>\n");
  }
}

/** A consumer that switches `on` on and mounts `up` whole, leaving out every group it has off. */
function consumer(on: readonly string[]): string {
  const scope = mkdtempSync(join(tmpdir(), "optin-mounting-"));
  made.push(scope);
  writeDeclaration(scope, { name: "down", enableSubgraphs: on.map((g) => `up.${g}`), directories: [] });
  const up = join(scope, "up");
  upstream(up, on);
  const except = ["ops", "extra"].filter((g) => !on.includes(g));
  writeFileSync(
    join(scope, "index.lock.json"),
    JSON.stringify({
      $schema: "cat-harness-mount-lock/v1",
      mounts: [{ harness: "up", repository: "o/up", ref: SHA }],
      instances: [
        {
          instance: "up",
          repository: "o/up",
          sha: SHA,
          upstreamRoot: "",
          path: "up",
          via: "up",
          pinnedBy: "declared",
          declaration: { file: "up.json", sha256: DIGEST },
          directories: [{ id: WHOLE_INSTANCE_ID, path: "up", upstreamPath: ".", treeDigest: DIGEST, files: 0, ...(except.length ? { except } : {}) }],
        },
      ],
      unmounted: [],
    }),
  );
  return up;
}

const ids = (root: string): string[] => resolveDirectories([{ name: "(local)", root, own: true }]).map((d) => d.id);
const workflows = (root: string): string[] => workflowFiles(root).map((f) => f.slice(root.length + 1)).sort();

describe("a consumer that switched a group OFF that the mounted layer has on", () => {
  const up = consumer([]);

  test("the mounting root's list decides", () => {
    expect(defaultEnabledSubgraphs(up)).toEqual(new Set());
    expect(ids(up)).not.toContain("ops");
  });

  test("its skills do not exist for check:tools / check:workflow-refs, and its workflows are not read", () => {
    const skills = knownSkills(up);
    expect(skills.has("base")).toBe(true);
    expect(skills.has("ops-skill")).toBe(false);
    expect(workflows(up)).toEqual([]);
  });
});

describe("a consumer that switched a group ON that the mounted layer has off", () => {
  const up = consumer(["extra"]);

  test("the mounting root's list decides", () => {
    expect(defaultEnabledSubgraphs(up)).toEqual(new Set(["up.extra"]));
    expect(ids(up)).toContain("extra");
    expect(ids(up)).not.toContain("ops");
  });

  test("its skills exist and its workflows are read", () => {
    expect(knownSkills(up).has("extra-skill")).toBe(true);
    expect(workflows(up)).toEqual(["extra/processes/extra.bpmn"]);
  });
});

describe("a layer no mount placed keeps its own list", () => {
  test("`ops` on, `extra` off, as `up` declares for itself", () => {
    const own = mkdtempSync(join(tmpdir(), "optin-own-"));
    made.push(own);
    upstream(own, ["ops", "extra"]);
    expect(defaultEnabledSubgraphs(own)).toEqual(new Set(["up.ops"]));
    expect(ids(own)).toContain("ops");
    expect(ids(own)).not.toContain("extra");
    expect(knownSkills(own).has("ops-skill")).toBe(true);
    expect(knownSkills(own).has("extra-skill")).toBe(false);
  });
});
