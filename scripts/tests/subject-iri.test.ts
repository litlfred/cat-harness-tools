/**
 * Subject IRIs are paths, not `#fragment`s — litlfred/cat-harness-tools#603.
 *
 * The rule is cat-harness `skills/kg/kg-core/kg-export.md` §"Subject IRIs — a
 * path, not a `#fragment`": `<doc dir>/<kind>/<id>` for a subject, a step
 * `…/process/P/node/T`, a lane `…/process/P/lane/L`, and a flow the one
 * fragment, `…/process/P#flow/F`. Every subject must load, so kg-export writes
 * its `.jsonld` and page; every old fragment keeps a one-release tombstone.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  FRAGMENT_DOCUMENT_STUBS,
  legacyFragmentIri,
  mintsFragments,
  subjectBase,
  subjectFileStem,
  subjectIri,
  subjectPathOf,
} from "../lib/subject-iri.ts";
import { makeIri, migrationTombstones, writeSubjectDocuments } from "../kg-export.ts";
import { subgraphIri } from "../subgraph-node.ts";
import { PUBLISHED_ELSEWHERE } from "../instance-exports.ts";

const HOST = "https://x.test/site/cat-harness.jsonld";
const CORE = "https://x.test/site/folio-assistant-core/folio-assistant-core.jsonld";

describe("the form", () => {
  test("a subject is <doc dir>/<kind>/<id> — the owner's own example", () => {
    expect(
      makeIri("https://litlfred.github.io/folio-assistant/folio-assistant-core/folio-assistant-core.jsonld", "globalTask", "GT_SeedWorkPlan"),
    ).toBe("https://litlfred.github.io/folio-assistant/folio-assistant-core/globalTask/GT_SeedWorkPlan");
  });

  test("a step and a lane are paths under their process; a flow is a fragment of its page", () => {
    expect(makeIri(CORE, "process", "P")).toBe("https://x.test/site/folio-assistant-core/process/P");
    expect(makeIri(CORE, "process", "P/node/T")).toBe("https://x.test/site/folio-assistant-core/process/P/node/T");
    expect(makeIri(CORE, "process", "P/lane/L")).toBe("https://x.test/site/folio-assistant-core/process/P/lane/L");
    expect(makeIri(CORE, "process", "P/flow/F")).toBe("https://x.test/site/folio-assistant-core/process/P#flow/F");
  });

  test("never `<doc>.jsonld/<kind>/…`, which no static host can serve beside the file", () => {
    expect(makeIri(CORE, "skill", "x")).not.toContain(".jsonld/");
    expect(subjectBase(CORE)).toBe("https://x.test/site/folio-assistant-core/");
  });

  test("only what would end or re-delimit a segment is escaped; `/` nests", () => {
    expect(makeIri(HOST, "decision", "gate/D 1")).toBe("https://x.test/site/decision/gate/D%201");
    expect(makeIri(HOST, "skill", "a#b?c")).toBe("https://x.test/site/skill/a%23b%3Fc");
  });

  test("a document-relative export mints relative subjects, as it minted relative fragments", () => {
    expect(makeIri("cat-harness.jsonld", "skill", "x")).toBe("skill/x");
  });

  test("an unknown kind is refused rather than minted", () => {
    expect(() => makeIri(HOST, "skils", "x")).toThrow(/not a subject kind/);
  });

  test("makeIri and subgraphIri are one minter", () => {
    expect(subgraphIri(CORE, "todos")).toBe(makeIri(CORE, "directory", "todos"));
    expect(subgraphIri(CORE, "todos")).toBe(subjectIri(CORE, "directory", "todos"));
  });
});

describe("telling this document's subjects from everything else", () => {
  test("the host sits at the site root, and still does not claim another instance's subjects", () => {
    expect(subjectPathOf("https://x.test/site/skill/a", HOST)).toBe("skill/a");
    expect(subjectPathOf("https://x.test/site/process/P#flow/F", HOST)).toBe("process/P#flow/F");
    expect(subjectPathOf(makeIri(CORE, "skill", "a"), HOST)).toBeUndefined();
    expect(subjectPathOf("https://x.test/site/tools/t.jsonld", HOST)).toBeUndefined();
    expect(subjectPathOf(HOST, HOST)).toBeUndefined();
    expect(subjectPathOf("https://x.test/site/ns#Skill", HOST)).toBeUndefined();
  });

  test("the pre-#603 fragment is recovered exactly, a flow's `#flow/` folded back", () => {
    expect(legacyFragmentIri(makeIri(CORE, "globalTask", "G"), CORE)).toBe(`${CORE}#globalTask/G`);
    expect(legacyFragmentIri(makeIri(CORE, "process", "P/node/T"), CORE)).toBe(`${CORE}#process/P/node/T`);
    expect(legacyFragmentIri(makeIri(CORE, "process", "P/flow/F"), CORE)).toBe(`${CORE}#process/P/flow/F`);
    expect(legacyFragmentIri("https://x.test/elsewhere", CORE)).toBeUndefined();
  });

  // #603 decision 1b (owner, 2026-10-23): the host's document moved from the
  // site root to `<site>/<name>/` in the same release, so its old fragments
  // are of the ROOT document, not the one that now holds the subject.
  test("a document that moved names its old fragments by the old document", () => {
    const moved = "https://x.test/site/cat-harness/cat-harness.jsonld";
    const iri = makeIri(moved, "skill", "a");
    expect(iri).toBe("https://x.test/site/cat-harness/skill/a");
    expect(legacyFragmentIri(iri, moved, HOST)).toBe(`${HOST}#skill/a`);
    expect(legacyFragmentIri(iri, moved)).toBe(`${moved}#skill/a`);
    expect(legacyFragmentIri(makeIri(moved, "process", "P/flow/F"), moved, HOST)).toBe(`${HOST}#process/P/flow/F`);
  });

  test("a subject's files sit at its path; a flow has none; nothing escapes the directory", () => {
    expect(subjectFileStem(makeIri(CORE, "decision", "gate/D 1"), CORE)).toBe("decision/gate/D 1");
    expect(subjectFileStem(makeIri(CORE, "process", "P/flow/F"), CORE)).toBeUndefined();
    expect(subjectFileStem("https://x.test/site/folio-assistant-core/skill/..", CORE)).toBeUndefined();
  });
});

describe("a document still published with fragments keeps them until its own phase", () => {
  const BOOT = "https://x.test/site/bootstrap/bootstrap.jsonld";

  test("links into bootstrap's document name what that document holds", () => {
    expect(mintsFragments(BOOT)).toBe(true);
    expect(makeIri(BOOT, "skill", "discussion")).toBe(`${BOOT}#skill/discussion`);
    expect(makeIri(BOOT, "process", "P/flow/F")).toBe(`${BOOT}#process/P/flow/F`);
    expect(subjectPathOf(`${BOOT}#skill/discussion`, BOOT)).toBe("skill/discussion");
    expect(legacyFragmentIri(`${BOOT}#skill/discussion`, BOOT)).toBeUndefined();
    expect(subjectFileStem(`${BOOT}#skill/discussion`, BOOT)).toBeUndefined();
  });

  test("the list is exactly the documents a publisher other than kg-export writes", () => {
    const elsewhere = Object.entries(PUBLISHED_ELSEWHERE)
      .filter(([, p]) => !p.publisher.source.includes("kg-export"))
      .map(([stub]) => stub)
      .sort();
    expect([...FRAGMENT_DOCUMENT_STUBS].sort()).toEqual(elsewhere);
  });
});

describe("every subject loads: its own .jsonld and page", () => {
  const DOC = "https://x.test/site/folio-assistant-core/folio-assistant-core.jsonld";
  const ctx = { name: "https://x.test/ns#name" };
  const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ "@id": makeIri(DOC, ...splitKind(id)), "@type": `https://x.test/ns#${type}`, ...extra });
  function splitKind(id: string): [string, string] {
    const i = id.indexOf("/");
    return [id.slice(0, i), id.slice(i + 1)];
  }
  const graph = [
    node("skill/a", "Skill", { name: "a", title: "</script><b>A</b>" }),
    node("process/P", "Process", { name: "P" }),
    node("process/P/node/T", "ProcessNode", { partOf: makeIri(DOC, "process", "P") }),
    node("process/P/lane/L", "Lane"),
    node("process/P/flow/F", "SequenceFlow", { from: makeIri(DOC, "process", "P/node/T") }),
    // Not this document's: another instance's subject, and a Tool beside it.
    { "@id": makeIri(HOST, "skill", "z"), "@type": "https://x.test/ns#Skill" },
    { "@id": "https://x.test/site/folio-assistant-core/tools/t.jsonld", "@type": "https://x.test/ns#Tool" },
  ];
  const tombstones = migrationTombstones(graph as never, DOC);
  const published = { "@context": ctx, "@id": DOC, "@graph": [...graph, ...tombstones] };

  test("one tombstone per subject of THIS document, under its old fragment, sameAs its path", () => {
    expect(tombstones.map((t) => t["@id"]).sort()).toEqual(
      ["skill/a", "process/P", "process/P/node/T", "process/P/lane/L", "process/P/flow/F"].map((p) => `${DOC}#${p}`).sort(),
    );
    const flow = tombstones.find((t) => t["@id"] === `${DOC}#process/P/flow/F`)!;
    expect(flow).toEqual({
      "@id": `${DOC}#process/P/flow/F`,
      deprecated: true,
      isReplacedBy: "https://x.test/site/folio-assistant-core/process/P#flow/F",
      sameAs: "https://x.test/site/folio-assistant-core/process/P#flow/F",
    } as never);
  });

  test("the writer puts a .jsonld and a page at every subject's path, and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "subject-docs-"));
    try {
      const out = join(dir, "folio-assistant-core.jsonld");
      const written = writeSubjectDocuments(published, out).map((f) => relative(dir, f)).sort();
      expect(written).toEqual(
        [
          "folio-assistant-core.context.jsonld",
          "process/P.html",
          "process/P.jsonld",
          // A subject with subjects under it also answers as a directory.
          "process/P/index.html",
          "process/P/lane/L.html",
          "process/P/lane/L.jsonld",
          "process/P/node/T.html",
          "process/P/node/T.jsonld",
          "skill/a.html",
          "skill/a.jsonld",
        ].sort(),
      );

      // The context once, beside the document; each subject names it.
      expect(JSON.parse(readFileSync(join(dir, "folio-assistant-core.context.jsonld"), "utf-8"))).toEqual({ "@context": ctx });
      const step = JSON.parse(readFileSync(join(dir, "process/P/node/T.jsonld"), "utf-8"));
      expect(step["@context"]).toBe("https://x.test/site/folio-assistant-core/folio-assistant-core.context.jsonld");
      expect(step["@id"]).toBe("https://x.test/site/folio-assistant-core/process/P/node/T.jsonld");
      expect(step.partOf).toBe(DOC);
      expect(step["@graph"].map((n: { "@id": string }) => n["@id"])).toEqual(["https://x.test/site/folio-assistant-core/process/P/node/T"]);

      // A flow is a fragment of its process's page: in its document, and an anchor on its page.
      const proc = JSON.parse(readFileSync(join(dir, "process/P.jsonld"), "utf-8"));
      expect(proc["@graph"].map((n: { "@id": string }) => n["@id"])).toEqual([
        "https://x.test/site/folio-assistant-core/process/P",
        "https://x.test/site/folio-assistant-core/process/P#flow/F",
      ]);
      expect(readFileSync(join(dir, "process/P.html"), "utf-8")).toContain('id="flow/F"');
      expect(existsSync(join(dir, "process/P/flow"))).toBe(false);

      // The page carries the same JSON-LD, and no value can close its script early.
      const page = readFileSync(join(dir, "skill/a.html"), "utf-8");
      expect(page).toContain('<link rel="alternate" type="application/ld+json" href="a.jsonld">');
      const script = /<script type="application\/ld\+json">\n([^]*?)\n<\/script>/.exec(page)![1]!;
      expect(script).not.toContain("</script>");
      expect(JSON.parse(script)["@graph"][0].title).toBe("</script><b>A</b>");
      expect(page).toContain("&lt;/script&gt;&lt;b&gt;A&lt;/b&gt;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
