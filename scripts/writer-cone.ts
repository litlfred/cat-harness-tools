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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { gitKey, gitState, MAX_TRACE_BYTES, parseTrace, pathState, STRACE_ARGS, TRACER_VERSION, type GitCall, type ReadSet } from "./ci-cone.ts";
import { fingerprint, FileDigests, type Fingerprint } from "./input-hash.ts";

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
  /** The fingerprint WITHOUT the tree: script closure, audited environment, tool versions. */
  base: string;
  /** Every path it touched inside the checkout and did not write, with its state after the run (`absent` for one it probed and then created). */
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

/**
 * The fingerprint a writer record is keyed on: the script, its imports, the
 * audited environment and the tools, with NO tree input, because the recorded
 * reads stand in for the tree (`ci-cone.ts` `coneFingerprint`).
 */
export function writerBase(root: string, scripts: Readonly<Record<string, string>>, writer: string, digests: FileDigests): Fingerprint {
  try {
    return fingerprint(root, scripts, [writer], { inputs: [] }, digests, undefined, { treeReplayed: true });
  } catch (e) {
    return { undetermined: (e as Error).message };
  }
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
  before: Fingerprint;
  after: Fingerprint;
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
  const absent = new Set(a.reads.absentBefore ?? []);
  const reads: Record<string, string> = {};
  for (const p of a.reads.paths) reads[p] = pathState(a.root, p, a.digests);
  for (const p of absent) reads[p] = "absent";
  const outputs: Record<string, string> = {};
  for (const p of a.reads.writes ?? []) {
    const s = pathState(a.root, p, a.digests);
    if (s !== "absent") outputs[p] = s;
  }
  const git: Record<string, string> = {};
  for (const c of a.reads.git) git[gitKey(c)] = (a.git ?? gitState)(a.root, c);
  return { sha: a.sha, base: a.before.hash, reads, git, outputs };
}

export type WriterDecision = { skip: true; sha: string; why: string } | { skip: false; why: string };

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
  base: Fingerprint,
  root: string,
  digests: FileDigests,
  git: (root: string, c: GitCall) => string = gitState,
): WriterDecision {
  if (records === undefined) return { skip: false, why: "no writer records from a full deploy" };
  const rec = records.writers[writer];
  if (rec === undefined) return { skip: false, why: records.unrecorded[writer] ? `not recorded: ${records.unrecorded[writer]}` : `the deploy at ${records.sha.slice(0, 12)} recorded nothing for it` };
  if ("undetermined" in base) return { skip: false, why: `fingerprint undetermined: ${base.undetermined}` };
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
  return { skip: true, sha: rec.sha, why: `reads unchanged since ${rec.sha.slice(0, 12)} (${Object.keys(rec.reads).length} paths, ${Object.keys(rec.outputs).length} outputs)` };
}
