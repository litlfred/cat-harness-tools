#!/usr/bin/env bun
/**
 * A job that RUNS platform code must have CHECKED OUT the platform's submodules.
 *
 * @module folio-assistant/scripts/check-workflow-submodules
 * @covers none — an audit of this repository's workflow YAML; it judges, and writes nothing
 *
 * `cat-harness/schemas/kg/graph-typology-registry.ts` imports
 * `../../bootstrap-tools/schemas/graph`, and `bootstrap-tools` is a git
 * SUBMODULE. So any `bun run` of a platform script that reaches the schema
 * layer dies on `Cannot find module` unless its checkout carried
 * `submodules: true` — and nothing in the script's own text says so. Under
 * `bash -e` such a failure can abort a step halfway (e.g. a cleanup that
 * deletes locally but never pushes), so findings are `critical`.
 *
 * Jobs are DISCOVERED from the YAML, never listed. It reads
 * `uses: actions/checkout` steps and `run:` bodies per job, and does not pair
 * a script to its checkout. The rule is conservative: **if a job runs any
 * platform script, every non-publish checkout in that job must carry
 * `submodules`.** It can over-report; the remedy is one harmless line.
 *
 * Blind spot, printed every run: a composite action or reusable workflow that
 * runs platform code on the caller's behalf.
 *
 * A checkout of a PUBLISH branch (`gh-pages`, the `publish_branch` input) is
 * exempt: it carries built output, never source.
 *
 * Exit: 0 clean, 1 a job runs platform code from a submodule-less checkout.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS = ".github/workflows";

/**
 * A publish branch holds BUILT output, so a checkout of one needs no
 * submodules. Matched on the `ref:` rather than on the path, because the path
 * is a local convention (`pages`) and the ref is the actual claim.
 */
const PUBLISH_REF = /^\s*ref:\s*(gh-pages|\$\{\{\s*inputs\.publish_branch\s*\}\})\s*$/;

/**
 * `bun run <path>` / `bun <path>`, where the path ends in `.ts`, however it is
 * spelled — `source/x.ts`, `../source/x.ts`, `"$PLATFORM_DIR/x.ts"`. A
 * `package.json` script name (`bun run cat gates`) is NOT matched: those resolve
 * through the checkout's own `package.json` and are covered by whichever
 * checkout that is, which this rule already requires to be complete.
 */
const BUN_RUN = /\bbun\s+(?:run\s+)?["']?([^"'\s]*\.ts)\b/g;

export interface Finding {
  readonly workflow: string;
  readonly job: string;
  readonly line: number;
  readonly detail: string;
}

interface CheckoutStep {
  readonly line: number;
  readonly path: string | undefined;
  readonly submodules: boolean;
  readonly publish: boolean;
}

interface Job {
  readonly name: string;
  readonly start: number;
  readonly lines: readonly string[];
}

/**
 * Split a workflow into jobs by indentation.
 *
 * Deliberately textual. A YAML parse would give a cleaner tree and lose the
 * LINE NUMBERS, and a finding a reader cannot navigate to is a finding they
 * have to re-find by hand.
 */
export function jobsOf(src: string): Job[] {
  const lines = src.split("\n");
  const jobs: Job[] = [];
  let inJobs = false;
  let current: { name: string; start: number; body: string[] } | undefined;
  const flush = (): void => {
    if (current) jobs.push({ name: current.name, start: current.start, lines: current.body });
    current = undefined;
  };
  for (const [i, line] of lines.entries()) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    // A non-indented, non-blank line ends the `jobs:` block.
    if (/^\S/.test(line)) {
      flush();
      inJobs = false;
      continue;
    }
    const header = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header?.[1] !== undefined) {
      flush();
      current = { name: header[1], start: i + 1, body: [] };
      continue;
    }
    current?.body.push(line);
  }
  flush();
  return jobs;
}

/**
 * A checkout whose `sparse-checkout` names only paths under `.github/` holds
 * the repository's own CI scripts and none of the platform's source, so no
 * mount can be missing from it. `repin-train-verdict.yml` checks out main's
 * `.github/scripts` alone, on purpose, to judge a train with main's script.
 */
export function ciScriptsOnly(block: readonly string[]): boolean {
  const at = block.findIndex((l) => /^\s*sparse-checkout:/.test(l));
  if (at < 0) return false;
  const inline = /^\s*sparse-checkout:\s*(.*?)\s*$/.exec(block[at]!)?.[1] ?? "";
  const paths: string[] = [];
  if (inline !== "" && !/^[|>][-+]?$/.test(inline)) paths.push(inline);
  else {
    const indent = /^(\s*)/.exec(block[at]!)![1]!.length;
    for (const l of block.slice(at + 1)) {
      if (l.trim() === "") continue;
      if (/^(\s*)/.exec(l)![1]!.length <= indent) break;
      paths.push(l.trim());
    }
  }
  const clean = paths.map((p) => p.replace(/^["']|["']$/g, "").replace(/^\.\//, "").replace(/^\//, ""));
  return clean.length > 0 && clean.every((p) => p === ".github" || p.startsWith(".github/"));
}

/** Every `actions/checkout` in one job, with the `with:` keys that matter here. */
export function checkoutsOf(job: Job): CheckoutStep[] {
  const out: CheckoutStep[] = [];
  for (const [i, line] of job.lines.entries()) {
    if (!/uses:\s*actions\/checkout/.test(line)) continue;
    // The step's own `with:` block: up to the next line at or below the
    // `- uses:`/`- name:` indentation, which is where the next step begins.
    const block: string[] = [];
    for (const next of job.lines.slice(i + 1)) {
      if (/^\s{0,8}- /.test(next)) break;
      block.push(next);
    }
    const pathLine = block.find((l) => /^\s*path:\s*\S/.test(l));
    const path = /^\s*path:\s*["']?([^"'\s]+)/.exec(pathLine ?? "")?.[1];
    // Since bean `nn8e` (#2462) `bootstrap/` and `bootstrap-tools/` are REMOTE
    // MOUNTS, not submodules: the checkout is served by a later step in the
    // same job that replays the lock into the same path. `submodules:` alone
    // no longer supplies them — there is no `.gitmodules` to read.
    // The whole value, so `${{ steps.x.outputs.checkout }}` compares as one
    // expression rather than as its first token.
    const full = /^\s*path:\s*(.+?)\s*$/.exec(pathLine ?? "")?.[1]?.replace(/^["']|["']$/g, "");
    const norm = (p: string) => p.replace(/\s+/g, " ").replace(/\/+$/, "");
    const root = norm(full ?? ".");
    const after = job.lines.slice(i + 1);
    const mounted = after.some((l, k) => {
      // The replayer itself (`.ts`), or the index checkout's `.github/
      // mount-from-lock.sh`, which fetches the pinned replayer and runs it
      // with the same `--root` — every job in an index checkout calls the
      // wrapper, because the replayer lives in a mount it cannot yet see.
      const m = /mount-from-lock\.(?:ts|sh)["']?\s+--root\s+["']?([^"'\s;]+)/.exec(l);
      if (m?.[1] === undefined) return false;
      // A path that is a step output reaches the script through `env:`, never
      // interpolated (check:workflow-injection): follow `$VAR` to its value in
      // the same step, which sits just above its `run:`.
      const v = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(m[1]);
      if (v?.[1] !== undefined) {
        let stepStart = k;
        while (stepStart > 0 && !/^\s{0,8}- /.test(after[stepStart]!)) stepStart--;
        const env = after.slice(Math.max(stepStart, 0), k + 1).map((x) => new RegExp(`^\\s*${v[1]}:\\s*(.+?)\\s*$`).exec(x)?.[1]).find(Boolean);
        return env !== undefined && norm(env.replace(/^["']|["']$/g, "")) === root;
      }
      return norm(m[1]) === root;
    });
    out.push({
      line: job.start + i + 1,
      path,
      submodules: mounted,
      publish: block.some((l) => PUBLISH_REF.test(l)) || ciScriptsOnly(block),
    });
  }
  return out;
}

/** Every platform script a job's `run:` bodies invoke, as written. */
export function bunRunsOf(job: Job): { line: number; script: string }[] {
  const out: { line: number; script: string }[] = [];
  for (const [i, line] of job.lines.entries()) {
    for (const m of line.matchAll(BUN_RUN)) {
      if (m[1] !== undefined) out.push({ line: job.start + i + 1, script: m[1] });
    }
  }
  return out;
}

export function auditWorkflow(
  file: string,
  src: string,
): { findings: Finding[]; composites: Finding[] } {
  const findings: Finding[] = [];
  const composites: Finding[] = [];
  for (const job of jobsOf(src)) {
    const checkouts = checkoutsOf(job).filter((c) => !c.publish);
    const runs = bunRunsOf(job);
    if (runs.length === 0) {
      // A job that runs no platform script but delegates to a composite action
      // could still be running one. Named, not assumed either way.
      for (const [i, line] of job.lines.entries()) {
        const m = /uses:\s*\.\/(\.github\/actions\/[A-Za-z0-9._/-]+)/.exec(line);
        if (m?.[1] !== undefined && checkouts.some((c) => !c.submodules)) {
          composites.push({
            workflow: file,
            job: job.name,
            line: job.start + i + 1,
            detail: `delegates to \`${m[1]}\` — whether that runs platform code is not readable here`,
          });
        }
      }
      continue;
    }
    const bare = checkouts.filter((c) => !c.submodules);
    if (bare.length === 0) continue;
    for (const c of bare) {
      findings.push({
        workflow: file,
        job: job.name,
        line: c.line,
        detail:
          `checkout is not followed by a lock replay (\`bun <path>/cat-harness/scripts/mount-from-lock.ts --root <path>\` or \`bash .github/mount-from-lock.sh --root <path>\`), ` +
          `and this job runs ${runs.length} platform script(s) (first: \`${runs[0]?.script ?? "?"}\` at line ${runs[0]?.line ?? 0}) — ` +
          `one reaching \`cat-harness/schemas/\` dies on \`bootstrap-tools\`, which is a remote mount (bean nn8e)`,
      });
    }
  }
  return { findings, composites };
}

if (import.meta.main) {
  const files = readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
  const findings: Finding[] = [];
  const composites: Finding[] = [];
  for (const f of files) {
    const r = auditWorkflow(f, readFileSync(join(WORKFLOWS, f), "utf8"));
    findings.push(...r.findings);
    composites.push(...r.composites);
  }

  console.log(`Workflow submodules (${files.length} workflow(s) read)`);
  const seen = new Set<string>();
  for (const f of findings) {
    const key = `${f.workflow}:${f.job}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ✗ ${f.workflow} › ${f.job} (line ${f.line}): ${f.detail}`);
  }
  if (findings.length === 0) {
    console.log("  ✓ every job that runs a platform script mounts bootstrap and bootstrap-tools from the lock");
  }
  if (composites.length > 0) {
    console.log(
      `\n  · ${composites.length} composite-action call(s) COULD NOT BE DETERMINED — reported, never counted clean:`,
    );
    for (const u of composites.slice(0, 8)) {
      console.log(`      ${u.workflow} › ${u.job} (line ${u.line}): ${u.detail}`);
    }
    if (composites.length > 8) console.log(`      …and ${composites.length - 8} more`);
    console.log(
      "    This file reads `run:` bodies, so platform code invoked INSIDE a composite\n" +
        "    action is not visible to it. Settle one by reading that action, or by adding\n" +
        "    `submodules: true` to the checkout and moving on.",
    );
  }
  process.exit(findings.length > 0 ? 1 : 0);
}
