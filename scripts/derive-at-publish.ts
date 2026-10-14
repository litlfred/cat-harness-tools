#!/usr/bin/env bun
/**
 * derive:publish — build every derived artefact that cannot be current in a
 * commit, at the moment the site is built. Bean `0b8c` (#2230).
 *
 * @module cat-harness/scripts/derive-at-publish
 * @covers none — it runs the writers `check:derived-from` names; it judges no graph
 *
 * ## Why this exists
 *
 * A derived artefact is current only relative to its inputs. When every
 * input is kept in the commit, a committed copy plus a `:check` gate keeps
 * them together. When an input is kept on a BRANCH, it moves without a
 * commit, and a committed copy is stale on main and on every open PR the
 * moment somebody writes there — measured 2026-10-05, when one `state:push`
 * to `cat/cat-harness/fsh-guts` turned `fsh-guts:viz:check` red everywhere.
 *
 * So such an artefact is never committed. `check:derived-from` works out
 * which artefacts those are by walking the `derivedFrom` edges up to a
 * branch-kept input — a visualisation counting as derived from the directory
 * it shows — and refuses any that is tracked. This script is the other half:
 * the site build runs it after `state:mount` and before composing the site,
 * and it runs each one's declared `writer`, sources before consumers.
 *
 * ## And the artefacts an instance DECLARES it builds at publish (B1)
 *
 * Owner, 2026-10-14 ("B1"; widened to state: "fix all, in proper way"). An
 * instance's `builtAtPublish` (`schemas/built-at-publish.ts`) lists artefacts
 * no commit of it can hold current — computed over the checkout's other
 * instances (`checkout`), or from a branch-kept graph (`state`) — and names
 * each one's writer as a package script. After the branch-derived artefacts
 * above, this runs every such writer once, in declaration order (instances
 * dependency-first), and then REFUSES an entry that came out missing or empty:
 * a declared page nobody built is a broken publish, not an absent one.
 * `--cause state` runs only the state-derived ones (what an e2e job reading the
 * beans and todos projections needs after `state:mount`).
 *
 * No list of generators lives here or in a workflow. Adding the next
 * branch-kept graph (beans, todos) with a declared visualiser `writer` is the
 * whole change; this step picks it up.
 *
 * ## Refusals, not silence
 *
 * A writer that exits non-zero fails the step, naming it. A writer reads a
 * mounted graph and refuses an unmounted one (exit 2), so a build that forgot
 * `state:mount` fails here rather than publishing an empty page.
 *
 * ```
 * bun run cat derive:publish            # run every writer
 * bun run cat derive:publish --list     # print what would run, run nothing
 * ```
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { judge, readTree, renderingOrder, trackedIn, type PublishArtefact } from "./check-derived-from.ts";
import { readInstances } from "./check-import-direction.ts";
import { readDeclaration } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { HARNESS_ROOT } from "./lib/roots.ts";
import { dirname } from "node:path";

const REPO_ROOT = resolve(dirname(HARNESS_ROOT));

/** The publish-time artefacts in rendering order: a source's artefacts before its consumers'. */
export function publishPlan(repoRoot = REPO_ROOT): PublishArtefact[] {
  const tree = readTree(repoRoot);
  const j = judge(tree, (p) => existsSync(resolve(repoRoot, p)), trackedIn(repoRoot));
  const order = renderingOrder(tree, j.edges);
  const rank = new Map(order.map((n, k) => [n, k]));
  return [...j.publish].sort((a, b) => (rank.get(a.node) ?? 0) - (rank.get(b.node) ?? 0) || a.artefact.localeCompare(b.artefact));
}

/** One declared publish-time artefact, resolved: which instance, where on disk, who writes it. */
export interface DeclaredArtefact {
  instance: string;
  /** Absolute. */
  abs: string;
  /** Instance-relative, as declared. */
  path: string;
  writer: readonly string[];
  because: "checkout" | "state";
}

/** Every instance's `builtAtPublish`, instances dependency-first (the order `readTree` gives), entries as declared. */
export function declaredPlan(repoRoot = REPO_ROOT, cause?: "checkout" | "state"): DeclaredArtefact[] {
  const order = readTree(repoRoot).map((i) => i.name);
  const roots = new Map(readInstances(repoRoot).map((i) => [i.name, i.root] as const));
  const out: DeclaredArtefact[] = [];
  for (const name of order) {
    const root = roots.get(name);
    if (root === undefined) continue;
    const decl = readDeclaration(root) as { builtAtPublish?: Array<{ path: string; writer: string[]; because: "checkout" | "state" }> } | undefined;
    for (const e of decl?.builtAtPublish ?? []) {
      if (cause !== undefined && e.because !== cause) continue;
      out.push({ instance: name, abs: join(root, e.path), path: e.path, writer: e.writer, because: e.because });
    }
  }
  return out;
}

/** The scripts to run, each once, in first-mention order. */
export function writersOf(plan: readonly DeclaredArtefact[]): string[] {
  return [...new Set(plan.flatMap((a) => a.writer))];
}

/** Built means present and, for a directory, holding at least one file. */
export function built(a: Pick<DeclaredArtefact, "abs" | "path">): boolean {
  if (!existsSync(a.abs)) return false;
  if (!a.path.endsWith("/")) return statSync(a.abs).isFile();
  const walk = (d: string): boolean => readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? walk(join(d, e.name)) : true));
  return statSync(a.abs).isDirectory() && walk(a.abs);
}

if (import.meta.main) {
  const plan = publishPlan();
  const listOnly = process.argv.includes("--list");
  console.log(`derive:publish — ${plan.length} artefact(s) built at publish`);
  for (const a of plan) console.log(`  ${a.artefact}  ← ${a.via.join(" ← ")}  (writer: ${a.writer.join(", ")})`);
  for (const a of listOnly ? [] : plan) {
    // The writer list holds scripts and, for a directory, template directories
    // it READS (ending in `/`); only the scripts are run.
    for (const w of a.writer.filter((p) => !p.endsWith("/"))) {
      const r = spawnSync("bun", ["run", w], { cwd: REPO_ROOT, stdio: "inherit" });
      if (r.status !== 0) {
        console.log(`::error::derive:publish: writer ${w} for ${a.artefact} exited ${r.status ?? "on a signal"}`);
        process.exit(1);
      }
    }
  }
  console.log(`  ✓ ${plan.length} artefact(s) built`);

  const at = process.argv.indexOf("--cause");
  const cause = at === -1 ? undefined : (process.argv[at + 1] as "checkout" | "state");
  if (cause !== undefined && cause !== "checkout" && cause !== "state") {
    console.log(`::error::derive:publish: --cause is checkout or state, not ${String(cause)}`);
    process.exit(2);
  }
  const declared = declaredPlan(REPO_ROOT, cause);
  const writers = writersOf(declared);
  console.log(`derive:publish — ${declared.length} declared artefact(s) (builtAtPublish${cause ? `, ${cause} only` : ""}), ${writers.length} writer(s)`);
  for (const a of declared) console.log(`  ${a.instance}/${a.path}  (${a.because}; writer: ${a.writer.join(", ")})`);
  if (listOnly) process.exit(0);
  for (const w of writers) {
    const r = spawnSync("bun", ["run", "cat", w], { cwd: REPO_ROOT, stdio: "inherit" });
    if (r.status !== 0) {
      console.log(`::error::derive:publish: declared writer \`${w}\` exited ${r.status ?? "on a signal"}`);
      process.exit(1);
    }
  }
  const empty = declared.filter((a) => !built(a));
  if (empty.length > 0) {
    for (const a of empty) console.log(`::error::derive:publish: ${a.instance}/${a.path} is declared built at publish, and ${a.writer.join(", ")} built nothing there`);
    process.exit(1);
  }
  console.log(`  ✓ ${declared.length} declared artefact(s) built`);
}
