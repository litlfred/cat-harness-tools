/**
 * One string's translations, in every locale: its status, its candidates with
 * their provenance, and the default pick when no collaborator has chosen.
 *
 * @module scripts/lib/translation-strings
 * @covers translation-sources
 *
 * The owner's rulings of 2026-11-18 on per-block translation feedback:
 *
 *   1. A block's 🌐 pane lists every locale's current translation and its
 *      status: {@link STRING_STATUSES}.
 *   2. Several proposals per msgid × locale live in the candidates sidecar
 *      (`translation-candidates/v1`); the pane offers each with its
 *      provenance — source and version, date, author, the source-string hash
 *      (so a stale one shows), and QA results.
 *   3. Collaborators adjudicate (`StringAdjudication` in the sidecar).
 *   4. When nobody has adjudicated, the default pick is ranked
 *      {@link PICK_TIERS}: official > human-adjudicated > human-proposed >
 *      agent > MT, a candidate failing QA after every clean one, a stale one
 *      last. An auto-pick is always `unofficial`.
 *
 * This module is pure: it reads text it is given. The projection a site
 * publishes ({@link stringsProjection}) is what the pane reads, so the pane
 * restates none of these rules beyond drawing what it is told.
 */
import {
  msgidHash,
  poEntries,
  type Candidate,
  type CandidateSource,
  type CandidatesEntry,
  type CandidatesFile,
  type PoEntry,
  type StringAdjudication,
} from "./translation-adjudication.ts";

/** The translation platforms whose strings people translate (`translation-sources/platforms.ts` PLATFORMS). */
const PLATFORM_IDS: readonly string[] = ["weblate", "crowdin", "transifex"];

/**
 * A string's status in one locale (owner, 2026-11-18: "official /
 * adjudicated / proposed / agent / MT / missing / stale").
 *
 * | status        | the `msgstr` the page shows …                                              |
 * |---------------|-----------------------------------------------------------------------------|
 * | `official`    | is in a catalogue signed off as official, or is an `official` source's text |
 * | `adjudicated` | is what a collaborator chose, for the source text as it is now              |
 * | `proposed`    | is a person's proposal (an issue, a translation platform) nobody adjudicated |
 * | `agent`       | is an agent model's candidate                                               |
 * | `mt`          | is a machine-translation model's or service's candidate                     |
 * | `missing`     | is empty: the page shows the source language                                |
 * | `stale`       | translates an older source text (`#| msgid`, or a hash that no longer matches) |
 * | `unattributed`| is a translation whose provenance nothing records                           |
 */
export const STRING_STATUSES = ["official", "adjudicated", "proposed", "agent", "mt", "missing", "stale", "unattributed"] as const;
export type StringStatus = (typeof STRING_STATUSES)[number];

/** The default pick's order, best first (ruling 4, accepted by the owner 2026-11-18). */
export const PICK_TIERS = ["official", "human-adjudicated", "human-proposed", "agent", "mt"] as const;
export type PickTier = (typeof PICK_TIERS)[number];

/** A round trip scoring below this fails QA. */
export const ROUND_TRIP_MIN = 0.7;

const sameSource = (a: CandidateSource, b: CandidateSource) => a.kind === b.kind && a.id === b.id;

/** The tier of one candidate. `adjudicatedTexts` are texts a collaborator once chose for this string. */
export function pickTier(c: Pick<Candidate, "text" | "source">, adjudicatedTexts: ReadonlySet<string> = new Set()): PickTier {
  const k = c.source.kind;
  if (k === "official") return "official";
  const byPerson = k === "human" || (k === "web-service" && PLATFORM_IDS.includes(c.source.id.toLowerCase()));
  if (adjudicatedTexts.has(c.text)) return "human-adjudicated";
  if (byPerson) return "human-proposed";
  if (k === "agent") return "agent";
  return "mt";
}

/** What a candidate's QA results say is wrong with it; empty when it passes, or carries none. */
export function qaFailures(c: Pick<Candidate, "qa">): string[] {
  const out: string[] = [];
  const g = c.qa?.glossary;
  if (g && g.missing.length > 0) out.push(`glossary: ${g.missing.join(", ")} not translated as the glossary fixes`);
  const r = c.qa?.roundTrip;
  if (r && r.score < ROUND_TRIP_MIN) out.push(`round trip ${r.score.toFixed(2)} < ${ROUND_TRIP_MIN}`);
  return out;
}

/** Whether a candidate or adjudication was made for another source text than `hash`. */
export const isStale = (x: { msgidHash?: string }, hash: string): boolean => x.msgidHash !== undefined && x.msgidHash !== hash;

/** One candidate as ranked: its index in the sidecar, tier, QA and staleness. */
export interface RankedCandidate {
  index: number;
  candidate: Candidate;
  tier: PickTier;
  qaFailures: string[];
  stale: boolean;
}

/**
 * Rank a string's candidates for the default pick: clean candidates by tier
 * first, then those failing QA (by tier), then stale ones (by tier). A QA
 * failure demotes a candidate below every clean one, not only within its tier.
 * Ties keep the order they were recorded in. `hash` is the string's
 * {@link msgidHash} now.
 */
export function rankCandidates(entry: Pick<CandidatesEntry, "candidates" | "adjudications"> | undefined, hash: string, accept: (c: Candidate) => boolean = () => true): RankedCandidate[] {
  if (!entry) return [];
  const chosen = new Set((entry.adjudications ?? []).map((a) => a.text));
  const ranked = entry.candidates
    .map((candidate, index) => ({ index, candidate, tier: pickTier(candidate, chosen), qaFailures: qaFailures(candidate), stale: isStale(candidate, hash) }))
    .filter((r) => accept(r.candidate));
  const band = (r: RankedCandidate) => (r.stale ? 2 : r.qaFailures.length > 0 ? 1 : 0);
  return ranked.sort((a, b) => band(a) - band(b) || PICK_TIERS.indexOf(a.tier) - PICK_TIERS.indexOf(b.tier) || a.index - b.index);
}

/** The string's current adjudication: the last one, when its source text is still the string's. */
export function currentAdjudication(entry: Pick<CandidatesEntry, "adjudications"> | undefined, hash: string): StringAdjudication | undefined {
  const last = entry?.adjudications?.[entry.adjudications.length - 1];
  return last && !isStale(last, hash) ? last : undefined;
}

/** The default pick: the current adjudication when there is one, else the best-ranked candidate, labelled unofficial. */
export type DefaultPick =
  | { kind: "adjudicated"; text: string; adjudication: StringAdjudication }
  | { kind: "auto"; text: string; index: number; tier: PickTier; unofficial: true };

export function defaultPick(entry: CandidatesEntry | undefined, hash: string): DefaultPick | undefined {
  const adj = currentAdjudication(entry, hash);
  if (adj) return { kind: "adjudicated", text: adj.text, adjudication: adj };
  const top = rankCandidates(entry, hash)[0];
  return top ? { kind: "auto", text: top.candidate.text, index: top.index, tier: top.tier, unofficial: true } : undefined;
}

const keyOf = (msgctxt: string | undefined, msgid: string) => `${msgctxt ?? ""}\u0004${msgid}`;

/**
 * The sidecar entry for a catalogue entry, and whether it was found under the
 * entry's PREVIOUS source text (`#| msgid`): candidates recorded for the old
 * source are offered, and shown stale.
 */
export function entryFor(sidecar: CandidatesFile | undefined, e: Pick<PoEntry, "msgctxt" | "msgid" | "previousMsgid" | "previousMsgctxt">): { entry?: CandidatesEntry; previous: boolean } {
  if (!sidecar) return { previous: false };
  const by = new Map(sidecar.entries.map((x) => [keyOf(x.msgctxt, x.msgid), x]));
  const now = by.get(keyOf(e.msgctxt, e.msgid));
  const before = e.previousMsgid !== undefined ? by.get(keyOf(e.previousMsgctxt ?? e.msgctxt, e.previousMsgid)) : undefined;
  if (now && before && before !== now) return { entry: { ...now, candidates: [...now.candidates, ...before.candidates] }, previous: false };
  if (now) return { entry: now, previous: false };
  return before ? { entry: before, previous: true } : { previous: false };
}

/**
 * One string's status in one locale. `officialCatalogue`: the catalogue is
 * signed off as official (the review cell's `official` state).
 * `generatedBy`: what the catalogue's node says produced its strings, the
 * fallback when no candidate matches the text.
 */
export function stringStatus(
  e: Pick<PoEntry, "msgstr" | "forms" | "fuzzy" | "previousMsgid">,
  entry: CandidatesEntry | undefined,
  hash: string,
  o: { officialCatalogue?: boolean; generatedBy?: string; foundUnderPrevious?: boolean } = {},
): StringStatus {
  if (e.forms.every((f) => f === "")) return "missing";
  if (e.previousMsgid !== undefined || o.foundUnderPrevious) return "stale";
  const last = entry?.adjudications?.[entry.adjudications.length - 1];
  if (last && last.text === e.msgstr) return isStale(last, hash) ? "stale" : "adjudicated";
  if (o.officialCatalogue && !e.fuzzy) return "official";
  const matching = (entry?.candidates ?? []).filter((c) => c.text === e.msgstr);
  if (matching.some((c) => isStale(c, hash)) && !matching.some((c) => !isStale(c, hash))) return "stale";
  const tiers = matching.map((c) => pickTier(c));
  if (tiers.includes("official")) return "official";
  if (tiers.includes("human-proposed")) return "proposed";
  if (tiers.includes("agent")) return "agent";
  if (tiers.includes("mt")) return "mt";
  const g = (o.generatedBy ?? "").toLowerCase();
  if (g === "agent") return "agent";
  if (g === "machine" || g === "open-mt" || g === "web-service") return "mt";
  if (g === "human-draft") return "proposed";
  return "unattributed";
}

// ── The projection ───────────────────────────────────────────────────────

/** The tag of {@link stringsProjection}. */
export const TRANSLATION_STRINGS_SCHEMA = "folio-translation-strings/v1" as const;

/** One candidate as the pane shows it. */
export interface ProjectedCandidate extends Candidate {
  tier: PickTier;
  stale: boolean;
  qaFailures: string[];
  /** Its text is what the catalogue says now. */
  current: boolean;
}

/** One string in one locale. */
export interface ProjectedLocaleString {
  text: string;
  forms?: string[];
  status: StringStatus;
  fuzzy: boolean;
  /** The current adjudication, when there is one. */
  adjudication?: StringAdjudication;
  /** The default pick (ruling 4) when no collaborator has adjudicated: `unofficial` always. */
  pick?: { text: string; candidate: number; tier: PickTier; unofficial: true };
  /** Best-ranked first. */
  candidates: ProjectedCandidate[];
}

export interface ProjectedString {
  msgctxt?: string;
  msgid: string;
  msgidPlural?: string;
  /** {@link msgidHash} of the source string as the template has it. */
  hash: string;
  /** Source files (`#:`, line numbers dropped). */
  sources: string[];
  locales: Record<string, ProjectedLocaleString>;
}

export interface StringsProjection {
  $schema: typeof TRANSLATION_STRINGS_SCHEMA;
  layer: string;
  repository?: string;
  translations: string;
  catalogue: string;
  /** Per locale: the `poHash` of the catalogue, which an issue is pinned to. */
  hashes: Record<string, string>;
  strings: ProjectedString[];
}

/** One locale's inputs to {@link stringsProjection}. */
export interface LocaleInput {
  po: string;
  sidecar?: CandidatesFile;
  officialCatalogue?: boolean;
  generatedBy?: string;
  poHash: string;
}

/**
 * Every string of one catalogue, in every locale that has a `.po`: what the
 * pane lists. Strings are taken from the first locale's catalogue order, and
 * a string one locale lacks is simply absent from that locale.
 */
export function stringsProjection(meta: { layer: string; repository?: string; translations: string; catalogue: string }, locales: Record<string, LocaleInput>): StringsProjection {
  const strings = new Map<string, ProjectedString>();
  const hashes: Record<string, string> = {};
  for (const [locale, l] of Object.entries(locales).sort(([a], [b]) => a.localeCompare(b, "en"))) {
    hashes[locale] = l.poHash;
    for (const e of poEntries(l.po)) {
      const key = keyOf(e.msgctxt, e.msgid);
      const hash = msgidHash(e);
      const s = strings.get(key) ?? {
        ...(e.msgctxt !== undefined ? { msgctxt: e.msgctxt } : {}),
        msgid: e.msgid,
        ...(e.msgidPlural !== undefined ? { msgidPlural: e.msgidPlural } : {}),
        hash,
        sources: [...new Set(e.references.map((r) => r.replace(/:\d+$/, "")))].sort(),
        locales: {},
      };
      strings.set(key, s);
      const found = entryFor(l.sidecar, e);
      const ranked = rankCandidates(found.entry, hash);
      const adj = currentAdjudication(found.entry, hash);
      const pick = adj ? undefined : ranked[0];
      s.locales[locale] = {
        text: e.msgstr,
        ...(e.msgidPlural !== undefined ? { forms: e.forms } : {}),
        status: stringStatus(e, found.entry, hash, { officialCatalogue: l.officialCatalogue, generatedBy: l.generatedBy, foundUnderPrevious: found.previous }),
        fuzzy: e.fuzzy,
        ...(adj ? { adjudication: adj } : {}),
        ...(pick ? { pick: { text: pick.candidate.text, candidate: 0, tier: pick.tier, unofficial: true as const } } : {}),
        candidates: ranked.map((r) => ({ ...r.candidate, tier: r.tier, stale: r.stale || found.previous, qaFailures: r.qaFailures, current: r.candidate.text === e.msgstr })),
      };
    }
  }
  return { $schema: TRANSLATION_STRINGS_SCHEMA, ...meta, hashes, strings: [...strings.values()] };
}

/** The candidate whose source is `s`, when the sidecar entry has one with this text. */
export function candidateBySource(entry: CandidatesEntry | undefined, text: string, s: CandidateSource): Candidate | undefined {
  return entry?.candidates.find((c) => c.text === text && sameSource(c.source, s));
}
