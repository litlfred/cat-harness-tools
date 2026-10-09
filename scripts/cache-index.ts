#!/usr/bin/env bun
/**
 * What is materialized here, how big, how old — and what could go.
 *
 * Usage:
 *   bun run cat cache:index          # summary, then eviction candidates
 *   bun run cat cache:index --all    # every materialized copy
 *   bun run cat cache:index --json
 *
 * Bean `54rk`. `freshness()` answers *"is this copy stale"* for ONE record.
 * Nothing answered the question a person asks before materializing anything
 * else: **what do I hold, what does it cost, and what is safe to drop** —
 * across the whole set.
 *
 * @module scripts/cache-index
 */
import { statSync } from "node:fs";

import { freshness, type FreshnessVerdict, type Materialization } from "@litlfred/cat-harness/schemas/materialization.ts";

export type SizeBasis = "recorded" | "measured" | "directory" | "absent";

/** One materialized artefact, as the corpus records it. */
export interface MaterializedRecord {
  readonly source: string;
  readonly id?: string;
  readonly name?: string;
  readonly localPath?: string;
  readonly abs?: string;
  readonly algorithm?: string;
  readonly digest?: string;
  readonly record?: Partial<Materialization> & Record<string, unknown>;
}

export function collect(): MaterializedRecord[] {
  return [];
}

export interface CacheRow {
  source: string;
  id?: string;
  localPath?: string;
  purpose?: string;
  bytes?: number;
  sizeBasis: SizeBasis;
  /** `materializedAt`, or undefined: NOT RECORDED, never "now" and never "unknown date zero". */
  fetchedAt?: string;
  /** When last read, or undefined: NOT RECORDED (bean 54rk, 7wgs). */
  lastReadAt?: string;
  freshness: FreshnessVerdict;
}

export interface EvictionCandidate {
  row: CacheRow;
  reason: string;
}

function sizeOf(rec: MaterializedRecord): { bytes?: number; basis: SizeBasis } {
  const recorded = rec.record?.bytes;
  if (typeof recorded === "number") return { bytes: recorded, basis: "recorded" };
  if (!rec.abs) return { basis: "absent" };
  try {
    const st = statSync(rec.abs);
    if (st.isDirectory()) return { basis: "directory" };
    return { bytes: st.size, basis: "measured" };
  } catch {
    return { basis: "absent" };
  }
}

/** One row per materialized copy. */
export function cacheRows(records: readonly MaterializedRecord[] = collect()): CacheRow[] {
  return records.map((rec) => {
    const m = (rec.record ?? { state: "materialized" }) as unknown as Materialization;
    const { bytes, basis } = sizeOf(rec);
    const fetched = rec.record?.materializedAt;
    const lastRead = rec.record?.lastReadAt;
    return {
      source: rec.source,
      ...(rec.id ? { id: rec.id } : {}),
      ...(rec.localPath ? { localPath: rec.localPath } : {}),
      ...(typeof rec.record?.purpose === "string" ? { purpose: rec.record.purpose } : {}),
      ...(bytes !== undefined ? { bytes } : {}),
      sizeBasis: basis,
      ...(typeof fetched === "string" ? { fetchedAt: fetched } : {}),
      ...(typeof lastRead === "string" ? { lastReadAt: lastRead } : {}),
      freshness: freshness(m, new Date()),
    };
  });
}

/**
 * Compare eviction candidates: least recently read copies prioritized for eviction;
 * missing lastReadAt displayed as "not recorded" and sorted after expired/known stale.
 */
function compareEvictionCandidates(a: CacheRow, b: CacheRow): number {
  if (a.lastReadAt && b.lastReadAt) {
    const diff = new Date(a.lastReadAt).getTime() - new Date(b.lastReadAt).getTime();
    if (diff !== 0) return diff;
  } else if (a.lastReadAt && !b.lastReadAt) {
    return -1;
  } else if (!a.lastReadAt && b.lastReadAt) {
    return 1;
  }
  return (b.bytes ?? -1) - (a.bytes ?? -1);
}

/**
 * Which copies a person might drop, largest first — REPORTED, never acted on.
 *
 * `expired` first: its own record says its lifetime is over. Then `no-expiry`
 * working copies: a copy nobody gave a lifetime cannot be told from an
 * abandoned one (`freshness()`'s own note). `permanent` (archival) and
 * `fresh` never appear, and neither does `input-bound` (a `compiled` copy,
 * bean `gpdo`): its lifetime is its inputs, and only `compiledValidity()`
 * with the CURRENT inputs can say it is stale — which this index cannot know.
 *
 * Eviction candidate ranking accounts for `lastReadAt`: least recently read
 * copies are prioritized for eviction (bean 7wgs).
 */
export function evictionCandidates(rows: readonly CacheRow[]): EvictionCandidate[] {
  const pick = (f: FreshnessVerdict, reason: string) =>
    rows
      .filter((r) => r.freshness === f)
      .sort(compareEvictionCandidates)
      .map((row) => ({ row, reason }));
  return [
    ...pick("expired", "its `expiresAt` has passed"),
    ...pick("no-expiry", "a working copy with no `expiresAt` — nobody gave it a lifetime"),
  ];
}

export interface CacheSummary {
  copies: number;
  /** Bytes over rows whose size is recorded or measured. Directories and absent sizes are excluded, and counted. */
  knownBytes: number;
  bySizeBasis: Record<SizeBasis, number>;
  fetchedRecorded: number;
  lastReadRecorded: number;
  byFreshness: Partial<Record<FreshnessVerdict, number>>;
}

export function summarise(rows: readonly CacheRow[]): CacheSummary {
  const bySizeBasis: Record<SizeBasis, number> = { recorded: 0, measured: 0, directory: 0, absent: 0 };
  const byFreshness: Partial<Record<FreshnessVerdict, number>> = {};
  let knownBytes = 0;
  let fetchedRecorded = 0;
  let lastReadRecorded = 0;
  for (const r of rows) {
    bySizeBasis[r.sizeBasis] += 1;
    byFreshness[r.freshness] = (byFreshness[r.freshness] ?? 0) + 1;
    if (r.bytes !== undefined && (r.sizeBasis === "recorded" || r.sizeBasis === "measured")) knownBytes += r.bytes;
    if (r.fetchedAt) fetchedRecorded += 1;
    if (r.lastReadAt) lastReadRecorded += 1;
  }
  return { copies: rows.length, knownBytes, bySizeBasis, fetchedRecorded, lastReadRecorded, byFreshness };
}

const human = (n?: number): string =>
  n === undefined ? "?" : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

if (import.meta.main) {
  const rows = cacheRows();
  const s = summarise(rows);
  const evict = evictionCandidates(rows);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ summary: s, evictionCandidates: evict, ...(process.argv.includes("--all") ? { rows } : {}) }, null, 2));
  } else {
    console.log(`\nCache — ${s.copies} materialized cop${s.copies === 1 ? "y" : "ies"}, ${human(s.knownBytes)} where size is known\n`);
    console.log(`  size       recorded ${s.bySizeBasis.recorded} · measured now ${s.bySizeBasis.measured} · directory (counted by its parts) ${s.bySizeBasis.directory} · absent ${s.bySizeBasis.absent}`);
    console.log(`  fetched    recorded ${s.fetchedRecorded} · not recorded ${s.copies - s.fetchedRecorded}`);
    const lastReadStr =
      s.lastReadRecorded > 0
        ? `recorded ${s.lastReadRecorded} · not recorded ${s.copies - s.lastReadRecorded}`
        : `not recorded for any copy — nothing records reads (bean 54rk)`;
    console.log(`  last read  ${lastReadStr}`);
    console.log(`  freshness  ${Object.entries(s.byFreshness).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    if (process.argv.includes("--all")) {
      console.log(`\n  Every copy:`);
      for (const r of rows) console.log(`    ${human(r.bytes).padStart(9)} ${r.sizeBasis.padEnd(9)} ${r.freshness.padEnd(16)} ${(r.lastReadAt ?? "not recorded").padEnd(25)} ${r.localPath ?? "(no localPath)"}   [${r.source}]`);
    }
    console.log(`\n  Eviction candidates — ${evict.length}. REPORTED ONLY: nothing is removed; a person decides.`);
    for (const e of evict.slice(0, 20)) {
      console.log(`    ${human(e.row.bytes).padStart(9)}  ${e.row.localPath ?? "(no localPath)"} — ${e.reason}`);
    }
    if (evict.length > 20) console.log(`    …and ${evict.length - 20} more (--json lists them)`);
    console.log("");
  }
}
