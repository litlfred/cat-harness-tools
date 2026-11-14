/**
 * The open machine-translation step: the placeholder guard, the never-overwrite
 * rule, the fuzzy flag, and what is recorded on the translation node.
 *
 * @covers translation-sources
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyTranslations,
  fillCandidates,
  forbidsMachineFill,
  libreTranslateEngine,
  libreTranslateUrlProblem,
  opusMtEngine,
  opusMtModel,
  placeholderProblem,
  placeholders,
  splitWhitespace,
  type MtEngine,
} from "../lib/machine-translation.ts";
import { poEntries } from "../lib/translation-adjudication.ts";
import { translateLayer } from "../translate-pot.ts";

const PO = `# Spanish catalogue
msgid ""
msgstr ""
"Language: es\\n"
"Content-Type: text/plain; charset=UTF-8\\n"

#: docs/a.md:1
msgid "Hello"
msgstr "Hola, ya traducido"

#: docs/a.md:2
msgid "Open {name} now"
msgstr ""

#: docs/a.md:3
msgctxt "button"
msgid "Open"
msgstr ""

#: docs/a.md:4
msgid "Open"
msgstr ""

#: docs/a.md:5
msgid "%d file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""

#: docs/a.md:6
#, python-format
msgid "  Run %(cmd)s in <a0>the shell</a0>.\\n"
msgstr ""

#: docs/a.md:7
#, fuzzy
msgid "Already a machine guess"
msgstr "Una suposición"
`;

/** A fake engine: prefixes each core with "ES:", keeping tokens. */
function fakeEngine(f: (s: string) => string = (s) => `ES:${s}`): MtEngine & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    name: "fake",
    calls,
    model: (t) => `model-en-${t}`,
    async translate(texts) {
      calls.push(texts);
      return texts.map(f);
    },
  };
}

describe("placeholder guard", () => {
  test("finds the tokens a translation must keep", () => {
    expect(placeholders("Open {name} with %s, %(x)s, %1$s and {{y}}")).toEqual(["%(x)s", "%1$s", "%s", "{name}", "{{y}}"].sort());
    expect(placeholders("<a0>link</a0> to <slug> and `code {x}`")).toEqual(["</a0>", "<a0>", "<slug>", "`code {x}`"].sort());
    expect(placeholders("see [docs](https://x.org/a) &amp; https://y.org/b")).toEqual(["&amp;", "](https://x.org/a)", "https://y.org/b"].sort());
    expect(placeholders("100% sure, no tokens")).toEqual([]);
  });

  test("accepts a reordered but complete translation", () => {
    expect(placeholderProblem("{a} before {b}", "{b} después de {a}")).toBeUndefined();
    expect(placeholderProblem("<a0>x</a0> %s", "%s <a0>y</a0>")).toBeUndefined();
  });

  test("refuses a lost, renamed, duplicated or translated placeholder", () => {
    expect(placeholderProblem("Open {name}", "Abrir")).toContain('lost "{name}"');
    expect(placeholderProblem("Open {name}", "Abrir {nombre}")).toContain('added "{nombre}"');
    expect(placeholderProblem("%s", "%s %s")).toContain("do not round-trip");
    expect(placeholderProblem("<a0>x</a0>", "<a0>x")).toContain('lost "</a0>"');
    expect(placeholderProblem("Run `ls -l`", "Ejecuta `ls -larga`")).toContain("do not round-trip");
    expect(placeholderProblem("%(cmd)s", "%(comando)s")).toContain("do not round-trip");
  });

  test("refuses lost line breaks and an empty answer", () => {
    expect(placeholderProblem("a\nb", "a b")).toContain("line breaks");
    expect(placeholderProblem("a", "  ")).toBe("the engine returned nothing");
  });

  test("surrounding whitespace is cut off and kept", () => {
    expect(splitWhitespace("  x y\n")).toEqual({ lead: "  ", core: "x y", trail: "\n" });
  });
});

describe("never overwrite", () => {
  test("only empty, singular, non-blank entries are candidates", () => {
    const { candidates, skipped } = fillCandidates(PO);
    expect(candidates).toEqual([
      { msgid: "Open {name} now" },
      { msgctxt: "button", msgid: "Open" },
      { msgid: "Open" },
      { msgid: "  Run %(cmd)s in <a0>the shell</a0>.\n" },
    ]);
    expect(skipped).toEqual([{ msgid: "%d file", reason: "plural entry: its forms are left for a person" }]);
  });

  test("filling leaves every non-empty msgstr byte-for-byte, and flags each new one fuzzy", () => {
    const { candidates } = fillCandidates(PO);
    const out = applyTranslations(PO, candidates, candidates.map((c) => `ES:${splitWhitespace(c.msgid).core}`));
    expect(out.filled).toBe(4);
    const before = new Map(poEntries(PO).map((e) => [`${e.msgctxt}|${e.msgid}`, e]));
    for (const e of poEntries(out.text)) {
      const b = before.get(`${e.msgctxt}|${e.msgid}`)!;
      if (b.msgstr !== "") expect(e.msgstr).toBe(b.msgstr);
      else if (e.msgidPlural === undefined) expect(e.fuzzy).toBe(true);
    }
    expect(out.text).toContain('msgstr "Hola, ya traducido"');
    expect(out.text).toContain('msgstr "Una suposición"');
    // msgctxt kept apart from the context-free entry with the same msgid.
    const opens = poEntries(out.text).filter((e) => e.msgid === "Open");
    expect(opens.map((e) => e.msgctxt)).toEqual(["button", undefined]);
    // Whitespace round-trips; the existing python-format flag is kept.
    expect(out.text).toContain('#, python-format, fuzzy\nmsgid "  Run %(cmd)s in <a0>the shell</a0>.\\n"\nmsgstr "  ES:Run %(cmd)s in <a0>the shell</a0>.\\n"');
    // Plural entry untouched.
    expect(out.text).toContain('msgstr[0] ""\nmsgstr[1] ""');
    // A second pass finds nothing left to fill.
    expect(fillCandidates(out.text).candidates).toEqual([]);
  });

  test("a translation that breaks a placeholder is left empty and reported", () => {
    const { candidates } = fillCandidates(PO);
    const out = applyTranslations(PO, candidates, candidates.map((c) => splitWhitespace(c.msgid).core.replace("{name}", "{nombre}")));
    expect(out.filled).toBe(3);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]!.msgid).toBe("Open {name} now");
    expect(poEntries(out.text).find((e) => e.msgid === "Open {name} now")!.msgstr).toBe("");
  });

  test("a mismatched answer count is an error, not a partial write", () => {
    const { candidates } = fillCandidates(PO);
    expect(() => applyTranslations(PO, candidates, ["x"])).toThrow("engine returned 1 strings");
  });

  test("a catalogue that forbids machine filling is recognised", () => {
    expect(forbidsMachineFill("# DO NOT MACHINE-FILL THIS FILE. A machine…\nmsgid \"\"")).toBe(true);
    expect(forbidsMachineFill(PO)).toBe(false);
  });
});

describe("engines", () => {
  test("OPUS-MT models, with the target token the multi-target ones need", () => {
    expect(opusMtModel("es")).toEqual({ model: "Helsinki-NLP/opus-mt-en-es" });
    expect(opusMtModel("ar")).toEqual({ model: "Helsinki-NLP/opus-mt-en-ar", targetToken: ">>ara<<" });
    expect(opusMtModel("zh")).toEqual({ model: "Helsinki-NLP/opus-mt-en-zh", targetToken: ">>cmn_Hans<<" });
  });

  test("the OPUS-MT runner gets one JSON request and returns translations", async () => {
    let seen: { argv: string[]; req: Record<string, unknown> } | undefined;
    const e = opusMtEngine(["runner", "--x"], async (argv, stdin) => {
      seen = { argv, req: JSON.parse(stdin) };
      return JSON.stringify({ translations: ["hola"] });
    });
    expect(await e.translate(["hello"], "en", "zh")).toEqual(["hola"]);
    expect(seen).toEqual({
      argv: ["runner", "--x"],
      req: { source: "en", target: "zh", model: "Helsinki-NLP/opus-mt-en-zh", targetToken: ">>cmn_Hans<<", texts: ["hello"] },
    });
  });

  test("LibreTranslate: self-hosted only", async () => {
    expect(libreTranslateUrlProblem("https://libretranslate.com")).toContain("hosted freemium");
    expect(libreTranslateUrlProblem("https://api.libretranslate.de/")).toContain("hosted freemium");
    expect(libreTranslateUrlProblem("http://localhost:5000")).toBeUndefined();
    expect(() => libreTranslateEngine("https://libretranslate.com")).toThrow("hosted freemium");
    let body: Record<string, unknown> | undefined;
    const e = libreTranslateEngine("http://localhost:5000/", (async (url: string, init: RequestInit) => {
      expect(url).toBe("http://localhost:5000/translate");
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ translatedText: ["Bonjour"] }));
    }) as unknown as typeof fetch);
    expect(await e.translate(["Hello"], "en", "fr")).toEqual(["Bonjour"]);
    expect(body).toEqual({ q: ["Hello"], source: "en", target: "fr", format: "text" });
    expect(e.model("fr")).toBe("argos-translate en_fr");
  });
});

describe("translateLayer", () => {
  function layer(): string {
    const root = mkdtempSync(join(tmpdir(), "translate-pot-"));
    mkdirSync(join(root, "translations", "es", "start"), { recursive: true });
    mkdirSync(join(root, "translations", "fr"), { recursive: true });
    writeFileSync(join(root, "translations", "es", "start", "a.pot"), PO.replace(/msgstr "[^"]+"/g, 'msgstr ""'));
    writeFileSync(join(root, "translations", "es", "start", "a.po"), PO);
    // An existing node: its other fields are kept, official is not set.
    writeFileSync(
      join(root, "translations", "es", "start", "a.json"),
      JSON.stringify({ $schema: "translation-node/v1", label: "trans:es/start/a", locale: "es", sourceFile: "docs/a.md", poFile: "translations/es/start/a.po", status: { locale: "es", official: false, generatedBy: "agent" }, title: "keep me" }),
    );
    // A forbidden catalogue, and a POT with no PO.
    writeFileSync(join(root, "translations", "fr", "kg.pot"), PO);
    writeFileSync(join(root, "translations", "fr", "kg.po"), `# DO NOT MACHINE-FILL THIS FILE.\n${PO}`);
    writeFileSync(join(root, "translations", "fr", "b.pot"), PO);
    return root;
  }
  const now = () => new Date("2026-11-14T12:00:00Z");

  test("fills, flags fuzzy, records the machine on the node, and refuses the forbidden catalogue", async () => {
    const root = layer();
    const engine = fakeEngine();
    const { reports, potOnly } = await translateLayer({ root, translations: "translations", engine, now });
    const es = reports.find((r) => r.locale === "es")!;
    expect(es.filled).toBe(4);
    const node = JSON.parse(readFileSync(join(root, "translations", "es", "start", "a.json"), "utf-8"));
    expect(node.status).toEqual({ locale: "es", official: false, generatedBy: "machine", generator: "fake model-en-es", generatedAt: "2026-11-14T12:00:00.000Z" });
    expect(node.title).toBe("keep me");
    expect(reports.find((r) => r.catalogue === "kg")!.refused).toContain("DO NOT MACHINE-FILL");
    expect(readFileSync(join(root, "translations", "fr", "kg.po"), "utf-8")).toBe(`# DO NOT MACHINE-FILL THIS FILE.\n${PO}`);
    expect(potOnly).toEqual(["fr/b.pot"]);
    // The engine saw cores only, never the surrounding whitespace.
    expect(engine.calls.flat()).toContain("Run %(cmd)s in <a0>the shell</a0>.");
  });

  test("an official node is not filled, and a dry run writes nothing", async () => {
    const root = layer();
    const nodePath = join(root, "translations", "es", "start", "a.json");
    const n = JSON.parse(readFileSync(nodePath, "utf-8"));
    n.status.official = true;
    writeFileSync(nodePath, JSON.stringify(n));
    const r1 = await translateLayer({ root, translations: "translations", engine: fakeEngine(), locales: ["es"], now });
    expect(r1.reports[0]!.refused).toContain("official");
    n.status.official = false;
    writeFileSync(nodePath, JSON.stringify(n));
    const poBefore = readFileSync(join(root, "translations", "es", "start", "a.po"), "utf-8");
    const r2 = await translateLayer({ root, translations: "translations", engine: fakeEngine(), locales: ["es"], dryRun: true, now });
    expect(r2.reports[0]!.filled).toBe(4);
    expect(readFileSync(join(root, "translations", "es", "start", "a.po"), "utf-8")).toBe(poBefore);
  });

  test("a missing node is created (and validates), unless told not to", async () => {
    const root = layer();
    const nodePath = join(root, "translations", "es", "start", "a.json");
    writeFileSync(nodePath, "{}");
    const bad = await translateLayer({ root, translations: "translations", engine: fakeEngine(), locales: ["es"], now });
    expect(bad.reports[0]!.refused).toContain("does not validate");

    const root2 = layer();
    const p2 = join(root2, "translations", "es", "start", "a.json");
    const { rmSync } = await import("node:fs");
    rmSync(p2);
    const skip = await translateLayer({ root: root2, translations: "translations", engine: fakeEngine(), locales: ["es"], createNode: false, now });
    expect(skip.reports[0]!.refused).toContain("no translation node");
    const made = await translateLayer({ root: root2, translations: "translations", engine: fakeEngine(), locales: ["es"], now });
    expect(made.reports[0]!.nodeCreated).toBe(true);
    const node = JSON.parse(readFileSync(p2, "utf-8"));
    expect(node).toMatchObject({
      label: "trans:es/start/a",
      sourceFile: "docs/a.md",
      potFile: "translations/es/start/a.pot",
      poFile: "translations/es/start/a.po",
      status: { locale: "es", official: false, generatedBy: "machine", generator: "fake model-en-es" },
    });
  });
});
