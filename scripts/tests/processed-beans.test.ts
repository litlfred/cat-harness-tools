/**
 * The beans-by-process projection and its pages (cat-harness-tools#1413,
 * bean `folio-assistant-pbv1`), against hand-built instances and beans.
 */
import { describe, expect, test } from "bun:test";

import type { BeanNode } from "../beans.ts";
import type { InstanceState } from "../../src/workflow/instance.js";
import {
  PB_SEGMENT,
  processedBeanBody,
  processedBeansBody,
  processedBeansRoutes,
  processedBeansRows,
  rebase,
} from "../processed-beans.ts";

const NOW = new Date("2026-11-02T00:00:00Z");

function bean(id: string, status: string, updatedAt = "2026-10-01T00:00:00Z"): BeanNode {
  return { id, file: `beans/defs/${id}.md`, title: `title of ${id}`, status, type: "task", priority: "normal", parent: "", blocking: [], createdAt: updatedAt, updatedAt, body: "" } as BeanNode;
}

function instance(id: string, o: Partial<InstanceState>): InstanceState {
  return {
    id,
    processId: "Process_A",
    source: "processes/a.bpmn",
    subject: id,
    tokens: [],
    arrivals: {},
    history: [],
    status: "running",
    startedAt: "2026-09-01T00:00:00Z",
    updatedAt: "",
    ...o,
  } as InstanceState;
}

const diagram = { nodes: new Set(["Start", "Task_1", "Task_2", "End"]), ends: new Set(["End"]) };

function rows(instances: InstanceState[], beans: BeanNode[]) {
  return processedBeansRows({
    instances,
    beans,
    now: NOW,
    diagrams: new Map(instances.map((i) => [i.id, diagram])),
    drawingFor: (src) => (src === "processes/a.bpmn" ? "../../assets/img/workflows/a.svg" : undefined),
    instanceHref: (id) => `workflows/${id}/`,
  });
}

describe("processedBeansRows", () => {
  test("a running instance unmoved for 30 days is stalled, with its bean joined", () => {
    const [r] = rows(
      [instance("i1", { bean: "fa-aaaa", tokens: ["Task_2"], history: [{ at: "2026-10-03T00:00:00Z", node: "Start" }, { at: "2026-10-03T00:00:00Z", node: "Task_1" }] } as Partial<InstanceState>)],
      [bean("fa-aaaa", "in-progress")],
    );
    expect(r.finished).toBe(false);
    expect(r.ageDays).toBe(30);
    expect(r.stuck).toContain("enabled-not-taken");
    expect(r.beans).toEqual([{ id: "fa-aaaa", found: true, title: "title of fa-aaaa", status: "in-progress", updatedAt: "2026-10-01T00:00:00Z" }]);
    expect(r.done).toEqual(["Start", "Task_1"]);
    expect(r.drawing).toBe("../../assets/img/workflows/a.svg");
    expect(r.href).toBe("workflows/i1/");
  });

  test("a bean the store does not hold is bean-missing, a token off the diagram is node-missing", () => {
    const [r] = rows([instance("i2", { bean: "fa-gone", tokens: ["A_Removed"], updatedAt: "2026-11-01T00:00:00Z" })], []);
    expect(r.beans).toEqual([{ id: "fa-gone", found: false }]);
    expect(r.stuck).toContain("bean-missing");
    expect(r.stuck).toContain("node-missing");
    expect(r.missingNodes).toEqual(["A_Removed"]);
  });

  test("a token resting on an end event is finished, not stalled", () => {
    const [r] = rows([instance("i3", { bean: "fa-aaaa", tokens: ["End"], status: undefined as never, updatedAt: "2026-09-01T00:00:00Z" })], [bean("fa-aaaa", "completed")]);
    expect(r.finished).toBe(true);
    expect(r.stuck).not.toContain("enabled-not-taken");
    expect(r.stuck).not.toContain("bean-closed");
  });

  test("rows sort oldest move first", () => {
    const out = rows(
      [instance("new", { updatedAt: "2026-11-01T00:00:00Z" }), instance("old", { updatedAt: "2026-09-01T00:00:00Z" })],
      [],
    );
    expect(out.map((r) => r.instance)).toEqual(["old", "new"]);
  });
});

describe("routes are path IRIs", () => {
  test("only URL-segment ids get a page", () => {
    const out = rows([instance("i1", { bean: "fa-aaaa", processId: "Process_A" }), instance("i2", { bean: "bad id", processId: "Process B" })], []);
    expect(processedBeansRoutes(out)).toEqual({ processes: ["Process_A"], beans: ["fa-aaaa"] });
    expect(PB_SEGMENT.test("folio-assistant-pbv1")).toBe(true);
    expect(PB_SEGMENT.test("a/b")).toBe(false);
  });

  test("rebase re-anchors relative hrefs and leaves absolute ones", () => {
    const [r] = rebase([{ ...rows([instance("i1", {})], [])[0], drawing: "https://x/a.svg" }], "../../");
    expect(r.href).toBe("../../workflows/i1/");
    expect(r.drawing).toBe("https://x/a.svg");
  });

  test("no page builds a query-string link", () => {
    const out = rebase(rows([instance("i1", { bean: "fa-aaaa", tokens: ["Task_1"] })], [bean("fa-aaaa", "todo")]), "../");
    const all = processedBeansBody("folio-assistant", out, NOW, "../");
    const one = processedBeanBody("folio-assistant", "fa-aaaa", out, NOW, "../../");
    for (const html of [all, one]) {
      expect(html).not.toMatch(/href="[^"]*\?/);
      expect(html).not.toContain("URLSearchParams");
      expect(html).toContain('"processed-bean/" + id + "/"');
    }
    expect(one).toContain('data-pb-bean="fa-aaaa"');
  });

  test("the embedded rows cannot close the script element", () => {
    const out = rows([instance("i1", { bean: "fa-aaaa" })], [{ ...bean("fa-aaaa", "todo"), title: "</script><b>x" }]);
    expect(processedBeansBody("s", out, NOW, "../")).not.toContain("</script><b>");
  });
});
