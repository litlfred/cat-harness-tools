/**
 * Move a library's stored narratives from the single form to a one-entry
 * list that names its language — bean `cat-tools-e1lo`, step 3d.
 *
 * Owner ruling 2026-10-21 (cat-harness-tools drain session): every written
 * narrative becomes a one-entry list tagged `lang: "en"`. Measured before the
 * ruling: no library entry records a language anywhere, so the language is
 * the one the narratives were written in. All 1,090 then stored were agent
 * drafts in English (1,059 by a stopword check, 30 short captions too terse
 * for it, 1 not-authored).
 *
 * What it does NOT touch, on purpose:
 * - a slot already in list form (it has its languages);
 * - an empty `not-authored` slot: nothing is written in any language, so
 *   there is no language to name;
 * - a file that does not round-trip byte-identically through
 *   `JSON.parse`/`JSON.stringify`. Rewriting it would change more than
 *   narratives, so it is refused and reported instead.
 *
 * Dry run unless `--apply`. Every converted slot is re-parsed with
 * `NarrativeSlotSchema`, and a file whose narrative count changes is refused.
 *
 * Usage: bun run cat narratives:migrate-lang <library-dir>… [--lang en] [--apply]
 *
 * @module scripts/narratives-migrate-lang
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGE_TAG, NarrativeSlotSchema } from "@litlfred/cat-harness/schemas/narrative.ts";
import { LIBRARY_NARRATIVE_BEARING, NARRATIVE_BEARING, narrativesIn, type NarrativePath } from "./narratives.ts";

export interface FileResult {
  file: string;
  converted: number;
  skippedNotAuthored: number;
  alreadyList: number;
  refused?: string;
}

function indentOf(raw: string): number | string {
  const m = /^\{\r?\n([ \t]+)"/.exec(raw);
  return m ? (m[1]!.startsWith("\t") ? "\t" : m[1]!.length) : 2;
}

function at(doc: unknown, path: NarrativePath): { parent: Record<string, unknown> | unknown[]; key: string | number } {
  let cur = doc as Record<string, unknown>;
  for (const k of path.slice(0, -1)) cur = (cur as Record<string | number, unknown>)[k] as Record<string, unknown>;
  return { parent: cur, key: path[path.length - 1]! };
}

/** Non-ASCII characters as `\uXXXX`, the way Python's `json` writes a file. */
function escapeNonAscii(text: string): string {
  return text.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * How this file was serialised: plain, or with non-ASCII escaped. A file in
 * neither form is not ours to rewrite.
 */
function serializerFor(raw: string, doc: unknown, indent: number | string, trailing: string): ((d: unknown) => string) | undefined {
  const plain = (d: unknown) => JSON.stringify(d, null, indent) + trailing;
  const escaped = (d: unknown) => escapeNonAscii(JSON.stringify(d, null, indent)) + trailing;
  if (plain(doc) === raw) return plain;
  if (escaped(doc) === raw) return escaped;
  return undefined;
}

/** Migrate one file's text. Pure: returns the new text (or the same) and what happened. */
export function migrateText(raw: string, lang: string): { text: string; result: Omit<FileResult, "file"> } {
  const result = { converted: 0, skippedNotAuthored: 0, alreadyList: 0 };
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const indent = indentOf(raw);
  const trailing = raw.endsWith("\n") ? "\n" : "";
  const write = serializerFor(raw, doc, indent, trailing);
  if (write === undefined) {
    return { text: raw, result: { ...result, refused: "does not round-trip through JSON byte-identically" } };
  }
  const before = narrativesIn(doc);
  for (const { path, narrative } of before) {
    if (path[path.length - 1] !== "narrative") {
      result.alreadyList++;
      continue;
    }
    if (narrative.state === "not-authored") {
      result.skippedNotAuthored++;
      continue;
    }
    const { parent, key } = at(doc, path);
    const single = (parent as Record<string | number, unknown>)[key] as Record<string, unknown>;
    const list = [{ ...single, lang }];
    const r = NarrativeSlotSchema.safeParse(list);
    if (!r.success) return { text: raw, result: { ...result, refused: `${path.join(".")}: ${r.error.issues[0]?.message}` } };
    (parent as Record<string | number, unknown>)[key] = list;
    result.converted++;
  }
  if (narrativesIn(doc).length !== before.length) {
    return { text: raw, result: { ...result, refused: "the narrative count changed" } };
  }
  return { text: result.converted ? write(doc) : raw, result };
}

/** Every narrative-bearing file of every entry in a library directory. */
export function libraryFiles(lib: string): string[] {
  const out: string[] = [];
  for (const slug of readdirSync(lib).sort()) {
    const dir = join(lib, slug);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of NARRATIVE_BEARING) {
      const f = join(dir, name);
      if (existsSync(f)) out.push(f);
    }
  }
  for (const name of LIBRARY_NARRATIVE_BEARING) {
    const f = join(lib, name);
    if (existsSync(f)) out.push(f);
  }
  return out;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const li = argv.indexOf("--lang");
  const lang = li >= 0 ? argv[li + 1]! : "en";
  const libs = argv.filter((a, i) => !a.startsWith("--") && !(li >= 0 && i === li + 1));
  if (libs.length === 0 || !LANGUAGE_TAG.test(lang)) {
    console.error("usage: bun run cat narratives:migrate-lang <library-dir>… [--lang <bcp47>] [--apply]");
    process.exit(2);
  }
  let converted = 0, skipped = 0, files = 0, refused = 0;
  for (const lib of libs) {
    for (const f of libraryFiles(lib)) {
      const raw = readFileSync(f, "utf-8");
      const { text, result } = migrateText(raw, lang);
      if (result.refused) {
        refused++;
        console.error(`  REFUSED ${f}: ${result.refused}`);
        continue;
      }
      converted += result.converted;
      skipped += result.skippedNotAuthored;
      if (result.converted) {
        files++;
        if (apply) writeFileSync(f, text);
      }
    }
  }
  console.log(`${apply ? "migrated" : "would migrate"} ${converted} narrative(s) in ${files} file(s) to [{…, lang: "${lang}"}]; ${skipped} not-authored left as they are; ${refused} file(s) refused`);
  process.exit(refused ? 1 : 0);
}
