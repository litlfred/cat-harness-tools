#!/usr/bin/env bun
/**
 * Cap the total size of the `STAGING/<slug>/` review previews on the publish
 * branch, rotating the oldest off.
 *
 * @module scripts/staging-rotate
 * @covers none — a WRITER the deploy calls, not an audit: it removes previews over the cap, and judges nothing else
 *
 * ```sh
 * bun run cat-harness-tools/scripts/staging-rotate.ts --dir pages --current "$STAGING_SLUG" --summary-out rotated.txt
 * ```
 *
 * GitHub Pages deploys `gh-pages` as-is, and every per-PR preview under
 * `STAGING/<slug>/` is a full copy of the site, so the TOTAL must stay under
 * GitHub's 10 GB Pages artifact limit. The per-preview removal paths
 * (`cleanup` on PR close, `cleanup-dispatch` for orphans) do not bound it, so
 * this caps the total by SIZE (`MAX_PREVIEW_BYTES`, 3 GiB; preview sizes
 * vary too much for a count).
 *
 * The owner's rule is the confirmation `deletion-requires-confirmation` asks
 * for, given once for the whole class. Every removal still leaves a RECORD: a
 * `removed` entry in the render log, the preview's `staging-preview.json`
 * retired into `STAGING/_retired/`, and a line per preview in the commit
 * message and the job log, with its age and size.
 *
 * ## A rotated-off preview is not lost work
 *
 * A preview is a BUILD of a branch, not content. The next push to that pull
 * request's branch runs `feature-staging.yml` again, which re-stages it — and,
 * being the preview just staged, it can never be the one rotated off by that
 * run. So the cost of rotation is a 404 until the author pushes, never data.
 *
 * ## How "last updated" is determined, in order
 *
 * 1. **`STAGING/<slug>/.staged-at`** — an ISO timestamp this script writes into
 *    the preview being staged, every time it is staged. Authoritative.
 * 2. **The render log** — the latest `rendered` or `restored` entry for
 *    `STAGING/<slug>` in `_render-log/*.jsonl`.
 * 3. **`staging-preview.json`'s `builtAt`** — when the preview FIRST appeared
 *    (`staging-record.ts` deliberately does not walk it forward). A lower bound
 *    on the last update, so a preview known only this way sorts as older than
 *    it may be.
 * 4. **`git log -1 --format=%ct -- STAGING/<slug>`** — last resort. The
 *    workflow's checkout of `gh-pages` is depth 1, where this returns the TIP
 *    commit's time for every path, so it cannot order previews against each
 *    other; ties then break by slug so the choice is at least deterministic.
 *
 * In a SPARSE checkout (only `STAGING/<slug>`, `STAGING/_retired` and
 * `_render-log` on disk) the other previews are read from git instead: the
 * same four signals, in the same order, from the same files, read as blobs.
 * Nothing here reads a file's mtime.
 *
 * A preview whose age could not be determined at all sorts OLDEST and the log
 * says so — the one place this leans towards removal, since an unknown-age
 * preview predates every signal above and would otherwise sit outside the
 * bound forever.
 *
 * ## How a preview's size is known without its files
 *
 * The size is the bytes of the preview's files as checked out. Outside a
 * sparse checkout's cone that costs every blob of the preview (a blob's size
 * is in its header, and a blobless clone fetches the blob to read it), so
 * every staging also writes {@link STAGED_SIZE_FILE}: the bytes of every other
 * file in the preview and a digest of their blob ids and paths. Read from git,
 * it is trusted only when the digest matches the preview's tree, which a
 * blobless clone has; the size is then its bytes plus the record's own. Any
 * other writer that changed the preview since makes the digest disagree, and
 * the size is read from the blobs, fetched in one request — slower, never
 * different.
 *
 * ## What is never touched
 *
 * - **The preview being staged** (`--current`). It always stays, and the cap
 *   counts it.
 * - **`STAGING/_retired/`** and anything that is not a preview directory: plain
 *   files, dot-entries, `_`-prefixed reserved names, and names the staging
 *   slug pipeline could not have produced. An entry this script does not
 *   recognise is somebody else's.
 *
 * ## Why it runs inside the push loop
 *
 * The stage job re-reads `gh-pages` on every push attempt and re-runs this
 * against the fresh tree, so the removal pushed is always the one the current
 * tree warrants — never one decided on a stale read and replayed by a rebase.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { blobId, blobSizes, forEachBlob, isRegular, objectFormat, prefetchBlobs, removeFromIndex, sparseEntries, type GitEntry } from "./lib/git-blobs.ts";

import { RENDER_LOG_DIR, readRenderLog } from "../schemas/ui/render-log.ts";
import { readStagingPreview, retireStagingPreview, serializeStagingPreview } from "../schemas/sdlc/staging-preview.ts";
import { appendEntry, buildEntry } from "./render-log.ts";
import { RETIRED_DIR, SLUG_PATTERN, STAGING_PREFIX } from "./restore-staging.ts";
import { loadExisting } from "./staging-record.ts";

/**
 * THE CAP — defined here and nowhere else. The workflow passes no number, so
 * there is no second copy to drift.
 *
 * The TOTAL size of every preview under `STAGING/`, in bytes as checked out
 * (what Pages publishes, not what git stores). Owner ruling 2026-10-02
 * (issue #1868) capped the COUNT at ten; amended 2026-10-04 to a size budget
 * of *"3gb"*. Binary, 3 x 1024^3: every byte formatter in this repository
 * divides by 1024, and a budget stated in decimal would print as "2.79 GB"
 * beside the owner's 3 in the health report that checks it. The preview being staged counts
 * toward it. GitHub's Pages limit (10 GB) covers the live site too, which is
 * why the budget leaves most of it free.
 */
export const MAX_PREVIEW_BYTES = 3 * 1024 ** 3;

/** The per-preview stamp, inside the preview directory. */
export const STAGED_AT_FILE = ".staged-at";

/** The size record, inside the preview directory — see "How a preview's size is known". */
export const STAGED_SIZE_FILE = ".staged-size.json";

/** The record `staging-record.ts` writes beside each preview. */
const RECORD_FILE = "staging-preview.json";

export type AgeSource = "stamp" | "render-log" | "record" | "git" | "unknown";

export interface Preview {
  slug: string;
  /** Last update, epoch milliseconds. `undefined` when no signal answered. */
  updatedMs: number | undefined;
  source: AgeSource;
  /** Total size of the files under the preview, bytes. */
  bytes: number;
}

export interface RotationPlan {
  keep: Preview[];
  remove: Preview[];
}

/** Is this `STAGING/` entry name one this script may treat as a preview? */
export function isPreviewName(name: string): boolean {
  if (name === RETIRED_DIR) return false;
  if (name.startsWith(".") || name.startsWith("_")) return false;
  return SLUG_PATTERN.test(name);
}

/**
 * Decide what to keep. Pure.
 *
 * `current` is always kept, whether or not it is in `previews`, and its bytes
 * count first. The others are kept newest first while the running total stays
 * within `budget`; the first that does not fit goes, and so does everything
 * older than it. Strictly by recency, never by fit: keeping an older small
 * preview over a newer large one would make rotation depend on size, and a
 * reviewer could not tell from a preview's age whether it is still there.
 * Ties break by slug so two runs over the same tree agree. Unknown ages sort
 * oldest.
 *
 * A current preview larger than the whole budget on its own is still kept —
 * it is what this run was asked to publish — and every other preview goes.
 */
export function planRotation(previews: Preview[], current: string, budget: number = MAX_PREVIEW_BYTES): RotationPlan {
  if (!Number.isFinite(budget) || budget <= 0) throw new Error(`the preview budget must be a positive number of bytes, got ${budget}`);
  const cur = previews.filter((p) => p.slug === current);
  const others = previews
    .filter((p) => p.slug !== current)
    .sort((a, b) => {
      const ta = a.updatedMs ?? Number.NEGATIVE_INFINITY;
      const tb = b.updatedMs ?? Number.NEGATIVE_INFINITY;
      if (ta !== tb) return tb - ta;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  let total = cur.reduce((n, p) => n + p.bytes, 0);
  let fit = 0;
  while (fit < others.length && total + others[fit]!.bytes <= budget) total += others[fit++]!.bytes;
  return { keep: [...cur, ...others.slice(0, fit)], remove: others.slice(fit) };
}

/** The latest `rendered`/`restored` time per slug, from every log file under `dir`. */
export function renderLogTimes(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  const logDir = join(dir, RENDER_LOG_DIR);
  if (!existsSync(logDir)) return out;
  for (const f of readdirSync(logDir)) {
    if (!f.endsWith(".jsonl")) continue;
    const { entries } = readRenderLog(readFileSync(join(logDir, f), "utf8"));
    for (const e of entries) {
      if (e.event !== "rendered" && e.event !== "restored") continue;
      const m = /^STAGING\/([^/]+)$/.exec(e.subject.path);
      if (m === null) continue;
      const t = Date.parse(e.at);
      if (Number.isNaN(t)) continue;
      const prev = out.get(m[1]);
      if (prev === undefined || t > prev) out.set(m[1], t);
    }
  }
  return out;
}

/** Last-commit time of a path, epoch ms, or undefined. Injected in tests. */
export type GitTime = (dir: string, path: string) => number | undefined;

export const gitLastCommit: GitTime = (dir, path) => {
  const r = spawnSync("git", ["-C", dir, "log", "-1", "--format=%ct", "--", path], { encoding: "utf-8" });
  if (r.status !== 0) return undefined;
  const s = Number((r.stdout ?? "").trim());
  return Number.isFinite(s) && s > 0 ? s * 1000 : undefined;
};

function readTime(path: string, pick: (text: string) => string | undefined): number | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = pick(readFileSync(path, "utf8"));
    if (raw === undefined) return undefined;
    const t = Date.parse(raw.trim());
    return Number.isNaN(t) ? undefined : t;
  } catch {
    return undefined;
  }
}

function sizeOf(path: string): number {
  let total = 0;
  const st = lstatSync(path);
  if (st.isSymbolicLink()) return 0;
  if (st.isFile()) return st.size;
  if (st.isDirectory()) for (const k of readdirSync(path)) total += sizeOf(join(path, k));
  return total;
}

/** The digest a size record carries: the preview's regular files (but the record) by blob id and path. */
export function sizeDigest(files: readonly { path: string; oid: string }[]): string {
  const lines = files
    .filter((f) => f.path !== STAGED_SIZE_FILE)
    .map((f) => `${f.oid} ${f.path}\n`)
    .sort();
  return `sha256:${createHash("sha256").update(lines.join("")).digest("hex")}`;
}

interface SizeRecord {
  version: 1;
  /** Bytes of every regular file in the preview but this record. */
  bytes: number;
  digest: string;
}

function regularFiles(abs: string, rel = "", out: { path: string; abs: string }[] = []): { path: string; abs: string }[] {
  for (const k of readdirSync(abs)) {
    const p = join(abs, k);
    const r = rel === "" ? k : `${rel}/${k}`;
    const st = lstatSync(p);
    if (st.isDirectory()) regularFiles(p, r, out);
    else if (st.isFile()) out.push({ path: r, abs: p });
  }
  return out;
}

/** Write the size record of a preview on disk. Last, after every other file of it is written. */
export function writeSizeRecord(dir: string, previewAbs: string): void {
  const format = objectFormat(dir);
  const files = regularFiles(previewAbs)
    .filter((f) => f.path !== STAGED_SIZE_FILE)
    .map((f) => {
      const bytes = readFileSync(f.abs);
      return { path: f.path, oid: blobId(bytes, format), size: bytes.length };
    });
  const rec: SizeRecord = { version: 1, bytes: files.reduce((n, f) => n + f.size, 0), digest: sizeDigest(files) };
  writeFileSync(join(previewAbs, STAGED_SIZE_FILE), `${JSON.stringify(rec)}\n`);
}

/** The size of a preview known only from git: its record when the digest agrees, else its blobs. */
function sizeFromGit(dir: string, entries: readonly GitEntry[], prefix: string, record: Buffer | undefined): number {
  const files = entries.filter((e) => isRegular(e.mode)).map((e) => ({ path: e.path.slice(prefix.length), oid: e.oid }));
  if (record !== undefined) {
    try {
      const r = JSON.parse(record.toString("utf-8")) as SizeRecord;
      if (r.version === 1 && Number.isInteger(r.bytes) && r.bytes >= 0 && r.digest === sizeDigest(files)) return r.bytes + record.length;
    } catch {
      // not a record: read the blobs
    }
  }
  const sizes = blobSizes(dir, [...new Set(files.map((f) => f.oid))]);
  return files.reduce((n, f) => n + (sizes.get(f.oid) ?? 0), 0);
}

/** The small blobs a preview's age and size are read from, for every preview known only from git. */
function readSmallBlobs(dir: string, fromGit: ReadonlyMap<string, GitEntry[]>): Map<string, Buffer> {
  const wanted = new Map<string, string>();
  for (const [name, entries] of fromGit) {
    for (const f of [STAGED_AT_FILE, RECORD_FILE, STAGED_SIZE_FILE]) {
      const e = entries.find((x) => x.path === `${STAGING_PREFIX}/${name}/${f}`);
      if (e !== undefined && isRegular(e.mode)) wanted.set(e.path, e.oid);
    }
  }
  const byOid = new Map<string, Buffer>();
  const oids = [...new Set(wanted.values())];
  prefetchBlobs(dir, oids);
  forEachBlob(dir, oids, (oid, bytes) => byOid.set(oid, Buffer.from(bytes)));
  return new Map([...wanted].map(([path, oid]) => [path, byOid.get(oid)!]));
}

function timeOf(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = Date.parse(raw.trim());
  return Number.isNaN(t) ? undefined : t;
}

/** The previews a sparse checkout holds only in git, with their index entries, by slug. */
function previewsInGit(dir: string, outside: Map<string, GitEntry> | undefined): Map<string, GitEntry[]> {
  const out = new Map<string, GitEntry[]>();
  if (outside === undefined) return out;
  const prefix = `${STAGING_PREFIX}/`;
  for (const e of outside.values()) {
    if (!e.path.startsWith(prefix)) continue;
    const rest = e.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) continue;
    const name = rest.slice(0, slash);
    if (existsSync(join(dir, STAGING_PREFIX, name))) continue;
    out.set(name, [...(out.get(name) ?? []), e]);
  }
  return out;
}

/**
 * Every preview under `<dir>/STAGING`, with its age and where the age came
 * from. In a sparse checkout, also every preview the index holds outside the
 * cone, read from git.
 */
export function readPreviews(dir: string, git: GitTime = gitLastCommit): Preview[] {
  const staging = join(dir, STAGING_PREFIX);
  const inGit = previewsInGit(dir, sparseEntries(dir));
  if (!existsSync(staging) && inGit.size === 0) return [];
  const logTimes = renderLogTimes(dir);
  const small = readSmallBlobs(dir, inGit);
  const onDisk = existsSync(staging) ? readdirSync(staging) : [];
  const out: Preview[] = [];
  for (const name of [...new Set([...onDisk, ...inGit.keys()])].sort()) {
    if (!isPreviewName(name)) continue;
    const abs = join(staging, name);
    const entries = inGit.get(name);
    if (entries === undefined && !lstatSync(abs).isDirectory()) continue;
    const blob = (f: string) => small.get(`${STAGING_PREFIX}/${name}/${f}`);

    let updatedMs: number | undefined;
    let source: AgeSource = "unknown";
    const stamp =
      entries === undefined ? readTime(join(abs, STAGED_AT_FILE), (t) => t) : timeOf(blob(STAGED_AT_FILE)?.toString("utf8"));
    if (stamp !== undefined) {
      updatedMs = stamp;
      source = "stamp";
    } else if (logTimes.has(name)) {
      updatedMs = logTimes.get(name);
      source = "render-log";
    } else {
      const pick = (t: string) => readStagingPreview(t).node?.staging.builtAt;
      let built: number | undefined;
      if (entries === undefined) built = readTime(join(abs, RECORD_FILE), pick);
      else {
        try {
          const rec = blob(RECORD_FILE);
          built = rec === undefined ? undefined : timeOf(pick(rec.toString("utf8")));
        } catch {
          built = undefined;
        }
      }
      if (built !== undefined) {
        updatedMs = built;
        source = "record";
      } else {
        const g = git(dir, `${STAGING_PREFIX}/${name}`);
        if (g !== undefined) {
          updatedMs = g;
          source = "git";
        }
      }
    }
    const bytes =
      entries === undefined ? sizeOf(abs) : sizeFromGit(dir, entries, `${STAGING_PREFIX}/${name}/`, blob(STAGED_SIZE_FILE));
    out.push({ slug: name, updatedMs, source, bytes });
  }
  return out;
}

function human(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function age(p: Preview, nowMs: number): string {
  if (p.updatedMs === undefined) return "age unknown";
  const h = (nowMs - p.updatedMs) / 3_600_000;
  return h < 48 ? `${h.toFixed(1)}h old` : `${(h / 24).toFixed(1)}d old`;
}

/** One line per rotated preview — the job log and the commit message both carry these. */
export function describeRemoval(p: Preview, nowMs: number): string {
  return `rotated off STAGING/${p.slug}: ${age(p, nowMs)} (last update from ${p.source}), ${human(p.bytes)}`;
}

export interface RotateOptions {
  dir: string;
  current: string;
  now: string;
  /** Bytes. Defaults to {@link MAX_PREVIEW_BYTES}; tests pass their own. */
  budget?: number;
  git?: GitTime;
  run?: string;
}

/**
 * Stamp the current preview, then remove every preview over the cap, leaving
 * a record for each. Returns the plan that was carried out.
 */
export function rotate(o: RotateOptions): { plan: RotationPlan; lines: string[] } {
  const budget = o.budget ?? MAX_PREVIEW_BYTES;
  const nowMs = Date.parse(o.now);
  if (Number.isNaN(nowMs)) throw new Error(`--now \`${o.now}\` is not a timestamp`);
  if (!isPreviewName(o.current)) throw new Error(`--current \`${o.current}\` is not a preview slug`);

  const curDir = join(o.dir, STAGING_PREFIX, o.current);
  if (existsSync(curDir)) writeFileSync(join(curDir, STAGED_AT_FILE), `${o.now}\n`);
  const outside = sparseEntries(o.dir);
  const inGit = previewsInGit(o.dir, outside);

  const plan = planRotation(readPreviews(o.dir, o.git ?? gitLastCommit), o.current, budget);
  // After the plan, so this run decides on the bytes it always did; the next
  // run, and any read from git, counts the record too.
  if (existsSync(curDir)) writeSizeRecord(o.dir, curDir);
  const reason =
    `rotated off: the previews on gh-pages came to more than ${human(budget)} ` +
    `(owner ruling 2026-10-02, issue #1868, amended 2026-10-04 to a size budget); ` +
    `STAGING/${o.current} was staged and the least recently updated preview goes. ` +
    `The next push to its branch re-stages it.`;
  const lines: string[] = [];
  for (const p of plan.remove) {
    const abs = join(o.dir, STAGING_PREFIX, p.slug);
    const line = describeRemoval(p, nowMs);
    lines.push(line);

    // Retire the record first, the same way both cleanup jobs do: the record
    // goes to `_retired/`, never with the directory. Retiring twice keeps the
    // first retirement.
    const rec = join(abs, RECORD_FILE);
    const entries = inGit.get(p.slug);
    // Outside a sparse checkout's cone, the record is its blob.
    const recBlob = entries?.find((e) => e.path === `${STAGING_PREFIX}/${p.slug}/${RECORD_FILE}` && isRegular(e.mode));
    if (existsSync(rec) || recBlob !== undefined) {
      const retiredDir = join(o.dir, STAGING_PREFIX, RETIRED_DIR);
      const out = join(retiredDir, `${p.slug}.json`);
      mkdirSync(retiredDir, { recursive: true });
      try {
        // A retired record outside the cone is materialised first, so retiring twice still keeps the first.
        const already = outside?.get(`${STAGING_PREFIX}/${RETIRED_DIR}/${p.slug}.json`);
        if (!existsSync(out) && already !== undefined) writeBlob(o.dir, already.oid, out);
        if (!existsSync(out)) {
          if (existsSync(rec)) copyFileSync(rec, out);
          else writeBlob(o.dir, recBlob!.oid, out);
        }
        const node = loadExisting(out);
        if (node !== undefined) writeFileSync(out, serializeStagingPreview(retireStagingPreview(node, reason, o.now)));
      } catch (e) {
        // Same posture as the cleanup jobs: the record copy stays as it was and
        // the failure is an annotation, not a blocked deploy.
        console.log(
          `::error title=staging-preview record::could not retire STAGING/${p.slug} — ` +
            `${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    appendEntry(
      o.dir,
      buildEntry({
        event: "removed",
        kind: "staging-preview",
        path: `${STAGING_PREFIX}/${p.slug}`,
        slug: p.slug,
        summary: line,
        reason,
        ...(o.run ? { run: o.run } : {}),
        at: o.now,
        id: `${o.now.replace(/[:.]/g, "-")}-removed-${p.slug}`,
      }),
    );

    rmSync(abs, { recursive: true, force: true });
    // Not on disk to delete: take it out of the index, so the commit removes it.
    if (entries !== undefined) removeFromIndex(o.dir, [`${STAGING_PREFIX}/${p.slug}`]);
  }
  return { plan, lines };
}

function writeBlob(dir: string, oid: string, out: string): void {
  prefetchBlobs(dir, [oid]);
  forEachBlob(dir, [oid], (_o, bytes) => writeFileSync(out, bytes));
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  const v = argv[i].startsWith(`--${name}=`) ? argv[i].slice(name.length + 3) : argv[i + 1];
  return v === undefined || v === "" ? undefined : v;
}

const USAGE =
  "usage: staging-rotate.ts --dir PAGES_CHECKOUT --current SLUG [--summary-out FILE] [--run URL]";

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const dir = flag(argv, "dir");
  const current = flag(argv, "current");
  if (dir === undefined || current === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const now = new Date().toISOString();
    const { plan, lines } = rotate({ dir, current, now, run: flag(argv, "run") });
    const kept = plan.keep.reduce((n, p) => n + p.bytes, 0);
    console.log(
      `staging-rotate: budget ${human(MAX_PREVIEW_BYTES)}; ${plan.keep.length} kept (${human(kept)}), ` +
        `${plan.remove.length} rotated off`,
    );
    if (kept > MAX_PREVIEW_BYTES) {
      console.log(`::warning title=staging preview over budget::STAGING/${current} alone is ${human(kept)}, over the ${human(MAX_PREVIEW_BYTES)} budget; it is published and every other preview was rotated off`);
    }
    for (const p of plan.keep) console.log(`  keep STAGING/${p.slug}: ${age(p, Date.parse(now))} (${p.source}), ${human(p.bytes)}`);
    for (const l of lines) console.log(`::notice title=staging preview rotated off::${l}`);
    const out = flag(argv, "summary-out");
    if (out !== undefined) writeFileSync(out, lines.length === 0 ? "" : `${lines.join("\n")}\n`);
    process.exit(0);
  } catch (e) {
    console.error(`staging-rotate: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
