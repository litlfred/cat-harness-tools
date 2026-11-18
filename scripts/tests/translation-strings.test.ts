/**
 * One string's translations in every locale: the statuses, the ranked default
 * pick, the strings projection a block's 🌐 pane reads, and its publication
 * into a folio's site (owner, 2026-11-18).
 *
 * @covers translation-sources
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { msgidHash, poEntries, poHash, type Candidate, type CandidatesEntry, type CandidatesFile } from "../lib/translation-adjudication.ts";
import {
  defaultPick,
  entryFor,
  pickTier,
  qaFailures,
  rankCandidates,
  stringsProjection,
  stringStatus,
  STRING_STATUSES,
} from "../lib/translation-strings.ts";
import { layerStrings, reviewLayer, STRINGS_BASE } from "../lib/translation-review-page.ts";
import { publishTranslationReview } from "../publish-translation-review.ts";

const H = msgidHash({ msgid: "Save" });
const c = (text: string, kind: Candidate["source"]["kind"], id: string, extra: Partial<Candidate> = {}): Candidate => ({ text, source: { kind, id }, msgidHash: H, ...extra });
const entry = (candidates: Candidate[], adjudications?: CandidatesEntry["adjudications"]): CandidatesEntry => ({ msgid: "Save", candidates, ...(adjudications ? { adjudications } : {}) });

describe("the default pick (owner, 2026-11-18: official > human-adjudicated > human-proposed > agent > MT)", () => {
  test("tiers, whatever order the candidates were recorded in", () => {
    const e = entry([
      c("MT", "open-mt", "opus-mt-en-fr"),
      c("Svc", "web-service", "deepl"),
      c("Agent", "agent", "claude-opus-5-5"),
      c("Weblate", "web-service", "weblate"),
      c("Person", "human", "github:ana"),
      c("Official", "official", "who-glossary"),
    ]);
    expect(rankCandidates(e, H).map((r) => `${r.candidate.text}:${r.tier}`)).toEqual([
      "Official:official",
      "Weblate:human-proposed",
      "Person:human-proposed",
      "Agent:agent",
      "MT:mt",
      "Svc:mt",
    ]);
    // A text a collaborator once chose ranks as human-adjudicated, above proposals.
    expect(pickTier(c("Agent", "agent", "x"), new Set(["Agent"]))).toBe("human-adjudicated");
  });
  test("a QA failure demotes below every clean candidate; a stale one goes last", () => {
    const e = entry([
      c("Person, wrong term", "human", "github:ana", { qa: { glossary: { missing: ["immunization"], checked: ["immunization"] } } }),
      c("Agent, low round trip", "agent", "a", { qa: { roundTrip: { score: 0.4, back: "x" } } }),
      c("Old human", "human", "github:bo", { msgidHash: "0000000000000000" }),
      c("MT, clean", "open-mt", "opus", { qa: { roundTrip: { score: 0.95 } } }),
    ]);
    expect(rankCandidates(e, H).map((r) => r.candidate.text)).toEqual(["MT, clean", "Person, wrong term", "Agent, low round trip", "Old human"]);
    expect(qaFailures(e.candidates[0]!)).toEqual([expect.stringContaining("immunization")]);
    expect(qaFailures(e.candidates[1]!)).toEqual([expect.stringContaining("round trip 0.40")]);
  });
  test("a current adjudication is the pick; otherwise the top candidate, always unofficial", () => {
    const e = entry([c("A", "agent", "a"), c("B", "human", "github:b")]);
    expect(defaultPick(e, H)).toEqual({ kind: "auto", text: "B", index: 1, tier: "human-proposed", unofficial: true });
    const adj = { by: "github:col", at: "2026-11-18T00:00:00Z", issue: "https://github.com/o/r/issues/1", text: "A", chose: { kind: "agent" as const, id: "a" }, msgidHash: H };
    expect(defaultPick(entry(e.candidates, [adj]), H)).toMatchObject({ kind: "adjudicated", text: "A" });
    // An adjudication of an older source text is not current: back to the ranking, where its text now ranks human-adjudicated.
    expect(defaultPick(entry(e.candidates, [{ ...adj, msgidHash: "0000000000000000" }]), H)).toMatchObject({ kind: "auto", text: "A", tier: "human-adjudicated" });
    expect(defaultPick(undefined, H)).toBeUndefined();
  });
});

describe("a string's status", () => {
  const po = (msgstr: string, flags = "") => poEntries(`${flags}msgid "Save"\nmsgstr "${msgstr}"\n`)[0]!;
  test("every status the ruling lists, and unattributed when nothing records provenance", () => {
    const adj = { by: "github:col", at: "t", issue: "https://github.com/o/r/issues/1", text: "Enregistrer", chose: "own-text" as const, msgidHash: H };
    const e = entry([c("Sauver", "agent", "a"), c("Sauvegarder", "open-mt", "m"), c("Garder", "human", "github:x"), c("Officiel", "official", "who")], [adj]);
    expect(stringStatus(po(""), e, H)).toBe("missing");
    expect(stringStatus(po("Enregistrer"), e, H)).toBe("adjudicated");
    expect(stringStatus(po("Enregistrer"), entry([], [{ ...adj, msgidHash: "0000000000000000" }]), H)).toBe("stale");
    expect(stringStatus(po("Sauver", "#, fuzzy\n"), e, H)).toBe("agent");
    expect(stringStatus(po("Sauvegarder", "#, fuzzy\n"), e, H)).toBe("mt");
    expect(stringStatus(po("Garder", "#, fuzzy\n"), e, H)).toBe("proposed");
    expect(stringStatus(po("Officiel"), e, H)).toBe("official");
    expect(stringStatus(po("Texte"), undefined, H, { officialCatalogue: true })).toBe("official");
    expect(stringStatus(po("Texte"), undefined, H, { generatedBy: "agent" })).toBe("agent");
    expect(stringStatus(po("Texte"), undefined, H)).toBe("unattributed");
    expect(stringStatus(poEntries('#, fuzzy\n#| msgid "Sav"\nmsgid "Save"\nmsgstr "Sauver"\n')[0]!, e, H)).toBe("stale");
    expect(STRING_STATUSES).toEqual(["official", "adjudicated", "proposed", "agent", "mt", "missing", "stale", "unattributed"]);
  });
  test("candidates recorded for the previous source text (#| msgid) are found, and stale", () => {
    const side: CandidatesFile = { $schema: "translation-candidates/v1", locale: "fr", catalogue: "c", entries: [{ msgid: "Sav", candidates: [c("Sauver", "agent", "a", { msgidHash: msgidHash({ msgid: "Sav" }) })] }] };
    const e = poEntries('#, fuzzy\n#| msgid "Sav"\nmsgid "Save"\nmsgstr "Sauver"\n')[0]!;
    const found = entryFor(side, e);
    expect(found.previous).toBe(true);
    expect(rankCandidates(found.entry, msgidHash(e))[0]!.stale).toBe(true);
  });
});

const POT = '#: docs/guide.md:3\nmsgid "Hello"\nmsgstr ""\n\n#: docs/guide.md:5\nmsgctxt "button"\nmsgid "Save"\nmsgstr ""\n';
const FR = '#: docs/guide.md:3\nmsgid "Hello"\nmsgstr "Bonjour"\n\n#: docs/guide.md:5\n#, fuzzy\nmsgctxt "button"\nmsgid "Save"\nmsgstr "Sauver"\n';
const AR = POT;
const SIDE: CandidatesFile = {
  $schema: "translation-candidates/v1",
  locale: "fr",
  catalogue: "docs/guide",
  entries: [
    {
      msgctxt: "button",
      msgid: "Save",
      candidates: [
        { text: "Sauver", source: { kind: "agent", id: "claude-opus-5-5", at: "2026-11-14T10:00:00Z" }, msgidHash: msgidHash({ msgctxt: "button", msgid: "Save" }) },
        { text: "Enregistrer", source: { kind: "human", id: "github:ana", issue: "https://github.com/o/r/issues/3" }, msgidHash: msgidHash({ msgctxt: "button", msgid: "Save" }), qa: { roundTrip: { score: 0.9 } } },
      ],
    },
  ],
};

describe("the strings projection", () => {
  test("every string in every locale: text, status, candidates ranked with provenance, the unofficial pick", () => {
    const p = stringsProjection({ layer: "demo", repository: "o/r", translations: "translations", catalogue: "docs/guide" }, {
      fr: { po: FR, sidecar: SIDE, poHash: poHash(FR), generatedBy: "agent" },
      ar: { po: AR, poHash: poHash(AR) },
    });
    expect(p.$schema).toBe("folio-translation-strings/v1");
    expect(p.hashes).toEqual({ ar: poHash(AR), fr: poHash(FR) });
    const save = p.strings.find((s) => s.msgid === "Save")!;
    expect(save).toMatchObject({ msgctxt: "button", sources: ["docs/guide.md"], hash: msgidHash({ msgctxt: "button", msgid: "Save" }) });
    expect(save.locales.ar).toMatchObject({ text: "", status: "missing", candidates: [] });
    const fr = save.locales.fr!;
    expect(fr).toMatchObject({ text: "Sauver", status: "agent", fuzzy: true, pick: { text: "Enregistrer", tier: "human-proposed", unofficial: true } });
    expect(fr.candidates.map((x) => [x.text, x.tier, x.current, x.stale])).toEqual([
      ["Enregistrer", "human-proposed", false, false],
      ["Sauver", "agent", true, false],
    ]);
    expect(fr.candidates[0]!.source.issue).toBe("https://github.com/o/r/issues/3");
    expect(p.strings.find((s) => s.msgid === "Hello")!.locales.fr).toMatchObject({ text: "Bonjour", status: "agent" });
  });

  test("a layer's rows each name their projection, and an unreadable sidecar is left out", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-str-"));
    for (const [l, po] of [["fr", FR], ["ar", AR]] as const) {
      mkdirSync(join(root, "translations", l, "docs"), { recursive: true });
      writeFileSync(join(root, "translations", l, "docs", "guide.po"), po);
    }
    writeFileSync(join(root, "translations/fr/docs/guide.candidates.json"), JSON.stringify(SIDE));
    writeFileSync(join(root, "translations/ar/docs/guide.candidates.json"), "{ nope");
    const count = (t: string) => ({ entries: poEntries(t).length, translated: poEntries(t).filter((e) => e.msgstr && !e.fuzzy).length, fuzzy: poEntries(t).filter((e) => e.fuzzy).length });
    const layer = reviewLayer({ name: "demo", repository: "o/r", layerRoot: root, translationsDir: join(root, "translations"), attestationFor: () => join(root, "none"), poHeader: () => undefined, count });
    expect(layer.rows[0]!.strings).toBe("demo/docs/guide.json");
    const all = layerStrings(layer, join(root, "translations"));
    const proj = all.get("demo/docs/guide.json")!;
    expect(proj.strings.find((s) => s.msgid === "Save")!.locales.fr!.candidates).toHaveLength(2);
    expect(proj.strings.find((s) => s.msgid === "Save")!.locales.ar!.candidates).toEqual([]);
  });
});

describe("a folio's site publishes the projections wherever translations exist", () => {
  const declare = (root: string, name: string, translations: boolean) => {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, `${name}.json`),
      JSON.stringify({
        $schema: "cat-harness-declaration/1.0.0",
        name,
        repository: `o/${name}`,
        version: "0.1.0",
        directories: translations ? [{ id: `${name}-translations`, path: "translations/", graphTypologies: ["translation-sources"] }] : [],
      }),
    );
  };
  test("review.json and one strings file per catalogue; no review page linked where the site has none", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-folio-"));
    declare(root, "folio", true);
    mkdirSync(join(root, "translations/fr/docs"), { recursive: true });
    writeFileSync(join(root, "translations/fr/docs/guide.po"), FR);
    const site = join(root, "_site");
    mkdirSync(site);
    const written = publishTranslationReview(root, site);
    expect(written).toEqual(["assets/translation-status/review.json", `${STRINGS_BASE}folio/docs/guide.json`]);
    const review = JSON.parse(readFileSync(join(site, "assets/translation-status/review.json"), "utf-8"));
    expect(review.$schema).toBe("folio-translation-review/v1");
    expect(review.reviewPage).toBeUndefined();
    expect(review.strings).toMatchObject({ schema: "folio-translation-strings/v1", base: STRINGS_BASE });
    expect(review.layers[0]).toMatchObject({ name: "folio", repository: "o/folio", rows: [{ catalogue: "docs/guide", strings: "folio/docs/guide.json" }] });
  });
  test("a checkout with no translations writes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-folio-"));
    declare(root, "plain", false);
    const site = join(root, "_site");
    mkdirSync(site);
    expect(publishTranslationReview(root, site)).toEqual([]);
    expect(existsSync(join(site, "assets/translation-status/review.json"))).toBe(false);
  });
});
