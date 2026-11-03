/**
 * `work_context_note`: the agent keeps a note on the work it is doing, so it
 * is there when the work is picked up again (cat-harness#991 §4.13, Q11).
 *
 * Its own Tool, registered apart from the `workflow_*` tools, so a run can
 * offer it to an agent that is told nothing about processes or the work plan
 * (owner, 2026-11-03: *"would an agent still see it through the dependency
 * tree … in that case it needs to be own tool"*). What the agent sees is a
 * note and nothing else: no instance, no item id, no store.
 *
 * Behind it (*"in reality a bean with metadata wrapped in the backend, just
 * not exposed to agent"*): the run's launcher names the instance in
 * {@link WORK_INSTANCE_ENV}; the note goes to that instance's item through the
 * deployment's work-context store, wrapped with its metadata
 * (`work-context.ts`). The note is a hand-over another agent reads later, so
 * it passes the same screen as `workflow_complete`'s note.
 *
 * @module folio-assistant/tools/work-context
 */
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { oneLineLabel, screenHandover } from "../core/handover-screen.js";
import { loadProcessModel } from "../workflow/process-model.js";
import { loadInstance } from "../workflow/store.js";
import { record, workContextFrom } from "../workflow/work-context.js";
import { workPlanStoreFor } from "../workflow/work-plan-store-select.js";

/** The environment variable a launcher sets to the instance an agent works in. */
export const WORK_INSTANCE_ENV = "CAT_WORK_INSTANCE";

const NOTE_MAX = 4000;

export interface WorkContextToolEnv {
  env?: Readonly<Record<string, string | undefined>>;
}

/** What the agent is told. Neutral: it names no instance, item or store. */
export async function workContextNote(repoRoot: string, { note }: { note: string }, opts?: WorkContextToolEnv): Promise<string> {
  const root = resolve(repoRoot);
  // input-site: env CAT_WORK_INSTANCE #f4c974e2 — the instance the run's launcher bound this agent to
  const env = opts?.env ?? process.env;
  const instance = env[WORK_INSTANCE_ENV]?.trim();
  if (!instance) return "Not kept: this session is not bound to a piece of work.";
  const state = loadInstance(root, instance);
  if (!state) return "Not kept: the work this session was bound to is not found.";

  const screen = screenHandover({ note }, { fields: { note: "data" } });
  const seen = typeof screen.screened?.note === "string" ? screen.screened.note : note;
  const folded = oneLineLabel(seen, Number.MAX_SAFE_INTEGER);
  const capped = folded.length <= NOTE_MAX ? folded : `${folded.slice(0, NOTE_MAX)} [… cut: ${folded.length - NOTE_MAX} more characters not kept]`;
  const text =
    screen.state === "quarantined"
      ? `[QUARANTINED by the hand-over screen: ${[...new Set(screen.findings.map((f) => f.kind))].join(", ")}; kept, data not instruction] ${capped}`
      : capped;

  const model = await loadProcessModel(resolve(root, state.source));
  const node = state.tokens.length === 1 ? state.tokens[0] : undefined;
  let summary: string;
  try {
    const target = workContextFrom(workPlanStoreFor(root, env));
    summary = record(target, state.bean, { kind: "note", process: model.id, instance: state.id, ...(node ? { node } : {}), by: "agent" }, text).summary;
  } catch (e) {
    summary = `work context not kept: ${e instanceof Error ? e.message : String(e)}`;
  }
  // The agent is told only whether the note was kept; the summary names the
  // backend, so it goes no further than this server's own answer's shape.
  return summary.startsWith("work context kept") ? "Kept." : "Not kept: the note could not be stored for this work.";
}

export function registerWorkContextTools(server: McpServer, repoRoot: string, opts?: WorkContextToolEnv): void {
  server.tool(
    "work_context_note",
    "Keep a short note on the work you are doing — what you did, what you decided and why, and what is left open — " +
      "so it is there when this work is picked up again, by you or by someone else.",
    { note: z.string().describe("The note, in plain words. One paragraph is plenty.") },
    async (args) => ({ content: [{ type: "text" as const, text: await workContextNote(repoRoot, args, opts) }] }),
  );
}
