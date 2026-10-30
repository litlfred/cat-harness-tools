#!/usr/bin/env bun
/**
 * cat-harness holds no code: every source file under it is a ratcheted debt.
 *
 * @module cat-harness-tools/scripts/check-content-code-free
 * @covers code — every tracked file under the cat-harness instance, read by extension only
 *
 * Bean `y9r6` (FR-7, owner D2 2026-10-01): the harness is content, so its
 * manifests, Tool definitions and skill records are JSON data that the tools
 * validate on read, and code lives in cat-harness-tools. The bean's done-when
 * names this gate: no tracked `.ts/.js/.py/.sh` under `cat-harness/`.
 *
 * It cannot be green by that wording yet. About 470 of the files it counts are
 * `schemas/`, which bean `8lcl` moves, so the gate is a ratchet. The committed
 * list (`content-code-free-baseline.json`) names every code file still allowed.
 * A code file NOT on the list is red: that is new code in content. A listed
 * file that is gone is reported with the command that shortens the list, and
 * is not red, so a move landing elsewhere never turns an unrelated PR red. The
 * list only ever shrinks; a longer one is a diff somebody reviews.
 *
 * Code is decided by extension: `.ts .tsx .mts .cts .js .mjs .cjs .py .sh .rb`.
 * The bean names four; the module variants are the same languages, and `.rb`
 * is how Jekyll plugins are written. Git decides what is tracked.
 *
 * Usage: bun run cat check:content-code-free [--update] [--no-baseline]
 * Exit:  0 when every code file is listed · 1 otherwise
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { gitFiles } from "@litlfred/cat-harness/schemas/sdlc/git-corpus.ts";
import { HARNESS_ROOT, TOOLS_ROOT } from "./lib/roots.ts";

export const BASELINE_PATH = resolve(TOOLS_ROOT, "scripts", "content-code-free-baseline.json");

/** File extensions that count as code. */
export const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".py", ".sh", ".rb"] as const;

export const isCode = (rel: string): boolean => CODE_EXTENSIONS.some((e) => rel.endsWith(e));

/** Every tracked code file under `root`, as root-relative POSIX paths, sorted. */
export function codeFiles(root: string): string[] {
  return gitFiles(root, isCode).files.map((abs) => relative(root, abs).split("\\").join("/")).sort();
}

export interface Judgement {
  /** Code files not on the list: red. */
  added: string[];
  /** Listed files that are gone: the list can shrink. */
  gone: string[];
}

/** Pure: the current code files against the allowed list. One way: only an addition is red. */
export function judge(current: readonly string[], allowed: readonly string[]): Judgement {
  const a = new Set(allowed);
  const c = new Set(current);
  return {
    added: current.filter((f) => !a.has(f)),
    gone: allowed.filter((f) => !c.has(f)),
  };
}

const COMMENT =
  "Code files still allowed under cat-harness/ (bean `y9r6`, FR-7: content holds no code). A RATCHET, one way: a code file not listed is red; a listed file that is gone is reported with `bun run cat content-code-free:baseline`, which shortens the list. WRITTEN by that command; a longer list is a diff somebody reviews. Most entries are `schemas/`, which bean `8lcl` moves. See the module header of cat-harness-tools/scripts/check-content-code-free.ts.";

export function readBaseline(path = BASELINE_PATH): string[] {
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, "utf-8")) as { files?: string[] }).files ?? [];
}

if (import.meta.main) {
  const current = codeFiles(HARNESS_ROOT);
  if (process.argv.includes("--update")) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ _comment: COMMENT, files: current }, null, 2)}\n`);
    console.log(`content-code-free: wrote ${current.length} file(s) to ${relative(TOOLS_ROOT, BASELINE_PATH)}`);
    process.exit(0);
  }
  const allowed = process.argv.includes("--no-baseline") ? [] : readBaseline();
  const j = judge(current, allowed);
  console.log(`content-code-free: ${current.length} code file(s) under ${HARNESS_ROOT}; ${allowed.length} allowed by the list.`);
  if (j.gone.length) {
    console.log(`  ${j.gone.length} listed file(s) are gone — \`bun run cat content-code-free:baseline\` shortens the list (not a failure).`);
  }
  if (j.added.length) {
    console.log(`✗ ${j.added.length} code file(s) under cat-harness/ that the list does not allow. Content holds no code: make it JSON data, or move it to cat-harness-tools.`);
    for (const f of j.added.slice(0, 50)) console.log(`  · ${f}`);
    if (j.added.length > 50) console.log(`  … and ${j.added.length - 50} more`);
    process.exit(1);
  }
  console.log("✓ no code file under cat-harness/ beyond the list.");
}
