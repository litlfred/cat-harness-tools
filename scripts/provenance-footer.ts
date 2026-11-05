/**
 * The "Provenance" section in a page's footer, built from the document's
 * `<document>.prov.jsonld` log.
 *
 * @module scripts/provenance-footer
 *
 * The docs QA moved provenance out of the narrative. Who decided, when, and
 * under which work item now goes into a log beside each document, and the
 * log says it "is rendered in its footer". This module does that rendering.
 * The owner chose it on 2026-11-05 ("2B: build it now").
 *
 * ## Two kinds of page, one route
 *
 * A page on the docs site comes from one of two places. An AUTHORED page is
 * a `.md` file under the site directory. A GENERATED page is written by a
 * script from a source somewhere else: `gen-docs-pages` from `docs/source/`,
 * `gen-skill-docs` from a skill. Only the script knows which source a
 * generated page came from, because Jekyll knows only `page.path`.
 *
 * So each generator passes a map of page key to source files to
 * {@link writeProvenanceListing}. It writes one fragment per page that has a
 * log entry, plus a site-data slice, `_data/provenance/<producer>.json`. That
 * slice maps a page key to its fragment. `footer_custom.html` looks up
 * `page.path` in every slice. The keys are the same as the todo index's, so
 * the page path minus its extension. Nothing is written for a page with no
 * entry, so the footer then shows nothing at all, never an empty section.
 *
 * Like the todo listing, everything here is generated at publish time and
 * gitignored.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { withInlineCode } from "../schemas/content/inline-code.js";
import { wrapRaw } from "./lib/liquid-raw.ts";
import { escapeHtml, todoListingFileFor } from "./todo-listing.js";

/** One entry of a provenance log, as the footer shows it. */
export interface ProvenanceEntry {
  /** The heading the passage sat under, or `(top of file)`. */
  section: string;
  /** `bean`, `owner-decision`, `issue`, `pr`, `proposal`, `history`, `date`. */
  kind: string;
  /** The passage moved out of the narrative, verbatim. */
  value: string;
  /** The work items, PRs and dates the passage named. */
  refs: string[];
}

/** The log that records a document's provenance: `x.md` → `x.prov.jsonld`. */
export function provenanceLogFor(source: string): string {
  return source.replace(/\.[^./]+$/, "") + ".prov.jsonld";
}

const asList = (v: unknown): string[] =>
  v === undefined ? [] : (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");

/**
 * The entries of one log, in the order the log lists them.
 *
 * Returns `undefined` when there is no log, or when the file is not a
 * document provenance log (`docs/assets/prov/` holds PROV traces of another
 * shape). A log that does not parse throws, because a broken log must not be
 * published as a page with no provenance.
 */
export function readProvenanceLog(file: string): ProvenanceEntry[] | undefined {
  if (!existsSync(file)) return undefined;
  const doc = JSON.parse(readFileSync(file, "utf-8")) as unknown;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return undefined;
  const graph = (doc as { "@graph"?: unknown })["@graph"];
  if (!Array.isArray(graph)) return undefined;
  const out: ProvenanceEntry[] = [];
  for (const node of graph as Array<Record<string, unknown>>) {
    const value = node["prov:value"];
    if (typeof value !== "string") continue; // the document node itself
    out.push({
      section: typeof node["cat-harness:section"] === "string" ? (node["cat-harness:section"] as string) : "(top of file)",
      kind: typeof node["cat-harness:provenanceKind"] === "string" ? (node["cat-harness:provenanceKind"] as string) : "history",
      value,
      refs: asList(node["cat-harness:refs"]),
    });
  }
  return out;
}

/** The entries of every source's log, concatenated in source order. */
export function provenanceOf(sources: readonly string[]): ProvenanceEntry[] {
  return sources.flatMap((s) => readProvenanceLog(provenanceLogFor(s)) ?? []);
}

/**
 * A passage as plain prose. Passages were cut from Markdown and sometimes
 * from inside an HTML comment, so the comment markers and the common indent
 * are removed. Nothing else changes.
 */
export function passageText(value: string): string {
  const lines = value
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .split("\n");
  const indents = lines.filter((l) => l.trim() !== "").map((l) => l.match(/^ */)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(cut))
    .join("\n")
    .trim();
}

/**
 * Inline Markdown emphasis outside code spans: `**x**` → strong, `*x*` → em.
 * Runs on text that is already escaped, so it adds tags and nothing else.
 */
export function withEmphasis(html: string): string {
  return html
    .split(/(<code>[\s\S]*?<\/code>)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, "$1<em>$2</em>"),
    )
    .join("");
}

/**
 * The footer section: a collapsed `<details>`, with entries grouped under the
 * section they came from, in first-seen order. Every interpolated value is
 * escaped. The whole fragment is wrapped in a Liquid raw block, because a
 * passage may contain `{{` and the fragment is read through `include`.
 */
export function renderProvenanceFooter(entries: readonly ProvenanceEntry[]): string {
  const bySection = new Map<string, ProvenanceEntry[]>();
  for (const e of entries) bySection.set(e.section, [...(bySection.get(e.section) ?? []), e]);
  const html: string[] = [
    `<details class="fa-provenance" id="fa-provenance" data-fa-provenance-count="${entries.length}">`,
    `  <summary class="fa-provenance-summary">Provenance (${entries.length})</summary>`,
    `  <p class="fa-provenance-lead">Who decided, when, and under which work item. ` +
      `This record was moved out of the text of the page.</p>`,
  ];
  for (const [section, items] of bySection) {
    // The extraction's marker for "before the first heading" reads as a
    // reader's label here.
    const label = section === "(top of file)" ? "About this page" : section;
    html.push(`  <h3 class="fa-provenance-section">${withInlineCode(label, escapeHtml)}</h3>`);
    html.push(`  <ul class="fa-provenance-list">`);
    for (const e of items) {
      const refs = e.refs.length
        ? ` <span class="fa-provenance-refs">${e.refs.map((r) => `<code>${escapeHtml(r.replace(/`/g, ""))}</code>`).join(" ")}</span>`
        : "";
      const text = passageText(e.value)
        .split(/\n{2,}/)
        .map((p) => withEmphasis(withInlineCode(p.replace(/\s*\n\s*/g, " "), escapeHtml)))
        .join("<br><br>");
      html.push(
        `    <li class="fa-provenance-entry" data-fa-provenance-kind="${escapeHtml(e.kind)}">` +
          `<span class="fa-provenance-kind">${escapeHtml(e.kind)}</span>${refs}` +
          `<div class="fa-provenance-text">${text}</div></li>`,
      );
    }
    html.push(`  </ul>`);
  }
  html.push(`</details>`);
  return wrapRaw(html.join("\n")).join("\n") + "\n";
}

/** What {@link writeProvenanceListing} did, for the generator's log line. */
export interface ProvenanceListingResult {
  pages: number;
  entries: number;
  /** Fragments that are stale: reported under `check`, deleted otherwise. */
  stale: string[];
}

/**
 * Write one generator's slice: a fragment per page with log entries, under
 * `_includes/generated/provenance/<producer>/`, and the index
 * `_data/provenance/<producer>.json`.
 *
 * `emit` is the generator's own writer, so `--check` compares instead of
 * writing. A fragment no page needs any more is deleted, or reported when
 * `check` is set.
 */
export function writeProvenanceListing(opts: {
  siteDir: string;
  producer: string;
  pages: ReadonlyMap<string, readonly string[]>;
  check: boolean;
  emit?: (path: string, content: string) => void;
  banner?: string;
}): ProvenanceListingResult {
  const emit =
    opts.emit ??
    ((path: string, content: string) => {
      if (!opts.check) writeFileSync(path, content);
    });
  const fragDir = join(opts.siteDir, "_includes", "generated", "provenance", opts.producer);
  const indexFile = join(opts.siteDir, "_data", "provenance", `${opts.producer}.json`);
  const index: { pages: Record<string, string> } = { pages: {} };
  const written = new Set<string>();
  let entries = 0;
  if (!opts.check) mkdirSync(fragDir, { recursive: true });
  for (const [page, sources] of [...opts.pages].sort(([a], [b]) => a.localeCompare(b))) {
    const found = provenanceOf(sources);
    if (found.length === 0) continue;
    const file = todoListingFileFor(page);
    written.add(file);
    entries += found.length;
    index.pages[page] = `generated/provenance/${opts.producer}/${file}`;
    emit(join(fragDir, file), (opts.banner ?? "") + renderProvenanceFooter(found));
  }
  const stale: string[] = [];
  if (existsSync(fragDir)) {
    for (const f of readdirSync(fragDir)) {
      if (!f.endsWith(".html") || written.has(f)) continue;
      stale.push(f);
      if (!opts.check) unlinkSync(join(fragDir, f));
    }
  }
  if (!opts.check) mkdirSync(dirname(indexFile), { recursive: true });
  emit(indexFile, JSON.stringify(index, null, 2) + "\n");
  return { pages: written.size, entries, stale };
}
