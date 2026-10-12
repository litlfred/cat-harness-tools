#!/usr/bin/env bun
/**
 * How many recorded workflow instances there are against how many merges —
 * computed, never quoted. Bean `folio-assistant-5ulq`.
 *
 * ## Why this is a command
 *
 * `process-state` §"Naming it is not the same as recording it" cited bean
 * `vlhk`'s count — 54 merges in one window and an empty instance directory —
 * as prose. Two weeks later the same breach measured 755 merges against 9
 * instances (`5ulq`, 2026-10-02), and the quoted 54 had gone stale by ~14×
 * with nothing to say so. A number that matters is computed by a command, so
 * whoever reads it reads today's.
 *
 * ## Advisory, by ruling
 *
 * The owner, 2026-10-10 (`5ulq`, options gate / advisory / scrap): **make it
 * advisory**. So this REPORTS the gap and never fails on it: a `finding` exits
 * 0. It is not wired into CI as a gate, and must not be — that would be the
 * "gate it" option, which was not chosen.
 *
 * Three states all the same (`kg:audit`'s discipline): `unknown` — the store
 * cannot be reached, the clone is shallow, an instance file does not parse —
 * exits 2, because a count over data that could not be read is not a count.
 *
 * ## The denominator is an upper bound, and says so
 *
 * Not every merge is a turn inside a process: a steward landing somebody
 * else's train, a docs-only fix or a revert may legitimately have no instance.
 * So `merges` against `instances started` bounds compliance from above; it
 * does not measure non-compliance. The report prints that sentence with the
 * numbers, so the ratio is never read without it.
 *
 * Usage: `bun run cat workflow:instances [--root <checkout>] [--since <iso>] [--ref <rev>] [--repo <checkout>] [--json]`
 *
 * @module scripts/workflow-instances
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { resolveBeanGraphNode } from "./beans.ts";
import { REPO_ROOT } from "./lib/roots.ts";

/** The owner settled the rule on 2026-09-20 (`vlhk`); counting starts there. */
export const RULE_SETTLED_AT = "2026-09-20T18:00:00Z";

export type WorkflowInstances =
  | {
      state: "ok" | "finding";
      since: string;
      ref: string;
      /** The resolved `workflow-state` directory, relative to the checkout. */
      dir: string;
      instances: number;
      startedSince: number;
      merges: number;
      /** CI workflows that read the `workflow-state` graph. Zero means nothing enforces it. */
      gatesReading: string[];
    }
  | { state: "unknown"; reason: string };

export interface InstancesOptions {
  root: string;
  since?: string;
  ref?: string;
  /** The checkout whose merges are counted, when it is not `root` (a full clone beside a shallow one). */
  repo?: string;
  /** Injected for tests; defaults to git in `repo`. */
  git?: (args: string[]) => string;
}

function defaultGit(root: string): (args: string[]) => string {
  return (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** CI workflow files that name the `workflow-state` graph or its directory. */
function gatesReadingGraph(root: string, dirRel: string): string[] {
  const wf = join(root, ".github", "workflows");
  if (!existsSync(wf)) return [];
  return readdirSync(wf)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => {
      const text = readFileSync(join(wf, f), "utf8");
      return text.includes("workflow-state") || text.includes(dirRel) || text.includes("workflow:instances");
    })
    .sort();
}

export function workflowInstances(opts: InstancesOptions): WorkflowInstances {
  const root = resolve(opts.root);
  const since = opts.since ?? RULE_SETTLED_AT;
  const ref = opts.ref ?? "HEAD";
  if (Number.isNaN(Date.parse(since))) return { state: "unknown", reason: `--since ${since} is not a date` };

  const where = resolveBeanGraphNode(root, "workflow-state");
  if (where.unreachable) return { state: "unknown", reason: `the workflow-state graph is unreachable: ${where.unreachable}` };
  if (!where.dir) return { state: "unknown", reason: `${root} declares no workflow-state graph` };
  if (!existsSync(where.dir)) {
    return { state: "unknown", reason: `${relative(root, where.dir)} is declared but absent — mount the store (bun run cat state:mount)` };
  }

  let instances = 0;
  let startedSince = 0;
  const unreadable: string[] = [];
  const from = Date.parse(since);
  for (const f of readdirSync(where.dir).filter((n) => n.endsWith(".json")).sort()) {
    let json: { startedAt?: unknown; history?: Array<{ at?: unknown }> };
    try {
      json = JSON.parse(readFileSync(join(where.dir, f), "utf8"));
    } catch {
      unreadable.push(f);
      continue;
    }
    instances++;
    // `startedAt` is optional in `folio-workflow-instance/v1`; three instances
    // recorded retroactively carry only `history`, whose first entry is the
    // start event, so that is when the instance began.
    const started = typeof json.startedAt === "string" ? json.startedAt : json.history?.[0]?.at;
    const at = typeof started === "string" ? Date.parse(started) : NaN;
    if (Number.isNaN(at)) unreadable.push(`${f} (no startedAt and no history)`);
    else if (at >= from) startedSince++;
  }
  if (unreadable.length) return { state: "unknown", reason: `instance files that cannot be counted: ${unreadable.join(", ")}` };

  const git = opts.git ?? defaultGit(resolve(opts.repo ?? root));
  let merges: number;
  try {
    if (git(["rev-parse", "--is-shallow-repository"]) === "true") {
      return { state: "unknown", reason: "the clone is shallow, so its merge count is not the repository's — fetch with --unshallow" };
    }
    merges = Number(git(["rev-list", "--first-parent", "--merges", "--count", `--since=${since}`, ref]));
  } catch (e) {
    return { state: "unknown", reason: `git could not count merges on ${ref}: ${(e as Error).message.split("\n")[0]}` };
  }
  if (!Number.isInteger(merges)) return { state: "unknown", reason: `git returned no merge count for ${ref}` };

  const dir = relative(root, where.dir);
  const gatesReading = gatesReadingGraph(root, dir);
  const state = merges > startedSince ? "finding" : "ok";
  return { state, since, ref, dir, instances, startedSince, merges, gatesReading };
}

export function report(c: WorkflowInstances): string {
  if (c.state === "unknown") return `UNKNOWN — ${c.reason}`;
  return [
    `${c.state === "finding" ? "FINDING (advisory)" : "OK"} — workflow instances against merges on ${c.ref} since ${c.since}`,
    `  instances recorded in ${c.dir}: ${c.instances} (${c.startedSince} started since ${c.since})`,
    `  first-parent merges since ${c.since}: ${c.merges}`,
    `  CI workflows reading the workflow-state graph: ${c.gatesReading.length ? c.gatesReading.join(", ") : "none"}`,
    "  The merge count is an upper bound on the instances owed: a steward's train, a docs-only fix or a revert may have none.",
    "  Advisory by owner ruling (5ulq, 2026-10-10): this reports the gap and never fails on it.",
  ].join("\n");
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const val = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const c = workflowInstances({ root: val("--root") ?? REPO_ROOT ?? process.cwd(), since: val("--since"), ref: val("--ref"), repo: val("--repo") });
  console.log(argv.includes("--json") ? JSON.stringify(c, null, 2) : report(c));
  process.exit(c.state === "unknown" ? 2 : 0);
}
