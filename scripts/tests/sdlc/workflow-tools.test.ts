/**
 * check:workflow-tools — every script a workflow runs is a Tool linked to a
 * process. Each case is a way the gate could read a workflow as clean while a
 * step runs something no Tool reaches.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import { assess, invocations, processesOf, resolvePath, runBlocks, toolReach } from "../../check-workflow-tools.ts";
import type { ToolDefinition } from "../../../schemas/tools/tool.js";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "workflow-tools-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

const tool = (id: string, shell: string, satisfies: string[], subprocesses?: string[]) =>
  ({ id, invoke: { shell }, satisfies, subprocesses }) as unknown as ToolDefinition;

describe("runBlocks", () => {
  test("reads inline and block `run:`, and drops comment lines", () => {
    const yaml = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: bash x/a.sh",
      "      - name: b",
      "        run: |",
      "          # bash x/commented.sh",
      "          bun run x/b.ts --flag",
      "      - run: echo done",
    ].join("\n");
    const blocks = runBlocks(yaml).join("\n");
    expect(blocks).toContain("bash x/a.sh");
    expect(blocks).toContain("bun run x/b.ts --flag");
    expect(blocks).not.toContain("commented");
  });
});

describe("resolvePath", () => {
  test("a workflow's checkout prefix is dropped until the rest is a file", () => {
    const root = tree({ "lay/.github/scripts/x.py": "", "lay/scripts/y.ts": "", ".github/m.sh": "" });
    expect(resolvePath("ci/.github/scripts/x.py", "lay", root)).toBe("lay/.github/scripts/x.py");
    expect(resolvePath("fa/.github/m.sh", ".", root)).toBe(".github/m.sh");
    expect(resolvePath("./lay/scripts/y.ts", ".", root)).toBe("lay/scripts/y.ts");
  });
  test("a path built at run time, or naming no file, resolves to nothing", () => {
    const root = tree({ "a.ts": "" });
    expect(resolvePath("$RUNNER_TEMP/a.ts", ".", root)).toBeUndefined();
    expect(resolvePath("nowhere/b.ts", ".", root)).toBeUndefined();
  });
});

describe("assess", () => {
  const files = {
    ".github/workflows/w.yml": [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: bash lay/scripts/linked.sh",
      "      - run: bun run lay/scripts/unlinked.ts",
      "      - run: python3 -I lay/scripts/bare.py",
      "      - run: bun run cat do:it",
    ].join("\n"),
    "lay/scripts/linked.sh": "",
    "lay/scripts/unlinked.ts": "",
    "lay/scripts/bare.py": "",
    "lay/scripts/keyed.ts": "",
    "package.json": JSON.stringify({ name: "root", scripts: { "do:it": "bun run lay/scripts/keyed.ts" } }),
  };
  const bySkill = new Map([["skill-a", new Set(["proc-a"])]]);

  test("a Tool with a process link is clean; one without is no-process; none is no-tool", () => {
    const root = tree(files);
    const defs = [
      tool("linked", "lay/scripts/linked.sh", ["skill-a"]),
      tool("unlinked", "bun run lay/scripts/unlinked.ts", ["skill-unused"]),
      tool("keyed", "bun run cat do:it", [], ["proc-b"]),
    ];
    const r = assess(invocations(root, [".github/workflows/w.yml"]), toolReach(defs, root), defs, bySkill);
    const kinds = Object.fromEntries(r.findings.map((f) => [f.subject, f.kind]));
    expect(kinds).toEqual({ "lay/scripts/unlinked.ts": "no-process", "lay/scripts/bare.py": "no-tool" });
    expect(r.ok.map((o) => o.subject).sort()).toEqual(["lay/scripts/keyed.ts", "lay/scripts/linked.sh"]);
  });

  test("processesOf joins satisfies to BPMN skill refs, and adds subprocesses", () => {
    expect(processesOf(tool("t", "x", ["skill-a"], ["proc-c"]), bySkill)).toEqual(["proc-a", "proc-c"]);
    expect(processesOf(tool("t", "x", ["nope"]), bySkill)).toEqual([]);
  });
});
