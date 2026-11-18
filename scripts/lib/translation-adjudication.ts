/**
 * Translation adjudication — a person's verdict on a machine translation,
 * carried from the review page to the record by a GitHub issue.
 *
 * @module scripts/lib/translation-adjudication
 * @covers translation-sources
 *
 * ## The round trip
 *
 *   1. The translation status page (`gen-translation-status.ts`) shows every
 *      catalogue × locale. A reviewer ticks the machine translations they
 *      find acceptable, or marks one a mistranslation and suggests a fix per
 *      string, and presses submit.
 *   2. The page opens GitHub's new-issue form, prefilled with
 *      {@link issueBody}: a readable summary, and the same thing as a JSON
 *      block in `translation-adjudication/v1` ({@link ADJUDICATION_SCHEMA}).
 *      The person who files it is the adjudicator: their GitHub login is the
 *      only identity the record carries, and nothing in the body can name
 *      anyone else.
 *   3. `scripts/translation-adjudicate.ts`, run by the reusable workflow
 *      `layer-translation-adjudication.yml`, turns the issue into a PR:
 *      {@link planAdjudication} decides every write, and refuses rather than
 *      guesses.
 *
 * ## What is recorded, and where
 *
 * - **acceptable** (collaborators only): the catalogue's translation node
 *   (`<locale>/<cat>.json`, `translation-node/v1`) gets `status.official:
 *   true` with `signedOffBy` / `signedOffAt` — what a layer's per-catalogue
 *   review reader and the status page read as "reviewed by a person" — and an
 *   entry is appended to the audited `translation-qa` attestation
 *   (`qa-attestations/v1`, criterion {@link ADJUDICATION_CRITERION}) naming
 *   the issue and the hash of the catalogue the person saw.
 * - **mistranslation** (owner, 2026-11-18): every suggestion, from anyone, is
 *   appended to the candidates sidecar as a `human` candidate. A
 *   collaborator's suggestion also adjudicates the string: `msgstr` becomes
 *   their text, not fuzzy, and the sidecar entry's `adjudications` records
 *   who chose which candidate (or their own text) and why. Anyone else's is a
 *   proposal: it fills `msgstr` only when that is empty (fuzzy), flags the
 *   catalogue for a collaborator, and is filed under
 *   {@link PROPOSAL_CRITERION}.
 *
 * The PO header `X-Folio-Official` and the locale's `status.json` are never
 * touched: locale sign-off stays a separate, deliberate act
 * (`check-translation-officiality.ts`).
 *
 * ## Refusals
 *
 * An `acceptable` verdict from an author who is not an owner, member or
 * collaborator of the repository is refused, as is one whose catalogue
 * changed since the page showed it (`poHash`). An item is refused when its
 * path leaves the translations directory or its sidecar will not parse. A
 * collaborator's suggestion for a string that is no longer what they saw is
 * recorded as their proposal, not as an adjudication. A refusal is reported
 * on the issue; it is never a partial record dressed as a whole one.
 *
 * Node-only imports: this module is the part both the page's generator and
 * the workflow's script share, and it is tested without a mounted harness.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";

/** The issue body's JSON block declares this. */
export const ADJUDICATION_SCHEMA = "translation-adjudication/v1" as const;

/** The issue label the page asks for and the workflow listens on. */
export const ADJUDICATION_LABEL = "translation-adjudication" as const;

/** The issue title's prefix: the workflow's trigger when the label could not be set. */
export const ADJUDICATION_TITLE_PREFIX = "[translation review]" as const;

/** The attestation criterion a human adjudication is filed under. */
export const ADJUDICATION_CRITERION = "human-adjudication" as const;

/** Repository roles whose adjudication is recorded (GitHub `author_association`). */
export const ADJUDICATOR_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"] as const;

/** GitHub refuses a new-issue URL much past this; beyond it the page copies the body instead. */
export const MAX_ISSUE_URL = 7500;

export type Verdict = "acceptable" | "mistranslation";

/**
 * Where a candidate translation came from. A reviewer may pick one of several
 * candidates for a string (an official text, an agent model, an open
 * machine-translation model, a web service or translation platform, a
 * person); the source of the one they picked is recorded with their verdict.
 *
 * `official` (owner, 2026-11-18) is a text a responsible body published (a
 * WHO glossary's, a ministry's), recorded as a candidate so it ranks first.
 */
export const CANDIDATE_SOURCE_KINDS = ["official", "agent", "open-mt", "web-service", "human"] as const;
export type CandidateSourceKind = (typeof CANDIDATE_SOURCE_KINDS)[number];

export interface CandidateSource {
  kind: CandidateSourceKind;
  /** The model or service: `claude-opus-5-5`, `opus-mt-en-fr`, `deepl`, `weblate`; a person as `github:<login>`. */
  id: string;
  version?: string;
  /** ISO 8601, when the candidate was produced. */
  at?: string;
  /** The issue a person's proposal came from (owner, 2026-11-18: `{kind:"human", id:"github:<login>", issue}`). */
  issue?: string;
}

/**
 * QA results carried with a candidate, so a reviewer sees them beside it and
 * the default pick demotes a candidate that fails (owner, 2026-11-18).
 *
 * - `glossary`: the glossary check (`pipeline/translation-glossary.ts`, the
 *   port of `glossary_qa.py`): the fixed terms the source uses (`checked`)
 *   and those whose fixed translation the candidate lacks (`missing`).
 * - `roundTrip`: the candidate translated back to the source language and
 *   scored against it, 0 to 1; `back` is the back-translation.
 */
export interface CandidateQa {
  glossary?: { missing: string[]; checked?: string[] };
  roundTrip?: { score: number; back?: string; engine?: string };
}

/** One proposed translation of one string. */
export interface Candidate {
  /** The translation; for a plural entry, form 0. */
  text: string;
  /** For a plural entry, every `msgstr[n]`, in order. */
  forms?: string[];
  source: CandidateSource;
  /** Who wrote it, when the source is a platform or service with translators (a Weblate user). */
  author?: string;
  /** {@link msgidHash} of the string the candidate translates, when it was made: a mismatch is a stale candidate. */
  msgidHash?: string;
  qa?: CandidateQa;
  /** A person's proposal that repeats another source's candidate names that source. */
  basedOn?: CandidateSource;
  note?: string;
}

/**
 * A collaborator's choice for one string (owner, 2026-11-18: "repo
 * collaborators adjudicate by choosing a candidate or entering their own
 * text; that writes msgstr and records who chose and why"). Appended; the
 * last is the string's current adjudication.
 */
export interface StringAdjudication {
  /** `github:<login>`. */
  by: string;
  at: string;
  issue: string;
  /** The text chosen; it is what `msgstr` says after the adjudication. */
  text: string;
  /** The candidate chosen, by its source, or `own-text` when the collaborator typed their own. */
  chose: CandidateSource | "own-text";
  /** The collaborator's reason, when they gave one. */
  why?: string;
  /** {@link msgidHash} of the string when it was adjudicated. */
  msgidHash?: string;
  /** What `msgstr` said before. */
  previous?: string;
}

/**
 * The candidates sidecar, `translations/<locale>/<catalogue>.candidates.json`:
 * alternative translations per string, from any number of sources, for a
 * reviewer to choose among. The `.po` keeps one `msgstr`; this file keeps the
 * rest. Writers append; a candidate is never a verdict.
 *
 * **Candidates are never a barrier to having a translation** (owner,
 * 2026-11-14). A writer that adds candidates for a string whose `msgstr` is
 * empty also puts the default pick (`translation-strings.ts` `rankCandidates`)
 * in the `.po` as its `msgstr`, marked `#, fuzzy`: the page then shows that
 * translation, and it stays the default until a collaborator adjudicates the
 * string. A non-empty `msgstr` is left alone (owner, 2026-11-18).
 *
 * **Several proposals per string** (owner, 2026-11-18): every issue
 * suggestion, from any author, is appended here as a `human` candidate; a
 * collaborator's choice is recorded in `adjudications`.
 */
export const CANDIDATES_SCHEMA = "translation-candidates/v1" as const;
export const CANDIDATES_SUFFIX = ".candidates.json" as const;

export interface CandidatesEntry {
  msgctxt?: string;
  msgid: string;
  /**
   * `text` is the translation; for a plural entry it is form 0, and `forms`
   * holds every `msgstr[n]`, in order (owner, 2026-11-14: plurals are
   * machine-filled, fuzzy).
   */
  candidates: Candidate[];
  adjudications?: StringAdjudication[];
}

export interface CandidatesFile {
  $schema: typeof CANDIDATES_SCHEMA;
  locale: string;
  /** Path inside the locale directory, without extension. */
  catalogue: string;
  entries: CandidatesEntry[];
}

const HEX16 = /^[0-9a-f]{16}$/;

/** `undefined` when `v` is a {@link CandidateQa}, else what is wrong. */
function qaProblem(v: unknown): string | undefined {
  const q = v as Record<string, unknown> | null;
  if (q === null || typeof q !== "object" || Array.isArray(q)) return "must be an object";
  const strs = (x: unknown) => Array.isArray(x) && x.every((y) => typeof y === "string" && y.length <= 500);
  if (q.glossary !== undefined) {
    const g = q.glossary as Record<string, unknown> | null;
    if (g === null || typeof g !== "object" || !strs(g.missing) || (g.checked !== undefined && !strs(g.checked))) return "glossary must list missing (and checked) terms";
  }
  if (q.roundTrip !== undefined) {
    const r = q.roundTrip as Record<string, unknown> | null;
    if (r === null || typeof r !== "object" || typeof r.score !== "number" || !(r.score >= 0 && r.score <= 1)) return "roundTrip.score must be a number from 0 to 1";
    if (r.back !== undefined && typeof r.back !== "string") return "roundTrip.back must be text";
    if (r.engine !== undefined && typeof r.engine !== "string") return "roundTrip.engine must be text";
  }
  return undefined;
}

/** Problems with a candidates file; empty means it is a {@link CandidatesFile}. */
export function candidatesProblems(c: unknown): string[] {
  const o = c as Record<string, unknown> | null;
  if (o === null || typeof o !== "object" || Array.isArray(o)) return ["not an object"];
  const out: string[] = [];
  if (o.$schema !== CANDIDATES_SCHEMA) out.push(`$schema must be "${CANDIDATES_SCHEMA}"`);
  if (typeof o.locale !== "string" || !LOCALE_RE.test(o.locale)) out.push("locale is not a locale tag");
  if (!safeCatalogue(o.catalogue)) out.push("catalogue is not a safe relative path");
  if (!Array.isArray(o.entries)) return [...out, "entries must be a list"];
  o.entries.forEach((e0, i) => {
    const e = e0 as Record<string, unknown> | null;
    if (e === null || typeof e !== "object" || typeof e.msgid !== "string") return void out.push(`entries[${i}].msgid is required`);
    if (!Array.isArray(e.candidates)) return void out.push(`entries[${i}].candidates must be a list`);
    e.candidates.forEach((c1, j) => {
      const at = `entries[${i}].candidates[${j}]`;
      const cc = c1 as Record<string, unknown> | null;
      if (cc === null || typeof cc.text !== "string") out.push(`${at}.text is required`);
      if (cc?.forms !== undefined && (!Array.isArray(cc.forms) || cc.forms.length === 0 || !cc.forms.every((x) => typeof x === "string") || cc.forms[0] !== cc.text)) {
        out.push(`${at}.forms must be a non-empty list of strings whose first is text`);
      }
      const p = sourceProblem(cc?.source);
      if (p) out.push(`${at}.source ${p}`);
      if (cc?.basedOn !== undefined) {
        const b = sourceProblem(cc.basedOn);
        if (b) out.push(`${at}.basedOn ${b}`);
      }
      if (cc?.author !== undefined && (typeof cc.author !== "string" || cc.author.length === 0 || cc.author.length > 200)) out.push(`${at}.author must name a person`);
      if (cc?.msgidHash !== undefined && (typeof cc.msgidHash !== "string" || !HEX16.test(cc.msgidHash))) out.push(`${at}.msgidHash must be 16 hex characters`);
      if (cc?.note !== undefined && !str(cc.note, 2000)) out.push(`${at}.note is too long`);
      if (cc?.qa !== undefined) {
        const q = qaProblem(cc.qa);
        if (q) out.push(`${at}.qa ${q}`);
      }
    });
    if (e.adjudications !== undefined) {
      if (!Array.isArray(e.adjudications)) return void out.push(`entries[${i}].adjudications must be a list`);
      e.adjudications.forEach((a0, j) => {
        const at = `entries[${i}].adjudications[${j}]`;
        const a = a0 as Record<string, unknown> | null;
        if (a === null || typeof a !== "object") return void out.push(`${at} is not an object`);
        if (typeof a.by !== "string" || !/^github:[A-Za-z0-9-]+(\[bot\])?$/.test(a.by)) out.push(`${at}.by must be github:<login>`);
        if (typeof a.at !== "string" || a.at.length > 40) out.push(`${at}.at must be a timestamp`);
        if (typeof a.issue !== "string" || a.issue.length > 300) out.push(`${at}.issue must be the issue's URL`);
        if (typeof a.text !== "string") out.push(`${at}.text is required`);
        if (a.chose !== "own-text") {
          const s = sourceProblem(a.chose);
          if (s) out.push(`${at}.chose must be own-text or a candidate source: ${s}`);
        }
        if (a.why !== undefined && !str(a.why, 2000)) out.push(`${at}.why is too long`);
        if (a.msgidHash !== undefined && (typeof a.msgidHash !== "string" || !HEX16.test(a.msgidHash))) out.push(`${at}.msgidHash must be 16 hex characters`);
        if (a.previous !== undefined && typeof a.previous !== "string") out.push(`${at}.previous must be text`);
      });
    }
  });
  return out;
}

/** `undefined` when `v` is a {@link CandidateSource}, else what is wrong. */
export function sourceProblem(v: unknown): string | undefined {
  const s = v as Record<string, unknown> | null;
  if (s === null || typeof s !== "object" || Array.isArray(s)) return "must be an object";
  if (!(CANDIDATE_SOURCE_KINDS as readonly unknown[]).includes(s.kind)) return `kind must be one of ${CANDIDATE_SOURCE_KINDS.join(", ")}`;
  if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 200) return "id must name the model or service";
  if (s.version !== undefined && (typeof s.version !== "string" || s.version.length > 200)) return "version must be text";
  if (s.at !== undefined && (typeof s.at !== "string" || s.at.length > 40)) return "at must be a timestamp";
  if (s.issue !== undefined && (typeof s.issue !== "string" || !s.issue.startsWith("https://") || s.issue.length > 300)) return "issue must be the issue's https URL";
  return undefined;
}

/** One string's suggested fix. `current` is what the reviewer saw, so a changed string is caught. */
export interface Suggestion {
  msgctxt?: string;
  msgid: string;
  current: string;
  suggested: string;
  /** The candidate's source when the reviewer picked one rather than typing their own. */
  source?: CandidateSource;
  note?: string;
}

/** One (catalogue, locale) verdict. */
export interface AdjudicationItem {
  /** The catalogue's path inside the locale directory, without extension: `start/contributing`. */
  catalogue: string;
  locale: string;
  verdict: Verdict;
  /** {@link poHash} of the catalogue the reviewer saw. */
  poHash: string;
  suggestions?: Suggestion[];
  note?: string;
  /**
   * `propose`: record the suggestions as candidates only, even when the
   * author could adjudicate. Absent, a collaborator's suggestion adjudicates
   * the string and anyone else's is a proposal (owner, 2026-11-18).
   */
  intent?: Intent;
}

/** What an item's suggestions ask for: a collaborator's choice, or a proposal for one. */
export type Intent = "adjudicate" | "propose";

/** The issue body's JSON block. */
export interface AdjudicationPayload {
  $schema: typeof ADJUDICATION_SCHEMA;
  /** `owner/name` of the repository holding the catalogues. */
  repository: string;
  /** The layer's declared name. */
  layer: string;
  /** The `translation-sources` directory, relative to the layer root. */
  translations: string;
  items: AdjudicationItem[];
}

// ── Hashes ───────────────────────────────────────────────────────────────

/** The hash a reviewer's verdict is pinned to: SHA-256 of the catalogue's bytes, 16 hex. */
export function poHash(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

/**
 * The hash of one source string — context, msgid and plural msgid — that a
 * candidate or an adjudication is pinned to (owner, 2026-11-18: "the source
 * msgid hash so stale entries show"). 16 hex characters.
 */
export function msgidHash(e: { msgctxt?: string; msgid: string; msgidPlural?: string }): string {
  return poHash(`${e.msgctxt ?? ""}\u0004${e.msgid}\u0000${e.msgidPlural ?? ""}`);
}

// ── Validation ───────────────────────────────────────────────────────────

const LOCALE_RE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH_RE = /^[0-9a-f]{16}$/;

/** A catalogue path is relative, POSIX, and cannot climb out. */
export function safeCatalogue(c: unknown): c is string {
  if (typeof c !== "string" || c.length === 0 || c.length > 300) return false;
  if (c.includes("\\") || c.includes("\0") || isAbsolute(c) || c.startsWith("/")) return false;
  return c.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

const str = (v: unknown, max = 20000): v is string => typeof v === "string" && v.length <= max;

/**
 * Validate an untrusted payload. Returns the problems; an empty list means
 * `p` is an {@link AdjudicationPayload}. Every field is checked, because the
 * body is whatever the issue's author typed.
 */
export function payloadProblems(p: unknown): string[] {
  const out: string[] = [];
  const o = p as Record<string, unknown> | null;
  if (o === null || typeof o !== "object" || Array.isArray(o)) return ["the JSON block is not an object"];
  if (o.$schema !== ADJUDICATION_SCHEMA) out.push(`$schema must be "${ADJUDICATION_SCHEMA}"`);
  if (typeof o.repository !== "string" || !REPO_RE.test(o.repository)) out.push("repository must be owner/name");
  if (!str(o.layer, 200) || o.layer.length === 0) out.push("layer must be a name");
  if (!safeCatalogue(o.translations)) out.push("translations must be a relative directory");
  if (!Array.isArray(o.items) || o.items.length === 0) {
    out.push("items must be a non-empty list");
    return out;
  }
  if (o.items.length > 2000) out.push("at most 2000 items per issue");
  o.items.forEach((raw, i) => {
    const it = raw as Record<string, unknown> | null;
    const at = `items[${i}]`;
    if (it === null || typeof it !== "object") return void out.push(`${at} is not an object`);
    if (!safeCatalogue(it.catalogue)) out.push(`${at}.catalogue is not a safe relative path`);
    if (typeof it.locale !== "string" || !LOCALE_RE.test(it.locale)) out.push(`${at}.locale is not a locale tag`);
    if (it.verdict !== "acceptable" && it.verdict !== "mistranslation") out.push(`${at}.verdict must be acceptable or mistranslation`);
    if (typeof it.poHash !== "string" || !HASH_RE.test(it.poHash)) out.push(`${at}.poHash must be 16 hex characters`);
    if (it.note !== undefined && !str(it.note, 2000)) out.push(`${at}.note is too long`);
    if (it.intent !== undefined && it.intent !== "adjudicate" && it.intent !== "propose") out.push(`${at}.intent must be adjudicate or propose`);
    if (it.verdict === "acceptable" && it.suggestions !== undefined && (!Array.isArray(it.suggestions) || it.suggestions.length > 0)) {
      out.push(`${at}: an acceptable verdict carries no suggestions`);
    }
    if (it.verdict === "mistranslation") {
      if (!Array.isArray(it.suggestions) || it.suggestions.length === 0) {
        out.push(`${at}: a mistranslation needs at least one suggestion`);
      } else {
        it.suggestions.forEach((s0, j) => {
          const s = s0 as Record<string, unknown> | null;
          const sat = `${at}.suggestions[${j}]`;
          if (s === null || typeof s !== "object") return void out.push(`${sat} is not an object`);
          if (!str(s.msgid) || s.msgid.length === 0) out.push(`${sat}.msgid is required`);
          if (s.msgctxt !== undefined && !str(s.msgctxt, 2000)) out.push(`${sat}.msgctxt is not text`);
          if (!str(s.current)) out.push(`${sat}.current is required (the text you saw)`);
          if (!str(s.suggested) || s.suggested.trim().length === 0) out.push(`${sat}.suggested is required`);
          if (s.note !== undefined && !str(s.note, 2000)) out.push(`${sat}.note is too long`);
          if (s.source !== undefined) {
            const sp = sourceProblem(s.source);
            if (sp) out.push(`${sat}.source ${sp}`);
          }
        });
      }
    }
  });
  return out;
}

// ── The issue ────────────────────────────────────────────────────────────

/** The info string of the issue body's fenced JSON block. */
export const ADJUDICATION_FENCE_INFO = "json translation-adjudication" as const;
const FENCE_OPEN = "```" + ADJUDICATION_FENCE_INFO;

/** The issue's title. */
export function issueTitle(p: AdjudicationPayload): string {
  const acc = p.items.filter((i) => i.verdict === "acceptable").length;
  const mis = p.items.length - acc;
  const parts = [acc ? `${acc} acceptable` : "", mis ? `${mis} mistranslation${mis === 1 ? "" : "s"}` : ""].filter(Boolean);
  return `${ADJUDICATION_TITLE_PREFIX} ${p.layer}: ${parts.join(", ")}`;
}

/** Inline code that survives backticks in the text. */
function code(s: string): string {
  const t = s.replace(/\n/g, "⏎");
  return t.includes("`") ? `\`\` ${t} \`\`` : `\`${t}\``;
}

/**
 * The issue's body: a summary a person reads, then the JSON block the
 * workflow reads. Only the block is authoritative; the summary is rendered
 * from it and says so.
 */
export function issueBody(p: AdjudicationPayload): string {
  const lines: string[] = [
    `Translation review of **${p.layer}** (\`${p.translations}\`), filed from the translation status page.`,
    "",
    "By filing this issue, I (its author) review the translations below. The workflow records my GitHub login as the reviewer and opens a pull request; nothing is recorded in anyone else's name. If I am a collaborator of the repository my choices are adjudications; otherwise each suggestion is recorded as a proposal beside the others.",
    "",
  ];
  const acc = p.items.filter((i) => i.verdict === "acceptable");
  const mis = p.items.filter((i) => i.verdict === "mistranslation");
  if (acc.length > 0) {
    lines.push("### Acceptable", "");
    for (const i of acc) lines.push(`- [x] \`${i.locale}\` ${code(i.catalogue)}${i.note ? ` — ${i.note}` : ""}`);
    lines.push("");
  }
  if (mis.length > 0) {
    lines.push("### Mistranslations, with suggestions", "");
    for (const i of mis) {
      lines.push(`- \`${i.locale}\` ${code(i.catalogue)}${i.note ? ` — ${i.note}` : ""}`);
      for (const s of i.suggestions ?? []) {
        lines.push(`  - ${code(s.msgid)}${s.msgctxt ? ` (context ${code(s.msgctxt)})` : ""}: ${code(s.current)} → ${code(s.suggested)}${s.source ? ` (candidate from ${s.source.kind} ${code(s.source.id)})` : ""}${s.note ? ` — ${s.note}` : ""}`);
      }
    }
    lines.push("");
  }
  lines.push(
    "<details><summary>Machine-readable record (what the workflow reads; please don't edit)</summary>",
    "",
    FENCE_OPEN,
    JSON.stringify(p, null, 1),
    "```",
    "",
    "</details>",
  );
  return lines.join("\n");
}

/** The JSON block of an issue body, parsed; `undefined` when there is none or it will not parse. */
export function parseIssueBody(body: string): unknown {
  const start = body.indexOf(FENCE_OPEN);
  if (start < 0) return undefined;
  const from = body.indexOf("\n", start) + 1;
  const end = body.indexOf("\n```", from);
  if (from <= 0 || end < 0) return undefined;
  try {
    return JSON.parse(body.slice(from, end));
  } catch {
    return undefined;
  }
}

/** GitHub's new-issue URL, prefilled; `undefined` when it would be too long to open. */
export function newIssueUrl(p: AdjudicationPayload): string | undefined {
  const q = new URLSearchParams({ title: issueTitle(p), labels: ADJUDICATION_LABEL, body: issueBody(p) });
  const url = `https://github.com/${p.repository}/issues/new?${q.toString()}`;
  return url.length <= MAX_ISSUE_URL ? url : undefined;
}

// ── PO catalogues ────────────────────────────────────────────────────────

/** One entry of a `.po`, located by line. */
export interface PoEntry {
  msgctxt?: string;
  msgid: string;
  msgidPlural?: string;
  /** `msgstr`, or `msgstr[0]` for a plural entry. */
  msgstr: string;
  /** Every `msgstr[n]` of a plural entry, in order; `[msgstr]` for a singular one. */
  forms: string[];
  fuzzy: boolean;
  /** `#:` source references: where the string comes from. */
  references: string[];
  /** `#| msgid`: the source text this entry translated before the source changed (msgmerge's previous msgid). */
  previousMsgid?: string;
  /** `#| msgctxt`, with {@link previousMsgid}. */
  previousMsgctxt?: string;
  /** Line range `[start, end)` of the whole entry, comments included. */
  start: number;
  end: number;
  /** Line range `[start, end)` of the `msgstr` keyword and its continuations. */
  msgstrStart: number;
  msgstrEnd: number;
  /** End of the last `msgstr[n]` and its continuations (`msgstrEnd` for a singular entry). */
  formsEnd: number;
  /** The `#,` flags line, when there is one. */
  flagsLine?: number;
}

function unquote(line: string): string {
  const m = /"(.*)"\s*$/.exec(line);
  if (!m) return "";
  return m[1]!.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c));
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
}

/** Parse a catalogue into its entries, header (`msgid ""`) and obsolete (`#~`) entries excluded. */
export function poEntries(text: string): PoEntry[] {
  const lines = text.split("\n");
  const out: PoEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && lines[i]!.trim() === "") i++;
    if (i >= lines.length) break;
    const start = i;
    while (i < lines.length && lines[i]!.trim() !== "") i++;
    const end = i;
    const e: Partial<PoEntry> & { references: string[] } = { references: [], fuzzy: false, start, end };
    let field: "msgctxt" | "msgid" | "msgidPlural" | "msgstr" | "other" | undefined;
    const acc: Record<string, string> = {};
    const forms: string[] = [];
    let formsEnd: number | undefined;
    let obsolete = false;
    const prev: Record<string, string> = {};
    let prevField: string | undefined;
    for (let k = start; k < end; k++) {
      const l = lines[k]!;
      if (l.startsWith("#~")) { obsolete = true; continue; }
      if (l.startsWith("#|")) {
        const body = l.slice(2).trimStart();
        const pk = /^(msgctxt|msgid_plural|msgid)\s/.exec(body);
        if (pk) { prevField = pk[1]; prev[prevField!] = unquote(body); }
        else if (prevField && body.startsWith('"')) prev[prevField] = (prev[prevField] ?? "") + unquote(body);
        continue;
      }
      if (l.startsWith("#:")) { e.references.push(...l.slice(2).trim().split(/\s+/).filter(Boolean)); continue; }
      if (l.startsWith("#,")) { e.flagsLine = k; e.fuzzy = /\bfuzzy\b/.test(l); continue; }
      if (l.startsWith("#")) continue;
      const kw = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s/.exec(l);
      if (kw) {
        const name = kw[1]!;
        if (name === "msgctxt") field = "msgctxt";
        else if (name === "msgid") field = "msgid";
        else if (name === "msgid_plural") field = "msgidPlural";
        else if (name === "msgstr" || kw[2] === "0") { field = "msgstr"; e.msgstrStart = k; }
        else { field = "other"; if (e.msgstrEnd === undefined && e.msgstrStart !== undefined) e.msgstrEnd = k; }
        if (field !== "other") acc[field] = unquote(l);
        if (name.startsWith("msgstr")) { forms.push(unquote(l)); formsEnd = k + 1; }
        continue;
      }
      if (l.trimStart().startsWith('"') && field) {
        if (field !== "other") acc[field] = (acc[field] ?? "") + unquote(l);
        if (formsEnd === k) { forms[forms.length - 1] += unquote(l); formsEnd = k + 1; }
      }
    }
    if (obsolete || acc.msgid === undefined || e.msgstrStart === undefined) continue;
    if (e.msgstrEnd === undefined) {
      let k = e.msgstrStart + 1;
      while (k < end && lines[k]!.trimStart().startsWith('"')) k++;
      e.msgstrEnd = k;
    }
    if (acc.msgid === "" && acc.msgctxt === undefined) continue; // the header
    out.push({
      ...(acc.msgctxt !== undefined ? { msgctxt: acc.msgctxt } : {}),
      msgid: acc.msgid,
      ...(acc.msgidPlural !== undefined ? { msgidPlural: acc.msgidPlural } : {}),
      msgstr: acc.msgstr ?? "",
      forms,
      fuzzy: e.fuzzy!,
      references: e.references,
      ...(prev.msgid !== undefined ? { previousMsgid: prev.msgid } : {}),
      ...(prev.msgctxt !== undefined ? { previousMsgctxt: prev.msgctxt } : {}),
      start,
      end,
      msgstrStart: e.msgstrStart,
      msgstrEnd: e.msgstrEnd,
      formsEnd: formsEnd ?? e.msgstrEnd,
      ...(e.flagsLine !== undefined ? { flagsLine: e.flagsLine } : {}),
    });
  }
  return out;
}

/** The source files a catalogue's strings come from (`#:` references, line numbers dropped), sorted. */
export function sourceFilesOf(text: string): string[] {
  const files = new Set<string>();
  for (const e of poEntries(text)) for (const r of e.references) files.add(r.replace(/:\d+$/, ""));
  return [...files].sort();
}

/**
 * Replace one entry's `msgstr` and mark it `#, fuzzy`. Returns the new text,
 * or a reason when the entry is not there, is plural, or no longer says
 * `current`.
 */
export function applySuggestion(text: string, s: Suggestion): { text: string } | { refused: string } {
  const entries = poEntries(text).filter((e) => e.msgid === s.msgid && (e.msgctxt ?? undefined) === (s.msgctxt || undefined));
  if (entries.length === 0) return { refused: `no entry for msgid ${JSON.stringify(s.msgid.slice(0, 80))}` };
  const e = entries[0]!;
  if (e.msgidPlural !== undefined) return { refused: `msgid ${JSON.stringify(s.msgid.slice(0, 80))} is a plural entry; suggest plural forms by hand` };
  if (e.msgstr !== s.current) return { refused: `msgid ${JSON.stringify(s.msgid.slice(0, 80))} no longer says what the reviewer saw` };
  const lines = text.split("\n");
  return { text: markFuzzy([...lines.slice(0, e.msgstrStart), `msgstr ${quote(s.suggested)}`, ...lines.slice(e.msgstrEnd)], e).join("\n") };
}

/**
 * Fill an EMPTY plural entry's `msgstr[0..n-1]` and mark it `#, fuzzy`. Every
 * form must be empty (a plural a person has started is theirs), and `forms`
 * must have as many forms as the entry, or as the catalogue's plural count
 * when the entry lists fewer.
 */
export function applyForms(text: string, f: { msgctxt?: string; msgid: string; forms: string[] }): { text: string } | { refused: string } {
  const e = poEntries(text).find((x) => x.msgid === f.msgid && (x.msgctxt ?? undefined) === (f.msgctxt || undefined));
  const what = `msgid ${JSON.stringify(f.msgid.slice(0, 80))}`;
  if (!e) return { refused: `no entry for ${what}` };
  if (e.msgidPlural === undefined) return { refused: `${what} is not a plural entry` };
  if (e.forms.some((x) => x !== "")) return { refused: `${what} already has a form; plural forms are left for a person` };
  if (f.forms.length === 0 || f.forms.length < e.forms.length) return { refused: `${what} has ${e.forms.length} forms; ${f.forms.length} given` };
  const lines = text.split("\n");
  const fresh = f.forms.map((v, n) => `msgstr[${n}] ${quote(v)}`);
  return { text: markFuzzy([...lines.slice(0, e.msgstrStart), ...fresh, ...lines.slice(e.formsEnd)], e).join("\n") };
}

/** Add `fuzzy` to an entry's flags line, or add one after its other comments, before `msgctxt`/`msgid`. */
function markFuzzy(lines: string[], e: PoEntry): string[] {
  if (e.flagsLine !== undefined) {
    if (!e.fuzzy) lines[e.flagsLine] = `${lines[e.flagsLine]!}, fuzzy`;
    return lines;
  }
  let k = e.start;
  while (k < e.end && lines[k]!.startsWith("#")) k++;
  lines.splice(k, 0, "#, fuzzy");
  return lines;
}

// ── Planning the record ──────────────────────────────────────────────────

/** Who filed the issue, from the GitHub event (never from the body). */
export interface IssueAuthor {
  login: string;
  /** GitHub's `author_association`. */
  association: string;
}

export interface PlanInput {
  /** The layer's root on disk. */
  layerRoot: string;
  /** The layer's `owner/name`, from its declaration. */
  repository: string;
  /** The layer's `translation-sources` directory, relative to its root. */
  translations: string;
  payload: AdjudicationPayload;
  author: IssueAuthor;
  issueUrl: string;
  /** ISO 8601, the issue's creation time. */
  at: string;
  /** Where a catalogue's `translation-qa` attestation lives, relative to the layer root. */
  attestationPath: (catalogueFromRoot: string, locale: string) => string;
  /** The subject id an attestation names. */
  attestationSubject: (catalogueFromRoot: string) => string;
}

export interface Plan {
  /** Layer-relative path → new contents. */
  writes: Map<string, string>;
  applied: string[];
  refused: string[];
}

function readJson(path: string): Record<string, unknown> | null | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const v = JSON.parse(readFileSync(path, "utf-8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

/**
 * A collaborator's choice for one string: replace its `msgstr`, and clear
 * `fuzzy` and the `#|` previous-source lines, since a person with the
 * authority to decide has decided. Refused for a plural entry, an entry that
 * is not there, or one that no longer says `current` (unless it already says
 * the chosen text).
 */
export function applyAdjudication(text: string, s: Pick<Suggestion, "msgctxt" | "msgid" | "current" | "suggested">): { text: string } | { refused: string } {
  const e = poEntries(text).find((x) => x.msgid === s.msgid && (x.msgctxt ?? undefined) === (s.msgctxt || undefined));
  const what = `msgid ${JSON.stringify(s.msgid.slice(0, 80))}`;
  if (!e) return { refused: `no entry for ${what}` };
  if (e.msgidPlural !== undefined) return { refused: `${what} is a plural entry; adjudicate plural forms by hand` };
  if (e.msgstr !== s.current && e.msgstr !== s.suggested) return { refused: `${what} no longer says what the reviewer saw` };
  const lines = text.split("\n");
  const head: string[] = [];
  for (let k = e.start; k < e.msgstrStart; k++) {
    const l = lines[k]!;
    if (l.startsWith("#|")) continue;
    if (k === e.flagsLine) {
      const flags = l.slice(2).split(",").map((f) => f.trim()).filter((f) => f && f !== "fuzzy");
      if (flags.length > 0) head.push(`#, ${flags.join(", ")}`);
      continue;
    }
    head.push(l);
  }
  return { text: [...lines.slice(0, e.start), ...head, `msgstr ${quote(s.suggested)}`, ...lines.slice(e.msgstrEnd)].join("\n") };
}

/** The attestation criterion a proposal (not an adjudication) is filed under. */
export const PROPOSAL_CRITERION = "human-proposal" as const;

/**
 * Decide every write an issue makes. Pure apart from reading the layer's
 * files: the caller writes {@link Plan.writes}, so a test can inspect the
 * plan without a checkout.
 *
 * The owner's rulings of 2026-11-18:
 *
 * - **Anyone can propose.** Every suggestion, from any author, is appended to
 *   the catalogue's candidates sidecar as `{kind: "human", id:
 *   "github:<login>", issue}`. A proposal never conflicts with another: the
 *   sidecar keeps them all. `msgstr` is left alone unless it is empty, when
 *   the proposal fills it, fuzzy.
 * - **Collaborators adjudicate.** An owner's, member's or collaborator's
 *   suggestion (unless the item says `intent: "propose"`) also writes
 *   `msgstr`, not fuzzy, and appends to the entry's `adjudications` who chose
 *   which candidate (or their own text) and why. A string that changed since
 *   they saw it is recorded as their proposal only.
 * - **Only collaborators accept** a whole catalogue (`acceptable`).
 */
export function planAdjudication(input: PlanInput): Plan {
  const plan: Plan = { writes: new Map(), applied: [], refused: [] };
  const { payload: p, author } = input;
  const collaborator = (ADJUDICATOR_ASSOCIATIONS as readonly string[]).includes(author.association);
  const problems = payloadProblems(p);
  if (problems.length > 0) {
    plan.refused.push(...problems.map((x) => `invalid record: ${x}`));
    return plan;
  }
  if (p.repository.toLowerCase() !== input.repository.toLowerCase()) {
    plan.refused.push(`the record is for ${p.repository}, but this is ${input.repository}`);
    return plan;
  }
  if (normalize(p.translations) !== normalize(input.translations)) {
    plan.refused.push(`the record names translations directory ${p.translations}, but this layer declares ${input.translations}`);
    return plan;
  }
  const person = `github:${author.login}`;
  const seen = new Set<string>();
  for (const item of p.items) {
    const key = `${item.locale}/${item.catalogue}`;
    if (seen.has(key)) {
      plan.refused.push(`${key}: listed twice; only the first is recorded`);
      continue;
    }
    seen.add(key);
    const catFromRoot = join(input.translations, item.locale, item.catalogue).split(sep).join("/");
    const poRel = `${catFromRoot}.po`;
    const nodeRel = `${catFromRoot}.json`;
    const sidecarRel = `${catFromRoot}${CANDIDATES_SUFFIX}`;
    const poAbs = join(input.layerRoot, poRel);
    const current = plan.writes.get(poRel) ?? (existsSync(poAbs) ? readFileSync(poAbs, "utf-8") : undefined);
    if (current === undefined) {
      plan.refused.push(`${key}: there is no catalogue ${poRel}`);
      continue;
    }

    let poText = current;
    let role: "adjudicator" | "proposer" = "adjudicator";
    const appliedSuggestions: Suggestion[] = [];
    let sidecarText: string | undefined;
    let adjudicated = 0;
    let proposed = 0;
    let filled = 0;
    if (item.verdict === "acceptable") {
      if (!collaborator) {
        plan.refused.push(
          `${key}: only an owner, member or collaborator of ${input.repository} can accept a translation, and @${author.login} is ${author.association}; ` +
            "suggest text with ✎ Fix translation to propose it instead.",
        );
        continue;
      }
      if (poHash(current) !== item.poHash) {
        plan.refused.push(`${key}: the catalogue changed since the page showed it (hash ${item.poHash}, now ${poHash(current)}); reload the page and review it again`);
        continue;
      }
    } else {
      role = collaborator && item.intent !== "propose" ? "adjudicator" : "proposer";
      const sidecarAbs = join(input.layerRoot, sidecarRel);
      const raw = plan.writes.has(sidecarRel) ? (JSON.parse(plan.writes.get(sidecarRel)!) as unknown) : readJson(sidecarAbs);
      if (raw === null || (raw !== undefined && candidatesProblems(raw).length > 0)) {
        plan.refused.push(`${key}: its candidates file ${sidecarRel} is not ${CANDIDATES_SCHEMA}; it is never overwritten, so nothing is recorded for this catalogue`);
        continue;
      }
      const sidecar: CandidatesFile = (raw as CandidatesFile | undefined) ?? { $schema: CANDIDATES_SCHEMA, locale: item.locale, catalogue: item.catalogue, entries: [] };
      for (const s of item.suggestions ?? []) {
        const what = `msgid ${JSON.stringify(s.msgid.slice(0, 80))}`;
        const e = poEntries(poText).find((x) => x.msgid === s.msgid && (x.msgctxt ?? undefined) === (s.msgctxt || undefined));
        if (!e) {
          plan.refused.push(`${key}: no entry for ${what}`);
          continue;
        }
        if (e.msgidPlural !== undefined) {
          plan.refused.push(`${key}: ${what} is a plural entry; suggest plural forms by hand`);
          continue;
        }
        const hash = msgidHash(e);
        let entry = sidecar.entries.find((x) => x.msgid === e.msgid && (x.msgctxt ?? undefined) === (e.msgctxt ?? undefined));
        if (!entry) {
          entry = { ...(e.msgctxt !== undefined ? { msgctxt: e.msgctxt } : {}), msgid: e.msgid, candidates: [] };
          sidecar.entries.push(entry);
        }
        // Every suggestion is a proposal, recorded beside the others.
        if (!entry.candidates.some((c) => c.text === s.suggested && c.source.kind === "human" && c.source.id === person)) {
          entry.candidates.push({
            text: s.suggested,
            source: { kind: "human", id: person, at: input.at, issue: input.issueUrl },
            msgidHash: hash,
            ...(s.source ? { basedOn: s.source } : {}),
            ...(s.note ? { note: s.note } : {}),
          });
        }
        proposed++;
        if (role === "adjudicator") {
          const r = applyAdjudication(poText, s);
          if ("refused" in r) {
            plan.refused.push(`${key}: ${r.refused}; recorded as @${author.login}'s proposal, not adjudicated`);
            continue;
          }
          poText = r.text;
          entry.adjudications = [
            ...(entry.adjudications ?? []),
            {
              by: person,
              at: input.at,
              issue: input.issueUrl,
              text: s.suggested,
              chose: s.source ?? "own-text",
              ...(s.note || item.note ? { why: s.note ?? item.note! } : {}),
              msgidHash: hash,
              previous: e.msgstr,
            },
          ];
          adjudicated++;
          appliedSuggestions.push(s);
        } else {
          // msgstr is left alone unless it is empty (owner, 2026-11-18).
          if (e.forms.every((f) => f === "")) {
            const r = applySuggestion(poText, { ...s, current: "" });
            if ("text" in r) {
              poText = r.text;
              filled++;
            }
          }
          appliedSuggestions.push(s);
        }
      }
      if (proposed === 0) continue;
      const issues = candidatesProblems(sidecar);
      if (issues.length > 0) {
        plan.refused.push(`${key}: the candidates file would not validate (${issues[0]}); nothing is recorded for this catalogue`);
        continue;
      }
      sidecarText = json(sidecar);
    }

    // The translation node: what the review cells and the status page read.
    const nodeAbs = join(input.layerRoot, nodeRel);
    const node0 = plan.writes.has(nodeRel) ? (JSON.parse(plan.writes.get(nodeRel)!) as Record<string, unknown>) : readJson(nodeAbs);
    if (node0 === null) {
      plan.refused.push(`${key}: ${nodeRel} will not parse; recorded nothing for this catalogue`);
      continue;
    }
    const node: Record<string, unknown> = node0 ?? {
      $schema: "translation-node/v1",
      label: `trans:${item.locale}/${item.catalogue}`,
      locale: item.locale,
      sourceFile: sourceFilesOf(current)[0] ?? "",
      ...(existsSync(join(input.layerRoot, `${catFromRoot}.pot`)) ? { potFile: `${catFromRoot}.pot` } : {}),
      poFile: poRel,
    };
    const status: Record<string, unknown> = { locale: item.locale, official: false, ...((node.status as Record<string, unknown>) ?? {}) };
    if (item.verdict === "acceptable") {
      status.official = true;
      status.signedOffBy = author.login;
      status.signedOffAt = input.at;
      status.level = "block";
      delete status.flaggedForReview;
      delete status.flagReason;
    } else if (adjudicated > 0) {
      // A sign-off covered the old text; the strings' own record says who chose the new.
      status.official = false;
      delete status.signedOffBy;
      delete status.signedOffAt;
      delete status.level;
    } else {
      status.flaggedForReview = true;
      status.flagReason = `${proposed} proposal(s) by ${author.login} in ${input.issueUrl} await a collaborator's adjudication`;
    }
    node.status = status;

    // The audited record: append-only.
    const attRel = input.attestationPath(catFromRoot, item.locale);
    const att0 = plan.writes.has(attRel) ? JSON.parse(plan.writes.get(attRel)!) : readJson(join(input.layerRoot, attRel));
    if (att0 === null) {
      plan.refused.push(`${key}: the attestation ${attRel} will not parse; it is never overwritten, so nothing is recorded for this catalogue`);
      continue;
    }
    const att = (att0 as Record<string, unknown> | undefined) ?? {
      $schema: "qa-attestations/v1",
      family: "translation-qa",
      subject: { kind: "block", id: input.attestationSubject(catFromRoot), path: input.attestationSubject(catFromRoot) },
      locale: item.locale,
      criteria: {},
    };
    const criteria = (att.criteria as Record<string, unknown[]>) ?? {};
    const criterion = role === "adjudicator" && (item.verdict === "acceptable" || adjudicated > 0) ? ADJUDICATION_CRITERION : PROPOSAL_CRITERION;
    const entry: Record<string, unknown> = {
      reviewer: { kind: "human", id: person },
      verdict: item.verdict,
      at: input.at,
      issue: input.issueUrl,
      po_hash: item.poHash,
      ...(item.verdict === "mistranslation" ? { po_hash_after: poHash(poText) } : {}),
      ...(item.note ? { note: item.note } : {}),
      ...(appliedSuggestions.length > 0 ? { suggestions: appliedSuggestions } : {}),
    };
    criteria[criterion] = [...(criteria[criterion] ?? []), entry];
    att.criteria = criteria;

    // Every write of this item, or none.
    if (poText !== current) plan.writes.set(poRel, poText);
    if (sidecarText !== undefined) plan.writes.set(sidecarRel, sidecarText);
    plan.writes.set(nodeRel, json(node));
    plan.writes.set(attRel, json(att));
    if (item.verdict === "acceptable") plan.applied.push(`${key}: accepted`);
    else if (adjudicated > 0) {
      plan.applied.push(`${key}: ${adjudicated} string(s) adjudicated by @${author.login}; their choices are recorded in ${sidecarRel}`);
    } else {
      plan.applied.push(
        `${key}: ${proposed} proposal(s) recorded beside the other candidates` +
          (filled > 0 ? `; ${filled} empty string(s) now show the proposal, fuzzy` : "; msgstr is left as it was") +
          (!collaborator && item.intent !== "propose" ? ` (@${author.login} is not an owner, member or collaborator, ${author.association}, so a collaborator adjudicates)` : ""),
      );
    }
  }
  return plan;
}
