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
 * above, this runs every such writer once — instances CONSUMERS FIRST, each
 * instance's entries in its declared order — and then REFUSES an entry that
 * came out missing or empty:
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
 * A writer that exits non-zero fails the step, naming it — after every other
 * declared writer has run, so one run names every failure. A writer reads a
 * mounted graph and refuses an unmounted one (exit 2), so a build that forgot
 * `state:mount` fails here rather than publishing an empty page.
 *
 * ## Except a writer that says it does not apply to this root
 *
 * A writer that exits `NOT_APPLICABLE_EXIT` (78, `lib/not-applicable.ts`) has
 * said, with a reason, that THIS root cannot build its artefact: `uml:overview`
 * reads the QA working copy, which needs the gates workflow, and a document
 * folio (smart-ra) has none (smart-ra#66, run 38714163952). It is reported
 * SKIPPED with its reason, every other writer still runs, the artefacts that
 * name it are excused from the built-or-refused check (and listed), and the
 * step does not fail on it. Only the writer can say so — no list of writers or
 * roots lives here — so a root that has the prerequisite (the folio-assistant
 * index) runs it exactly as before, and any other non-zero exit still fails.
 *
 * ## Why consumers first
 *
 * A `checkout` artefact is, by the B1 rule, computed over the instances ABOVE
 * the one that serves it — the ones that `need` it. When one of those builds
 * part of its own tree at publish, the artefact below reads that output, so
 * its writer must run after it. Measured 2026-10-15: smart-trust's `docs/`
 * (`smart-trust:pages`) is built at publish, and cat-harness's
 * `docs/_data/harness.json` (`docs:harness`) gives smart-trust a folio link
 * and a rail scope only when that directory exists. In index order
 * cat-harness ran first, so one clean `derive:publish` published the platform
 * site with smart-trust as a landing-page section and no rail scope, and
 * `foreign-site-scope.test.ts` went red or green with whichever concurrent
 * build had reached `smart-trust:pages` first (cat-harness-tools PR #298, run
 * 38734014626). The other direction does not arise: an instance above reads a
 * lower layer at the checkout's pins, which is committed, never built here.
 *
 * ```
 * bun run cat derive:publish            # run every writer
 * bun run cat derive:publish --list     # print what would run, run nothing
 * ```
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { judge, readTree, renderingOrder, trackedIn, type PublishArtefact } from "./check-derived-from.ts";
import { readInstances } from "./check-import-direction.ts";
import { readDeclaration } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { flattenDependencies } from "@litlfred/cat-harness/schemas/dependency-order.js";
import { HARNESS_ROOT } from "./lib/roots.ts";
import { NOT_APPLICABLE_EXIT, NOT_APPLICABLE_REASON_ENV } from "./lib/not-applicable.ts";
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

/**
 * The order instances' publish-time writers run in: every instance before the
 * ones it `needs` (see "Why consumers first" above). It is the reverse of the
 * dependency-first order `flattenDependencies` gives, so it is a function of
 * the declared `needs` alone, never of the index's listing order.
 */
export function writingOrder(repoRoot = REPO_ROOT): string[] {
  const all = readInstances(repoRoot);
  const names = new Set(all.map((i) => i.name));
  const flat = flattenDependencies(all.map((i) => ({ id: i.name, needs: (i.needs ?? []).filter((n) => names.has(n)), fatal: false })));
  if (flat.problems.length > 0) {
    throw new Error(`derive:publish: the instance needs graph is broken — ${flat.problems.map((p) => p.detail).join("; ")}`);
  }
  return flat.order.map((s) => s.id).reverse();
}

/** Every instance's `builtAtPublish`, instances consumers first ({@link writingOrder}), entries as declared. */
export function declaredPlan(repoRoot = REPO_ROOT, cause?: "checkout" | "state"): DeclaredArtefact[] {
  const order = writingOrder(repoRoot);
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

/** What one writer did: ran, failed with an exit, or declined this root with a reason. */
export type WriterOutcome = { kind: "ran" } | { kind: "failed"; exit: number | null } | { kind: "skipped"; why: string };

/** Read a writer's exit, and its handed-over reason when it declined (`lib/not-applicable.ts`). */
export function outcomeOf(status: number | null, reason: string | undefined): WriterOutcome {
  if (status === 0) return { kind: "ran" };
  if (status === NOT_APPLICABLE_EXIT) return { kind: "skipped", why: reason?.trim() || "the writer gave no reason" };
  return { kind: "failed", exit: status };
}

/** Run one writer, handing it a file for its not-applicable reason. */
export function runWriter(argv: readonly string[], cwd: string): WriterOutcome {
  // input-site: inert #d24ef100 — a temp dir for the writer's reason, removed before this returns
  const dir = mkdtempSync(join(tmpdir(), "derive-publish-"));
  const file = join(dir, "not-applicable.txt");
  try {
    // input-site: inert #9142594c — hands the environment on to a writer, plus the path it writes its reason to
    const r = spawnSync(argv[0]!, argv.slice(1), { cwd, stdio: "inherit", env: { ...process.env, [NOT_APPLICABLE_REASON_ENV]: file } });
    return outcomeOf(r.status, existsSync(file) ? readFileSync(file, "utf-8") : undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The declared artefacts excused because a writer of theirs declined this root,
 * and the ones that must be built: an entry naming a skipped writer cannot be
 * complete, so it is reported rather than refused.
 */
export function excused(plan: readonly DeclaredArtefact[], skipped: ReadonlyMap<string, string>): { excused: DeclaredArtefact[]; judged: DeclaredArtefact[] } {
  const ex = plan.filter((a) => a.writer.some((w) => skipped.has(w)));
  return { excused: ex, judged: plan.filter((a) => !ex.includes(a)) };
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
      const o = runWriter(["bun", "run", w], REPO_ROOT);
      if (o.kind === "failed") {
        console.log(`::error::derive:publish: writer ${w} for ${a.artefact} exited ${o.exit ?? "on a signal"}`);
        process.exit(1);
      }
      if (o.kind === "skipped") console.log(`  skipped: writer ${w} for ${a.artefact} does not apply to this root — ${o.why}`);
    }
  }
  console.log(`  ✓ ${plan.length} artefact(s) handled`);

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
  // Every writer runs, whatever an earlier one did, so one run names every
  // failure rather than the first (smart-ra#66 hid three behind uml:overview).
  // A failure still fails the step, after the rest have run.
  const skipped = new Map<string, string>();
  const failed = new Map<string, number | null>();
  for (const w of writers) {
    const o = runWriter(["bun", "run", "cat", w], REPO_ROOT);
    if (o.kind === "failed") {
      failed.set(w, o.exit);
      console.log(`::error::derive:publish: declared writer \`${w}\` exited ${o.exit ?? "on a signal"}`);
    }
    if (o.kind === "skipped") {
      skipped.set(w, o.why);
      console.log(`derive:publish: declared writer \`${w}\` skipped — it does not apply to this root: ${o.why}`);
    }
  }
  const { excused: notHere, judged } = excused(declared, skipped);
  // An artefact of a failed writer is already named by its writer's failure.
  const empty = judged.filter((a) => !a.writer.some((w) => failed.has(w)) && !built(a));
  for (const a of empty) console.log(`::error::derive:publish: ${a.instance}/${a.path} is declared built at publish, and ${a.writer.join(", ")} built nothing there`);
  // Last, so the record's tail (layer-pr-checks.yml keeps the final 1500 characters) carries it.
  for (const [w, why] of skipped) {
    const of = notHere.filter((a) => a.writer.includes(w)).map((a) => `${a.instance}/${a.path}`);
    console.log(`  skipped ${w} (not applicable here: ${why}); not built: ${of.join(", ")}`);
  }
  if (failed.size > 0 || empty.length > 0) {
    const parts = [...failed].map(([w, x]) => `${w} exited ${x ?? "on a signal"}`);
    if (empty.length > 0) parts.push(`${empty.length} declared artefact(s) built empty`);
    console.log(`::error::derive:publish: ${parts.join("; ")}`);
    process.exit(1);
  }
  console.log(`  ✓ ${judged.length} declared artefact(s) built${notHere.length ? `, ${notHere.length} skipped (their writer does not apply to this root)` : ""}`);
}
