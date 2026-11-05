/**
 * A work plan is an epic or a milestone that names the process it instantiates.
 *
 * @module schemas/sdlc/work-plan
 * @graphNode none — a reading of a work item's tags; its one kind, {@link WorkPlanKind},
 *   adds no field and no file, only the glossary's word for such a work item
 *
 * Work item folio-assistant-exrp. Owner, 2026-11-05: *"At the beginning of a
 * large process (like creating a new collaborative document, or adding
 * software features,) there should / may be a work plan. Not every process
 * needs a work plan. Docs/proposals/ once approved become workplans"*, and on
 * the card, **"Epic is the plan"**: an epic or milestone already groups work
 * items under a goal; what it lacked was the process it runs.
 *
 * ## Why tags, not front-matter fields
 *
 * The `beans` CLI rewrites front matter and drops every key it does not know
 * (measured 2026-11-05 on a scratch store: `process:` and `proposal:` were gone
 * after one `beans update`, as `$schema` was in 2026-10-06). Tags survive every
 * CLI write, and `beans list --tag process:<id>` already queries them. So a
 * plan's two facts are tags with a prefix:
 *
 * | tag | means |
 * |---|---|
 * | `process:<bpmn:process id>` | the process this plan instantiates; more than one is allowed |
 * | `proposal:<repo-relative path>` | the approved proposal this plan was made from, when there is one |
 *
 * A work item with at least one `process:` tag IS a work plan. It should be an
 * epic or a milestone, and {@link workPlanFindings} says so when it is not,
 * rather than refusing: a plan filed as a feature is a filing slip, not a
 * reason to hide it.
 *
 * A process instance names its plan (`InstanceState.plan`), as it already
 * names its work item (`bean`). The plan does not list its instances: the
 * position of work lives in the instances (ruling Q1), and a list kept on
 * both ends would disagree.
 */

import { nodeKind } from "../kg/node-kind";
import { BeanKind } from "./bean-graph.ts";

/**
 * A WORK PLAN, as a kind: a work item that names the process it runs. It adds
 * no field and no file of its own, because a plan is told apart by its
 * `process:` tag, which {@link workPlanOf} reads. It exists so the glossary
 * carries "Work plan" as a narrower "Work item" (owner, 2026-11-05: "add the
 * Work plan glossary term too"). No typology holds it; the node-kind index
 * finds it by its name rule, `process-tag`.
 */
export const WorkPlanKind = nodeKind("work-plan", [BeanKind], {}, {
  term: "Work plan",
  summary:
    "An epic or milestone that names the process it runs, with a `process:` tag, and the proposal it came from, with a `proposal:` tag. Not every process needs one; the work items under it are its work.",
});

/** The tag prefix naming a process a work plan instantiates. */
export const PLAN_PROCESS_TAG = "process:";
/** The tag prefix naming the proposal a work plan was made from. */
export const PLAN_PROPOSAL_TAG = "proposal:";
/** The work item types a work plan is filed as. */
export const PLAN_TYPES: readonly string[] = ["epic", "milestone"];

/** What a work item's tags say about it as a work plan. */
export interface WorkPlanTags {
  /** The processes it instantiates, in tag order, without duplicates. */
  readonly processes: readonly string[];
  /** The proposal it was made from, when it names one. */
  readonly proposal?: string;
}

/**
 * A work item's plan, read from its tags, or `undefined` when it names no
 * process (it is not a work plan). A `proposal:` tag alone does not make one:
 * a plan is defined by what it runs.
 */
export function workPlanOf(tags: readonly string[] | undefined): WorkPlanTags | undefined {
  const processes: string[] = [];
  let proposal: string | undefined;
  for (const raw of tags ?? []) {
    const t = raw.trim();
    if (t.startsWith(PLAN_PROCESS_TAG)) {
      const p = t.slice(PLAN_PROCESS_TAG.length).trim();
      if (p !== "" && !processes.includes(p)) processes.push(p);
    } else if (t.startsWith(PLAN_PROPOSAL_TAG) && proposal === undefined) {
      const p = t.slice(PLAN_PROPOSAL_TAG.length).trim();
      if (p !== "") proposal = p;
    }
  }
  if (processes.length === 0) return undefined;
  return { processes, ...(proposal !== undefined ? { proposal } : {}) };
}

/** A work-plan defect a reader should see: reported, never fatal. */
export interface WorkPlanFinding {
  readonly id: string;
  readonly problem: string;
}

/**
 * What is wrong with the work plans in a set of work items. Two things today:
 * a plan filed under a type that is not an epic or milestone, and a
 * `proposal:` tag on an item that names no process (a proposal with no
 * process to run is not yet a plan).
 */
export function workPlanFindings(
  items: ReadonlyArray<{ id: string; type?: string; tags?: readonly string[] }>,
): WorkPlanFinding[] {
  const out: WorkPlanFinding[] = [];
  for (const b of items) {
    const plan = workPlanOf(b.tags);
    if (plan !== undefined && !PLAN_TYPES.includes(b.type ?? "")) {
      out.push({ id: b.id, problem: `names a process (${plan.processes.join(", ")}) but is a ${b.type ?? "work item of no type"}: a work plan is an epic or a milestone` });
    }
    if (plan === undefined && (b.tags ?? []).some((t) => t.trim().startsWith(PLAN_PROPOSAL_TAG))) {
      out.push({ id: b.id, problem: "names a proposal but no process: a work plan is defined by the process it runs (`process:<id>`)" });
    }
  }
  return out;
}
