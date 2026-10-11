/**
 * The checklist projection follows the EDGES, not the page (bean
 * `folio-assistant-cy4p`): every step names where it goes next, a decision
 * names each labelled branch, a parallel fork names every branch and its join,
 * and the text says it is generated.
 *
 * @module scripts/tests/bpmn-checklist.test
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadProcessModel } from "../../src/workflow/process-model.ts";
import { checklistFor, renderAll } from "../bpmn-checklist.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const XML = (reviewName = "Review the draft") => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:cat-harness.processes="https://litlfred.github.io/cat-harness/0.1.0/processes/ns#"
                  id="Defs" targetNamespace="urn:test">
  <bpmn:process id="Process_Review" name="Review">
    <bpmn:startEvent id="Start" name="A draft exists"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_Review" name="${reviewName}">
      <bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing>
      <bpmn:extensionElements><cat-harness.processes:skill ref="review-skill"/></bpmn:extensionElements>
    </bpmn:task>
    <bpmn:exclusiveGateway id="GW_Ok" name="Acceptable?">
      <bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F_yes</bpmn:outgoing><bpmn:outgoing>F_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:parallelGateway id="Fork"><bpmn:incoming>F_yes</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing><bpmn:outgoing>F4</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:task id="Task_Publish" name="Publish">
      <bpmn:incoming>F3</bpmn:incoming><bpmn:outgoing>F5</bpmn:outgoing>
      <bpmn:extensionElements><cat-harness.processes:skill ref="publish-skill"/></bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="Task_Announce" name="Announce">
      <bpmn:incoming>F4</bpmn:incoming><bpmn:outgoing>F6</bpmn:outgoing>
      <bpmn:extensionElements><cat-harness.processes:skill ref="announce-skill"/></bpmn:extensionElements>
    </bpmn:task>
    <bpmn:parallelGateway id="Join"><bpmn:incoming>F5</bpmn:incoming><bpmn:incoming>F6</bpmn:incoming><bpmn:outgoing>F7</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:endEvent id="End_Done" name="Published"><bpmn:incoming>F7</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="End_Rejected" name="Rejected"><bpmn:incoming>F_no</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Task_Review"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_Review" targetRef="GW_Ok"/>
    <bpmn:sequenceFlow id="F_yes" name="yes" sourceRef="GW_Ok" targetRef="Fork"/>
    <bpmn:sequenceFlow id="F_no" name="no" sourceRef="GW_Ok" targetRef="End_Rejected"/>
    <bpmn:sequenceFlow id="F3" sourceRef="Fork" targetRef="Task_Publish"/>
    <bpmn:sequenceFlow id="F4" sourceRef="Fork" targetRef="Task_Announce"/>
    <bpmn:sequenceFlow id="F5" sourceRef="Task_Publish" targetRef="Join"/>
    <bpmn:sequenceFlow id="F6" sourceRef="Task_Announce" targetRef="Join"/>
    <bpmn:sequenceFlow id="F7" sourceRef="Join" targetRef="End_Done"/>
  </bpmn:process>
</bpmn:definitions>`;

async function checklist(xml = XML()): Promise<string> {
  const d = mkdtempSync(join(tmpdir(), "bpmn-checklist-"));
  dirs.push(d);
  writeFileSync(join(d, "review.bpmn"), xml);
  return checklistFor(await loadProcessModel(join(d, "review.bpmn")), "processes/review.bpmn");
}

describe("the checklist projection", () => {
  test("says, in its own text, that it is generated and not the authority", async () => {
    const t = await checklist();
    expect(t.split("\n")[0]).toMatch(/^<!-- GENERATED from processes\/review\.bpmn by cat-harness-tools\/scripts\/bpmn-checklist\.ts\. Do not edit/);
    expect(t).toContain("**Generated, and not the authority.**");
    expect(t).toContain("process `Process_Review`");
  });

  test("the start event is an entry line naming workflow_start", async () => {
    const t = await checklist();
    expect(t).toContain("## Begin — A draft exists (`Start`)");
    expect(t).toContain('`workflow_start` with `process: "Process_Review"`');
  });

  test("every task names the call that records it and the node it flows to — by id, never by position", async () => {
    const t = await checklist();
    for (const [id, next] of [["Task_Review", "GW_Ok"], ["Task_Publish", "Join"], ["Task_Announce", "Join"]]) {
      expect(t).toContain(`\`workflow_complete\` with \`node: "${id}"\``);
      const block = t.slice(t.indexOf(`(\`${id}\`)`));
      expect(block.slice(0, block.indexOf("\n\n", block.indexOf("next:")))).toContain(`next: → \`${next}\``);
    }
    expect(t).toContain("- Skill: `review-skill`.");
  });

  test("a decision is a Decide step naming each labelled branch and where it goes", async () => {
    const t = await checklist();
    expect(t).toContain("### Decide — Acceptable? (`GW_Ok`)");
    expect(t).toContain('`node: "GW_Ok"` and `outcome` set to the label that holds');
    expect(t).toContain("«yes» → `Fork`");
    expect(t).toContain("«no» → `End_Rejected` (Rejected)");
  });

  test("a parallel fork names every branch; its join waits for all of them", async () => {
    const t = await checklist();
    expect(t).toContain("### Do all of — `Fork`");
    expect(t).toContain("Branches: → `Task_Publish` (Publish), → `Task_Announce` (Announce)");
    expect(t).toContain("### Wait for all — `Join`");
    expect(t).toContain("every one of the 2 incoming branches");
  });

  test("both end events are exit lines", async () => {
    const t = await checklist();
    expect(t).toContain("## Done — Published (`End_Done`)");
    expect(t).toContain("## Done — Rejected (`End_Rejected`)");
  });

  test("a changed diagram changes the checklist — what the :check gate compares", async () => {
    const d = mkdtempSync(join(tmpdir(), "bpmn-checklist-"));
    dirs.push(d);
    writeFileSync(join(d, "review.bpmn"), XML());
    const before = (await renderAll([join(d, "review.bpmn")], d)).files[0]!;
    writeFileSync(join(d, "review.bpmn"), XML("Review the draft twice"));
    const after = (await renderAll([join(d, "review.bpmn")], d)).files[0]!;
    expect(before.name).toBe("review.checklist.md");
    expect(after.text).not.toBe(before.text);
    expect(after.text).toContain("Review the draft twice");
  });
});
