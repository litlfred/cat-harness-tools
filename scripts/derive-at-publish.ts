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
 * instance's `builtAtPublish` (`schemas/kg/built-at-publish.ts`) lists artefacts
 * no commit of it can hold current — computed over the checkout's other
 * instances (`checkout`), or from a branch-kept graph (`state`) — and names
 * each one's writer as a package script. After the branch-derived artefacts
 * above, this runs every such writer once — in the order {@link writersOf} works
 * out from the declarations (see "Writer order" below) — and then REFUSES an entry that
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
 * ## Writer order: lowest layer first, plus the edges the declarations state
 *
 * Owner, 2026-10-15 ("A1"). The base order is the instances' dependency order
 * (lowest layer first, a function of the declared `needs` alone, never of the
 * index's listing order), each instance's entries in their declared order,
 * and a writer named by several entries runs ONCE. On top of that, two kinds
 * of edge, both read from the declarations and both hard:
 *
 * - an instance's own declared order: each of its writers runs after the one
 *   it lists before it (`processes:viz` after `render:bpmn`, `navbar:include`
 *   after the `docs:harness` whose `harness.json` it renders);
 * - a READ EDGE (`reads` on an entry, `schemas/kg/built-at-publish.ts` in
 *   cat-harness): the entry's writers run after the writers of every OTHER
 *   instance's entry that fills (`directory`) a directory of one of those
 *   kinds.
 *
 * The case the second exists for (measured 2026-10-15): cat-harness's
 * `docs/_data/harness.json` (`docs:harness`) gives an IG instance a folio
 * link and a rail scope only when that IG's `docs/` exists, and that
 * directory is the IG's own publish-time artefact (its `<ig>:pages` writer).
 * Lowest-first wrote the tiles first, so one clean `derive:publish` published
 * the platform site with the IG as a landing-page section and no rail scope
 * (`foreign-site-scope.test.ts` (a), `viewer-undiscovered.test.ts`). An
 * interim fix ran every instance consumers first; the ruling replaced it with
 * the declared edge, `reads: ["docs"]` on that entry, because which way a read
 * goes is a fact the reading writer knows, and a global inversion only guesses
 * it (it also ran the shared `jsonld:contexts` before the cat-harness
 * documents it reads were written).
 *
 * The sort is stable (a writer runs as early as its edges allow, ties broken
 * by first mention), and a cycle is REFUSED, naming the writers in it: two
 * writers that each read the other's output have no order that is right.
 *
 * ## Reused when nothing it reads moved, and run side by side (issue #400)
 *
 * The declared writers (28 of them for cat-harness's 149 entries) ran one
 * after another with nothing remembered, and `smart:pages` ran twice in a
 * layer-PR job. Now each declared writer is keyed (`derive-cache.ts`: its
 * input-hash fingerprint — the audited script closure, tool versions and its
 * declared inputs, or the whole tree when it declares none — plus its
 * predecessors' outputs), and a writer whose key has a recorded result is
 * RESTORED from `CAT_DERIVE_CACHE_DIR` (default `build/derive-cache`) and
 * reported `reused <writer> (inputs unchanged since <key>)` — never as built.
 * Writers the declared edges leave unordered run at once, at most
 * `CAT_DERIVE_JOBS` (default: the cores); with `CAT_DERIVE_JOBS=1` it is the
 * sequential order above, output unbuffered. `--no-cache` turns reuse off;
 * so does `CI`, unless `CAT_DERIVE_CACHE_DIR` opts in.
 *
 * ```
 * bun run cat derive:publish            # run every writer
 * bun run cat derive:publish --list     # print what would run, run nothing
 * bun run cat derive:publish --no-cache # run every writer, reuse nothing
 * ```
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { judge, readTree, renderingOrder, trackedIn, type PublishArtefact } from "./check-derived-from.ts";
import { readInstances } from "./check-import-direction.ts";
import { readDeclaration } from "../schemas/kg/cat-harness.ts";
import { flattenDependencies } from "../schemas/kg/dependency-order.js";
import { HARNESS_ROOT } from "./lib/roots.ts";
import { NOT_APPLICABLE_EXIT, NOT_APPLICABLE_REASON_ENV } from "./lib/not-applicable.ts";
import { dirname } from "node:path";
import { scriptsOf } from "../schemas/sdlc/script-table.ts";
import { FileDigests, TRACKED, fingerprint, trackedTreeDigest, type Fingerprint } from "./input-hash.ts";
import { TASK_IO } from "./task-io.ts";
import {
  cacheDirOf,
  commitStaged,
  deriveCacheEnabled,
  digestPaths,
  hasEntry,
  jobsOf,
  nestedForeign,
  outputsByWriter,
  predecessorsOf,
  restoreOutputs,
  schedule,
  stageOutputs,
  writerKey,
} from "./derive-cache.ts";
import { openTrace } from "../schemas/sdlc/input-trace.ts";
import { emptyRecords, readTraceFile, saveWriterRecords, STRACE_SEES, tracedArgv, underOutputs, writerBase, writerRecordOf, WRITER_RECORD_ENV, WRITER_RECORD_FILE } from "./writer-cone.ts";

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
  /** The kinds of directory, in other instances, its writers read (`reads`): the declared read edge. */
  reads?: readonly string[];
  /** The kinds of the declared directory this entry fills (`directory`), so a reader of those kinds is ordered after it. */
  fills?: readonly string[];
}

/**
 * The order instances' publish-time entries are read in: dependency order,
 * lowest layer first, a function of the declared `needs` alone. The base of
 * {@link writersOf}; the declared edges reorder writers on top of it.
 */
export function writingOrder(repoRoot = REPO_ROOT): string[] {
  const all = readInstances(repoRoot);
  const names = new Set(all.map((i) => i.name));
  const flat = flattenDependencies(all.map((i) => ({ id: i.name, needs: (i.needs ?? []).filter((n) => names.has(n)), fatal: false })));
  if (flat.problems.length > 0) {
    throw new Error(`derive:publish: the instance needs graph is broken — ${flat.problems.map((p) => p.detail).join("; ")}`);
  }
  return flat.order.map((s) => s.id);
}

/** Every instance's `builtAtPublish`, instances lowest layer first ({@link writingOrder}), entries as declared. */
export function declaredPlan(repoRoot = REPO_ROOT, cause?: "checkout" | "state"): DeclaredArtefact[] {
  const order = writingOrder(repoRoot);
  const roots = new Map(readInstances(repoRoot).map((i) => [i.name, i.root] as const));
  const out: DeclaredArtefact[] = [];
  for (const name of order) {
    const root = roots.get(name);
    if (root === undefined) continue;
    const decl = readDeclaration(root) as
      | {
          builtAtPublish?: Array<{ path: string; writer: string[]; because: "checkout" | "state"; reads?: string[]; directory?: string }>;
          directories?: Array<{ id?: string; graphTypologies?: string[]; kinds?: string[] }>;
        }
      | undefined;
    const kindsOf = new Map((decl?.directories ?? []).map((d) => [d.id, d.graphTypologies ?? d.kinds ?? []] as const));
    for (const e of decl?.builtAtPublish ?? []) {
      if (cause !== undefined && e.because !== cause) continue;
      const fills = e.directory === undefined ? [] : (kindsOf.get(e.directory) ?? []);
      out.push({
        instance: name,
        abs: join(root, e.path),
        path: e.path,
        writer: e.writer,
        because: e.because,
        ...(e.reads?.length ? { reads: e.reads } : {}),
        ...(fills.length ? { fills } : {}),
      });
    }
  }
  return out;
}

/** One ordering edge: `before` runs before `after`, and why the declarations say so. */
export interface WriterEdge {
  before: string;
  after: string;
  why: string;
}

/**
 * The ordering edges the plan declares (see "Writer order" above): each
 * instance's writers in the order it lists them, and every `reads` edge.
 */
export function writerEdges(plan: readonly DeclaredArtefact[]): WriterEdge[] {
  const edges: WriterEdge[] = [];
  const byInstance = new Map<string, string[]>();
  for (const a of plan) {
    const seq = byInstance.get(a.instance) ?? [];
    for (const w of a.writer) if (!seq.includes(w)) seq.push(w);
    byInstance.set(a.instance, seq);
  }
  for (const [instance, seq] of byInstance) {
    for (let k = 1; k < seq.length; k++) edges.push({ before: seq[k - 1]!, after: seq[k]!, why: `${instance} lists ${seq[k - 1]} before ${seq[k]}` });
  }
  for (const reader of plan) {
    for (const kind of reader.reads ?? []) {
      for (const source of plan) {
        if (source.instance === reader.instance || !(source.fills ?? []).includes(kind)) continue;
        for (const before of source.writer) {
          for (const after of reader.writer) {
            if (before !== after) edges.push({ before, after, why: `${reader.instance}/${reader.path} reads ${kind}, which ${source.instance}/${source.path} fills` });
          }
        }
      }
    }
  }
  return edges;
}

/**
 * The scripts to run, each once: first-mention order, reordered by the
 * declared edges ({@link writerEdges}) with a stable topological sort, so a
 * writer runs as early as its edges allow. Throws on a cycle, naming it.
 */
export function writersOf(plan: readonly DeclaredArtefact[]): string[] {
  const nodes = [...new Set(plan.flatMap((a) => a.writer))];
  const rank = new Map(nodes.map((n, k) => [n, k] as const));
  const edges = writerEdges(plan);
  const next = new Map<string, Set<string>>(nodes.map((n) => [n, new Set<string>()]));
  const indegree = new Map<string, number>(nodes.map((n) => [n, 0]));
  for (const e of edges) {
    if (next.get(e.before)!.has(e.after)) continue;
    next.get(e.before)!.add(e.after);
    indegree.set(e.after, indegree.get(e.after)! + 1);
  }
  const out: string[] = [];
  const ready = nodes.filter((n) => indegree.get(n) === 0);
  while (ready.length > 0) {
    ready.sort((a, b) => rank.get(a)! - rank.get(b)!);
    const n = ready.shift()!;
    out.push(n);
    for (const m of next.get(n)!) {
      indegree.set(m, indegree.get(m)! - 1);
      if (indegree.get(m) === 0) ready.push(m);
    }
  }
  if (out.length < nodes.length) {
    const stuck = new Set(nodes.filter((n) => !out.includes(n)));
    const why = edges.filter((e) => stuck.has(e.before) && stuck.has(e.after)).map((e) => `${e.before} → ${e.after} (${e.why})`);
    throw new Error(`derive:publish: the publish-time writers' declared order has a cycle among ${[...stuck].join(", ")}: ${why.join("; ")}`);
  }
  return out;
}

/** Built means present and, for a directory, holding at least one file. */
export function built(a: Pick<DeclaredArtefact, "abs" | "path">): boolean {
  if (!existsSync(a.abs)) return false;
  if (!a.path.endsWith("/")) return statSync(a.abs).isFile();
  const walk = (d: string): boolean => readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? walk(join(d, e.name)) : true));
  return statSync(a.abs).isDirectory() && walk(a.abs);
}

/** Whether `strace` runs here (writer records need it). */
export function straceWorks(): boolean {
  // input-site: inert #50824495 — probes for the tracer; its answer only turns recording on or off
  const r = spawnSync("strace", ["-f", "-qq", "-o", "/dev/null", "true"], { stdio: "ignore" });
  return r.status === 0;
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
 * {@link runWriter}, without blocking, so writers the declared edges leave
 * unordered run side by side. `buffer`: collect the writer's output and hand
 * it back, so parallel writers' logs come out whole rather than interleaved.
 */
// input-site: inert #8d7029a5 — the environment handed on to a writer by default; the writer's own reads are its own sites
export function runWriterAsync(argv: readonly string[], cwd: string, buffer: boolean, env: Record<string, string | undefined> = process.env): Promise<{ outcome: WriterOutcome; log: string }> {
  // input-site: inert #d24ef100 — a temp dir for the writer's reason, removed before this resolves
  const dir = mkdtempSync(join(tmpdir(), "derive-publish-"));
  const file = join(dir, "not-applicable.txt");
  return new Promise((done) => {
    let log = "";
    // input-site: inert #8cc2849c — hands the environment on to a writer, plus the path it writes its reason to
    const child = spawn(argv[0]!, argv.slice(1), { cwd, stdio: buffer ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...env, [NOT_APPLICABLE_REASON_ENV]: file } });
    child.stdout?.on("data", (d: Buffer) => (log += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (log += d.toString()));
    const finish = (status: number | null) => {
      const reason = existsSync(file) ? readFileSync(file, "utf-8") : undefined;
      rmSync(dir, { recursive: true, force: true });
      done({ outcome: outcomeOf(status, reason), log });
    };
    child.on("error", (e) => {
      log += `${String(e)}\n`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

/**
 * The input-hash fingerprint a declared writer is keyed on (`derive-cache.ts`):
 * its own `task-io` inputs when it declares them, else `{tracked}` — the whole
 * tree, never a narrowed guess (`task-io.ts`, "The rule for adding one").
 */
export function writerFingerprint(root: string, scripts: Readonly<Record<string, string>>, writer: string, digests: FileDigests): Fingerprint {
  return fingerprint(root, scripts, [writer], { inputs: TASK_IO[writer]?.inputs ?? [TRACKED] }, digests);
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
  let writers: string[];
  try {
    writers = writersOf(declared);
  } catch (e) {
    console.log(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  console.log(`derive:publish — ${declared.length} declared artefact(s) (builtAtPublish${cause ? `, ${cause} only` : ""}), ${writers.length} writer(s)`);
  for (const a of declared) console.log(`  ${a.instance}/${a.path}  (${a.because}; writer: ${a.writer.join(", ")}${a.reads ? `; reads: ${a.reads.join(", ")}` : ""})`);
  console.log(`  writer order: ${writers.join(" → ")}`);
  if (listOnly) process.exit(0);
  // Every writer runs, whatever an earlier one did, so one run names every
  // failure rather than the first (smart-ra#66 hid three behind uml:overview).
  // A failure still fails the step, after the rest have run.
  const skipped = new Map<string, string>();
  const failed = new Map<string, number | null>();
  const reused = new Map<string, string>();
  // ── Issue #400: key, reuse, and run unordered writers side by side ──
  // input-site: inert #c6583b74 — the cache directory, the job count and the CI switch decide how the writers run, never what they write
  const env = process.env;
  const jobs = jobsOf(env);
  const cacheOn = deriveCacheEnabled(process.argv, env);
  const cacheDir = cacheDirOf(REPO_ROOT, env);
  const edges = writerEdges(declared);
  const byWriter = outputsByWriter(declared, REPO_ROOT);
  const allOutputs = [...new Set([...byWriter.values()].flat())];
  const scripts = cacheOn.on ? scriptsOf(REPO_ROOT) : {};
  const digests = new FileDigests(REPO_ROOT);
  // One tree digest for the run, over the tree as it stands before any declared
  // writer runs, leaving out every declared output (each run rewrites them).
  const treeBefore = cacheOn.on ? trackedTreeDigest(REPO_ROOT, digests, { exclude: allOutputs }) : undefined;
  if (treeBefore !== undefined) digests.tree = treeBefore;
  const base = new Map<string, Fingerprint>(cacheOn.on ? writers.map((w) => [w, writerFingerprint(REPO_ROOT, scripts, w, digests)] as const) : []);
  const staged = new Map<string, { key: string; path: string }>();
  // ── Bean fwtz, option B: record what each writer read and wrote (skips nothing) ──
  // input-site: inert #5f0c2a71 — the switch decides whether writers run traced, never what they write
  const recordOn = env[WRITER_RECORD_ENV] === "1" && straceWorks();
  // input-site: inert #a3e7d915 — the commit names the record; it is not an input of any writer
  const records = emptyRecords(env.GITHUB_SHA ?? "local");
  const recScripts = recordOn ? (cacheOn.on ? scripts : scriptsOf(REPO_ROOT)) : {};
  if (env[WRITER_RECORD_ENV] === "1" && !recordOn) console.log("  writer records: OFF (strace does not run here)");
  console.log(
    `  ${jobs} job(s); reuse ${cacheOn.on ? `ON (${cacheDir}${treeBefore && "undetermined" in treeBefore ? `; tree undetermined: ${treeBefore.undetermined}` : ""})` : `OFF (${cacheOn.why})`}`,
  );
  /** Run `w` traced and record it; the outcome is always the writer's own (a failed traced run is asked again untraced). */
  const runRecorded = async (w: string): Promise<{ outcome: WriterOutcome; log: string }> => {
    const before = writerBase(REPO_ROOT, recScripts, w, new FileDigests(REPO_ROOT));
    const trace = openTrace(REPO_ROOT);
    // input-site: inert #fd4c3e00 — a scratch file for the trace, removed before this returns
    const traceLog = join(tmpdir(), `writer-cone-${process.pid}-${w.replace(/[^\w.-]/g, "_")}.strace`);
    const first = await runWriterAsync(tracedArgv(["bun", "run", "cat", w], traceLog), REPO_ROOT, jobs > 1, trace.env);
    try {
      if (first.outcome.kind !== "ran") {
        records.unrecorded[w] = `the traced run ${first.outcome.kind === "failed" ? `exited ${first.outcome.exit}` : "was skipped"}`;
        trace.reached();
        return first.outcome.kind === "skipped" ? first : await runWriterAsync(["bun", "run", "cat", w], REPO_ROOT, jobs > 1);
      }
      const digests = new FileDigests(REPO_ROOT);
      const rec = writerRecordOf({
        sha: records.sha,
        ran: true,
        before,
        after: writerBase(REPO_ROOT, recScripts, w, digests),
        reads: readTraceFile(traceLog, REPO_ROOT, underOutputs(byWriter.get(w) ?? [])),
        reached: trace.reached([], STRACE_SEES),
        root: REPO_ROOT,
        digests,
      });
      if ("none" in rec) records.unrecorded[w] = rec.none;
      else records.writers[w] = rec;
    } catch (e) {
      // Recording is never allowed to change the writer's outcome.
      records.unrecorded[w] = (e as Error).message;
    } finally {
      rmSync(traceLog, { force: true });
    }
    return first;
  };
  const runOne = async (w: string): Promise<WriterOutcome> => {
    const keep = nestedForeign(w, byWriter);
    const fp = base.get(w);
    let key: string | undefined;
    let why = cacheOn.on ? "" : "reuse off";
    if (fp !== undefined && "hash" in fp) {
      const before = [...predecessorsOf(w, edges)].sort().flatMap((p) => byWriter.get(p) ?? []);
      key = writerKey(w, fp.hash, digestPaths(REPO_ROOT, before, [...(byWriter.get(w) ?? [])]));
      if (hasEntry(cacheDir, w, key) && restoreOutputs(cacheDir, w, key, REPO_ROOT, keep)) {
        reused.set(w, key);
        console.log(`  reused ${w} (inputs unchanged since ${key.slice(0, 12)}${fp.wholeTree ? ", keyed on the whole tree" : ""})`);
        return { kind: "ran" };
      }
      why = `no result recorded for ${key.slice(0, 12)}`;
    } else if (fp !== undefined) {
      why = `inputs could not be determined: ${fp.undetermined}`;
    }
    const { outcome, log } = recordOn ? await runRecorded(w) : await runWriterAsync(["bun", "run", "cat", w], REPO_ROOT, jobs > 1);
    if (jobs > 1) process.stdout.write(`── ${w} ──\n${log}${log.endsWith("\n") || log === "" ? "" : "\n"}`);
    console.log(`  ran ${w} (${why})`);
    if (outcome.kind === "ran" && key !== undefined) staged.set(w, { key, path: stageOutputs(cacheDir, w, key, REPO_ROOT, byWriter.get(w) ?? [], keep) });
    return outcome;
  };
  const outcomes = await schedule(writers, edges, jobs, runOne);
  if (recordOn) {
    saveWriterRecords(REPO_ROOT, records);
    const un = Object.entries(records.unrecorded);
    console.log(`  writer records: ${Object.keys(records.writers).length} recorded, ${un.length} not (${WRITER_RECORD_FILE})`);
    for (const [w, why] of un) console.log(`    not recorded: ${w} — ${why}`);
  }
  for (const w of writers) {
    const o = outcomes.get(w)!;
    if (o.kind === "failed") {
      failed.set(w, o.exit);
      console.log(`::error::derive:publish: declared writer \`${w}\` exited ${o.exit ?? "on a signal"}`);
    }
    if (o.kind === "skipped") {
      skipped.set(w, o.why);
      console.log(`derive:publish: declared writer \`${w}\` skipped — it does not apply to this root: ${o.why}`);
    }
  }
  // Record only over a tree that held still (`derive-cache.ts`): the digest the
  // keys were computed over must be the digest now, fresh.
  if (staged.size > 0 && treeBefore !== undefined && "hash" in treeBefore) {
    const after = trackedTreeDigest(REPO_ROOT, new FileDigests(REPO_ROOT), { exclude: allOutputs });
    if ("hash" in after && after.hash === treeBefore.hash) {
      for (const [w, s] of staged) commitStaged(cacheDir, w, s.key, s.path);
      console.log(`  recorded ${staged.size} writer result(s) for reuse`);
    } else {
      rmSync(join(cacheDir, ".staging"), { recursive: true, force: true });
      console.log(`  recorded nothing: the tree outside the declared outputs moved during the run${"undetermined" in after ? ` (${after.undetermined})` : ""}`);
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
  console.log(`  ✓ ${judged.length} declared artefact(s) built or reused${reused.size ? ` (${reused.size} writer(s) reused: ${[...reused.keys()].join(", ")})` : ""}${notHere.length ? `, ${notHere.length} skipped (their writer does not apply to this root)` : ""}`);
}
