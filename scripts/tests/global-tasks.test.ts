/**
 * Global tasks — a step two or more processes share, called by bare id.
 *
 * Spec §7 of the lane / role / skill model, and the owner's three rulings of
 * 2026-10-20 ("a1 b1 c1"): a layer's shared steps are BPMN global tasks in
 * ONE `.bpmn` that holds no process (a1); a `callActivity` names one by bare
 * id, as it names a process in another file (b1); a global task may take
 * parameters, and is shared within its own layer only (c1).
 *
 * Fixture diagrams only, so a change to a real diagram cannot make these pass.
 *
 * @module scripts/tests/global-tasks.test
 * @graphNode none — a test
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractBpmn, injectBpmn } from "../../pipeline/bpmn-translate";
import { complete, enabled, startInstance } from "../../src/workflow/instance";
import { checklistFor } from "../bpmn-checklist.ts";
import { globalTaskSharedFindings } from "../lib/global-task-criteria";
import {
  GlobalTasksFile,
  holdsProcess,
  isGlobalTasksFile,
  loadGlobalTasks,
  loadProcessModel,
  UnsupportedBpmn,
} from "../../src/workflow/process-model";

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:bootstrap.processes="https://litlfred.github.io/bootstrap/0.1.0/processes/ns#"
                  xmlns:cat-harness.processes="https://litlfred.github.io/cat-harness/0.1.0/processes/ns#"
                  id="D" targetNamespace="urn:t">`;

/** The shared file: one user task with an input, one plain task without. */
const GLOBALS = `${HEAD}
  <bpmn:globalUserTask id="GT_Track" name="Open or EDIT the one&#10;tracking issue">
    <bpmn:documentation>Edit the one open issue carrying the label.</bpmn:documentation>
    <bpmn:extensionElements>
      <bootstrap.processes:skill ref="ci-health"/>
      <cat-harness.processes:policy relaxable="false"/>
    </bpmn:extensionElements>
    <bpmn:ioSpecification id="GT_Track_IO">
      <bpmn:dataInput id="GT_Track_Label" name="label"/>
      <bpmn:inputSet id="GT_Track_In"><bpmn:dataInputRefs>GT_Track_Label</bpmn:dataInputRefs></bpmn:inputSet>
      <bpmn:outputSet id="GT_Track_Out"/>
    </bpmn:ioSpecification>
  </bpmn:globalUserTask>
  <bpmn:globalScriptTask id="GT_Log" name="Append retained">
    <bpmn:extensionElements><bootstrap.processes:skill ref="render-logging"/></bpmn:extensionElements>
  </bpmn:globalScriptTask>
</bpmn:definitions>`;

/** A caller: the call names the global task, gives its input a value, and sits in a lane. */
function caller(id: string, label: string | undefined, extra = ""): string {
  const io =
    label === undefined
      ? ""
      : `
      <bpmn:ioSpecification id="IO_${id}">
        <bpmn:dataInput id="In_${id}" name="label"/>
        <bpmn:inputSet id="InSet_${id}"><bpmn:dataInputRefs>In_${id}</bpmn:dataInputRefs></bpmn:inputSet>
        <bpmn:outputSet id="OutSet_${id}"/>
      </bpmn:ioSpecification>
      <bpmn:dataInputAssociation id="A_${id}">
        <bpmn:targetRef>In_${id}</bpmn:targetRef>
        <bpmn:assignment id="As_${id}">
          <bpmn:from xsi:type="bpmn:tFormalExpression">${label}</bpmn:from>
          <bpmn:to xsi:type="bpmn:tFormalExpression">In_${id}</bpmn:to>
        </bpmn:assignment>
      </bpmn:dataInputAssociation>`;
  return `${HEAD}
  <bpmn:resource id="build-pipeline" name="Build pipeline"/>
  <bpmn:process id="${id}">
    <bpmn:laneSet id="LS_${id}">
      <bpmn:lane id="Lane_${id}" name="CI" partitionElementRef="build-pipeline">
        <bpmn:flowNodeRef>S_${id}</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Call_Track</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Call_Log</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>E_${id}</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="S_${id}"/>
    <bpmn:callActivity id="Call_Track" calledElement="GT_Track">${extra}${io}
    </bpmn:callActivity>
    <bpmn:callActivity id="Call_Log" name="Log it here" calledElement="GT_Log"/>
    <bpmn:endEvent id="E_${id}"/>
    <bpmn:sequenceFlow id="F1_${id}" sourceRef="S_${id}" targetRef="Call_Track"/>
    <bpmn:sequenceFlow id="F2_${id}" sourceRef="Call_Track" targetRef="Call_Log"/>
    <bpmn:sequenceFlow id="F3_${id}" sourceRef="Call_Log" targetRef="E_${id}"/>
  </bpmn:process>
</bpmn:definitions>`;
}

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "global-tasks-"));
  for (const [name, xml] of Object.entries(files)) writeFileSync(join(dir, name), xml);
  return dir;
}

describe("a call activity naming a global task runs as that task", () => {
  test("the step takes the global task's type, name, skill, documentation and policy; the lane stays the call's", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", "ci-health"), "b.bpmn": caller("P_B", "repo-health") });
    try {
      for (const [file, label] of [["a.bpmn", "ci-health"], ["b.bpmn", "repo-health"]] as const) {
        const m = await loadProcessModel(join(dir, file));
        const track = m.nodes.get("Call_Track")!;
        expect(track.kind).toBe("activity");
        expect(track.type).toBe("bpmn:UserTask");
        expect(track.name).toBe("Open or EDIT the one tracking issue");
        expect(track.skills).toEqual(["ci-health"]);
        expect(track.documentation).toBe("Edit the one open issue carrying the label.");
        expect(track.relaxable).toBe(false);
        expect(track.lane).toBe("CI");
        expect(track.roleRef).toBe("build-pipeline");
        expect(track.calledElement).toBeUndefined();
        expect(track.globalTask).toEqual({ id: "GT_Track", type: "bpmn:GlobalUserTask", source: join(dir, "global-tasks.bpmn"), name: "Open or EDIT the one tracking issue" });
        expect(track.inputs).toEqual({ label });
        // A script task is performed without a person, as a service task is;
        // the call's own name wins over the global task's.
        const log = m.nodes.get("Call_Log")!;
        expect(log.type).toBe("bpmn:ServiceTask");
        expect(log.name).toBe("Log it here");
        expect(log.skills).toEqual(["render-logging"]);
        expect(log.inputs).toBeUndefined();
        expect(m.children.size).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the engine enables and completes it as a single step, never a sub-process", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", "ci-health") });
    try {
      const m = await loadProcessModel(join(dir, "a.bpmn"));
      const state = startInstance(m, { id: "gt", subject: "x" });
      const first = enabled(m, state);
      expect(first.map((e) => e.node)).toEqual(["Call_Track"]);
      const step = first[0] as { skills?: string[]; calledElement?: string; globalTask?: string; inputs?: Record<string, string> };
      expect(step.skills).toEqual(["ci-health"]);
      expect(step.calledElement).toBeUndefined();
      expect(step.globalTask).toBe("GT_Track");
      expect(step.inputs).toEqual({ label: "ci-health" });
      complete(m, state, "Call_Track");
      complete(m, state, "Call_Log");
      expect(state.status).toBe("completed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the call's own extensions are added after the global task's, its documentation after the global task's", async () => {
    const extra = `
      <bpmn:documentation>Here, the label is the watch's own.</bpmn:documentation>
      <bpmn:extensionElements><bootstrap.processes:skill ref="opening-brief"/></bpmn:extensionElements>`;
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", "ci-health", extra) });
    try {
      const m = await loadProcessModel(join(dir, "a.bpmn"));
      expect(m.nodes.get("Call_Track")!.skills).toEqual(["ci-health", "opening-brief"]);
      expect(m.nodes.get("Call_Track")!.documentation).toBe("Edit the one open issue carrying the label.\n\nHere, the label is the watch's own.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a declared input the call gives no value refuses the load", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", undefined) });
    try {
      await expect(loadProcessModel(join(dir, "a.bpmn"))).rejects.toThrow(/declares input\(s\) label, and gives none of them a value/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a process of the same id wins over a global task; an id neither defines stays opaque", async () => {
    const proc = `${HEAD}
  <bpmn:process id="GT_Log"><bpmn:startEvent id="S2"/><bpmn:endEvent id="E2"/><bpmn:sequenceFlow id="G1" sourceRef="S2" targetRef="E2"/></bpmn:process>
</bpmn:definitions>`;
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", "ci-health"), "log.bpmn": proc });
    try {
      const m = await loadProcessModel(join(dir, "a.bpmn"));
      expect(m.nodes.get("Call_Log")!.calledElement).toBe("GT_Log");
      expect(m.nodes.get("Call_Log")!.globalTask).toBeUndefined();
      expect(m.children.get("Call_Log")?.id).toBe("GT_Log");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the shared file holds no process, and says so", () => {
  test("isGlobalTasksFile and holdsProcess tell it apart from a diagram", () => {
    expect(isGlobalTasksFile(GLOBALS)).toBe(true);
    expect(holdsProcess(GLOBALS)).toBe(false);
    expect(isGlobalTasksFile(caller("P_A", "x"))).toBe(false);
    expect(holdsProcess(caller("P_A", "x"))).toBe(true);
    expect(isGlobalTasksFile(`${HEAD}</bpmn:definitions>`)).toBe(false);
  });

  test("loading it as a process is refused with its own error, not as a broken diagram", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS });
    try {
      await expect(loadProcessModel(join(dir, "global-tasks.bpmn"))).rejects.toThrow(GlobalTasksFile);
      await expect(loadProcessModel(join(dir, "global-tasks.bpmn"))).rejects.toThrow(UnsupportedBpmn);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the tools that read diagrams read the shared file too", () => {
  test("loadGlobalTasks lists each global task with its kind, the type it runs as, its skill and its inputs", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS });
    try {
      const defs = await loadGlobalTasks(join(dir, "global-tasks.bpmn"));
      expect(defs.map((d) => [d.id, d.type, d.runsAs, d.skills, d.inputs])).toEqual([
        ["GT_Track", "bpmn:GlobalUserTask", "bpmn:UserTask", ["ci-health"], ["label"]],
        ["GT_Log", "bpmn:GlobalScriptTask", "bpmn:ServiceTask", ["render-logging"], []],
      ]);
      expect(defs[0]!.name).toBe("Open or EDIT the one tracking issue");
      expect(defs[0]!.documentation).toBe("Edit the one open issue carrying the label.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("bpmn-translate extracts and injects a global task's name; never a dataInput's", () => {
    const msgids = extractBpmn(GLOBALS, "global-tasks.bpmn").map((e) => e.msgid);
    expect(msgids).toContain("Open or EDIT the one tracking issue");
    expect(msgids).toContain("Append retained");
    expect(msgids).not.toContain("label");
    const fr = injectBpmn(GLOBALS, new Map([["Append retained", "Ajouter retained"]]));
    expect(fr).toContain('<bpmn:globalScriptTask id="GT_Log" name="Ajouter retained">');
  });

  test("global-task-shared reports a global task fewer than two processes call", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", "x"), "b.bpmn": caller("P_B", "y") });
    try {
      const defs = await loadGlobalTasks(join(dir, "global-tasks.bpmn"));
      const a = await loadProcessModel(join(dir, "a.bpmn"));
      const b = await loadProcessModel(join(dir, "b.bpmn"));
      expect(globalTaskSharedFindings([defs], [{ model: a }, { model: b }], dir)).toEqual([]);
      const once = globalTaskSharedFindings([defs], [{ model: a }], dir);
      expect(once.map((f) => f.where)).toEqual(["GT_Track", "GT_Log"]);
      expect(once[0]!.detail).toContain("called only by P_A");
      expect(globalTaskSharedFindings([defs], [], dir)[0]!.detail).toContain("called by no process");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a process's checklist names the shared step and the values its call gives", async () => {
    const dir = fixture({ "global-tasks.bpmn": GLOBALS, "a.bpmn": caller("P_A", "ci-health") });
    try {
      const md = checklistFor(await loadProcessModel(join(dir, "a.bpmn")), "a.bpmn");
      expect(md).toContain("- Shared step `GT_Track`, with `label` = `ci-health`.");
      expect(md).toContain("- Shared step `GT_Log`.");
      expect(md).toContain('- Record it: `workflow_complete` with `node: "Call_Track"`.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
