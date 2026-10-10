#!/usr/bin/env bun
/**
 * Write `"$schema": "cat-harness-declaration/1.0.0"` as the first key of every
 * harness declaration (`<instance>/<instance>.json`) that lacks it, or, with
 * `--check`, fail on one that still lacks it.
 *
 * Bean `ujiv`, issue litlfred/cat-harness#88.
 *
 * A declaration is a node kind (`cat-harness-declaration/1.0.0`,
 * `schemas/cat-harness.ts#CatHarnessDeclarationKind`), found by its name rather
 * than by a typology directory. New ones are tagged when `init-folio` writes
 * them, and `CatHarnessDeclarationSchema` keeps the key through a parse, so
 * unlike a bean a declaration does not lose its tag in normal use. This script
 * is for the ones written before the kind existed, and its `--check` is the
 * gate that keeps them tagged.
 *
 * The tag goes in as a TEXT edit, one line after the opening brace, so the rest
 * of the file keeps its formatting and the diff is one line. A declaration that
 * carries some other `$schema` is reported and left alone.
 *
 * Which declarations: every instance `instanceRootsIn` finds under this
 * checkout's repository root, or only the one named by `--instance <dir>`. In
 * an index checkout that includes the mounted instances of other repositories;
 * their tags land through PRs to those repositories, so `--check` there names
 * each one rather than passing.
 *
 * Exit codes follow the bean gates: 0 every declaration tagged, 1 a defect
 * (untagged under `--check`, or a foreign tag), 2 could not check.
 *
 * @module scripts/declarations-retag
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  CAT_HARNESS_DECLARATION_SCHEMA_TAG,
  CatHarnessDeclarationKind,
  repoRootFor,
} from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { findDeclarationFile, instanceRootsIn } from "@litlfred/cat-harness/schemas/instance-roots.ts";
import { acceptsSchemaTag } from "@litlfred/cat-harness/schemas/node-kind.ts";

import { HARNESS_ROOT } from "./lib/roots.ts";

/** The command a person runs to fix what `--check` finds, named once. */
export const RETAG_COMMAND = "bun run cat declarations:retag";

export type DeclarationOutcome = "tagged" | "added" | "foreign" | "unparseable";

export interface DeclarationRetag {
  outcome: DeclarationOutcome;
  /** The file text after the retag. Equal to the input unless `outcome` is `added`. */
  text: string;
  tag?: string;
}

/**
 * Tag one declaration's text. Pure.
 *
 * The new key goes on its own line straight after `{`, indented like the key
 * that follows it. A file whose `{` is not followed by a newline (a one-line
 * declaration) is rewritten with two-space indentation instead, which is the
 * shape every declaration in the repositories has.
 */
export function retagDeclarationText(text: string): DeclarationRetag {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { outcome: "unparseable", text };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { outcome: "unparseable", text };
  const obj = parsed as Record<string, unknown>;
  if ("$schema" in obj) {
    return acceptsSchemaTag(CatHarnessDeclarationKind, obj.$schema)
      ? { outcome: "tagged", text }
      : { outcome: "foreign", text, tag: String(obj.$schema) };
  }
  const line = `"$schema": ${JSON.stringify(CAT_HARNESS_DECLARATION_SCHEMA_TAG)}`;
  const m = /^(\s*)\{\n([ \t]+)/.exec(text);
  if (m) {
    const empty = Object.keys(obj).length === 0;
    const at = m[1]!.length + 2;
    return { outcome: "added", text: `${text.slice(0, at)}${m[2]}${line}${empty ? "" : ","}\n${text.slice(at)}` };
  }
  return { outcome: "added", text: JSON.stringify({ $schema: CAT_HARNESS_DECLARATION_SCHEMA_TAG, ...obj }, null, 2) + "\n" };
}

export interface DeclarationsReport {
  files: number;
  tagged: number;
  added: string[];
  foreign: { file: string; tag: string }[];
  unparseable: string[];
}

/** Retag the declaration in each of `roots`. `write: false` changes nothing. */
export function retagDeclarations(roots: readonly string[], base: string, opts: { write: boolean }): DeclarationsReport {
  const report: DeclarationsReport = { files: 0, tagged: 0, added: [], foreign: [], unparseable: [] };
  for (const root of roots) {
    const name = findDeclarationFile(root);
    if (name === undefined) continue;
    const path = join(root, name);
    const shown = relative(base, path) || name;
    const before = readFileSync(path, "utf-8");
    const r = retagDeclarationText(before);
    report.files++;
    if (r.outcome === "tagged") report.tagged++;
    else if (r.outcome === "foreign") report.foreign.push({ file: shown, tag: r.tag! });
    else if (r.outcome === "unparseable") report.unparseable.push(shown);
    else {
      report.added.push(shown);
      if (opts.write) writeFileSync(path, r.text);
    }
  }
  return report;
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i >= 0) return argv[i + 1];
  return argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

function main(argv: readonly string[]): void {
  const check = argv.includes("--check");
  const one = argValue(argv, "--instance");
  const base = repoRootFor(HARNESS_ROOT);
  let roots: string[];
  if (one !== undefined) {
    const dir = resolve(one);
    if (!existsSync(dir) || findDeclarationFile(dir) === undefined) {
      console.error(`::error::declarations-retag: ${dir} holds no declaration. NOT a pass — nothing was checked`);
      process.exit(2);
    }
    roots = [dir];
  } else {
    roots = instanceRootsIn(base);
  }
  if (roots.length === 0) {
    console.error(`::error::declarations-retag: no instance declaration under ${base}, so every count here would be vacuous`);
    process.exit(2);
  }

  const r = retagDeclarations(roots, base, { write: !check });
  for (const f of r.foreign) {
    console.error(`::error::declarations-retag: ${f.file} carries \`$schema: ${f.tag}\`, which ${CAT_HARNESS_DECLARATION_SCHEMA_TAG} does not accept. Left as it is`);
  }
  for (const f of r.unparseable) console.error(`::error::declarations-retag: ${f} is not a JSON object`);
  const bad = r.foreign.length + r.unparseable.length;
  if (check) {
    if (r.added.length > 0) {
      console.error(
        `::error::declarations-retag: ${r.added.length} of ${r.files} declaration(s) carry no ` +
          `\`$schema: ${CAT_HARNESS_DECLARATION_SCHEMA_TAG}\`: ${r.added.join(", ")}. Run \`${RETAG_COMMAND}\``,
      );
      process.exit(1);
    }
    console.log(`Declaration tags — all ${r.tagged} of ${r.files} declaration(s) carry ${CAT_HARNESS_DECLARATION_SCHEMA_TAG}`);
    process.exit(bad > 0 ? 1 : 0);
  }
  console.log(
    `Declaration tags — added ${CAT_HARNESS_DECLARATION_SCHEMA_TAG} to ${r.added.length} declaration(s)` +
      `${r.added.length ? ` (${r.added.join(", ")})` : ""}; ${r.tagged} already carried it`,
  );
  process.exit(bad > 0 ? 1 : 0);
}

if (import.meta.main) main(process.argv.slice(2));
