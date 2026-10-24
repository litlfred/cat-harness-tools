/**
 * `workflow:instances` — bean `folio-assistant-5ulq` (advisory by owner ruling).
 *
 * The instance directory is asked of the bean graph rather than written here,
 * and git is injected, so every state is reached without a repository.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveBeanGraphNode } from "../../beans.ts";
import { report, workflowInstances } from "../../workflow-instances.ts";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** A checkout with the default bean graph and the given instance files. */
function fixture(instances: Record<string, unknown>): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "wf-instances-"));
  roots.push(root);
  const dir = resolveBeanGraphNode(root, "workflow-state").dir!;
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(instances)) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return { root, dir };
}

const git = (merges: string, shallow = "false") => (args: string[]) =>
  args[0] === "rev-parse" ? shallow : merges;

describe("workflowInstances", () => {
  test("more merges than instances is a FINDING, and the report says advisory", () => {
    const { root } = fixture({
      "a.json": { startedAt: "2026-10-01T00:00:00Z" },
      "b.json": { startedAt: "2026-09-01T00:00:00Z" },
    });
    const c = workflowInstances({ root, git: git("40") });
    expect(c).toMatchObject({ state: "finding", instances: 2, startedSince: 1, merges: 40, gatesReading: [] });
    const text = report(c);
    expect(text).toContain("FINDING (advisory)");
    expect(text).toContain("upper bound");
  });

  test("an instance with no startedAt is dated by its first history entry", () => {
    const { root } = fixture({ "r.json": { history: [{ at: "2026-10-02T00:00:00Z" }] } });
    expect(workflowInstances({ root, git: git("1") })).toMatchObject({ state: "ok", startedSince: 1, merges: 1 });
  });

  test("an instance that cannot be dated or parsed makes the count UNKNOWN, not smaller", () => {
    const { root } = fixture({ "x.json": "{ not json", "y.json": { status: "running" } });
    const c = workflowInstances({ root, git: git("5") });
    expect(c.state).toBe("unknown");
    expect(report(c)).toContain("x.json");
  });

  test("a shallow clone is UNKNOWN: its merge count is not the repository's", () => {
    const { root } = fixture({});
    expect(workflowInstances({ root, git: git("3", "true") })).toMatchObject({ state: "unknown" });
  });

  test("a declared but absent directory is UNKNOWN, never zero instances", () => {
    const { root, dir } = fixture({});
    rmSync(dir, { recursive: true });
    expect(workflowInstances({ root, git: git("3") }).state).toBe("unknown");
  });

  test("a CI workflow naming the graph is counted as reading it", () => {
    const { root } = fixture({});
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "w.yml"), "run: bun run cat workflow:instances\n");
    writeFileSync(join(root, ".github", "workflows", "other.yml"), "run: echo hi\n");
    expect(workflowInstances({ root, git: git("0") })).toMatchObject({ state: "ok", gatesReading: ["w.yml"] });
  });
});
