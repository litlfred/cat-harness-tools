/**
 * A tree-keyed record of a local gate run: which tree was judged, which gates
 * the set held, how each came out, and with which tools.
 *
 * Written by `scripts/pre-push-gates.ts` after `bun run cat gates` passes on
 * the tree being pushed. It serves two readers:
 *
 * 1. **The next push of the same tree** (the Claude Code hook runs before
 *    `git push`, then git's own pre-push hook runs inside it): a record that
 *    covers the tree means the gates are not asked twice.
 * 2. **CI, with deferred verification** (design in bean `cat-tools-pp9g`): a
 *    record attached to the commit as a git note (`refs/notes/cat-gates`)
 *    lets a PR's critical path skip the gates it covers, and a sweep off the
 *    critical path re-runs them and compares — the trust model agent-built
 *    previews already use. That CI side is a follow-up in folio-assistant;
 *    nothing here makes CI skip anything.
 *
 * Only a PASS is recorded. A record is a claim that the gates are green on
 * this tree, so a fail, a not-clean run or an undetermined one leaves no
 * record and everything downstream runs as if there were none.
 *
 * Why the tree and not the commit: the gates judge files, and the same tree
 * reached by a rebase or an amend of the message is the same judgment. Why
 * the Bun version: the same tree under another runtime is not the same run.
 * The workflow and `bun.lock` are files of the tree, so the gate list and the
 * dependency set are fixed by the key already.
 *
 * Deliberately free of package imports, so the git hook runs it in a checkout
 * that has not installed anything.
 *
 * @module scripts/gate-record
 * @graphNode none — a helper of the pre-push hook, not a gate itself
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

export const LOCAL_GATE_RECORD_SCHEMA = "cat-local-gate-record/v1";
/** The notes ref a record is attached under, so it can travel with a push. */
export const RECORD_NOTES_REF = "refs/notes/cat-gates";

/** What `bun run cat gates --report` writes (`schemas/sdlc/gates-report.ts`), the fields read here. */
export interface GatesReportLike {
  $schema: string;
  outcome: "pass" | "fail" | "not-clean" | "undetermined";
  exitCode: 0 | 1 | 2;
  set: "fast" | "whole";
  gates: number;
  commands?: string[];
  failed: { command: string; job: string; step: string; why: string[] }[];
  skipped: { command: string; why: string }[];
  undetermined: string[];
}

export interface ToolVersions {
  bun: string;
  git: string;
  platform: string;
}

export interface LocalGateRecord {
  $schema: typeof LOCAL_GATE_RECORD_SCHEMA;
  /** The tree judged: `git rev-parse <commit>^{tree}`. The key. */
  tree: string;
  /** The commit the run was made for. Informative only; the tree is the key. */
  commit: string;
  set: "fast" | "whole";
  outcome: "pass";
  /** Every gate in the set, in workflow order. */
  gates: string[];
  /** Gates not asked because the input-hash cache (bean `f017`) holds a pass on identical inputs. */
  skipped: { command: string; why: string }[];
  tools: ToolVersions;
  /** `agent` when a Claude Code session ran it (CLAUDECODE set), else `human`. */
  runBy: "agent" | "human";
  startedAt: string;
  finishedAt: string;
}

/** Run git in `root`; the trimmed stdout, or undefined when git exits non-zero. */
export function git(root: string, args: readonly string[]): string | undefined {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/** The directory records and logs live in: `<common git dir>/cat-gates`, shared by every worktree. */
export function stateDir(root: string): string {
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  if (common === undefined) throw new Error(`${root} is not inside a git repository`);
  return join(resolve(root, common), "cat-gates");
}

export function treeOf(root: string, rev: string): string | undefined {
  return git(root, ["rev-parse", "--verify", "--quiet", `${rev}^{tree}`]);
}

export function toolVersions(root: string): ToolVersions {
  return {
    bun: typeof Bun !== "undefined" ? Bun.version : "none",
    git: (git(root, ["--version"]) ?? "unknown").replace(/^git version /, ""),
    platform: `${process.platform}-${process.arch}`,
  };
}

export function recordPath(root: string, tree: string): string {
  if (!/^[0-9a-f]{40,64}$/.test(tree)) throw new Error(`not a tree id: ${tree}`);
  return join(stateDir(root), "records", `${tree}.json`);
}

/** The record for a passing report, or undefined when the report is not a pass. */
export function buildRecord(
  report: GatesReportLike,
  ctx: { tree: string; commit: string; tools: ToolVersions; runBy: "agent" | "human"; startedAt: string; finishedAt: string },
): LocalGateRecord | undefined {
  if (report.outcome !== "pass" || report.exitCode !== 0) return undefined;
  // A pass over a set nobody can name is not something to vouch for: the
  // record has to say what it covers.
  if (report.commands === undefined || report.commands.length !== report.gates || report.gates === 0) return undefined;
  return {
    $schema: LOCAL_GATE_RECORD_SCHEMA,
    tree: ctx.tree,
    commit: ctx.commit,
    set: report.set,
    outcome: "pass",
    gates: [...report.commands],
    skipped: report.skipped.map((s) => ({ command: s.command, why: s.why })),
    tools: ctx.tools,
    runBy: ctx.runBy,
    startedAt: ctx.startedAt,
    finishedAt: ctx.finishedAt,
  };
}

export function writeRecord(root: string, rec: LocalGateRecord): string {
  const p = recordPath(root, rec.tree);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(rec, null, 2) + "\n");
  return p;
}

export function readRecord(root: string, tree: string): LocalGateRecord | undefined {
  const p = recordPath(root, tree);
  if (!existsSync(p)) return undefined;
  try {
    const r = JSON.parse(readFileSync(p, "utf-8")) as LocalGateRecord;
    return r.$schema === LOCAL_GATE_RECORD_SCHEMA && r.tree === tree ? r : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a record covers `tree` for a push now: it is a pass on that tree,
 * under the Bun that would run the gates now. Returns the reason either way.
 */
export function covers(rec: LocalGateRecord | undefined, tree: string, now: ToolVersions): { covered: boolean; why: string } {
  if (rec === undefined) return { covered: false, why: "no local gate record for this tree" };
  if (rec.tree !== tree) return { covered: false, why: `the record is for tree ${rec.tree}` };
  if (rec.outcome !== "pass") return { covered: false, why: `the record's outcome is ${rec.outcome}` };
  if (rec.tools.bun !== now.bun) return { covered: false, why: `the record was made under bun ${rec.tools.bun}, this is ${now.bun}` };
  return { covered: true, why: `gates passed on this tree at ${rec.finishedAt} (${rec.gates.length} gate(s), ${rec.set} set)` };
}

/** Attach the record to its commit as a git note, so a push of the notes ref carries it. */
export function attachNote(root: string, rec: LocalGateRecord): boolean {
  const r = spawnSync("git", ["notes", `--ref=${RECORD_NOTES_REF}`, "add", "-f", "-F", "-", rec.commit], {
    cwd: root,
    input: JSON.stringify(rec) + "\n",
    encoding: "utf-8",
  });
  return r.status === 0;
}

/** One line of the push log: every bypass, refusal and undetermined push is written here. */
export function logPush(root: string, entry: Record<string, unknown>): string {
  const p = join(stateDir(root), "push.log");
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  return p;
}
