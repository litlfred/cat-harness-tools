#!/usr/bin/env bun
/**
 * Export CSL-JSON references to BibTeX.
 *
 * Reads the authoritative bibliography from `schema/references.ts`
 * and writes `references.bib` in the repo root for LaTeX consumption.
 *
 * Usage:
 *   bun run cat-harness-tools/pipeline/export-bibtex.ts
 *   bun run cat-harness-tools/pipeline/export-bibtex.ts --out /path/to/references.bib
 *
 * @module pipeline/export-bibtex
 */

import { writeFileSync } from "fs";
import { resolve, join } from "path";
import type { Data as CSLData } from "csl-json";
import { cslToBibtex } from "./bibtex-format";
import { references } from "./references-registry-di";
import { findContentRepoRoot } from "./repo-root";
import { readSourceLedger } from "@litlfred/cat-harness/schemas/bib-attestations.ts";

// Content repo root (was import-relative, which pointed at
// folio-assistant and made every content path below miss).
const REPO_ROOT = findContentRepoRoot();
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(REPO_ROOT, "references.bib");

// ── Verification status sidecar (added 2026-05-19) ──────────────
// Loaded once; each entryToBibtex() reads its own row and emits an
// `annotation = {...}` field that LaTeX / biblatex / pandoc can
// display in the rendered bibliography.

import type { Verifier } from "@litlfred/cat-harness/schemas/bib-verification.ts";
import { verifierLabel } from "@litlfred/cat-harness/schemas/bib-verification.ts";

interface VerifEntry {
  id: string;
  status: string;
  local_pdf?: string;
  verified_at?: string;
  verified_by?: Verifier;
  human_adjudicated?: { who: string; at: string; note?: string };
  fixes_applied?: number;
  fix_commit?: string;
  note?: string;
}

// The ONE reader of the source ledger (store, or the legacy file while the
// store has no `bib-verification` family); it says which on stderr.
const verifRead = readSourceLedger(REPO_ROOT);
console.error(verifRead.note);
const verifMap: Map<string, VerifEntry> = new Map(
  (verifRead.ledger.entries as unknown as VerifEntry[]).map((e) => [e.id, e]),
);

function verificationAnnotation(id: string): string | null {
  const v = verifMap.get(id);
  if (!v) return null;
  // Short symbol per status (works in BibTeX `annotation` field and HTML)
  const SYM: Record<string, string> = {
    "verified-clean":    "[Verified]",
    "fixed":             "[Verified+Fixed]",
    "partial":           "[Partial]",
    "pending":           "[Pending]",
    "pending-placement": "[Pending-Placement]",
    "uncited":           "[Uncited]",
    "paper-mismatch":    "[Paper-Mismatch]",
    "unfetchable":       "[Unfetchable]",
  };
  const sym = SYM[v.status] ?? `[${v.status}]`;
  const parts = [sym];
  if (v.fixes_applied && v.fixes_applied > 0) {
    parts.push(`${v.fixes_applied} fix${v.fixes_applied !== 1 ? "es" : ""}`);
  }
  if (v.verified_by) parts.push(`by ${verifierLabel(v.verified_by)}`);
  if (v.verified_at) parts.push(v.verified_at.slice(0, 10)); // YYYY-MM-DD
  return parts.join(" ");
}

// ── Formatting: pipeline/bibtex-format.ts (pure) ────────────────

/** One entry, with its verification marker from the source ledger. */
function entryToBibtex(entry: CSLData): string {
  return cslToBibtex(entry, verificationAnnotation(entry.id));
}

// ── Build full .bib file ────────────────────────────────────────

function buildBibtex(): string {
  const header = [
    "% Bibliography for Quantum Observable Universe",
    "% AUTO-GENERATED from folio/schema/references.ts — do not edit manually.",
    "%",
    "% Key convention:  <firstauthorlastname><year>  (all lower-case)",
    "% Source of truth: folio/schema/references.ts (CSL-JSON)",
    "% Generator:       pipeline/export-bibtex.ts",
    `% Generated:       ${new Date().toISOString()}`,
    "",
  ].join("\n");

  const entries = references.map(entryToBibtex).join("\n\n");
  return header + entries + "\n";
}

// ── CLI ─────────────────────────────────────────────────────────

const bibtex = buildBibtex();
writeFileSync(outPath, bibtex);
console.log(`Exported ${references.length} references → ${outPath}`);
console.log(`  (${(bibtex.length / 1024).toFixed(1)} KB)`);

export { buildBibtex, entryToBibtex };
