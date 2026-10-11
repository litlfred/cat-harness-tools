#!/usr/bin/env bun
/**
 * A checklist projection of every BPMN diagram — bean `folio-assistant-cy4p`,
 * owner ruling 2026-10-10 ("both": the engine as a Tool node, and a generated
 * checklist per diagram).
 *
 * **A rendering, never an authority.** The checklist is the diagram walked as
 * a state machine, emitted FROM the `.bpmn`; it says so in its own first
 * line, and `--check` fails when one is stale — the discipline
 * `render:bpmn:check` holds the SVGs to. The engine (`workflow_start` /
 * `workflow_next` / `workflow_complete`) stays the authority on which edge was
 * taken: every step names the call that records it, so a wrong turn is
 * visible and refusable rather than a memory of a list.
 *
 * How it follows the edges (the bean's design):
 *   1. each task is a step that ENDS with `next:` naming the node(s) it flows
 *      to by id — order is never inferred from position;
 *   2. a decision (exclusive gateway with more than one way out) is a
 *      "Decide" step: each branch's label → where it goes, or, when a DMN
 *      table computes it, the table by id and the `facts` call; a parallel
 *      fork is "do all of …", a join is "wait for all of …";
 *   3. start and end events are the entry and exit lines.
 * An agent with no MCP can walk 1–3 by hand; 4 (the calls) makes it auditable.
 *
 * Usage:
 *   bun run cat bpmn:checklist          # write <out>/<stem>.checklist.md for every diagram
 *   bun run cat bpmn:checklist:check    # exit 1 if any is stale or missing
 *   … [--out <dir>]                      # default: the harness site's assets/workflows/checklists
 *
 * @module scripts/bpmn-checklist
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { instanceRootsIn, repoRootFor, siteDirFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { loadProcessModel, type ProcessModel, type ProcessNode } from "../src/workflow/process-model.ts";
import { workflowFiles } from "./known-skills.js";
import { HARNESS_ROOT } from "./lib/roots.ts";

const GENERATOR = "cat-harness-tools/scripts/bpmn-checklist.ts";

/** Nodes in walk order: breadth-first from the start events, outgoing flows in document order. */
function walkOrder(model: ProcessModel): ProcessNode[] {
  const seen = new Set<string>();
  const order: ProcessNode[] = [];
  const queue = [...model.startNodes];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const node = model.nodes.get(id);
    if (!node) continue;
    seen.add(id);
    order.push(node);
    for (const f of node.outgoing) {
      const to = model.flows.get(f)?.to;
      if (to && !seen.has(to)) queue.push(to);
    }
  }
  // Anything unreachable from a start event is still listed — silently
  // dropping it would make the checklist disagree with the diagram.
  for (const n of model.nodes.values()) if (!seen.has(n.id)) order.push(n);
  return order;
}

const firstSentence = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return (m ? m[1]! : t).slice(0, 300);
};

function ref(model: ProcessModel, id: string): string {
  const n = model.nodes.get(id);
  return n && n.name && n.name !== id ? `\`${id}\` (${n.name})` : `\`${id}\``;
}

function nextLine(model: ProcessModel, node: ProcessNode): string {
  const tos = node.outgoing.map((f) => model.flows.get(f)?.to).filter((x): x is string => !!x);
  return tos.length === 0 ? "next: — (no outgoing flow)" : `next: ${tos.map((t) => `→ ${ref(model, t)}`).join(", ")}`;
}

/** The checklist text for one diagram. `sourceRel` is how the header names the `.bpmn`. */
export function checklistFor(model: ProcessModel, sourceRel: string): string {
  const out: string[] = [];
  out.push(
    `<!-- GENERATED from ${sourceRel} by ${GENERATOR}. Do not edit: change the diagram and regenerate (bun run cat bpmn:checklist). -->`,
    "",
    `# Checklist — ${model.name || model.id}`,
    "",
    `> **Generated, and not the authority.** This is \`${sourceRel}\` (process \`${model.id}\`) walked as a state machine. ` +
      "The diagram and the workflow engine decide; this list only reads them. Follow the `next:` line of each step rather than the order on the page, " +
      "and record each step with the call it names, so the engine's committed state — not this list — says which edge was taken.",
    "",
  );
  const doc = firstSentence(model.documentation);
  if (doc) out.push(doc, "");
  let step = 0;
  for (const n of walkOrder(model)) {
    const head = n.name && n.name !== n.id ? `${n.name} (\`${n.id}\`)` : `\`${n.id}\``;
    if (n.kind === "start") {
      out.push(`## Begin — ${head}`, "");
      out.push(`- Begin here${firstSentence(n.documentation) ? `: ${firstSentence(n.documentation)}` : "."}`);
      out.push(`- Call \`workflow_start\` with \`process: "${model.id}"\` and the subject this run is about; keep the instance id it returns.`);
      out.push(`- ${nextLine(model, n)}`, "");
    } else if (n.kind === "end") {
      out.push(`## Done — ${head}`, "");
      out.push(`- The instance completes here${firstSentence(n.documentation) ? `: ${firstSentence(n.documentation)}` : "."} \`workflow_next\` then reports nothing enabled — that, not this line, is the record of completion.`, "");
    } else if (n.kind === "activity") {
      step += 1;
      out.push(`### ${step}. ${head}`, "");
      if (n.lane) out.push(`- Who: the \`${n.lane}\` lane${n.roleRef ? ` (role \`${n.roleRef}\`)` : ""}.`);
      if (n.skills.length > 0) out.push(`- Skill: ${n.skills.map((s) => `\`${s}\``).join(", ")}.`);
      const d = firstSentence(n.documentation);
      if (d) out.push(`- What: ${d}`);
      if (n.calledElement) {
        out.push(`- A subprocess (\`${n.calledElement}\`): \`workflow_next\` reports its own steps; complete those — this call activity itself is not completable.`);
      } else {
        out.push(`- Record it: \`workflow_complete\` with \`node: "${n.id}"\`.`);
      }
      out.push(`- ${nextLine(model, n)}`, "");
    } else if (n.kind === "exclusive" && n.outgoing.length > 1) {
      out.push(`### Decide — ${head}`, "");
      const d = firstSentence(n.documentation);
      if (d) out.push(`- ${d}`);
      if (n.decisionRef) {
        out.push(`- Computed by the DMN table \`${n.decisionRef}\`: call \`workflow_complete\` with \`node: "${n.id}"\` and the \`facts\` it reads — the table returns the branch; pass no \`outcome\`.`);
      } else {
        out.push(`- Call \`workflow_complete\` with \`node: "${n.id}"\` and \`outcome\` set to the label that holds:`);
      }
      for (const f of n.outgoing) {
        const flow = model.flows.get(f);
        if (!flow) continue;
        out.push(`  - ${flow.name ? `«${flow.name}»` : "(unlabelled branch)"} → ${ref(model, flow.to)}`);
      }
      out.push("");
    } else if (n.kind === "parallel" && n.outgoing.length > 1) {
      out.push(`### Do all of — ${head}`, "");
      out.push(`- Work every branch; none is optional. ${nextLine(model, n).replace("next: ", "Branches: ")}`);
      out.push("- The engine passes through this gateway itself; there is nothing to record here.", "");
    } else {
      // A converging gateway (exclusive merge or parallel join).
      out.push(`### ${n.kind === "parallel" ? "Wait for all" : "Merge"} — ${head}`, "");
      out.push(
        n.kind === "parallel"
          ? `- Continue only when every one of the ${n.incoming.length} incoming branches is done; the engine passes through itself.`
          : "- Nothing to do or decide: the paths meet here and the engine passes through.",
      );
      out.push(`- ${nextLine(model, n)}`, "");
    }
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

/** Every `.bpmn` in every instance of the repository, by its declared knowledge-graph directories. */
export function bpmnSources(root: string = HARNESS_ROOT): string[] {
  const all = new Set<string>();
  for (const inst of instanceRootsIn(repoRootFor(root))) for (const f of workflowFiles(inst)) if (f.endsWith(".bpmn")) all.add(f);
  return [...all].sort();
}

export const defaultOutDir = (root: string = HARNESS_ROOT): string => join(root, siteDirFor(root), "assets", "workflows", "checklists");

/** Render every diagram; returns `{ file, text }` per checklist, and the diagrams that could not be loaded. */
export async function renderAll(sources: readonly string[], repoRoot: string): Promise<{ files: { name: string; text: string }[]; failed: string[] }> {
  const files: { name: string; text: string }[] = [];
  const failed: string[] = [];
  const names = new Set<string>();
  for (const src of sources) {
    let model: ProcessModel;
    try {
      model = await loadProcessModel(src);
    } catch (e) {
      failed.push(`${relative(repoRoot, src)}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      continue;
    }
    const name = `${basename(src, ".bpmn")}.checklist.md`;
    if (names.has(name)) {
      failed.push(`${relative(repoRoot, src)}: a second diagram named ${basename(src)} would overwrite ${name}`);
      continue;
    }
    names.add(name);
    files.push({ name, text: checklistFor(model, relative(repoRoot, src).split("\\").join("/")) });
  }
  return { files, failed };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const oi = argv.indexOf("--out");
  const outDir = oi >= 0 ? resolve(argv[oi + 1]!) : defaultOutDir();
  const repoRoot = repoRootFor(HARNESS_ROOT);
  const sources = bpmnSources();
  if (sources.length === 0) {
    console.error("bpmn-checklist: no .bpmn sources found in any declared knowledge-graph directory — refusing to report a clean run over nothing");
    process.exit(2);
  }
  const { files, failed } = await renderAll(sources, repoRoot);
  for (const f of failed) console.error(`? ${f}`);
  if (check) {
    const stale = files.filter((f) => !existsSync(join(outDir, f.name)) || readFileSync(join(outDir, f.name), "utf8") !== f.text).map((f) => f.name);
    const wanted = new Set(files.map((f) => f.name));
    const orphans = existsSync(outDir) ? readdirSync(outDir).filter((n) => n.endsWith(".checklist.md") && !wanted.has(n)) : [];
    for (const s of stale) console.error(`✗ ${s} is stale or missing — run \`bun run cat bpmn:checklist\``);
    for (const o of orphans) console.error(`✗ ${o} has no diagram — remove it`);
    if (stale.length + orphans.length > 0) process.exit(1);
    if (failed.length > 0) process.exit(2);
    console.log(`✓ ${files.length} checklist(s) current in ${relative(repoRoot, outDir)}`);
  } else {
    mkdirSync(outDir, { recursive: true });
    for (const f of files) writeFileSync(join(outDir, f.name), f.text);
    console.log(`bpmn-checklist: ${files.length} checklist(s) written to ${relative(repoRoot, outDir)}${failed.length ? `; ${failed.length} diagram(s) could not be loaded` : ""}`);
    if (failed.length > 0) process.exit(2);
  }
}
