/**
 * Where a running workflow instance IS, what it names, and whether it is
 * stuck — the join bean `folio-assistant-v49e` asks for, computed from
 * committed state only.
 *
 * @module scripts/workflow-view
 * @covers none — it JOINS committed workflow instances with the diagrams they
 *   run and the beans and todos those name; the state visualiser renders it
 *
 * Owner, 2026-09-20: *"cat-harness folio should have function to show
 * workflow mgmt... where todso/beans are in bpmn/dmn. should have specialized
 * browser visualzier to see where process is breaking down."*
 *
 * ## A join, not a second store
 *
 * Position is read from the instance's own `tokens` (and, inside a running
 * subprocess, its child's), through `positionOf` — the same reader the engine
 * reports with. The beans a step names are the diagram's `<folio:bean op>`
 * marks, read by `loadProcessModel`, the engine's parser. Nothing here keeps
 * its own idea of where an instance is, so a sibling session reading the same
 * commit draws the same picture.
 *
 * ## Stuck states are STATES
 *
 * Bean `v49e`: *"the interesting states are the ones that look like
 * nothing"*. Each is its own {@link StuckKind}, with a sentence saying what
 * was measured, rather than a red tint over a tidy diagram:
 *
 * | kind | from |
 * |---|---|
 * | `enabled-not-taken` | a running instance holding a token, unmoved for more than {@link STUCK_AFTER_DAYS} days |
 * | `age-unknown` | a running instance with no `updatedAt` and no dated history: its age cannot be told, which is not "fresh" |
 * | `bean-moved-on` | its bean was updated more than {@link STUCK_AFTER_DAYS} days after the instance last moved |
 * | `blocked-without-expiry` | its bean carries a block with no expiry (`bean-blocking`) |
 * | `bean-closed` | its bean is completed or scrapped while the instance still runs |
 * | `no-token` | `running` with no token anywhere: nothing can be completed |
 * | `no-status` | the file records no `status` at all |
 *
 * **A refused gate is NOT among them, because it is not recorded.**
 * `workflow_complete` refuses by throwing — `complete()` raises a
 * `WorkflowError`, the hand-over screen and the preflight gate raise an
 * `Error` — and nothing writes the refusal down: the instance file is saved
 * only after a step is accepted, and the activity log gets a `task-end` only
 * then. So "this gate keeps refusing" has no data on disk, and
 * {@link GATE_REFUSALS} says so on every page rather than drawing nothing,
 * which would read as "never refused".
 *
 * ## The clock
 *
 * The age-based states need a "now", and it is passed in, never read here.
 * The pages are built at publish (`builtAtPublish`), so their reference time
 * is the publish and each page states it; a committed, content-gated file
 * would have needed the client to compute age instead (the rule `beans.ts`
 * states on `beanFindings`).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { inspect as inspectBlock } from "./check-bean-blocks.ts";
import { beanFindings, type BeanNode } from "./beans.ts";
import { INSTANCE_SCHEMA, type HistoryEntry, type InstanceState } from "../src/workflow/instance.js";
import type { ProcessModel } from "../src/workflow/process-model.js";

/**
 * How long a token may sit on an enabled step before the view calls it
 * stuck: **7 days**.
 *
 * A week, because that is the bean's own example (*"a tidy diagram for a
 * process that has been stuck for a week"*), and because the steps these
 * diagrams hold are agent turns and owner sign-offs: an agent step that has
 * not moved in a week has been abandoned, and an owner sign-off that has
 * waited a week needs asking again. Shorter would flag every sign-off over a
 * weekend. It is a threshold for SHOWING a state, never for changing one.
 */
export const STUCK_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the view can say about refused gates: nothing is recorded. */
export const GATE_REFUSALS = {
  state: "not-recorded",
  why:
    "workflow_complete refuses a step by throwing an error, and nothing records the refusal: " +
    "the instance file is written only when a step is accepted, and the activity log gets an " +
    "entry only then. So whether a gate keeps refusing cannot be read from committed state.",
} as const;

export type StuckKind =
  | "enabled-not-taken"
  | "age-unknown"
  | "bean-moved-on"
  | "blocked-without-expiry"
  | "bean-closed"
  | "no-token"
  | "no-status";

export interface StuckState {
  kind: StuckKind;
  /** What was measured, as a sentence. */
  detail: string;
}

/** One file of a `workflow-state` directory: an instance, or why it is not one. */
export type InstanceRead = { file: string; state: InstanceState } | { file: string; bad: string };

/**
 * Read instance files, keeping an unreadable one visible with its reason.
 *
 * A file is an instance when it parses and carries `processId` and a `tokens`
 * array. The `$schema` tag is not required, because `InstanceState` documents
 * it as optional on read (pre-tag files load), but a file tagged with a
 * DIFFERENT schema is not an instance and says so.
 */
export function readInstances(files: readonly string[]): InstanceRead[] {
  return files.map((file) => {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      return { file, bad: "not readable JSON" };
    }
    const o = raw as Partial<InstanceState> & { $schema?: unknown };
    if (o.$schema !== undefined && o.$schema !== INSTANCE_SCHEMA) return { file, bad: `carries $schema ${String(o.$schema)}, not ${INSTANCE_SCHEMA}` };
    if (typeof o.processId !== "string" || !Array.isArray(o.tokens)) return { file, bad: "no processId or tokens array" };
    return {
      file,
      state: {
        ...(o as InstanceState),
        id: typeof o.id === "string" ? o.id : basename(file, ".json"),
        history: Array.isArray(o.history) ? o.history : [],
        arrivals: o.arrivals ?? {},
      },
    };
  });
}

/** Every bean id an instance names of its own: `bean`, then `carriedBeans`. */
export function beansNamedBy(s: InstanceState): string[] {
  return [...new Set([...(s.bean ? [s.bean] : []), ...(s.carriedBeans ?? [])])];
}

/** When an instance last moved: `updatedAt`, else its newest dated history entry. */
export function lastMoved(s: InstanceState): string | undefined {
  if (typeof s.updatedAt === "string" && s.updatedAt !== "") return s.updatedAt;
  const dated = (s.history ?? []).map((h) => h.at).filter((a): a is string => typeof a === "string" && a !== "");
  return dated.sort().at(-1);
}

function days(ms: number): string {
  return `${Math.floor(ms / DAY_MS)} day(s)`;
}

/** Every token anywhere in the instance, its running children included. */
function hasAnyToken(s: InstanceState): boolean {
  return s.tokens.length > 0 || Object.values(s.children ?? {}).some((c) => c.status === "running" && hasAnyToken(c));
}

/**
 * The stuck states one instance is in, from committed data and `now`.
 *
 * `beans` is the store the instance's bean lives in; a bean it names that is
 * not there yields no bean state (the page lists it as "not in this store").
 * A completed instance is in none: it is finished, not stuck — and neither is
 * one whose every token rests on an end event (`endNodes`), beyond saying
 * that its status was never set.
 */
export function stuckStatesOf(
  s: InstanceState,
  beans: readonly BeanNode[],
  now: Date,
  /** The diagram's end events, when the diagram was found: a token resting on one is finished, not waiting. */
  endNodes: ReadonlySet<string> = new Set(),
): StuckState[] {
  const out: StuckState[] = [];
  const atEnd = s.tokens.length > 0 && s.tokens.every((t) => endNodes.has(t));
  if (s.status === undefined || (s.status as string) === "") {
    out.push({
      kind: "no-status",
      detail: atEnd
        ? "the instance file records no status; its token rests on an end event, so it looks finished, but nothing said so"
        : "the instance file records no status, so whether it is running cannot be read",
    });
  }
  if (s.status === "completed" || atEnd) return out;

  if (!hasAnyToken(s)) {
    out.push({ kind: "no-token", detail: "no step holds a token, so nothing can be completed and the instance cannot finish" });
  }
  const moved = lastMoved(s);
  const movedMs = moved === undefined ? Number.NaN : Date.parse(moved);
  if (Number.isNaN(movedMs)) {
    if (hasAnyToken(s)) out.push({ kind: "age-unknown", detail: "no updatedAt and no dated history, so how long the token has waited cannot be told" });
  } else if (hasAnyToken(s) && now.getTime() - movedMs > STUCK_AFTER_DAYS * DAY_MS) {
    out.push({
      kind: "enabled-not-taken",
      detail: `the token has not moved since ${moved} — ${days(now.getTime() - movedMs)}, past the ${STUCK_AFTER_DAYS}-day threshold`,
    });
  }

  const byId = new Map(beans.map((b) => [b.id, b]));
  const relation = beanFindings([...beans]).filter((f) => f.kind === "blocked-without-expiry");
  for (const id of beansNamedBy(s)) {
    const b = byId.get(id);
    if (!b) continue;
    if (b.status === "completed" || b.status === "scrapped") {
      out.push({ kind: "bean-closed", detail: `\`${id}\` is ${b.status} while this instance still runs` });
    }
    const bMs = Date.parse(b.updatedAt);
    if (!Number.isNaN(bMs) && !Number.isNaN(movedMs) && bMs - movedMs > STUCK_AFTER_DAYS * DAY_MS) {
      out.push({
        kind: "bean-moved-on",
        detail: `\`${id}\` was updated ${b.updatedAt}, ${days(bMs - movedMs)} after the instance last moved — the work went on and the position did not`,
      });
    }
    const block = inspectBlock(b, b.body);
    if (block?.verdict === "unstructured") {
      out.push({ kind: "blocked-without-expiry", detail: `\`${id}\` says it is blocked in prose, with no \`## Blocked on\` section and so no expiry` });
    } else if (block?.verdict === "incomplete" && block.missing.includes("expires")) {
      out.push({ kind: "blocked-without-expiry", detail: `\`${id}\` carries a \`## Blocked on\` section with no expiry` });
    }
    for (const f of relation.filter((r) => r.blocks === id)) {
      out.push({ kind: "blocked-without-expiry", detail: `\`${id}\` is blocked by \`${f.bean}\` and neither states an expiry` });
    }
  }
  return out;
}

/** The end events of a model, for {@link stuckStatesOf}. */
export function endNodesOf(model: Pick<ProcessModel, "nodes"> | undefined): Set<string> {
  return new Set(model ? [...model.nodes.values()].filter((n) => n.kind === "end").map((n) => n.id) : []);
}

/** A step of the diagram (or of a subprocess it calls) that names the bean. */
export interface BeanStep {
  node: string;
  name: string;
  op: string;
  /** Call activities descended through, outermost first. */
  phase: string[];
}

/** Every `<folio:bean op>` activity in a model and the subprocesses it calls. */
export function beanStepsOf(model: Pick<ProcessModel, "nodes" | "children">, phase: string[] = []): BeanStep[] {
  const out: BeanStep[] = [];
  for (const n of model.nodes.values()) {
    if (n.workPlanOp) out.push({ node: n.id, name: n.name, op: n.workPlanOp, phase });
  }
  for (const [call, child] of model.children ?? new Map()) out.push(...beanStepsOf(child, [...phase, call]));
  return out;
}

/** One level of the drawing: a process, the steps holding a token in it, the steps done. */
export interface DiagramLevel {
  processId: string;
  /** The `.bpmn` this level was drawn from, when the model was found. */
  source?: string;
  /** Call activity this level runs inside, outermost first. */
  phase: string[];
  tokens: string[];
  done: string[];
}

/**
 * The levels to draw: the instance's own process, then each RUNNING child's,
 * so a token sitting on a call activity is followed into the step it is
 * really at. The model is optional: without one the levels still carry the
 * position, and the page says the drawing was not found.
 */
export function diagramLevels(s: InstanceState, model?: Pick<ProcessModel, "id" | "source" | "children">, phase: string[] = []): DiagramLevel[] {
  const done = [...new Set((s.history ?? []).map((h: HistoryEntry) => h.node))].filter((n) => !s.tokens.includes(n));
  const own: DiagramLevel = { processId: s.processId, ...(model ? { source: model.source } : {}), phase, tokens: [...s.tokens], done };
  const deeper = s.tokens.flatMap((t) => {
    const child = s.children?.[t];
    if (!child || child.status !== "running") return [];
    return diagramLevels(child, model?.children.get(t), [...phase, t]);
  });
  return [own, ...deeper];
}

/** A todo as the join needs it: its id, words, status, and its tags. */
export interface TodoLike {
  id: string;
  summary?: string;
  status?: string;
  processes?: readonly string[];
  tasks?: ReadonlyArray<{ process: string; task: string }>;
  references?: ReadonlyArray<{ kind: string; id: string }>;
}

/** A todo the instance's process, steps or beans name, and why it matched. */
export interface NamedTodo {
  id: string;
  summary: string;
  status: string;
  why: string;
}

/** Every process id an instance runs, its children included. */
function processIdsOf(s: InstanceState): Set<string> {
  const out = new Set([s.processId]);
  for (const c of Object.values(s.children ?? {})) for (const p of processIdsOf(c)) out.add(p);
  return out;
}

/**
 * The todos an instance names: tagged with one of its processes, one of its
 * processes' tasks, or a bean it names — the three tags a todo carries that
 * point into this join (`todo/1.0.0`'s `processes`, `tasks`, `references`).
 */
export function todosNamedBy(s: InstanceState, todos: readonly TodoLike[]): NamedTodo[] {
  const processes = processIdsOf(s);
  const beans = new Set(beansNamedBy(s));
  const out: NamedTodo[] = [];
  for (const t of todos) {
    const why: string[] = [];
    const ps = (t.processes ?? []).filter((p) => processes.has(p));
    if (ps.length > 0) why.push(`tagged with ${ps.join(", ")}`);
    const ts = (t.tasks ?? []).filter((x) => processes.has(x.process));
    if (ts.length > 0) why.push(`tagged with step ${ts.map((x) => `${x.process}▸${x.task}`).join(", ")}`);
    const bs = (t.references ?? []).filter((r) => r.kind === "bean" && beans.has(r.id));
    if (bs.length > 0) why.push(`references ${bs.map((r) => r.id).join(", ")}`);
    if (why.length > 0) out.push({ id: t.id, summary: t.summary ?? "", status: t.status ?? "", why: why.join("; ") });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Where a bean stands against the instance set: the three states, never a blank. */
export type BeanPosition =
  | { state: "running"; instances: string[] }
  | { state: "finished"; instances: string[] }
  | { state: "none"; reason: string };

/** Why a bean no instance names has no position — the same sentence every time. */
export const NO_INSTANCE_REASON =
  "no workflow instance names it (as `bean` or in `carriedBeans`), and a bean's front matter " +
  "carries no process reference, so it has no position in any diagram: nobody ran " +
  "workflow_start for it, or the run was not committed";

/**
 * Each bean's position against the instances: named by a running one, named
 * only by finished ones, or by none — the third state, with its reason.
 */
export function beanPositions(beans: readonly Pick<BeanNode, "id">[], instances: readonly InstanceState[]): Map<string, BeanPosition> {
  const running = new Map<string, string[]>();
  const finished = new Map<string, string[]>();
  for (const s of instances) {
    for (const id of beansNamedBy(s)) {
      const into = s.status === "completed" ? finished : running;
      into.set(id, [...(into.get(id) ?? []), s.id]);
    }
  }
  const out = new Map<string, BeanPosition>();
  for (const b of beans) {
    const r = running.get(b.id);
    const f = finished.get(b.id);
    out.set(b.id, r ? { state: "running", instances: r } : f ? { state: "finished", instances: f } : { state: "none", reason: NO_INSTANCE_REASON });
  }
  return out;
}
