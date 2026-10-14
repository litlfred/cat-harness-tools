/**
 * cat-harness-tools' own Tool nodes — the `tools` graph of the implementation
 * layer.
 *
 * @module cat-harness-tools/tools
 * @graphNode tool
 *
 * Reached through tool auto-discovery ({@link ./discover.ts}, bean `p0za`),
 * never by an import, like every other instance's `tools` graph.
 *
 * ## Why a Tool node lives here and not in `cat-harness/tools/`
 *
 * A Tool whose `invoke.inProcess.module` is code in THIS layer is declared
 * here, beside that code (owner, 2026-10-14: "Move the node to tools"). Its
 * module path is then instance-relative to this layer, so it names no
 * directory above or beside the instance that declares it. Declared in
 * cat-harness, the same node had to spell `../cat-harness-tools/src/…`, which
 * `check:import-direction` reads, correctly, as cat-harness reaching a layer
 * its `needs` does not name.
 *
 * Tools invoked by shell (`bun run cat-harness-tools/scripts/…`) stay declared
 * in cat-harness: a command line is not a module path, and the `w2gr` split
 * (definitions there, implementations here) still holds for them.
 *
 * ## `bpmn-engine` — bean `folio-assistant-cy4p`
 *
 * Owner ruling 2026-10-10 ("both"): the engine other instances discover and
 * depend on, not an implementation detail of one MCP server. Its checklist
 * projection, `bpmn-checklist`, is invoked by shell and stays in cat-harness.
 */
import { defineTool, type ToolDefinition } from "@litlfred/cat-harness/schemas/tool.js";
import { toolTypeIri } from "@litlfred/cat-harness/schemas/tool-types.js";

export function tools(baseUrl?: string): ToolDefinition[] {
  const B = baseUrl ?? "";
  const t = (n: Parameters<typeof toolTypeIri>[1]): string => toolTypeIri(B, n);

  return [
    defineTool({
      id: "bpmn-engine",
      title: "BPMN workflow engine",
      description:
        "Run a declared BPMN process as an instance: `workflow_start` opens one for a subject, `workflow_next` reports what is enabled, `workflow_complete` records a step or answers a decision (a DMN-computed one from `facts`) and REFUSES a step that is not enabled. State is committed under the work plan, so which edge was taken is a record, not a memory.",
      install: { none: true },
      // The registrar the MCP server loads. `inProcess.module` is relative to
      // the instance that declares the node, which is this one.
      invoke: { inProcess: { module: "src/tools/workflow.ts", register: "registerWorkflowTools" }, mcp: { tool: "workflow_*" } },
      io: {
        inputs: [
          { name: "process", schema: t("ProcessId"), required: true, description: "The process to run: a diagram's file stem or its `bpmn:process` id." },
          { name: "node", schema: t("NodeId"), required: false, description: "The step or decision to complete, as `workflow_next` reported it." },
        ],
        outputs: [
          { name: "enabled", schema: t("NodeId"), description: "What may be worked next, after each call." },
        ],
      },
      satisfies: ["process-state"],
      selection: {
        when: "Work follows a declared process and its order must be enforced and recorded: a step done out of order should be refused, not just discouraged.",
        limits: "Reached over MCP; an agent without the server can walk the generated checklist (`bpmn-checklist`) by hand, but nothing then refuses a wrong turn.",
        cost: "One diagram load per call; state is a small committed file.",
      },
      requires: { runtime: ["bun"], network: false },
    }),
  ];
}
