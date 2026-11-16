/**
 * gettext over a page's HTML and SVG includes: a computable figure, a card, a
 * toggle, anything a page pulls in with `{% include x %}` rather than writes.
 *
 * @module pipeline/include-po
 *
 * A site translates a page from the page's own catalogue, and an include is
 * not the page: an IG's figure written as `input/includes/x.svg` and included
 * on the home page stayed English on every translated page (owner,
 * 2026-11-16: "why computable images not translated?"). Here an include gets
 * a catalogue of its own, read with the two segmenters a page already has:
 *
 * - the HTML around a drawing through `html-po.ts` (text, `title`, `alt`…);
 * - each inline drawing's labels and `<title>`s through `svg-label-po.ts`,
 *   a label's lines joined into one msgid and re-wrapped where its anchor
 *   puts it.
 *
 * A Liquid tag or output (`{% include y.svg %}`, `{{ page.x }}`) is never a
 * msgid: the build resolves it, not a translator. The catalogue's name is the
 * include's file name, `translations/<locale>/includes/<file>.po`
 * ({@link includeCatalogue}), so one catalogue serves every page that
 * includes the file.
 *
 * Pure: no filesystem.
 */
import { extractHtml, injectHtml } from "./html-po.ts";
import type { PotEntry } from "./pot-extract.ts";
import { extractSvgLabels, injectSvgLabels } from "./svg-label-po.ts";

/** The include files these segmenters read. */
export const INCLUDE_EXT_RE = /\.(?:html|svg)$/;

/** An include's catalogue, relative to `translations/<locale>/`, without `.po`/`.pot`. */
export function includeCatalogue(name: string): string {
  return `includes/${name}`;
}

const LIQUID_ONLY = /^\s*(?:\{%[^%]*%\}|\{\{[^}]*\}\}|\s)*$/;

/** Whether a segment is words a translator can translate, not only Liquid. */
function words(msgid: string): boolean {
  return !LIQUID_ONLY.test(msgid);
}

/** Every msgid of one include, HTML segments first, then the drawings' labels, each once. */
export function extractInclude(text: string, source: string): PotEntry[] {
  const out: PotEntry[] = [];
  const seen = new Set<string>();
  const add = (msgid: string) => {
    if (!words(msgid) || seen.has(msgid)) return;
    seen.add(msgid);
    out.push({ source, line: 0, msgid, kind: "html-text" });
  };
  if (source.endsWith(".html")) for (const m of extractHtml(text)) add(m);
  for (const m of extractSvgLabels(text)) add(m);
  return out;
}

export interface IncludeInjectResult {
  text: string;
  translated: number;
  untranslated: string[];
}

/** One include in the catalogue's language; anything the catalogue lacks stays English. */
export function injectInclude(text: string, name: string, catalogue: ReadonlyMap<string, string>, locale: string): IncludeInjectResult {
  let out = text;
  let translated = 0;
  const untranslated: string[] = [];
  if (name.endsWith(".html")) {
    const h = injectHtml(out, catalogue, locale);
    out = h.html;
    translated += h.translated;
    untranslated.push(...h.untranslated.filter(words));
  }
  const s = injectSvgLabels(out, catalogue);
  return { text: s.html, translated: translated + s.translated, untranslated: [...untranslated, ...s.untranslated] };
}
