#!/usr/bin/env bun
/**
 * Shared workflows and actions are called at the commit this repository's
 * `index.lock.json` pins, never at a branch.
 *
 * @module scripts/workflow-pins
 * @covers cat-harness — the instance axis: every `uses: litlfred/<layer>/…` line in .github is pinned to the commit index.lock.json mounts for that layer
 *
 * Owner, 2026-11-01 (security audit finding S1, card Q-SEC-4 "B. Pin all
 * 59"): a `uses: litlfred/cat-harness-tools/.github/workflows/x.yml@main`
 * line runs whatever that branch holds when the run starts, so one bad push
 * to a lower layer's main runs in every repository that calls it, with that
 * repository's tokens. The lock already names the commit of each layer this
 * repository has accepted; the call follows it:
 *
 * | the line names | wanted |
 * |---|---|
 * | a layer the lock mounts | `@<that mount's ref> # index.lock.json` |
 * | this repository's own workflow, as a job | `./.github/workflows/<file>` (same commit) |
 * | this repository's own action, as a step | `@<a commit whose copy of the action is main's or this tree's>` |
 * | anything else | a 40-hex commit, kept as it is; a branch or tag is an error |
 *
 * A job that calls `layer-pr-checks.yml` must not pass `tools-ref: <branch>`:
 * the judging scripts follow the lock too (`tools-ref: lock`, the default).
 *
 * `mount:remote` runs `--write` after it writes the lock, so a re-pin moves
 * the calls with the mounts. A token that pushes the result needs the
 * `workflows` permission (GitHub refuses workflow-file changes otherwise).
 *
 *   bun run cat workflow-pins          # check (the gate is check:workflow-pins)
 *   bun run cat workflow-pins --write  # rewrite the lines
 *
 * Exit codes: 0 current · 1 a line is unpinned or drifted · 2 unreadable lock.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const OWNER = "litlfred";
const SHA = /^[0-9a-f]{40}$/;
/** `  - uses: litlfred/<repo>/<path>@<ref>  # comment` — groups: lead, step dash, repo, path, ref. */
const USES = /^(\s*(-\s+)?uses:\s*)litlfred\/([A-Za-z0-9_.-]+)\/(\S+?)@(\S+)(\s+#.*)?$/;
const TOOLS_REF = /^(\s*)tools-ref:\s*["']?([^"'\s#]+)["']?/;

export interface Finding {
  file: string;
  line: number;
  have: string;
  want: string | null;
  why: string;
}

/** The mounts of index.lock.json, harness name → commit; empty when there is no lock. */
export function lockedRefs(root: string): Map<string, string> {
  const f = join(root, "index.lock.json");
  const out = new Map<string, string>();
  if (!existsSync(f)) return out;
  const lock = JSON.parse(readFileSync(f, "utf8")) as { mounts?: { harness?: string; ref?: string }[] };
  for (const m of lock.mounts ?? []) if (m.harness && m.ref && SHA.test(m.ref)) out.set(m.harness, m.ref);
  return out;
}

/** This repository's name on GitHub: GITHUB_REPOSITORY, else origin's URL, else the directory. */
export function ownName(root: string): string {
  const env = process.env.GITHUB_REPOSITORY;
  if (env?.startsWith(`${OWNER}/`)) return env.slice(OWNER.length + 1);
  try {
    const url = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const m = url.match(/[/:]([^/]+?)(\.git)?$/);
    if (m) return m[1];
  } catch {
    /* no origin: fall through */
  }
  return basename(root);
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** The tree id of `dir` at `rev`, fetching `rev` once when a shallow clone lacks it. */
function treeAt(root: string, rev: string, dir: string): string | null {
  const ask = () => git(root, ["rev-parse", `${rev}:${dir}`]);
  let t = ask();
  if (t === null && SHA.test(rev)) {
    git(root, ["fetch", "-q", "--depth", "1", "origin", rev]);
    t = ask();
  }
  return t;
}

/** The newest commit of origin/main (else HEAD) that touched `dir`; null when history is too shallow to say. */
function lastTouch(root: string, dir: string): string | null {
  for (const base of ["origin/main", "HEAD"]) {
    const c = git(root, ["log", "-1", "--format=%H", base, "--", dir]);
    if (c && SHA.test(c)) return c;
  }
  return null;
}

/** The workflow and action files under .github. */
export function workflowFiles(root: string): string[] {
  const out: string[] = [];
  const wf = join(root, ".github", "workflows");
  if (existsSync(wf)) for (const f of readdirSync(wf)) if (/\.ya?ml$/.test(f)) out.push(join(wf, f));
  const act = join(root, ".github", "actions");
  if (existsSync(act))
    for (const d of readdirSync(act, { withFileTypes: true }))
      if (d.isDirectory()) for (const f of ["action.yml", "action.yaml"]) if (existsSync(join(act, d.name, f))) out.push(join(act, d.name, f));
  return out.sort();
}

/**
 * Judge (and with `write`, fix) one file's lines. Pure but for the git calls
 * a self-pinned action needs.
 */
export function judgeFile(root: string, file: string, text: string, own: string, refs: Map<string, string>): { findings: Finding[]; text: string } {
  const lines = text.split("\n");
  const findings: Finding[] = [];
  const rel = relative(root, file);
  let callsChecks = false;
  let callIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*#/.test(l)) continue;
    const indent = l.length - l.trimStart().length;
    if (callIndent >= 0 && l.trim() !== "" && indent < callIndent) callsChecks = false;
    const m = l.match(USES);
    if (m) {
      const [, lead, dash, repo, path, ref] = m;
      callsChecks = path.endsWith("layer-pr-checks.yml");
      callIndent = indent;
      let want: string | null = null;
      let why = "";
      if (repo === own && !dash && path.startsWith(".github/workflows/")) {
        want = `${lead}./${path}`;
        why = "this repository's own workflow: call it at the same commit";
      } else if (repo === own) {
        const dir = path.replace(/\/action\.ya?ml$/, "");
        const head = treeAt(root, "HEAD", dir);
        const pinned = SHA.test(ref) ? treeAt(root, ref, dir) : null;
        const main = treeAt(root, "origin/main", dir);
        if (pinned !== null && (pinned === head || pinned === main)) continue;
        const c = lastTouch(root, dir);
        want = c ? `${lead}litlfred/${repo}/${path}@${c} # last change to ${dir}` : null;
        why = c ? "this repository's own action: pin the commit that last changed it" : "this repository's own action: history too shallow to find the commit that last changed it; fetch more and re-run";
      } else if (refs.has(repo)) {
        const sha = refs.get(repo)!;
        if (ref === sha) continue;
        want = `${lead}litlfred/${repo}/${path}@${sha} # index.lock.json`;
        why = `index.lock.json mounts ${repo} at ${sha.slice(0, 8)}`;
      } else if (SHA.test(ref)) {
        continue;
      } else {
        why = `${repo} is not in index.lock.json: mount it, or pin a 40-hex commit by hand`;
      }
      const cur = l.trimEnd();
      if (want !== null && cur === want) continue;
      findings.push({ file: rel, line: i + 1, have: l.trim(), want: want?.trim() ?? null, why });
      if (want !== null) lines[i] = want;
      continue;
    }
    const t = l.match(TOOLS_REF);
    if (t && callsChecks && t[2] !== "lock" && !SHA.test(t[2])) {
      findings.push({ file: rel, line: i + 1, have: l.trim(), want: null, why: "tools-ref names a branch: drop it, so the judging scripts follow index.lock.json (tools-ref: lock)" });
      lines[i] = "\u0000drop";
    }
  }
  return { findings, text: lines.filter((x) => x !== "\u0000drop").join("\n") };
}

export function run(root: string, write: boolean): { findings: Finding[]; fixed: number } {
  const refs = lockedRefs(root);
  const own = ownName(root);
  const all: Finding[] = [];
  let fixed = 0;
  for (const f of workflowFiles(root)) {
    const before = readFileSync(f, "utf8");
    const { findings, text } = judgeFile(root, f, before, own, refs);
    all.push(...findings);
    if (write && text !== before) {
      writeFileSync(f, text);
      fixed += findings.filter((x) => x.want !== null || x.why.startsWith("tools-ref")).length;
    }
  }
  return { findings: all, fixed };
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  const rootArg = process.argv.find((a, i) => i > 1 && !a.startsWith("--"));
  // The repository being judged is the one the command runs in (a layer's
  // tools are mounted inside it), so no schema import: this runs on a bare clone.
  const root = resolve(rootArg ?? git(process.cwd(), ["rev-parse", "--show-toplevel"]) ?? process.cwd());
  let result;
  try {
    result = run(root, write);
  } catch (e) {
    console.log(`  ✗ index.lock.json is unreadable: ${(e as Error).message}`);
    process.exit(2);
  }
  console.log("Shared workflows pinned to index.lock.json:");
  if (result.findings.length === 0) {
    console.log("  ✓ every litlfred/… call is pinned");
    process.exit(0);
  }
  for (const f of result.findings) {
    console.log(`  ${write && f.want !== null ? "✎" : "✗"} ${f.file}:${f.line}  ${f.have}`);
    console.log(`      ${f.why}${f.want ? `\n      want: ${f.want}` : ""}`);
  }
  if (write) {
    const left = result.findings.filter((f) => f.want === null && !f.why.startsWith("tools-ref"));
    console.log(`  rewrote ${result.fixed} line(s)${left.length ? `; ${left.length} need a hand pin` : ""}`);
    process.exit(left.length ? 1 : 0);
  }
  console.log("  run `bun run cat workflow-pins --write`");
  process.exit(1);
}
