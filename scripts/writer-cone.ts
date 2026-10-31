/**
 * What each publish-time writer READ and WROTE, recorded from its own run, for
 * the rerun-and-measure deploy (bean `fwtz`, option B; owner card 2026-10-31).
 *
 * @module cat-harness-tools/scripts/writer-cone
 * @graphNode none — a helper of `derive-at-publish.ts`; it judges no graph
 *
 * ## Why records and not declarations
 *
 * The docs-site cone dry run predicted pages before the build and fell back to
 * "full" on every deploy: about 90% of a deploy's files come out of writers,
 * and no writer says which outputs depend on which inputs. Hand-kept lists of
 * that would drift, and the owner's rule is "declared or derived, never
 * hand-narrowed" (`task-io.ts`). So, as `ci-cone.ts` does for checks (bean
 * `4rbc`), the read set is DERIVED from the run itself: each writer runs under
 * `strace`, and what it touched inside the checkout is recorded with the state
 * of each path, beside what it wrote.
 *
 * ## The argument, the same one `ci-cone.ts` makes
 *
 * Take a writer run W that read the set R and wrote the set O. A later run with
 * the same code (the fingerprint hashes the script's import closure and the
 * audited environment) and the same state at every path in R and every git
 * answer it got takes the same path, reads the same R and writes the same O.
 * So when every recorded read matches, its outputs as the last full deploy
 * published them ARE what it would write, and the writer need not run. A run
 * that reached an input the audit cannot hash (a `traced` site), read a path
 * and then rewrote it, or whose fingerprint moved while it ran, records
 * nothing, so that writer always runs.
 *
 * ## What this step does: RECORD, skip nothing
 *
 * With `CAT_WRITER_RECORD=1` (and a working `strace`), `derive:publish` runs
 * every writer traced and writes {@link WRITER_RECORD_FILE}. Nothing is
 * skipped and every verdict is the writer's own: a traced run that fails is
 * asked again untraced, and that answer stands. The deploy keeps the file
 * next to the build stamp, so the NEXT deploy can ask {@link decideWriter}
 * which writers could have been skipped, and the dry run can check that
 * answer against what the full build wrote.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { gitKey, gitState, MAX_TRACE_BYTES, parseTrace, pathState, STRACE_ARGS, TRACER_VERSION, type GitCall, type ReadSet } from "./ci-cone.ts";
import { fingerprint, FileDigests, toolsLine } from "./input-hash.ts";

/** Bump when the record's meaning changes; a record from another version is ignored, so every writer runs. */
export const WRITER_RECORD_VERSION = 1;
// input-site: inert #f12d34f1 — names the build-output directory the records live in; no writer reads it
export const WRITER_CONE_DIR = join("build", "writer-cone");
export const WRITER_RECORD_FILE = join(WRITER_CONE_DIR, "records.json");
/** Turns recording on in `derive:publish`. */
export const WRITER_RECORD_ENV = "CAT_WRITER_RECORD";

/** One writer's traced run. */
export interface WriterRecord {
  /** The main commit whose deploy recorded it. */
  sha: string;
  /** The fingerprint WITHOUT the tree: script closure, audited environment, tool versions ({@link writerBase}). */
  base: string;
  /** `clean` when the input-site audit cleared the writer's closure; otherwise why not, and the record is evidence, not proof. */
  audit: string;
  /** Every path it touched inside the checkout and did not write, with its state after the run. */
  reads: Record<string, string>;
  /** Every git command it ran, and what that command answered after the run. */
  git: Record<string, string>;
  /** Every path it wrote that exists after the run, with its state. */
  outputs: Record<string, string>;
}

export interface WriterRecords {
  version: number;
  tracer: number;
  /** The main commit whose deploy wrote this file. */
  sha: string;
  writers: Record<string, WriterRecord>;
  /** Writers that ran and recorded nothing, with why: they always run. */
  unrecorded: Record<string, string>;
}

export function emptyRecords(sha: string): WriterRecords {
  return { version: WRITER_RECORD_VERSION, tracer: TRACER_VERSION, sha, writers: {}, unrecorded: {} };
}

/** The record file, or `undefined` when it is absent, corrupt or of another version: then every writer runs. */
export function loadWriterRecords(root: string, file = join(root, WRITER_RECORD_FILE)): WriterRecords | undefined {
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as WriterRecords;
    if (raw.version === WRITER_RECORD_VERSION && raw.tracer === TRACER_VERSION && typeof raw.writers === "object" && raw.writers !== null) return raw;
  } catch {
    /* absent or corrupt */
  }
  return undefined;
}

export function saveWriterRecords(root: string, records: WriterRecords): void {
  const path = join(root, WRITER_RECORD_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(records, null, 1)}\n`);
}

/** What a writer record is keyed on besides its reads, or why nothing can be. */
export type WriterBase = { hash: string; audit: string } | { undetermined: string };

/**
 * The key a writer record is keyed on besides its reads: the input-hash
 * fingerprint WITHOUT the tree (script closure, audited environment, tools),
 * as `ci-cone.ts` `coneFingerprint` does, when the input-site audit clears
 * the closure (`audit: "clean"`).
 *
 * Measured 2026-10-31: none of the 46 publish-time writers clears the audit
 * today (unannotated env, clock and spawn sites in shared modules), so that
 * alone would record nothing. The trace still sees every source file the run
 * loads, since they sit in the checkout, so "same code" is in the recorded
 * reads either way. What only the audit can vouch for is the environment, the
 * clock and the network. So a writer that fails the audit is keyed on the tools,
 * its script line and `bun.lock` (packages are not traced), and its record says
 * why (`audit`). Such a record is EVIDENCE for the dry run to test against the
 * full build, never proof on its own.
 */
export function writerBase(root: string, scripts: Readonly<Record<string, string>>, writer: string, digests: FileDigests): WriterBase {
  let why: string;
  try {
    const fp = fingerprint(root, scripts, [writer], { inputs: [] }, digests, undefined, { treeReplayed: true });
    if ("hash" in fp) return { hash: fp.hash, audit: "clean" };
    why = fp.undetermined;
  } catch (e) {
    why = (e as Error).message;
  }
  const command = scripts[writer];
  if (command === undefined) return { undetermined: `\`${writer}\` is not a package script` };
  const h = createHash("sha256");
  h.update(`writer-cone weak base v1\n${toolsLine()}script ${writer} = ${command}\n`);
  if (existsSync(join(root, "bun.lock"))) h.update(`bun.lock\0${digests.digest("bun.lock")}\n`);
  return { hash: h.digest("hex"), audit: why };
}

/** `argv`, run under the tracer, writing its trace to `log`. */
export function tracedArgv(argv: readonly string[], log: string): string[] {
  return ["strace", ...STRACE_ARGS, "-o", log, ...argv];
}

/** The trace at `log` as a read set, or why it cannot be one. */
export function readTraceFile(log: string, root: string): ReadSet {
  if (!existsSync(log)) return { undetermined: "no trace was written" };
  const size = statSync(log).size;
  if (size > MAX_TRACE_BYTES) return { undetermined: `the trace is ${size} bytes, more than ${MAX_TRACE_BYTES}` };
  return parseTrace(readFileSync(log, "utf-8"), root, { writes: "collect" });
}

/**
 * The record of one traced writer run, or why it records nothing. It needs
 * all of: the run succeeded, it reached no `traced` site, its trace can be
 * enumerated, and its fingerprint was the same before and after.
 */
export function writerRecordOf(a: {
  sha: string;
  ran: boolean;
  before: WriterBase;
  after: WriterBase;
  reads: ReadSet;
  reached: string | undefined;
  root: string;
  digests: FileDigests;
  /** Answers a git call now; tests replace it. */
  git?: (root: string, c: GitCall) => string;
}): WriterRecord | { none: string } {
  if (!a.ran) return { none: "the writer did not succeed" };
  if ("undetermined" in a.before) return { none: a.before.undetermined };
  if ("undetermined" in a.after || a.after.hash !== a.before.hash) return { none: "its script, imports or audited environment moved while it ran" };
  if (a.reached !== undefined) return { none: `the run reached a traced input site (${a.reached})` };
  if ("undetermined" in a.reads) return { none: a.reads.undetermined };
  // A path it probed absent and then created is its own output, never an
  // input: a skipped writer's outputs are put back from the published site.
  const reads: Record<string, string> = {};
  for (const p of a.reads.paths) reads[p] = pathState(a.root, p, a.digests);
  const outputs: Record<string, string> = {};
  for (const p of a.reads.writes ?? []) {
    const s = pathState(a.root, p, a.digests);
    if (s !== "absent") outputs[p] = s;
  }
  const git: Record<string, string> = {};
  for (const c of a.reads.git) git[gitKey(c)] = (a.git ?? gitState)(a.root, c);
  return { sha: a.sha, base: a.before.hash, audit: a.before.audit, reads, git, outputs };
}

/** `proof`: the record's audit was clean, so the skip rests on the argument above; otherwise it is evidence the dry run must confirm. */
export type WriterDecision = { skip: true; sha: string; proof: boolean; why: string } | { skip: false; why: string };

/**
 * Whether `writer` could be skipped now: its fingerprint and the state of
 * every path it read, and every git answer it got, match its record exactly.
 * Asked BEFORE any writer runs, so a predecessor's outputs are compared as the
 * checkout holds them then; a writer whose predecessor runs is asked again
 * after it (the dry run's job, not this function's).
 */
export function decideWriter(
  records: WriterRecords | undefined,
  writer: string,
  base: WriterBase,
  root: string,
  digests: FileDigests,
  git: (root: string, c: GitCall) => string = gitState,
): WriterDecision {
  if (records === undefined) return { skip: false, why: "no writer records from a full deploy" };
  const rec = records.writers[writer];
  if (rec === undefined) return { skip: false, why: records.unrecorded[writer] ? `not recorded: ${records.unrecorded[writer]}` : `the deploy at ${records.sha.slice(0, 12)} recorded nothing for it` };
  if ("undetermined" in base) return { skip: false, why: `no key: ${base.undetermined}` };
  if (base.hash !== rec.base) return { skip: false, why: "its script, imports, audited environment or tools changed" };
  for (const [p, state] of Object.entries(rec.reads)) {
    let now: string;
    try {
      now = pathState(root, p, digests);
    } catch (e) {
      return { skip: false, why: `could not read ${p}: ${(e as Error).message}` };
    }
    if (now !== state) return { skip: false, why: `${p || "."} changed` };
  }
  for (const [key, state] of Object.entries(rec.git)) {
    let call: GitCall;
    try {
      const [cwd, ...args] = JSON.parse(key) as string[];
      call = { cwd: cwd!, args };
    } catch {
      return { skip: false, why: `an unreadable git record ${key}` };
    }
    if (git(root, call) !== state) return { skip: false, why: `git ${call.args.join(" ")} answers differently` };
  }
  const proof = rec.audit === "clean";
  return {
    skip: true,
    sha: rec.sha,
    proof,
    why: `reads unchanged since ${rec.sha.slice(0, 12)} (${Object.keys(rec.reads).length} paths, ${Object.keys(rec.outputs).length} outputs)${proof ? "" : `; evidence only, the audit did not clear it: ${rec.audit}`}`,
  };
}

/** One writer, judged after a full build: could it have been skipped, and would that have been right? */
export type WriterVerdict =
  | { writer: string; verdict: "rerun"; why: string }
  | { writer: string; verdict: "skip-safe"; proof: boolean; outputs: number }
  | { writer: string; verdict: "skip-unsafe"; proof: boolean; differs: string[] };

/**
 * The dry run of the rerun-and-measure switch for writers. After a FULL
 * build, every writer the previous deploy recorded is asked {@link
 * decideWriter} against the checkout as it stands (its predecessors' fresh
 * outputs included). One that could have been skipped is then checked: each
 * output its record names must be what this build wrote, and no file this
 * build wrote under its declared outputs may be missing from the record. A
 * `skip-unsafe` writer is one the switch would have served stale.
 */
export function verifyWriters(o: {
  prev: WriterRecords | undefined;
  writers: readonly string[];
  base: (writer: string) => WriterBase;
  root: string;
  digests: FileDigests;
  /** Every file under the writer's declared outputs now, repo-relative. */
  filesNow: (writer: string) => string[];
  git?: (root: string, c: GitCall) => string;
}): WriterVerdict[] {
  return o.writers.map((w): WriterVerdict => {
    const d = decideWriter(o.prev, w, o.base(w), o.root, o.digests, o.git);
    if (!d.skip) return { writer: w, verdict: "rerun", why: d.why };
    const rec = o.prev!.writers[w]!;
    const differs: string[] = [];
    for (const [p, state] of Object.entries(rec.outputs)) if (pathState(o.root, p, o.digests) !== state) differs.push(p);
    for (const p of o.filesNow(w)) if (!(p in rec.outputs)) differs.push(`${p} (not in the record)`);
    return differs.length
      ? { writer: w, verdict: "skip-unsafe", proof: d.proof, differs: differs.sort() }
      : { writer: w, verdict: "skip-safe", proof: d.proof, outputs: Object.keys(rec.outputs).length };
  });
}

/** The step summary for {@link verifyWriters}: unsafe first, bounded. */
export function verifySummary(v: readonly WriterVerdict[], prevSha?: string): string {
  const unsafe = v.filter((x) => x.verdict === "skip-unsafe");
  const safe = v.filter((x) => x.verdict === "skip-safe");
  const rerun = v.filter((x) => x.verdict === "rerun");
  const lines = [
    "### Writers, rerun and measure — dry run (bean `fwtz`, option B)",
    "",
    `**${unsafe.length ? "unsafe" : "safe"}**${prevSha ? ` · records from ${prevSha.slice(0, 12)}` : ""} · could skip ${safe.length + unsafe.length} of ${v.length} · would have been stale ${unsafe.length} · must rerun ${rerun.length}`,
    "",
  ];
  for (const x of unsafe) if (x.verdict === "skip-unsafe") lines.push(`- \`${x.writer}\` would have been STALE${x.proof ? "" : " (evidence record)"}: ${x.differs.slice(0, 5).map((p) => `\`${p}\``).join(", ")}${x.differs.length > 5 ? ` … ${x.differs.length - 5} more` : ""}`);
  for (const x of safe) if (x.verdict === "skip-safe") lines.push(`- \`${x.writer}\` could skip: ${x.outputs} output(s) matched${x.proof ? " (proof)" : " (evidence)"}`);
  for (const x of rerun.slice(0, 20)) if (x.verdict === "rerun") lines.push(`- \`${x.writer}\` reruns: ${x.why}`);
  if (rerun.length > 20) lines.push(`- … ${rerun.length - 20} more rerun`);
  return lines.join("\n") + "\n";
}
