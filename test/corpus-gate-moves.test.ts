import { describe, expect, test } from "bun:test";

import { changedContentFiles } from "../src/workflow/corpus-gate.ts";

describe("changedContentFiles", () => {
  test("a pure move is not an edit", () => {
    expect(changedContentFiles(["R100\tfolio/d/acronyms/t-a.md\tfolio/d/glossary/t-a.md"])).toEqual([]);
  });
  test("a move that also edits keeps its new path", () => {
    expect(changedContentFiles(["R087\tfolio/d/a/t.md\tfolio/d/b/t.md"])).toEqual(["folio/d/b/t.md"]);
  });
  test("modified and added files are kept", () => {
    expect(changedContentFiles(["M\tfolio/d/a/p.md", "A\tfolio/d/a/q.ts", ""])).toEqual(["folio/d/a/p.md", "folio/d/a/q.ts"]);
  });
});

// A change with no block in it does not need the editing process on disk: the
// diagram lives in an opt-in group, and a root that leaves the group off (an
// IG re-pinning its layers) has no copy of it. A block still needs it.
describe("checkCorpusGate without the editing process on disk", () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const platformRoot = mkdtempSync(join(tmpdir(), "corpus-gate-platform-"));
  const repoRoot = mkdtempSync(join(tmpdir(), "corpus-gate-repo-"));
  mkdirSync(join(repoRoot, "folio", "d"), { recursive: true });
  writeFileSync(join(repoRoot, "folio", "d", "block.ts"), "export default {};\n");
  writeFileSync(join(repoRoot, "folio", "d", "block.md"), "text\n");
  writeFileSync(join(repoRoot, "index.lock.json"), "{}\n");

  test("no block changed: nothing to gate, so no process is needed", async () => {
    const { checkCorpusGate } = await import("../src/workflow/corpus-gate.ts");
    const findings = await checkCorpusGate(repoRoot, {
      files: ["index.lock.json", "folio/d/block.md"],
      platformRoot,
      labelFor: () => undefined,
    });
    expect(findings).toEqual([]);
  });

  test("a block changed: the missing process is still refused", async () => {
    const { checkCorpusGate } = await import("../src/workflow/corpus-gate.ts");
    await expect(
      checkCorpusGate(repoRoot, { files: ["folio/d/block.md"], platformRoot, labelFor: () => "blk" }),
    ).rejects.toThrow(/writes a content block, and there is no editing-hci-validation\.bpmn/);
  });
});
