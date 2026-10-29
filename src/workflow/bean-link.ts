/**
 * The one place where a workflow instance and its bean become the same answer.
 *
 * `beans/` says *what is being worked on*; an instance says *where it got to*.
 * Kept apart they diverge, and a work plan that disagrees with itself is worse
 * than one that is merely coarse. Eleven activities across the six diagrams
 * carry `<cat-harness.processes:bean op="…"/>` — completing one is not a step
 * *about* the work plan, it **is** the work-plan operation, so doing one does
 * the other.
 *
 * Four operations, and the difference between them is who may decide:
 *
 * | op        | effect                                                |
 * |-----------|-------------------------------------------------------|
 * | `claim`   | status → `in-progress`. Safe and idempotent.          |
 * | `note`    | append a line to the bean body.                       |
 * | `resolve` | status → `completed`, **only if the process finished** |
 * | `archive` | move the bean into the archive, **only if the process finished and the bean is terminal** |
 *
 * `resolve` is the careful one. `AGENTS.md` is explicit that a bean is not
 * closed on someone else's judgement, and "Resolve **or re-open** the bean" is
 * the activity's actual name — whether work is done is a judgement. So it is
 * not taken on the caller's say-so: the bean completes only when the instance
 * it tracks has itself completed, which is a fact derived from the process
 * rather than an assertion. A still-running instance gets a note instead.
 * One exception: a diagram that ends in an `archive` step resolves the step
 * before it, so "finished" there means nothing is left but archive steps that
 * run straight to an end ({@link onlyArchiveLeft}). Without it, adding the
 * archive step would turn the resolve before it into a note.
 *
 * `archive` is the per-activity disposition of bean `folio-assistant-m8gz`
 * (owner, 2026-10-20: "a step op"). Since 2026-10-24 (option A) claim, resolve
 * and archive are drawn only in `Process_BeanOpen` and `Process_BeanClose`,
 * which every bean-touching process calls; `check:bean-calls` holds that.
 * Archiving is a VIEW, not a terminal state (bean `e8m3`): the bean keeps its
 * status and moves to the store's `archive/`, and `check:bean-archive` holds
 * that everything there is terminal. So the op refuses to move a bean that is
 * not `completed` or `scrapped`, or one whose process is still running, and
 * notes why instead. It records WHY in the bean, which is the one thing the
 * periodic sweep (`beans archive`) cannot: the sweep stays the floor, the op is
 * the exception (`todo-manager` § Archiving).
 *
 * Only ever `state.bean` — the bean whoever started the instance nominated.
 * This never touches a bean it was not handed.
 *
 * @module folio-assistant/workflow/bean-link
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { inputSiteReached } from "@litlfred/cat-harness/schemas/sdlc/input-trace.ts";
import { resolveBeanDefs } from "../../scripts/beans.ts";
import type { InstanceState } from "./instance.js";
import type { ProcessModel } from "./process-model.js";

export type WorkPlanOp = "claim" | "note" | "resolve" | "archive";

export const WORK_PLAN_OPS = new Set<string>(["claim", "note", "resolve", "archive"]);

/** The statuses `check:bean-archive` allows in the archive. */
const TERMINAL = new Set(["completed", "scrapped"]);

export interface BeanRef {
  id: string;
  title: string;
  status: string;
  path: string;
}

const BEANS_DIR = "beans";
/** The archive, inside the defs directory, where `beans archive` moves a bean (`beans/beans.json`: `defs/archive`). */
const ARCHIVE_DIR = "archive";

/**
 * Where to look for a bean: the store's declared `defs` directory and its
 * `archive/`, then the flat `beans/` this module was written against.
 *
 * The flat layout alone found nothing once the store moved to `beans/defs/`:
 * every claim, note and resolve then reported "not in beans/" and recorded
 * nothing. The declaration is read through `resolveBeanDefs`, the one answer
 * every bean reader shares; an unreachable store falls through to the legacy
 * directory rather than throwing out of a workflow step.
 */
function beanDirs(repoRoot: string): string[] {
  let defs: string | null = null;
  try {
    defs = resolveBeanDefs(repoRoot).dir;
  } catch {
    defs = null;
  }
  const dirs = defs ? [defs, join(defs, ARCHIVE_DIR)] : [];
  dirs.push(join(repoRoot, BEANS_DIR));
  return [...new Set(dirs)].filter((d) => existsSync(d));
}

/** Run the beans CLI; `undefined` when it is not installed or the call fails. */
function cli(repoRoot: string, args: string[]): string | undefined {
  try {
    // input-site: traced #5457f2e6 — the beans CLI, a binary outside the tree
    inputSiteReached("bean-link: beans CLI");
    return execFileSync("beans", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Find a bean by id.
 *
 * Bean filenames are `<id>--<slugged-title>.md`, so the id is a prefix rather
 * than the whole name; matching on the prefix plus the `--` separator avoids
 * `fq0b` also matching a hypothetical `fq0bx`.
 */
export function findBean(repoRoot: string, id: string): BeanRef | undefined {
  let path: string | undefined;
  for (const dir of beanDirs(repoRoot)) {
    const file = readdirSync(dir).find((f) => f.startsWith(`${id}--`) && f.endsWith(".md"));
    if (file) {
      path = join(dir, file);
      break;
    }
  }
  if (!path) return undefined;
  const body = readFileSync(path, "utf8");
  return {
    id,
    title: body.match(/^title:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, "") ?? id,
    status: body.match(/^status:\s*(.+)$/m)?.[1].trim() ?? "unknown",
    path,
  };
}

export function listBeans(repoRoot: string): BeanRef[] {
  const dir = beanDirs(repoRoot)[0];
  if (!dir) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f.includes("--"))
    .map((f) => f.split("--")[0])
    .map((id) => findBean(repoRoot, id))
    .filter((b): b is BeanRef => b !== undefined);
}

/**
 * Rewrite `status:` in the front matter, and bump `updated_at`.
 *
 * The fallback for when the CLI is absent — which is not hypothetical: this
 * repo's own session-start hook reports "beans CLI not on PATH" and reads
 * `beans/` directly. A work-plan integration that only worked with the CLI
 * installed would be off exactly when someone is picking up a fresh container.
 */
function setStatusInFile(bean: BeanRef, status: string): void {
  const body = readFileSync(bean.path, "utf8");
  if (!/^status:\s*.+$/m.test(body)) {
    throw new Error(`${bean.path} has no \`status:\` in its front matter`);
  }
  // input-site: traced #1f19f8e1 — stamps a bean being written
  inputSiteReached("bean-link: clock");
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const next = body
    .replace(/^status:\s*.+$/m, `status: ${status}`)
    .replace(/^updated_at:\s*.+$/m, `updated_at: ${stamp}`);
  writeFileSync(bean.path, next, "utf8");
}

function appendToFile(bean: BeanRef, text: string): void {
  const body = readFileSync(bean.path, "utf8").replace(/\s*$/, "\n");
  writeFileSync(bean.path, `${body}\n${text}\n`, "utf8");
}

export interface WorkPlanResult {
  /** What was done, for the caller to report. */
  summary: string;
  bean?: BeanRef;
}

/**
 * Apply a work-plan operation to the instance's bean.
 *
 * Never throws for a missing bean: an instance may legitimately have none (a
 * one-off run, a subject that is not tracked). It says so instead, because
 * silently doing nothing is how the two records drift apart again.
 */
export function applyWorkPlanOp(
  repoRoot: string,
  beanId: string | undefined,
  op: WorkPlanOp,
  opts: { note?: string; instanceCompleted?: boolean } = {},
): WorkPlanResult {
  if (!beanId) {
    return { summary: `no bean on this instance, so the ${op} step recorded nothing in beans/` };
  }
  const bean = findBean(repoRoot, beanId);
  if (!bean) {
    return { summary: `bean ${beanId} is not in beans/ — nothing recorded` };
  }

  const note = opts.note?.trim();

  if (op === "archive") return archiveBean(bean, note, opts.instanceCompleted === true);

  if (op === "note" || (op === "resolve" && !opts.instanceCompleted)) {
    const text = note ?? `Workflow step reached (${op}).`;
    if (cli(repoRoot, ["update", beanId, "--body-append", text]) === undefined) {
      appendToFile(bean, text);
    }
    return {
      summary:
        op === "note"
          ? `noted on bean ${beanId}`
          : `bean ${beanId} left ${bean.status}: the process it tracks is still running, ` +
            `so whether the work is done is not settled — noted instead of resolved`,
      bean,
    };
  }

  const status = op === "claim" ? "in-progress" : "completed";
  if (bean.status === status) {
    return { summary: `bean ${beanId} already ${status}`, bean };
  }
  if (cli(repoRoot, ["update", beanId, "-s", status]) === undefined) {
    setStatusInFile(bean, status);
  }
  if (note) {
    if (cli(repoRoot, ["update", beanId, "--body-append", note]) === undefined) {
      appendToFile(bean, note);
    }
  }
  return { summary: `bean ${beanId}: ${bean.status} → ${status}`, bean };
}

/**
 * Whether the work an instance tracks is finished, for `resolve`: the instance
 * completed, or every token waits on an `archive` step (or on a phase whose
 * own tokens do) and nothing but archive steps lies between it and an end.
 *
 * A token anywhere else means work remains, so the answer is false. That
 * includes an archive step placed mid-flow: it does not let a resolve fire
 * while later steps are still to come.
 */
export function onlyArchiveLeft(model: ProcessModel, state: InstanceState): boolean {
  if (state.status === "completed") return true;
  if (state.tokens.length === 0) return false;
  return state.tokens.every((t) => {
    const node = model.nodes.get(t);
    if (!node || !finishesAfter(model, t, new Set())) return false;
    if (node.workPlanOp === "archive") return true;
    const child = state.children?.[t];
    const childModel = model.children.get(t);
    return child !== undefined && childModel !== undefined && onlyArchiveLeft(childModel, child);
  });
}

/** Every path out of `nodeId` reaches an end through archive steps only. */
function finishesAfter(model: ProcessModel, nodeId: string, seen: Set<string>): boolean {
  if (seen.has(nodeId)) return false;
  seen.add(nodeId);
  const out = model.nodes.get(nodeId)?.outgoing ?? [];
  return (
    out.length > 0 &&
    out.every((f) => {
      const to = model.nodes.get(model.flows.get(f)?.to ?? "");
      if (!to) return false;
      if (to.kind === "end") return true;
      return to.workPlanOp === "archive" && finishesAfter(model, to.id, seen);
    })
  );
}

/**
 * The `archive` op: move a terminal bean into the store's `archive/`, with the
 * reason, once the process it tracks has finished. Anything short of that is
 * noted, never forced: an archived non-terminal bean is open work hidden from
 * every count, the invariant `check:bean-archive` exists for.
 */
function archiveBean(bean: BeanRef, note: string | undefined, instanceCompleted: boolean): WorkPlanResult {
  const dir = dirname(bean.path);
  if (basename(dir) === ARCHIVE_DIR) return { summary: `bean ${bean.id} already archived`, bean };
  const archive = join(dir, ARCHIVE_DIR);
  const why = !instanceCompleted
    ? "the process it tracks is still running"
    : !TERMINAL.has(bean.status)
      ? `it is ${bean.status}, and only a completed or scrapped bean may be archived`
      : undefined;
  if (why) {
    appendToFile(bean, `${note ? `${note} ` : ""}Archive step reached, bean not archived: ${why}.`);
    return { summary: `bean ${bean.id} left in place: ${why} — noted instead of archived`, bean };
  }
  appendToFile(bean, note ?? "Archived by the process that completed it (workflow `archive` step).");
  mkdirSync(archive, { recursive: true });
  const to = join(archive, basename(bean.path));
  renameSync(bean.path, to);
  return { summary: `bean ${bean.id} archived (${bean.status}) to ${ARCHIVE_DIR}/`, bean: { ...bean, path: to } };
}
