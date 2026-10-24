#!/usr/bin/env bun
/**
 * Create a document in the reader's folio, of any DOCUMENT KIND the loaded
 * knowledge graphs describe. Bean `95sk`, R28.
 *
 * @module scripts/folio-create
 * @covers folio
 * @graphNode none — a writer into the folio graph, not a schema itself
 *
 * ## The rule it implements
 *
 * The owner, 2026-10-24, settling R28 ("new documents a reader creates or
 * links to go in `folio/`"):
 *
 * > a document someone creates goes into folio. can be of mutliple kinds -
 * > any that hey have KG to decribe/loaded in dep chain … /mounted
 *
 * So the kinds are not a list here. They are whatever `document-kinds`
 * directories the instances in this checkout declare, mounted layers included,
 * read by `gen-document-kinds-viz.ts`'s `readDocumentKinds`, which is the same
 * reader the document-kinds viewer draws from. A layer that adds a kind makes
 * it creatable with no change here. (A document the reader LINKS to is the
 * other half of R28, and goes to `library/` as a `referenced` node through
 * `ingest-document.ts`, not through this.)
 *
 * ## What it writes
 *
 * `<folio>/<slug>/index.md`, where `<folio>` is the target repository's
 * DECLARED folio directory (`folioDir`), never a literal `folio/`. The page
 * carries the kind in its front matter as `<instance>:<id>`, and one heading
 * per section of the kind, its parent kind's (`extends`) first, each marked
 * required or optional, with the section's description as a comment. It
 * writes no subject matter, for the reason `init-folio.ts` gives: content
 * nobody asked for has to be deleted.
 *
 * It refuses to overwrite: an existing `<slug>/` is somebody's document.
 *
 * Usage:
 *   bun run cat folio:create --list
 *   bun run cat folio:create --kind l1 --slug my-guideline --title "My guideline" [--root <repo>]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import type { DocumentKind } from "@litlfred/cat-harness/schemas/document-kind.ts";
import { folioDir } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { readDocumentKinds, type KindEntry } from "./gen-document-kinds-viz.ts";
import { HARNESS_ROOT, REPO_ROOT } from "./lib/roots.ts";

/** A kind as a reader names it: `id`, or `instance:id` when two instances declare one id. */
export function qualifiedKind(e: Pick<KindEntry, "instance" | "kind">): string {
  return `${e.instance}:${e.kind.id}`;
}

/**
 * The one kind `name` means, or why it means none. An unqualified id that two
 * instances declare is refused with both names, never picked: choosing one
 * would create a document of a structure the reader did not ask for.
 */
export function resolveKind(entries: readonly KindEntry[], name: string): KindEntry | { error: string } {
  const [inst, id] = name.includes(":") ? (name.split(":", 2) as [string, string]) : [undefined, name];
  const hits = entries.filter((e) => e.kind.id === id && (inst === undefined || e.instance === inst));
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) return { error: `kind "${name}" is declared by ${hits.map(qualifiedKind).join(" and ")}; name one of them` };
  const known = entries.map(qualifiedKind).sort();
  return { error: `no loaded knowledge graph declares a document kind "${name}". Known: ${known.length ? known.join(", ") : "none — no instance in this checkout declares a document-kinds directory"}` };
}

/** The kind's sections with its ancestors' first, nearest parent last. A cycle or a missing parent stops the walk. */
export function sectionsOf(entry: KindEntry, entries: readonly KindEntry[]): DocumentKind["sections"] {
  const chain: KindEntry[] = [];
  const seen = new Set<string>();
  let cur: KindEntry | undefined = entry;
  while (cur && !seen.has(qualifiedKind(cur))) {
    seen.add(qualifiedKind(cur));
    chain.unshift(cur);
    const parent: string | undefined = cur.kind.extends;
    if (!parent) break;
    // The parent its own instance declares, else the one other instance that does.
    const here: string = cur.instance;
    const own: KindEntry | undefined = entries.find((e) => e.instance === here && e.kind.id === parent);
    const r: KindEntry | { error: string } = own ?? resolveKind(entries, parent);
    cur = "error" in r ? undefined : r;
  }
  const out: DocumentKind["sections"] = [];
  const ids = new Set<string>();
  for (const k of chain) for (const s of k.kind.sections) if (!ids.has(s.id)) { ids.add(s.id); out.push(s); }
  return out;
}

const yamlString = (s: string): string => JSON.stringify(s);
const commentSafe = (s: string): string => s.replace(/--/g, "‐‐");

/** The page this writes, as text. */
export function documentPage(entry: KindEntry, entries: readonly KindEntry[], title: string): string {
  const lines = [
    "---",
    `title: ${yamlString(title)}`,
    `documentKind: ${yamlString(qualifiedKind(entry))}`,
    "---",
    "",
    `# ${title}`,
    "",
    `<!-- A ${commentSafe(entry.kind.title)} (${qualifiedKind(entry)}, ${entry.kind.structure}). Created by folio-create; write the content under each heading. -->`,
    "",
  ];
  for (const s of sectionsOf(entry, entries)) {
    lines.push(`## ${s.title}`, "", `<!-- ${s.required ? "Required" : "Optional"}. ${commentSafe(s.description)} -->`, "");
  }
  return lines.join("\n");
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Write the document; returns the path written, or why nothing was. */
export function createDocument(opts: { root: string; kinds: readonly KindEntry[]; kind: string; slug: string; title: string }): { path: string } | { error: string } {
  if (!SLUG.test(opts.slug)) return { error: `slug "${opts.slug}" must be lower-case letters, digits and hyphens` };
  const entry = resolveKind(opts.kinds, opts.kind);
  if ("error" in entry) return entry;
  const dir = join(folioDir(opts.root), opts.slug);
  if (existsSync(dir)) return { error: `${relative(opts.root, dir) || dir} already exists; it is somebody's document, so nothing was written` };
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "index.md");
  writeFileSync(path, documentPage(entry, opts.kinds, opts.title));
  return { path };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const root = arg("--root") ?? process.cwd();
  // The checkout: every instance mounted in it, which is the dependency chain.
  const { kinds } = readDocumentKinds(REPO_ROOT ?? HARNESS_ROOT);
  if (process.argv.includes("--list")) {
    for (const e of [...kinds].sort((a, b) => qualifiedKind(a).localeCompare(qualifiedKind(b)))) {
      console.log(`${qualifiedKind(e).padEnd(32)} ${e.kind.title}`);
    }
    if (kinds.length === 0) console.log("No instance in this checkout declares a document kind.");
    process.exit(0);
  }
  const kind = arg("--kind"), slug = arg("--slug"), title = arg("--title");
  if (!kind || !slug || !title) {
    console.error("usage: folio:create --kind <id|instance:id> --slug <slug> --title <title> [--root <repo>]   |   folio:create --list");
    process.exit(2);
  }
  const r = createDocument({ root, kinds, kind, slug, title });
  if ("error" in r) {
    console.error(`folio:create: ${r.error}`);
    process.exit(1);
  }
  console.log(`wrote ${relative(root, r.path)}`);
}
