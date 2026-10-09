/**
 * An L1 verdict is written under the instance that owns the library entry.
 *
 * In the index checkout the root declares no instance (owner, 2026-10-08),
 * so writing under it put the `library-qa` sidecars in an undeclared
 * `<index>/test/results/` (measured 2026-10-09: 79 files).
 */
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DECLARATION_SUFFIX } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { sidecarRootFor } from "../check-l1-complete.ts";

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("an entry's sidecar root is the instance holding its library, not an undeclared checkout root", () => {
  const root = mkdtempSync(join(tmpdir(), "l1-owner-"));
  made.push(root);
  const inst = join(root, "inst");
  mkdirSync(join(inst, "library", "some-entry"), { recursive: true });
  writeFileSync(
    join(inst, `inst${DECLARATION_SUFFIX}`),
    JSON.stringify({ name: "inst", directories: [{ id: "library", path: "library/", graphTypologies: ["library"] }] }),
  );
  expect(sidecarRootFor(inst, "some-entry")).toBe(inst);
  expect(sidecarRootFor(root, "some-entry")).toBe(inst);
  expect(sidecarRootFor(root, "not-an-entry")).toBe(root);
});
