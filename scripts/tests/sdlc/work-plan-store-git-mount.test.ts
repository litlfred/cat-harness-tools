/**
 * The git state branch Tool on its mount — what the engine calls — held to the
 * work-plan store's conformance suite (cat-harness#991 step 3).
 *
 * The CLI is turned off, so the suite checks this Tool's own bytes rather than
 * whichever `beans` binary the runner has. Two writers are two instances over
 * one mounted directory: the race between sessions is the push to the branch,
 * which `work-plan-store-git.test.ts` holds to the same suite.
 *
 * @module scripts/tests/sdlc/work-plan-store-git-mount
 */
import { afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MountedGitBranchStore } from "../../../src/workflow/work-plan-store-git-mount.ts";
import { workPlanStoreConformance } from "./work-plan-store-conformance.ts";

const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

workPlanStoreConformance({
  name: "git state branch, on its mount (beans-git-branch)",
  fresh() {
    const repo = mkdtempSync(join(tmpdir(), "wps-mount-"));
    made.push(repo);
    mkdirSync(join(repo, "beans", "defs"), { recursive: true });
    mkdirSync(join(repo, "beans", "workflows"), { recursive: true });
    writeFileSync(
      join(repo, "beans", "beans.json"),
      JSON.stringify({
        name: "f",
        directories: [
          { id: "defs", path: "defs", graphTypologies: ["bean-defs"] },
          { id: "workflows", path: "workflows", graphTypologies: ["workflow-state"] },
        ],
      }),
    );
    return {
      a: new MountedGitBranchStore(repo, { cli: false }),
      b: new MountedGitBranchStore(repo, { cli: false }),
      seedInstance: (s) => writeFileSync(join(repo, "beans", "workflows", `${s.id}.json`), `${JSON.stringify({ $schema: "folio-workflow-instance/v1", ...s }, null, 2)}\n`),
    };
  },
});
