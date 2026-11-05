#!/usr/bin/env bun
/**
 * Run the fast gates on the tree being pushed, before it leaves the machine,
 * and refuse the push when one is red.
 *
 * The CI fast set runs on every push to a PR. The same gates, under the same
 * pinned Bun, run in a committer's own container in the time it takes to push,
 * and a red one costs the committer a minute instead of a CI round. So this is
 * the pre-push half of `bun run cat gates`, with two entry points:
 *
 * - `--git-hook <remote>`: git's `pre-push` hook (`scripts/git-hooks/pre-push`,
 *   installed by `scripts/git-hooks/install.sh`). The pushed refs come on stdin.
 * - `--claude-hook`: a Claude Code `PreToolUse` hook on `Bash`. The tool call
 *   comes on stdin as JSON; anything that is not a `git push` passes at once.
 *   Exit 2 blocks the call and hands the reason to the agent. Agent containers
 *   are cloned fresh and never run `install.sh`, so this is the hook they get.
 *   The recipe is in bean `cat-tools-pp9g`.
 *
 * ## Which gates
 *
 * The fast set, derived from the workflow by `scripts/gates.ts` — never listed
 * here. "Only the gates the change affects" is what the input-hash cache
 * (bean `f017`) already does there: a gate whose fingerprint matches a pass is
 * SKIPPED. Measured on `4rbc`, almost every gate declares `{tracked}`, so a
 * change re-asks almost all of them; the narrow, strace-derived read sets that
 * make the CI cone skip are recorded on main's CI runs and not on disk here.
 * A record for the tree (`scripts/gate-record.ts`) skips the whole run when
 * the same tree is pushed again, which is the case the two hooks create.
 *
 * ## Verdicts
 *
 * - gates exit 0: write the tree's record, allow the push;
 * - gates exit 1 (a gate failed, or a gate changed the tree): refuse;
 * - gates exit 2, or no `cat` runner in this checkout (a layer cloned on its
 *   own): allow, say so, and log it. A third state is not a pass, so no record
 *   is written and CI runs everything, exactly as it would without the hook;
 * - the pushed tree is not the tree on disk (a dirty tracked file, or a ref
 *   other than HEAD): refuse, because the gates would judge the wrong tree.
 *
 * ## The bypass is explicit and logged
 *
 * `CAT_GATES_BYPASS='<reason>' git push ...` skips the gates and appends the
 * reason, the refs and the time to `<git dir>/cat-gates/push.log`. `git push
 * --no-verify` also skips git's hook, and git gives the hook no chance to log
 * that; the Claude hook therefore refuses a `--no-verify` push that names no
 * `CAT_GATES_BYPASS` reason.
 *
 * @module scripts/pre-push-gates
 * @graphNode none — a git and Claude Code hook, not a gate itself
 */
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  attachNote,
  buildRecord,
  covers,
  git,
  logPush,
  readRecord,
  stateDir,
  toolVersions,
  treeOf,
  writeRecord,
  RECORD_NOTES_REF,
  type GatesReportLike,
} from "./gate-record.ts";

const ZERO = /^0+$/;

/** One line of git's pre-push stdin. */
export interface PushedRef {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export function parsePushStdin(text: string): PushedRef[] {
  const out: PushedRef[] = [];
  for (const line of text.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length !== 4) continue;
    out.push({ localRef: f[0]!, localSha: f[1]!, remoteRef: f[2]!, remoteSha: f[3]! });
  }
  return out;
}

/** What a Bash command line says about a push, for the Claude hook. */
export interface PushCommand {
  /** The revisions named as refspec sources; `HEAD` when none is. Deletes are left out. */
  sources: string[];
  noVerify: boolean;
  dryRun: boolean;
  /** The `CAT_GATES_BYPASS=` reason written on the command line, if any. */
  bypass?: string;
}

/**
 * The first `git ... push ...` in a shell command line, or undefined when it
 * holds none. A reading of a command line, not a shell: a push it cannot read
 * (one built by `eval`, say) still meets git's own hook if that is installed.
 */
export function parsePushCommand(command: string): PushCommand | undefined {
  // Split on shell separators; each piece is one simple command.
  for (const piece of command.split(/&&|\|\||[;|\n]/)) {
    const words = piece.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    let i = 0;
    let bypass: string | undefined;
    // Leading assignments: `CAT_GATES_BYPASS='why' git push`, `env X=1 git push`.
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!) || words[i] === "env")) {
      const m = /^CAT_GATES_BYPASS=(.*)$/.exec(words[i]!);
      if (m) bypass = unquote(m[1]!);
      i++;
    }
    if (words[i] !== "git") continue;
    i++;
    // git's own options before the subcommand: `-C dir`, `-c k=v`, `--no-pager`.
    while (i < words.length && words[i]!.startsWith("-")) i += words[i] === "-C" || words[i] === "-c" ? 2 : 1;
    if (words[i] !== "push") continue;
    const args = words.slice(i + 1).map(unquote);
    const positional = args.filter((a) => !a.startsWith("-"));
    const refspecs = positional.slice(1);
    const sources: string[] = [];
    for (const spec of refspecs) {
      const src = spec.replace(/^\+/, "").split(":")[0]!;
      if (src !== "") sources.push(src);
    }
    if (refspecs.length === 0) sources.push("HEAD");
    return {
      sources,
      noVerify: args.includes("--no-verify"),
      dryRun: args.includes("-n") || args.includes("--dry-run"),
      ...(bypass !== undefined && bypass !== "" ? { bypass } : {}),
    };
  }
  return undefined;
}

function unquote(s: string): string {
  return s.replace(/^'(.*)'$/s, "$1").replace(/^"(.*)"$/s, "$1");
}

export type Verdict =
  | { kind: "allow"; why: string }
  | { kind: "refuse"; why: string[] }
  | { kind: "undetermined"; why: string };

/** Whether the checkout has the `cat` runner `bun run cat gates` needs. */
export function hasCatRunner(root: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as { scripts?: Record<string, string> };
    return typeof pkg.scripts?.cat === "string";
  } catch {
    return false;
  }
}

const BYPASS_HINT =
  "  To push anyway, say why — it is logged:  CAT_GATES_BYPASS='<reason>' git push ...";

/**
 * Decide a push of `commits`, running the gates when no record covers them.
 * `stream` receives the gate run's output as it goes (git's hook shows it;
 * the Claude hook keeps it in the log and quotes only the failures).
 */
export async function judge(root: string, commits: readonly string[], stream?: NodeJS.WritableStream): Promise<Verdict> {
  const now = toolVersions(root);
  const uncovered: { commit: string; tree: string }[] = [];
  for (const c of new Set(commits)) {
    const tree = treeOf(root, c);
    if (tree === undefined) return { kind: "undetermined", why: `could not read the tree of ${c}` };
    if (!covers(readRecord(root, tree), tree, now).covered) uncovered.push({ commit: c, tree });
  }
  if (uncovered.length === 0) return { kind: "allow", why: "a passing gate record already covers every tree pushed" };

  // First: where no gate can run, the tree on disk does not matter.
  if (!hasCatRunner(root)) {
    return { kind: "undetermined", why: "this checkout has no `cat` runner (a layer cloned on its own), so no gate can run here" };
  }

  const headTree = treeOf(root, "HEAD");
  const elsewhere = uncovered.filter((u) => u.tree !== headTree);
  if (elsewhere.length > 0) {
    return {
      kind: "refuse",
      why: [
        `The gates judge the files on disk, and ${elsewhere.map((u) => u.commit.slice(0, 12)).join(", ")} is not what is checked out.`,
        "  Check that commit out and push again, or push the branch you are on.",
      ],
    };
  }
  if (git(root, ["diff", "--quiet", "HEAD", "--"]) === undefined) {
    return {
      kind: "refuse",
      why: [
        "Tracked files differ from HEAD, so the gates would judge a tree you are not pushing.",
        "  Commit or stash them (`git stash`), then push again.",
      ],
    };
  }

  const dir = stateDir(root);
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, "last-report.json");
  const logPath = join(dir, "last-run.log");
  const startedAt = new Date().toISOString();
  const code = await runGates(root, reportPath, logPath, stream);
  const finishedAt = new Date().toISOString();

  let report: GatesReportLike | undefined;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf-8")) as GatesReportLike;
  } catch {
    report = undefined;
  }
  if (code === 0 && report !== undefined) {
    const { commit, tree } = uncovered[0]!;
    const rec = buildRecord(report, {
      tree,
      commit,
      tools: now,
      runBy: process.env.CLAUDECODE ? "agent" : "human",
      startedAt,
      finishedAt,
    });
    if (rec === undefined) return { kind: "undetermined", why: `the gates exited 0 but the report (${reportPath}) names no gate set to record` };
    writeRecord(root, rec);
    if (git(root, ["config", "--bool", "cat.gates.noteRecords"]) !== "false") attachNote(root, rec);
    return { kind: "allow", why: `${rec.gates.length - rec.skipped.length} gate(s) passed, ${rec.skipped.length} skipped on unchanged inputs` };
  }
  if (code === 1) {
    const lines = ["A gate is red on the tree being pushed, so the push was refused."];
    for (const f of report?.failed ?? []) {
      lines.push(`  · ${f.command}   (${f.job} / ${f.step})`);
      for (const w of f.why.slice(0, 5)) lines.push(`      ${w}`);
    }
    if (report?.outcome === "not-clean") lines.push("  Every gate passed, but one changed the tree. Commit what it wrote, or see the log.");
    lines.push(`  Full output: ${logPath}`);
    return { kind: "refuse", why: lines };
  }
  return { kind: "undetermined", why: `\`bun run cat gates\` exited ${code}, which is could-not-determine, not a pass (output: ${logPath})` };
}

function runGates(root: string, reportPath: string, logPath: string, stream?: NodeJS.WritableStream): Promise<number> {
  return new Promise((done) => {
    const log = createWriteStream(logPath);
    const child = spawn("bun", ["run", "cat", "gates", "--report", reportPath], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const tee = (b: Buffer) => {
      log.write(b);
      stream?.write(b);
    };
    child.stdout.on("data", tee);
    child.stderr.on("data", tee);
    child.on("error", (e) => {
      log.end(`\nspawn failed: ${e.message}\n`);
      done(2);
    });
    child.on("close", (c) => log.end(() => done(c ?? 2)));
  });
}

function say(lines: readonly string[]): void {
  for (const l of lines) process.stderr.write(`${l}\n`);
}

async function gitHook(root: string, remote: string): Promise<number> {
  const refs = parsePushStdin(await Bun.stdin.text()).filter((r) => !ZERO.test(r.localSha));
  if (refs.length === 0) return 0;
  const bypass = process.env.CAT_GATES_BYPASS;
  if (bypass !== undefined && bypass !== "") {
    const p = logPush(root, { event: "bypass", via: "git-hook", reason: bypass, remote, refs });
    say([`pre-push: gates BYPASSED — "${bypass}" (logged to ${p})`]);
    return 0;
  }
  // A push of the records' own notes ref carries no tree to judge.
  const judged = refs.filter((r) => r.localRef !== RECORD_NOTES_REF);
  if (judged.length === 0) return 0;
  say([`pre-push: running the fast gates on ${judged.map((r) => r.localRef).join(", ")} (bypass: CAT_GATES_BYPASS='<reason>')`]);
  const v = await judge(root, judged.map((r) => r.localSha), process.stderr);
  return finish(root, v, { via: "git-hook", remote, refs: judged }, 1, () => {
    if (git(root, ["config", "--bool", "cat.gates.pushRecords"]) === "true") {
      // `--no-verify`: this push carries only notes, and re-entering this hook would judge nothing.
      git(root, ["push", "--no-verify", "--quiet", remote, `${RECORD_NOTES_REF}:${RECORD_NOTES_REF}`]);
    }
  });
}

async function claudeHook(): Promise<number> {
  let input: { tool_name?: string; tool_input?: { command?: string }; cwd?: string };
  try {
    input = JSON.parse(await Bun.stdin.text());
  } catch {
    return 0;
  }
  if (input.tool_name !== "Bash" || typeof input.tool_input?.command !== "string") return 0;
  const push = parsePushCommand(input.tool_input.command);
  if (push === undefined || push.dryRun) return 0;
  const root = git(input.cwd ?? process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (root === undefined) return 0;
  const bypass = push.bypass ?? process.env.CAT_GATES_BYPASS;
  if (bypass !== undefined && bypass !== "") {
    const p = logPush(root, { event: "bypass", via: "claude-hook", reason: bypass, command: input.tool_input.command });
    say([`pre-push: gates BYPASSED — "${bypass}" (logged to ${p})`]);
    return 0;
  }
  if (push.noVerify) {
    logPush(root, { event: "refused", via: "claude-hook", why: "--no-verify without a reason", command: input.tool_input.command });
    say([
      "`git push --no-verify` skips the gates and leaves no record of why.",
      "Run the push without it, or name the reason, which is logged:",
      "  CAT_GATES_BYPASS='<reason>' git push --no-verify ...",
    ]);
    return 2;
  }
  const commits: string[] = [];
  for (const s of push.sources) {
    const sha = git(root, ["rev-parse", "--verify", "--quiet", `${s}^{commit}`]);
    // A source this cannot resolve (a pattern, say) is left to git's own hook.
    if (sha !== undefined) commits.push(sha);
  }
  if (commits.length === 0) return 0;
  const v = await judge(root, commits);
  return finish(root, v, { via: "claude-hook", command: input.tool_input.command }, 2);
}

function finish(root: string, v: Verdict, ctx: Record<string, unknown>, refuseCode: number, onAllow?: () => void): number {
  if (v.kind === "allow") {
    say([`pre-push: ✓ ${v.why}`]);
    onAllow?.();
    return 0;
  }
  if (v.kind === "undetermined") {
    const p = logPush(root, { event: "undetermined", why: v.why, ...ctx });
    say([`pre-push: ? gates not judged — ${v.why}. Pushing; CI runs them. (logged to ${p})`]);
    return 0;
  }
  const p = logPush(root, { event: "refused", why: v.why[0], ...ctx });
  say([...v.why, BYPASS_HINT, `  (logged to ${p})`]);
  return refuseCode;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--git-hook") {
    const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]) ?? process.cwd();
    process.exit(await gitHook(root, argv[1] ?? "origin"));
  } else if (argv[0] === "--claude-hook") {
    process.exit(await claudeHook());
  } else {
    console.error("usage: pre-push-gates.ts --git-hook <remote> < refs | --claude-hook < tool-call.json");
    process.exit(2);
  }
}
