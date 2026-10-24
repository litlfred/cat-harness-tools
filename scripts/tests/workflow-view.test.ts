/**
 * The workflow view's join and its stuck-state classifier (bean
 * `folio-assistant-v49e`), against hand-built instances, beans and todos.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BeanNode } from "../beans.ts";
import type { InstanceState } from "../../src/workflow/instance.js";
import type { ProcessModel, ProcessNode } from "../../src/workflow/process-model.js";
import {
  beanPositions,
  beanStepsOf,
  diagramLevels,
  endNodesOf,
  GATE_REFUSALS,
  lastMoved,
  NO_INSTANCE_REASON,
  readInstances,
  STUCK_AFTER_DAYS,
  stuckStatesOf,
  todosNamedBy,
} from "../workflow-view.ts";

const NOW = new Date("2026-10-24T00:00:00Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function inst(over: Partial<InstanceState> = {}): InstanceState {
  return {
    $schema: "folio-workflow-instance/v1",
    id: "p--x",
    processId: "Process_P",
    source: "p.bpmn",
    subject: "x",
    bean: "x-1",
    tokens: ["Task_A"],
    arrivals: {},
    history: [{ at: daysBefore(1), node: "Start" }],
    status: "running",
    startedAt: daysBefore(1),
    updatedAt: daysBefore(1),
    ...over,
  };
}

function bean(over: Partial<BeanNode> = {}): BeanNode {
  return {
    id: "x-1",
    file: "beans/defs/x-1.md",
    title: "a bean",
    status: "in-progress",
    type: "task",
    priority: "normal",
    parent: "",
    blocking: [],
    createdAt: daysBefore(2),
    updatedAt: daysBefore(1),
    body: "",
    ...over,
  };
}

const kinds = (s: InstanceState, beans: BeanNode[] = [bean()], ends?: Set<string>) =>
  stuckStatesOf(s, beans, NOW, ends).map((x) => x.kind);

describe("stuck states are states, from committed data and a given now", () => {
  test("the threshold is a named week", () => {
    expect(STUCK_AFTER_DAYS).toBe(7);
  });

  test("a fresh running instance is in none", () => {
    expect(kinds(inst())).toEqual([]);
  });

  test("a token unmoved past the threshold is enabled-not-taken, and just inside it is not", () => {
    expect(kinds(inst({ updatedAt: daysBefore(STUCK_AFTER_DAYS + 1) }), [bean({ updatedAt: daysBefore(STUCK_AFTER_DAYS + 1) })])).toEqual([
      "enabled-not-taken",
    ]);
    expect(kinds(inst({ updatedAt: daysBefore(STUCK_AFTER_DAYS - 1) }))).toEqual([]);
  });

  test("with no updatedAt the newest dated history entry is when it last moved", () => {
    const s = inst({ updatedAt: undefined as unknown as string, history: [{ at: daysBefore(30), node: "S" }, { at: daysBefore(20), node: "T" }] });
    expect(lastMoved(s)).toBe(daysBefore(20));
    expect(kinds(s, [bean({ updatedAt: daysBefore(20) })])).toEqual(["enabled-not-taken"]);
  });

  test("no date anywhere is age-unknown, never fresh", () => {
    const s = inst({ updatedAt: undefined as unknown as string, history: [] });
    expect(kinds(s)).toEqual(["age-unknown"]);
  });

  test("the bean updated well after the instance last moved is bean-moved-on", () => {
    const s = inst({ updatedAt: daysBefore(3) });
    expect(kinds(s, [bean({ updatedAt: daysBefore(3) })])).toEqual([]);
    const late = inst({ updatedAt: daysBefore(20) });
    expect(kinds(late, [bean({ updatedAt: daysBefore(1) })])).toEqual(["enabled-not-taken", "bean-moved-on"]);
  });

  test("a block with no expiry on the instance's bean is blocked-without-expiry, in each of its three shapes", () => {
    const heading = bean({ body: "## Blocked on\n\n- **waits on:** x\n- **since:** 2026-10-01\n- **handoff:** ask\n" });
    expect(kinds(inst(), [heading])).toEqual(["blocked-without-expiry"]);
    const withExpiry = bean({ body: "## Blocked on\n\n- **waits on:** x\n- **since:** 2026-10-01\n- **expires:** 2026-10-30\n- **handoff:** ask\n" });
    expect(kinds(inst(), [withExpiry])).toEqual([]);
    const prose = bean({ body: "This is blocked until the owner rules." });
    expect(kinds(inst(), [prose])).toEqual(["blocked-without-expiry"]);
    const relation = [bean({ declaredBlockedBy: ["x-2"] }), bean({ id: "x-2", file: "x-2.md" })];
    expect(kinds(inst(), relation)).toEqual(["blocked-without-expiry"]);
  });

  test("a closed bean under a running instance is bean-closed", () => {
    expect(kinds(inst(), [bean({ status: "completed" })])).toEqual(["bean-closed"]);
  });

  test("running with no token anywhere is no-token; a token in a running child counts", () => {
    expect(kinds(inst({ tokens: [] }))).toEqual(["no-token"]);
    const child = inst({ id: "c", processId: "Process_C", tokens: ["Task_C"] });
    expect(kinds(inst({ tokens: ["Call_C"], children: { Call_C: child } }))).toEqual([]);
  });

  test("no status is said; a token resting on an end event is finished, not waiting", () => {
    const s = inst({ status: undefined as unknown as "running", tokens: ["End_Done"], updatedAt: daysBefore(40) });
    expect(kinds(s, [bean()], new Set(["End_Done"]))).toEqual(["no-status"]);
    expect(stuckStatesOf(s, [bean()], NOW, new Set(["End_Done"]))[0]!.detail).toContain("end event");
    // Without the diagram the end event is not known, and the age is reported.
    expect(kinds(s, [bean({ updatedAt: daysBefore(40) })])).toEqual(["no-status", "enabled-not-taken"]);
  });

  test("a completed instance is in none", () => {
    expect(kinds(inst({ status: "completed", updatedAt: daysBefore(100) }), [bean({ status: "completed" })])).toEqual([]);
  });

  test("a refused gate is not a state: it is not recorded, and says why", () => {
    expect(GATE_REFUSALS.state).toBe("not-recorded");
    expect(GATE_REFUSALS.why).toContain("nothing records the refusal");
  });
});

describe("the join: position, beans, todos", () => {
  test("every bean gets one of three positions, and none is a stated reason", () => {
    const beans = [bean(), bean({ id: "x-2" }), bean({ id: "x-3" })];
    const pos = beanPositions(beans, [inst(), inst({ id: "q", bean: "x-2", status: "completed" }), inst({ id: "r", bean: "zz", carriedBeans: ["x-1"] })]);
    expect(pos.get("x-1")).toEqual({ state: "running", instances: ["p--x", "r"] });
    expect(pos.get("x-2")).toEqual({ state: "finished", instances: ["q"] });
    expect(pos.get("x-3")).toEqual({ state: "none", reason: NO_INSTANCE_REASON });
  });

  test("todos are named by process, by step, or by a bean the instance names", () => {
    const s = inst({ tokens: ["Call_C"], children: { Call_C: inst({ id: "c", processId: "Process_C", bean: undefined }) } });
    const named = todosNamedBy(s, [
      { id: "a", summary: "by process", status: "open", processes: ["Process_P"] },
      { id: "b", summary: "by child step", status: "open", tasks: [{ process: "Process_C", task: "Task_C" }] },
      { id: "c", summary: "by bean", status: "open", references: [{ kind: "bean", id: "x-1" }] },
      { id: "d", summary: "elsewhere", status: "open", processes: ["Process_Z"], references: [{ kind: "skill", id: "x-1" }] },
    ]);
    expect(named.map((t) => [t.id, t.why])).toEqual([
      ["a", "tagged with Process_P"],
      ["b", "tagged with step Process_C▸Task_C"],
      ["c", "references x-1"],
    ]);
  });

  test("diagram levels follow a token into its running subprocess", () => {
    const child = inst({ id: "c", processId: "Process_C", tokens: ["Task_C"], history: [{ at: daysBefore(1), node: "Start_C" }] });
    const s = inst({ tokens: ["Call_C"], history: [{ at: daysBefore(2), node: "Start" }, { at: daysBefore(1), node: "Call_C" }], children: { Call_C: child } });
    const levels = diagramLevels(s);
    expect(levels.map((l) => [l.processId, l.phase, l.tokens, l.done])).toEqual([
      ["Process_P", [], ["Call_C"], ["Start"]],
      ["Process_C", ["Call_C"], ["Task_C"], ["Start_C"]],
    ]);
  });

  test("bean steps are read off the model and its subprocesses; end nodes too", () => {
    const node = (id: string, kind: ProcessNode["kind"], op?: string) => ({ id, name: id, kind, type: "bpmn:Task", ...(op ? { workPlanOp: op } : {}) }) as unknown as ProcessNode;
    const child = { nodes: new Map([["A_Close", node("A_Close", "activity", "resolve")]]), children: new Map() } as unknown as ProcessModel;
    const model = {
      nodes: new Map([
        ["A_Claim", node("A_Claim", "activity", "claim")],
        ["Task_X", node("Task_X", "activity")],
        ["End", node("End", "end")],
      ]),
      children: new Map([["Call_Close", child]]),
    } as unknown as ProcessModel;
    expect(beanStepsOf(model).map((x) => [x.op, [...x.phase, x.node].join("▸")])).toEqual([
      ["claim", "A_Claim"],
      ["resolve", "Call_Close▸A_Close"],
    ]);
    expect([...endNodesOf(model)]).toEqual(["End"]);
    expect([...endNodesOf(undefined)]).toEqual([]);
  });

  test("an unreadable or foreign file is listed with its reason, never dropped", () => {
    const dir = mkdtempSync(join(tmpdir(), "wv-"));
    try {
      writeFileSync(join(dir, "a.json"), JSON.stringify({ processId: "P", tokens: [] }));
      writeFileSync(join(dir, "b.json"), "{");
      writeFileSync(join(dir, "c.json"), JSON.stringify({ $schema: "other/v1", processId: "P", tokens: [] }));
      const r = readInstances([join(dir, "a.json"), join(dir, "b.json"), join(dir, "c.json")]);
      expect("state" in r[0]! && r[0].state.id).toBe("a");
      expect("bad" in r[1]! && r[1].bad).toBe("not readable JSON");
      expect("bad" in r[2]! && r[2].bad).toContain("other/v1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
