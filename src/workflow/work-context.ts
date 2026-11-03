/**
 * **Work context**: what the engine keeps of an agent's work as it takes up,
 * works and completes the tasks of a process (cat-harness#991 §4.13, Q11).
 *
 * Owner, 2026-11-03: *"when an agent takes up / processes / completes task it
 * should preserve memory/context. one Tool is a bean"*; *"the neutral
 * work_context_note is in reality a bean with metadata wrapped in the backend
 * (just not exposed to agent)"*.
 *
 * So the diagrams carry no bean markup, and the engine does at every task
 * boundary what `Process_BeanOpen`, the `op="note"` steps and
 * `Process_BeanClose` did:
 *
 * | moment | what is kept |
 * |---|---|
 * | the instance starts | *taken up*: a `todo` item becomes `in-progress` |
 * | a task completes | *step done*: the task, its outcome and the agent's note |
 * | the agent records | *note*: `work_context_note`, mid-task |
 * | the instance completes | *closed*: the item is resolved |
 *
 * The backend is the work-plan store's bean, and each line carries its
 * metadata (what, process, step, instance, who) wrapped here. The agent sees
 * none of it: it gets "what was done before on this work" and a neutral tool.
 *
 * **Which processes the engine does this for.** A diagram that still draws
 * the work plan itself (an `op` step, a call to `Process_BeanOpen` or
 * `Process_BeanClose`) keeps doing it the drawn way; the engine stays out, so
 * nothing is done twice. Once its markup is removed (§4.13 step 17), the
 * engine takes over. {@link drawsWorkPlan} is that test.
 *
 * **Which store.** The deployment's `stores["work-context"]`: `work-plan` (the
 * default, the work-plan store's bean) or `none` (a run that tests a cold
 * start). Anything else is refused, never answered with the default.
 *
 * @module folio-assistant/workflow/work-context
 */
import type { ProcessModel } from "./process-model.js";
import { TERMINAL_STATUSES, type WorkPlanStore } from "./work-plan-store.js";
import type { ChosenStore } from "./work-plan-store-select.js";

/** The store Role, as a deployment's `stores` map names it. */
export const WORK_CONTEXT_ROLE = "work-context";

/** The `stores["work-context"]` values this toolset implements. */
export const WORK_CONTEXT_TOOLS = ["work-plan", "none"] as const;

export type WorkContextKind = "taken-up" | "step-done" | "note" | "closed";

export interface WorkContextMeta {
  kind: WorkContextKind;
  process: string;
  instance: string;
  /** The step, for `step-done` and a `note` made while a step is enabled. */
  node?: string;
  by: string;
}

/** Where the engine keeps work context here: the store, or nothing (`none`). */
export type WorkContextTarget = { store: WorkPlanStore; tool: string } | { none: true; tool: "none" };

/**
 * The work-context store, from the work-plan store already chosen for the
 * deployment. Throws on a Tool this toolset does not implement.
 */
export function workContextFrom(chosen: ChosenStore): WorkContextTarget {
  const tool = chosen.stores?.[WORK_CONTEXT_ROLE] ?? "work-plan";
  if (tool === "none") return { none: true, tool: "none" };
  if (tool === "work-plan") return { store: chosen.store, tool: `work-plan:${chosen.tool}` };
  throw new Error(
    `deployment ${chosen.deployment ?? "(none)"} keeps work context in "${tool}", which this toolset does not implement ` +
      `(it has: ${WORK_CONTEXT_TOOLS.join(", ")}). Refused rather than keeping it somewhere else.`,
  );
}

/** One line: the metadata the backend keeps, then the text. Never more than one line. */
export function contextLine(meta: WorkContextMeta, text: string): string {
  const where = meta.node ? `${meta.process}/${meta.node}` : meta.process;
  const body = text.replace(/\s+/g, " ").trim();
  return `[work context: ${meta.kind} · ${where} · ${meta.instance} · ${meta.by}]${body ? ` ${body}` : ""}`;
}

/**
 * Whether a process (or any phase it calls) still draws the work plan itself:
 * an explicit `op` step. A step that only writes to the Beans store
 * (`worksBean`, Q-BR-8 F) does not count; it is the neutral marking.
 */
export function drawsWorkPlan(model: ProcessModel, seen = new Set<ProcessModel>()): boolean {
  if (seen.has(model)) return false;
  seen.add(model);
  for (const n of model.nodes.values()) if (n.workPlanOp && !n.worksBean) return true;
  for (const child of model.children.values()) if (drawsWorkPlan(child, seen)) return true;
  return false;
}

export interface WorkContextResult {
  summary: string;
}

const NOT_STARTED = new Set(["todo"]);

/** The instance started: keep it, and take a `todo` item up. */
export function takeUp(target: WorkContextTarget, item: string | undefined, meta: Omit<WorkContextMeta, "kind">, text: string): WorkContextResult {
  return keep(target, item, { ...meta, kind: "taken-up" }, text, (store, got) =>
    NOT_STARTED.has(got.status) ? { status: "in-progress" } : undefined,
  );
}

/** A task completed, or the agent recorded something. */
export function record(target: WorkContextTarget, item: string | undefined, meta: WorkContextMeta, text: string): WorkContextResult {
  return keep(target, item, meta, text, () => undefined);
}

/** The instance completed: keep it, and resolve the item unless it is already finished. */
export function closeOut(target: WorkContextTarget, item: string | undefined, meta: Omit<WorkContextMeta, "kind">, text: string): WorkContextResult {
  return keep(target, item, { ...meta, kind: "closed" }, text, (store, got) =>
    TERMINAL_STATUSES.has(got.status) ? undefined : { status: "completed" },
  );
}

function keep(
  target: WorkContextTarget,
  item: string | undefined,
  meta: WorkContextMeta,
  text: string,
  change: (store: WorkPlanStore, got: { status: string }) => { status: string } | undefined,
): WorkContextResult {
  if ("none" in target) return { summary: "work context not kept: this deployment keeps none" };
  if (!item) return { summary: "work context not kept: this instance tracks no item" };
  const { store } = target;
  const got = store.get(item);
  if (got.state !== "hit") return { summary: `work context not kept: item ${item} is not in the store` };
  const to = change(store, got.bean);
  let moved = "";
  if (to) {
    const r = store.update(item, to, got.version);
    if (r.state !== "updated") {
      return { summary: `work context for ${item} not kept: ${r.state === "refused" ? `${r.why}: ${r.detail}` : "the item is gone"}` };
    }
    moved = `, ${got.bean.status} → ${to.status}`;
  }
  const noted = store.note(item, contextLine(meta, text), meta.by);
  if (noted.state !== "noted") return { summary: `work context not kept: item ${item} is gone` };
  return { summary: `work context kept on ${item} (${meta.kind}${moved})` };
}
