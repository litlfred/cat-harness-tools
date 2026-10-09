import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { complete, enabled, startInstance, type EnabledActivity } from "./instance.js";
import { loadProcessModel } from "./process-model.js";
import type { RoleGraph } from "@litlfred/cat-harness/schemas/role-graph.js";

const testRoleGraph: RoleGraph = {
  name: "test-role-graph",
  roles: [
    {
      id: "editor",
      title: "Editor",
      description: "Editor role",
      skills: ["editorial-skill-1", "editorial-skill-2"],
      actorKinds: ["agent"],
    },
    {
      id: "reviewer",
      title: "Reviewer",
      description: "Reviewer role",
      skills: ["review-skill-1", "review-skill-2"],
      actorKinds: ["agent"],
    },
  ],
};

function createWorkflowFixtures(): { dir: string; parentPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "process-walk-context-"));

  const parentXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:cat-harness.processes="https://litlfred.github.io/cat-harness/0.1.0/processes/ns#"
                  id="Defs_Parent" targetNamespace="urn:test">
  <bpmn:process id="Process_Parent" name="Parent Process">
    <bpmn:extensionElements>
      <cat-harness.processes:convention ref="conv-parent-global"/>
    </bpmn:extensionElements>
    <bpmn:laneSet id="LaneSet_Parent">
      <bpmn:lane id="Lane_Editor" name="Editorial">
        <bpmn:extensionElements>
          <cat-harness.processes:role ref="editor"/>
          <cat-harness.processes:convention ref="conv-parent-lane"/>
        </bpmn:extensionElements>
        <bpmn:flowNodeRef>Start_Parent</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Before</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Call_Sub</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_After</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Parent</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_Parent"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_Before" name="Before Child">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
      <bpmn:extensionElements>
        <cat-harness.processes:skill ref="task-before-skill"/>
        <cat-harness.processes:convention ref="conv-task-before"/>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:callActivity id="Call_Sub" name="Subprocess Phase" calledElement="Process_Child">
      <bpmn:incoming>F2</bpmn:incoming>
      <bpmn:outgoing>F3</bpmn:outgoing>
      <bpmn:extensionElements>
        <cat-harness.processes:convention ref="conv-call-activity"/>
        <cat-harness.processes:bean ref="bean-call-level"/>
      </bpmn:extensionElements>
    </bpmn:callActivity>
    <bpmn:task id="Task_After" name="After Child">
      <bpmn:incoming>F3</bpmn:incoming>
      <bpmn:outgoing>F4</bpmn:outgoing>
      <bpmn:extensionElements>
        <cat-harness.processes:skill ref="task-after-skill"/>
        <cat-harness.processes:convention ref="conv-task-after"/>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="End_Parent"><bpmn:incoming>F4</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start_Parent" targetRef="Task_Before"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_Before" targetRef="Call_Sub"/>
    <bpmn:sequenceFlow id="F3" sourceRef="Call_Sub" targetRef="Task_After"/>
    <bpmn:sequenceFlow id="F4" sourceRef="Task_After" targetRef="End_Parent"/>
  </bpmn:process>
</bpmn:definitions>`;

  const childXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:cat-harness.processes="https://litlfred.github.io/cat-harness/0.1.0/processes/ns#"
                  id="Defs_Child" targetNamespace="urn:test">
  <bpmn:process id="Process_Child" name="Child Process">
    <bpmn:extensionElements>
      <cat-harness.processes:convention ref="conv-child-global"/>
    </bpmn:extensionElements>
    <bpmn:laneSet id="LaneSet_Child">
      <bpmn:lane id="Lane_Reviewer" name="Review Lane">
        <bpmn:extensionElements>
          <cat-harness.processes:role ref="reviewer"/>
          <cat-harness.processes:convention ref="conv-child-lane"/>
        </bpmn:extensionElements>
        <bpmn:flowNodeRef>Start_Child</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Child_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Child_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Child</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_Child"><bpmn:outgoing>CF1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_Child_1" name="Child Step 1">
      <bpmn:incoming>CF1</bpmn:incoming>
      <bpmn:outgoing>CF2</bpmn:outgoing>
      <bpmn:extensionElements>
        <cat-harness.processes:skill ref="child-step1-skill"/>
        <cat-harness.processes:convention ref="conv-child-step1"/>
        <cat-harness.processes:bean ref="bean-child-step1" op="claim"/>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="Task_Child_2" name="Child Step 2">
      <bpmn:incoming>CF2</bpmn:incoming>
      <bpmn:outgoing>CF3</bpmn:outgoing>
      <bpmn:extensionElements>
        <cat-harness.processes:skill ref="child-step2-skill"/>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="End_Child"><bpmn:incoming>CF3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="CF1" sourceRef="Start_Child" targetRef="Task_Child_1"/>
    <bpmn:sequenceFlow id="CF2" sourceRef="Task_Child_1" targetRef="Task_Child_2"/>
    <bpmn:sequenceFlow id="CF3" sourceRef="Task_Child_2" targetRef="End_Child"/>
  </bpmn:process>
</bpmn:definitions>`;

  writeFileSync(join(dir, "parent.bpmn"), parentXml, "utf8");
  writeFileSync(join(dir, "child.bpmn"), childXml, "utf8");

  return { dir, parentPath: join(dir, "parent.bpmn") };
}

describe("PROCESS WALK: deterministic task context from the KG (folio-assistant-3q47)", () => {
  test("entering and leaving a subprocess overlays and REMOVES context; assert overlay is cleanly gone after child completes", async () => {
    const { dir, parentPath } = createWorkflowFixtures();
    try {
      const model = await loadProcessModel(parentPath);
      const state = startInstance(model, {
        id: "inst-overlay-test",
        subject: "test-subject",
        bean: "bean-alpha",
        carriedBeans: ["bean-alpha", "bean-beta"],
      });

      // 1. Before child: at Task_Before in parent
      const beforeEnabled = enabled(model, state, testRoleGraph);
      expect(beforeEnabled.length).toBe(1);
      const beforeStep = beforeEnabled[0] as EnabledActivity;
      expect(beforeStep.node).toBe("Task_Before");
      expect(beforeStep.role).toBe("editor");
      expect(beforeStep.context.role).toBe("editor");
      expect(beforeStep.context.roleStack).toEqual(["editor"]);
      // Only parent editor skills + task skill
      expect(beforeStep.context.effectiveSkills).toEqual([
        "editorial-skill-1",
        "editorial-skill-2",
        "task-before-skill",
      ]);
      // Only parent conventions
      expect(beforeStep.context.conventions.map((c) => c.ref)).toEqual([
        "conv-parent-global",
        "conv-parent-lane",
        "conv-task-before",
      ]);
      // Child conventions and reviewer skills MUST NOT be present
      expect(beforeStep.context.effectiveSkills).not.toContain("review-skill-1");
      expect(beforeStep.context.effectiveSkills).not.toContain("child-step1-skill");
      expect(beforeStep.context.conventions.map((c) => c.ref)).not.toContain("conv-child-global");

      // Advance into subprocess
      complete(model, state, "Task_Before");

      // 2. Inside subprocess: at Task_Child_1
      const childEnabled1 = enabled(model, state, testRoleGraph);
      expect(childEnabled1.length).toBe(1);
      const childStep1 = childEnabled1[0] as EnabledActivity;
      expect(childStep1.node).toBe("Task_Child_1");
      expect(childStep1.role).toBe("reviewer");
      expect(childStep1.context.role).toBe("reviewer");
      expect(childStep1.context.roleStack).toEqual(["editor", "reviewer"]);
      // Effective skills must overlay: outer role (editor) + inner role (reviewer) + task skill
      expect(childStep1.context.effectiveSkills).toEqual([
        "child-step1-skill",
        "editorial-skill-1",
        "editorial-skill-2",
        "review-skill-1",
        "review-skill-2",
      ]);
      // Conventions must overlay: outer process & lane & call conventions + inner process & lane & task conventions
      const childConvRefs = childStep1.context.conventions.map((c) => c.ref);
      expect(childConvRefs).toContain("conv-parent-global");
      expect(childConvRefs).toContain("conv-parent-lane");
      expect(childConvRefs).toContain("conv-call-activity");
      expect(childConvRefs).toContain("conv-child-global");
      expect(childConvRefs).toContain("conv-child-lane");
      expect(childConvRefs).toContain("conv-child-step1");

      // Carried beans include instance beans + call activity bean + child task bean
      expect(childStep1.context.carriedBeans).toEqual([
        "bean-alpha",
        "bean-beta",
        "bean-call-level",
        "bean-child-step1",
      ]);

      // Complete child step 1
      complete(model, state, "Task_Child_1");

      // At Task_Child_2 inside subprocess
      const childEnabled2 = enabled(model, state, testRoleGraph);
      expect(childEnabled2.length).toBe(1);
      const childStep2 = childEnabled2[0] as EnabledActivity;
      expect(childStep2.node).toBe("Task_Child_2");
      expect(childStep2.context.roleStack).toEqual(["editor", "reviewer"]);

      // Complete child step 2 -> child process completes, returns token to parent
      complete(model, state, "Task_Child_2");

      // 3. After child completes: at Task_After in parent
      const afterEnabled = enabled(model, state, testRoleGraph);
      expect(afterEnabled.length).toBe(1);
      const afterStep = afterEnabled[0] as EnabledActivity;
      expect(afterStep.node).toBe("Task_After");
      expect(afterStep.role).toBe("editor");
      expect(afterStep.context.role).toBe("editor");
      expect(afterStep.context.roleStack).toEqual(["editor"]);

      // ASSERT OVERLAY IS CLEANLY GONE:
      // Reviewer skills and child step skills must be completely gone
      expect(afterStep.context.effectiveSkills).toEqual([
        "editorial-skill-1",
        "editorial-skill-2",
        "task-after-skill",
      ]);
      expect(afterStep.context.effectiveSkills).not.toContain("review-skill-1");
      expect(afterStep.context.effectiveSkills).not.toContain("review-skill-2");
      expect(afterStep.context.effectiveSkills).not.toContain("child-step1-skill");
      expect(afterStep.context.effectiveSkills).not.toContain("child-step2-skill");

      // Child conventions must be completely gone
      const afterConvRefs = afterStep.context.conventions.map((c) => c.ref);
      expect(afterConvRefs).toEqual([
        "conv-parent-global",
        "conv-parent-lane",
        "conv-task-after",
      ]);
      expect(afterConvRefs).not.toContain("conv-call-activity");
      expect(afterConvRefs).not.toContain("conv-child-global");
      expect(afterConvRefs).not.toContain("conv-child-lane");
      expect(afterConvRefs).not.toContain("conv-child-step1");

      // Finish process
      complete(model, state, "Task_After");
      expect(state.status).toBe("completed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("two runs at the same task under the same role produce identical deterministic context", async () => {
    const { dir, parentPath } = createWorkflowFixtures();
    try {
      const model = await loadProcessModel(parentPath);

      // Run 1
      const state1 = startInstance(model, {
        id: "run-1",
        subject: "feature-determinism",
        bean: "folio-assistant-3q47",
        carriedBeans: ["bean-shared-1"],
      });
      complete(model, state1, "Task_Before");
      const enabledRun1 = enabled(model, state1, testRoleGraph);
      expect(enabledRun1.length).toBe(1);
      const stepRun1 = enabledRun1[0] as EnabledActivity;

      // Run 2 (separate run, separate instance ID and timestamps)
      const state2 = startInstance(model, {
        id: "run-2",
        subject: "feature-determinism",
        bean: "folio-assistant-3q47",
        carriedBeans: ["bean-shared-1"],
      });
      complete(model, state2, "Task_Before");
      const enabledRun2 = enabled(model, state2, testRoleGraph);
      expect(enabledRun2.length).toBe(1);
      const stepRun2 = enabledRun2[0] as EnabledActivity;

      // Assert identical deterministic context
      expect(stepRun1.node).toBe(stepRun2.node);
      expect(stepRun1.context).toEqual(stepRun2.context);
      expect(JSON.stringify(stepRun1.context)).toBe(JSON.stringify(stepRun2.context));
      expect(stepRun1.context.role).toBe("reviewer");
      expect(stepRun1.context.roleStack).toEqual(["editor", "reviewer"]);
      expect(stepRun1.context.effectiveSkills).toEqual(stepRun2.context.effectiveSkills);
      expect(stepRun1.context.conventions).toEqual(stepRun2.context.conventions);
      expect(stepRun1.context.carriedBeans).toEqual(stepRun2.context.carriedBeans);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the bean(s) carried at a task are part of that context", async () => {
    const { dir, parentPath } = createWorkflowFixtures();
    try {
      const model = await loadProcessModel(parentPath);

      // Start with multiple tracked / carried beans
      const state = startInstance(model, {
        id: "carried-beans-run",
        subject: "bean-tracking",
        bean: "folio-assistant-3q47",
        carriedBeans: ["bean-z-last", "bean-a-first"],
      });

      // At Task_Before: carriedBeans is deterministically sorted
      const open1 = enabled(model, state, testRoleGraph);
      const step1 = open1[0] as EnabledActivity;
      expect(step1.context.carriedBeans).toEqual([
        "bean-a-first",
        "bean-z-last",
        "folio-assistant-3q47",
      ]);

      // Complete Task_Before and add another runtime bean
      complete(model, state, "Task_Before", {
        carriedBeans: ["bean-runtime-added"],
      });

      // Child step inherits parent carried beans, call activity beans, and task-specified beans
      const open2 = enabled(model, state, testRoleGraph);
      const step2 = open2[0] as EnabledActivity;
      expect(step2.context.carriedBeans).toEqual([
        "bean-a-first",
        "bean-call-level",
        "bean-child-step1",
        "bean-runtime-added",
        "bean-z-last",
        "folio-assistant-3q47",
      ]);

      // Complete child steps
      complete(model, state, "Task_Child_1");
      complete(model, state, "Task_Child_2");

      // Back at Task_After: propagated carried beans persist with token
      const open3 = enabled(model, state, testRoleGraph);
      const step3 = open3[0] as EnabledActivity;
      expect(step3.context.carriedBeans).toContain("folio-assistant-3q47");
      expect(step3.context.carriedBeans).toContain("bean-runtime-added");
      expect(step3.context.carriedBeans).toContain("bean-child-step1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
