/**
 * Filling empty gettext entries with an OPEN, self-hosted machine translator.
 *
 * @module scripts/lib/machine-translation
 * @covers translation-sources
 *
 * The owner, 2026-11-14: an unrestricted, open machine-translation step for
 * the catalogues, so that no freemium API quota is involved. Two engines are
 * supported, both run by whoever runs the script:
 *
 *   - **OPUS-MT** (Helsinki-NLP Marian models, CC-BY 4.0) through a local
 *     runner command ({@link opusMtEngine}).
 *   - **LibreTranslate** (AGPL, Argos models) at a self-hosted URL
 *     ({@link libreTranslateEngine}). The hosted libretranslate.com service is
 *     refused: it is the freemium API this step exists to avoid.
 *
 * ## The rules, and where each is enforced
 *
 *   1. **Only EMPTY `msgstr` is filled.** A non-empty one is never touched,
 *      whoever wrote it ({@link fillCandidates}). Plural entries are skipped
 *      and reported: one machine string cannot supply `msgstr[0..n]` for a
 *      language with three or six forms.
 *   2. **Every machine string is `#, fuzzy`.** The PO edit is
 *      `applySuggestion` from `translation-adjudication.ts`, which writes the
 *      flag, so `gen-translation-status.ts` counts the string as "present,
 *      needs review" and never as translated.
 *   3. **Placeholders and markup must round-trip** ({@link placeholderProblem}).
 *      `{name}`, `{{x}}`, `%s`, `%(x)s`, `%1$s`, tags (`<a0>…</a0>`, `<slug>`),
 *      code spans, link targets and URLs are compared as multisets, along with
 *      the number of line breaks. A string that does not round-trip is left
 *      EMPTY and reported, never "repaired".
 *   4. **Surrounding whitespace is kept**: it is cut off before translation and
 *      put back after, so the engine never sees it.
 *   5. **The node records the machine** ({@link machineNodeStatus}):
 *      `status.generatedBy: "machine"`, `status.generator: "<engine> <model>"`,
 *      `status.generatedAt`. `official` is never set, and a catalogue whose
 *      node is already official is not filled at all.
 *   6. **A catalogue that says `DO NOT MACHINE-FILL` is not filled.** That is
 *      a rule the catalogue's author wrote (`translate-kg-viewer.ts`), and this
 *      step does not override it.
 */
import { applySuggestion, poEntries } from "./translation-adjudication.ts";

// ── Placeholders and markup ──────────────────────────────────────────────

/**
 * Every token that must come back from the engine unchanged. Alternation order
 * matters only when two alternatives start at the same position: a code span
 * is taken whole before anything inside it, `{{x}}` before `{x}`.
 */
const TOKEN = new RegExp(
  [
    "`[^`\\n]+`", // inline code span
    "\\{\\{[^{}]*\\}\\}", // {{ jinja / liquid }}
    "\\{[^{}\\s]*\\}", // {name}, {0}, {}
    "%%", // a literal percent sign in a printf string
    "%\\d+\\$[-+#0]*\\d*(?:\\.\\d+)?[diouxXeEfFgGcsa]", // %1$s
    "%\\([^)\\s]+\\)[-+#0]*\\d*(?:\\.\\d+)?[diouxXeEfFgGcrsa]", // %(name)s
    "%[-+#0]*\\d*(?:\\.\\d+)?[hlLqjzt]*[diouxXeEfFgGcsa@]", // %s, %d, %.2f, %@
    "</?[A-Za-z][\\w.:-]*(?:\\s[^<>]*)?/?>", // <a0>, </a0>, <br/>, <slug>
    "\\]\\([^)\\s]+\\)", // a Markdown link target](url)
    "https?://[^\\s<>()\\]]+", // a bare URL
    "&(?:[a-zA-Z]+|#\\d+|#x[0-9a-fA-F]+);", // HTML entities
  ].join("|"),
  "g",
);

/** The placeholders and markup tokens of a string, sorted (a multiset). */
export function placeholders(s: string): string[] {
  return (s.match(TOKEN) ?? []).sort();
}

/**
 * Why `translation` does not keep what `source` must keep, or `undefined` when
 * it does: the same placeholder multiset and the same number of line breaks.
 */
export function placeholderProblem(source: string, translation: string): string | undefined {
  if (translation.trim() === "") return "the engine returned nothing";
  const a = placeholders(source);
  const b = placeholders(translation);
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
    const missing = a.filter((t) => !b.includes(t));
    const extra = b.filter((t) => !a.includes(t));
    const parts = [
      missing.length ? `lost ${missing.map((t) => JSON.stringify(t)).join(", ")}` : "",
      extra.length ? `added ${extra.map((t) => JSON.stringify(t)).join(", ")}` : "",
    ].filter(Boolean);
    return `placeholders do not round-trip${parts.length ? ` (${parts.join("; ")})` : " (counts differ)"}`;
  }
  const nl = (x: string) => (x.match(/\n/g) ?? []).length;
  if (nl(source) !== nl(translation)) return `line breaks do not round-trip (${nl(source)} → ${nl(translation)})`;
  return undefined;
}

/** A string cut into its leading whitespace, its core, and its trailing whitespace. */
export function splitWhitespace(s: string): { lead: string; core: string; trail: string } {
  const lead = /^\s*/.exec(s)![0];
  const rest = s.slice(lead.length);
  const trail = /\s*$/.exec(rest)![0];
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

// ── What to fill ─────────────────────────────────────────────────────────

/** One entry the engine is asked to translate. */
export interface Candidate {
  msgctxt?: string;
  msgid: string;
}

/** Entries not filled, with the reason. */
export interface Skipped {
  msgctxt?: string;
  msgid: string;
  reason: string;
}

/**
 * The entries of a catalogue that may be filled: `msgstr` empty, not plural,
 * `msgid` not blank. Everything else is left exactly as it is; plural entries
 * with an empty `msgstr[0]` are reported, since they stay untranslated.
 */
export function fillCandidates(po: string): { candidates: Candidate[]; skipped: Skipped[] } {
  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  for (const e of poEntries(po)) {
    if (e.msgstr !== "") continue; // NEVER overwrite
    const ctx = e.msgctxt !== undefined ? { msgctxt: e.msgctxt } : {};
    if (e.msgidPlural !== undefined) {
      skipped.push({ ...ctx, msgid: e.msgid, reason: "plural entry: its forms are left for a person" });
      continue;
    }
    if (e.msgid.trim() === "") continue;
    const key = `${e.msgctxt ?? ""}\u0004${e.msgid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...ctx, msgid: e.msgid });
  }
  return { candidates, skipped };
}

/** Whether the catalogue's own comments forbid machine filling. */
export function forbidsMachineFill(po: string): boolean {
  return /^#.*\bDO NOT MACHINE-FILL\b/im.test(po);
}

/**
 * Write the engine's translations into the catalogue. `translated[i]` is the
 * engine's text for the CORE of `candidates[i].msgid` (whitespace cut off by
 * {@link splitWhitespace}). Each one is checked, re-wrapped in the source's
 * whitespace, and written as `#, fuzzy`; one that fails a check is left empty
 * and reported.
 */
export function applyTranslations(
  po: string,
  candidates: Candidate[],
  translated: string[],
): { text: string; filled: number; skipped: Skipped[] } {
  if (translated.length !== candidates.length) {
    throw new Error(`engine returned ${translated.length} strings for ${candidates.length} requested`);
  }
  let text = po;
  let filled = 0;
  const skipped: Skipped[] = [];
  candidates.forEach((c, i) => {
    const ctx = c.msgctxt !== undefined ? { msgctxt: c.msgctxt } : {};
    const { lead, core, trail } = splitWhitespace(c.msgid);
    const t = translated[i] ?? "";
    const problem = placeholderProblem(core, t.trim());
    if (problem) {
      skipped.push({ ...ctx, msgid: c.msgid, reason: problem });
      return;
    }
    const r = applySuggestion(text, { ...ctx, msgid: c.msgid, current: "", suggested: lead + t.trim() + trail });
    if ("refused" in r) {
      skipped.push({ ...ctx, msgid: c.msgid, reason: r.refused });
      return;
    }
    text = r.text;
    filled++;
  });
  return { text, filled, skipped };
}

// ── The translation node ─────────────────────────────────────────────────

/** A translation node's `status`, after a machine filled some of its catalogue. */
export function machineNodeStatus(
  status: Record<string, unknown>,
  generator: string,
  generatedAt: string,
): Record<string, unknown> {
  // `official` is carried, never set: the caller refuses an official node.
  return { ...status, generatedBy: "machine", generator, generatedAt };
}

// ── Engines ──────────────────────────────────────────────────────────────

/** A machine translator: English in, `target` out, one string per string. */
export interface MtEngine {
  /** `opus-mt` or `libretranslate`. */
  name: string;
  /** The model that serves `target`, as recorded in `status.generator`. */
  model(target: string): string;
  translate(texts: string[], source: string, target: string): Promise<string[]>;
}

/** The node's `status.generator` for an engine and target. */
export function generatorOf(engine: MtEngine, target: string): string {
  return `${engine.name} ${engine.model(target)}`;
}

/**
 * The OPUS-MT model for English to `target`. The `en-ar` and `en-zh` models
 * are multi-target and need a sentence-initial `>>id<<` token, given here.
 */
export function opusMtModel(target: string): { model: string; targetToken?: string } {
  const t = target.split("-")[0]!.toLowerCase();
  if (t === "ar") return { model: "Helsinki-NLP/opus-mt-en-ar", targetToken: ">>ara<<" };
  if (t === "zh") return { model: "Helsinki-NLP/opus-mt-en-zh", targetToken: ">>cmn_Hans<<" };
  return { model: `Helsinki-NLP/opus-mt-en-${t}` };
}

/** Runs a command: request JSON on stdin, response JSON on stdout. */
export type CommandRunner = (argv: string[], stdin: string) => Promise<string>;

/**
 * OPUS-MT through a LOCAL runner command. The command reads one JSON request
 * on stdin and writes one JSON response on stdout:
 *
 * ```
 * → {"source":"en","target":"es","model":"Helsinki-NLP/opus-mt-en-es","targetToken":null,"texts":["…"]}
 * ← {"translations":["…"]}
 * ```
 *
 * Any runner that loads the Marian model locally will do (transformers,
 * CTranslate2, marian-server behind a shim). Nothing leaves the machine.
 */
export function opusMtEngine(runner: string[], run: CommandRunner, modelOverride?: string): MtEngine {
  return {
    name: "opus-mt",
    model: (target) => modelOverride ?? opusMtModel(target).model,
    async translate(texts, source, target) {
      const { model, targetToken } = opusMtModel(target);
      const req = { source, target, model: modelOverride ?? model, targetToken: targetToken ?? null, texts };
      const out = JSON.parse(await run(runner, JSON.stringify(req))) as { translations?: unknown };
      if (!Array.isArray(out.translations) || !out.translations.every((x) => typeof x === "string")) {
        throw new Error("opus-mt runner: response has no `translations` array of strings");
      }
      return out.translations as string[];
    },
  };
}

/** Hosts that are a freemium translation API, never a self-hosted instance. */
const HOSTED = /(^|\.)libretranslate\.(com|de)$/i;

/** Why `url` may not be used as a LibreTranslate endpoint, or `undefined`. */
export function libreTranslateUrlProblem(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `not a URL: ${url}`;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `not an http(s) URL: ${url}`;
  if (HOSTED.test(u.hostname)) return `${u.hostname} is the hosted freemium service; run LibreTranslate yourself and give its URL`;
  return undefined;
}

/** LibreTranslate's `/translate`, at a self-hosted URL. */
export function libreTranslateEngine(url: string, fetchImpl: typeof fetch = fetch, modelOverride?: string): MtEngine {
  const problem = libreTranslateUrlProblem(url);
  if (problem) throw new Error(`libretranslate: ${problem}`);
  const base = url.replace(/\/+$/, "");
  return {
    name: "libretranslate",
    model: (target) => modelOverride ?? `argos-translate en_${target.split("-")[0]!.toLowerCase()}`,
    async translate(texts, source, target) {
      if (texts.length === 0) return [];
      const res = await fetchImpl(`${base}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: texts, source, target: target.split("-")[0], format: "text" }),
      });
      if (!res.ok) throw new Error(`libretranslate: HTTP ${res.status} from ${base}/translate`);
      const body = (await res.json()) as { translatedText?: unknown };
      const t = body.translatedText;
      if (!Array.isArray(t) || !t.every((x) => typeof x === "string")) {
        throw new Error("libretranslate: response has no `translatedText` array of strings");
      }
      return t as string[];
    },
  };
}
