/**
 * The journeys viewer over a fixture checkout of two instances: `lower`, a
 * layer holding journeys of its own, and `top`, which needs it, holds a
 * journey group, a workshop, and declares the visualiser.
 *
 * What is asserted is what the owner asked the viewer to show (2026-11-05):
 * every journey in the checkout, each journey alone, journeys in sub-graphs
 * (per instance, and by `partOf` within one), and the didactic layer on top.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { readJourneyCorpus } from "../journeys/read.ts";
import { bpmnFigure, orderByFollows, renderJourneyPages, stepAnchor, type PageFile } from "../journeys/render.ts";
import { journeyFiles, journeysRoute } from "../gen-journeys-viz.ts";
import { clearDeclaredVisualisers, renderedByOf } from "../viewer-declarations.ts";

const REPO = mkdtempSync(join(tmpdir(), "journeys-viz-"));
afterAll(() => rmSync(REPO, { recursive: true, force: true }));

const put = (rel: string, body: string | object): void => {
  mkdirSync(join(REPO, dirname(rel)), { recursive: true });
  writeFileSync(join(REPO, rel), typeof body === "string" ? body : JSON.stringify(body, null, 2));
};

const step = (id: string, lead: string, extra: object = {}) => ({
  id,
  title: `Step ${id}`,
  lead,
  experiences: [{ actor: lead, doing: `does ${id}`, feeling: "“fine”", emotion: 1 }],
  ...extra,
});

// ── lower: a layer with two chained journeys, actors, stories, a catalogue, a BPMN drawing, a requirement ──
put("lower/lower.json", {
  name: "lower",
  title: "Lower layer",
  repository: "example/lower",
  directories: [
    { id: "scenarios", path: "scenarios/", graphTypologies: ["scenarios"] },
    { id: "user-scenarios", path: "scenarios/user-scenarios/", graphTypologies: ["user-scenario"] },
    { id: "processes", path: "processes/", graphTypologies: ["processes"] },
    { id: "skills", path: "skills/", graphTypologies: ["skills"] },
    { id: "code-lists", path: "code-lists/", graphTypologies: ["code-list"] },
    // The catalogue beside the ArchiMate model, in a directory declared inside it.
    { id: "archimate", path: "archimate/", graphTypologies: ["archimate"] },
    { id: "building-blocks", path: "archimate/building-blocks/", graphTypologies: ["building-blocks"] },
  ],
});
put("lower/scenarios/actors/ana.json", { id: "ana", title: "Ana (pilgrim)", kind: "person", meta: { persona: { name: "Ana", role: "Pilgrim", color: "#123456" } } });
put("lower/scenarios/actors/ben.json", { id: "ben", title: "Ben (nurse)", kind: "person" });
put("lower/scenarios/stories.json", { name: "lower", stories: [{ id: "pilgrim-1", role: { role: "pilgrim" }, want: "Show my summary abroad", soThat: "I am treated safely" }] });
// A catalogue in a journeys directory is NOT read: the kind is declared, not the folder.
put("lower/scenarios/user-scenarios/stray-blocks.json", {
  $schema: "building-blocks/0.1.0",
  layers: [{ id: "apps", label: "Tools & apps" }],
  blocks: [{ id: "stray", name: "Stray", kind: "tool", layer: "apps", jurisdiction: "International", what: "Not declared." }],
});
put("lower/archimate/building-blocks/blocks.json", {
  $schema: "building-blocks/0.1.0",
  layers: [{ id: "apps", label: "Tools & apps" }],
  blocks: [{ id: "wallet", name: "Health wallet", kind: "tool", layer: "apps", jurisdiction: "International", what: "Holds the summary." }],
});
put("lower/code-lists/trust.json", {
  $schema: "folio-code-list/v1",
  id: "trust",
  title: "Trust",
  description: "How far the record can be trusted.",
  source: { note: "fixture" },
  codes: [
    { code: "paper", label: "On paper", definition: "d" },
    { code: "shared", label: "Shared", definition: "d" },
  ],
});
put("lower/scenarios/user-scenarios/p2.json", {
  $schema: "user-scenario/0.2.0",
  id: "p2-treated",
  title: "P2 — Treated",
  description: "Ana is treated.",
  personas: ["ana", "ben"],
  follows: "p1-checked",
  trustLadder: "trust",
  steps: [
    step("P2", "ben", {
      experiences: [
        { actor: "ben", doing: "reads the summary", emotion: 2 },
        { actor: "ana", doing: "waits", feeling: "“worried”", emotion: -1 },
      ],
      record: { state: "shared", description: "read abroad", heldWhere: "home" },
      stories: ["pilgrim-1", "ghost-story"],
      realisedBy: [{ process: "processes/care.bpmn", tasks: ["Task_Read"] }],
      requirements: ["LOW-REQ-001", "LOW-REQ-404"],
      examples: ["Bundle/ana-ips"],
      uses: [
        { block: "wallet", role: "shows the QR" },
        { block: "nowhere", role: "unknown block" },
      ],
      gaps: ["No transaction for this yet."],
      illustration: { src: "docs/images/p2.png", alt: "Ben reads the summary on a tablet." },
    }),
  ],
});
put("lower/scenarios/user-scenarios/p1.json", {
  $schema: "user-scenario/0.1.0",
  id: "p1-checked",
  title: "P1 — Checked",
  description: "Ana's health check.",
  personas: ["ana"],
  steps: [step("P1", "ana")],
});
put("lower/processes/care.bpmn", "<definitions/>");
put("lower/docs/images/p2.png", "\x89PNG fixture");
put(
  "lower/processes/care.svg",
  '<?xml version="1.0"?><!DOCTYPE svg><!-- generated --><svg xmlns="http://www.w3.org/2000/svg"><g class="djs-element djs-shape" data-element-id="Task_Read"><g class="djs-visual"><rect/></g></g><g class="djs-element djs-shape" data-element-id="Task_Other"><g class="djs-visual"><rect/></g></g></svg>',
);
put("lower/skills/requirements/low-req-001.json", { id: "req:low-req-001", title: "Read the summary", statements: [{ requirement: "The reader SHALL show the summary." }] });

// ── top: a journey group, a sub-journey, a workshop, and the visualiser ──
put("top/top.json", {
  name: "top",
  title: "Top demonstrator",
  needs: ["lower"],
  directories: [
    { id: "user-scenarios", path: "journeys/", graphTypologies: ["user-scenario"] },
    { id: "workshops", path: "workshops/", graphTypologies: ["workshop"] },
  ],
  visualisers: [{ id: "journeys", renderedBy: "journeys-viewer", coversKinds: ["user-scenario", "workshop"], subgraphs: "instance" }],
});
put("top/journeys/group.json", { $schema: "user-scenario/0.2.0", id: "t-group", title: "T — The whole trip", description: "Groups the trip.", personas: ["ana"], steps: [] });
put("top/journeys/t2.json", { $schema: "user-scenario/0.2.0", id: "t2-home", title: "T2 — Home", description: "Back home.", personas: ["ana"], partOf: "t-group", follows: "t1-away", steps: [step("T2", "ana")] });
// The pilgrimage's P3 brief, with a fictional cast (image prompts, owner via the parallel session, 2026-11-05).
put("top/journeys/t1.json", {
  $schema: "user-scenario/0.2.0",
  id: "t1-away",
  title: "T1 — Away",
  description: "Away.",
  personas: ["ana"],
  partOf: "t-group",
  illustrationStyle: {
    prompt: "Warm, flat digital illustration with soft shading and clean outlines. Wide banner, 11:4. No readable text, no logos. All people are fictional.",
    cast: [{ actor: "ana", description: "Pilgrim, 61, slim, short grey hair, white ihram." }],
    notes: ["Keep medical signs text-free."],
  },
  steps: [
    step("T1", "ana", {
      title: "Taken ill in Mina",
      illustration: {
        alt: "Ana, dizzy in the midday heat, is helped toward a health facility.",
        prompt: "The white tent city of Mina at midday; Ana, in white ihram, looks dizzy and is helped toward a plain white health facility with no text on its sign.",
      },
    }),
  ],
});
put("top/journeys/broken.json", { $schema: "user-scenario/0.2.0", id: "broken", title: "Broken", description: "d", personas: ["ana"], steps: [step("B1", "zed")] });
put("top/workshops/policy.json", {
  $schema: "workshop/0.1.0",
  id: "policy",
  title: "Policy track",
  description: "Taught from the pilgrim's journey.",
  scenarios: ["p1-checked", "p2-treated"],
  modules: [
    { id: "M1", title: "Capabilities", carries: "What had to exist?", sheet: "s1", objectives: ["Name the capabilities"] },
    { id: "M2", title: "Rights", tables: ["rights"] },
  ],
  tables: [{ id: "rights", title: "Decision rights", rows: [{ id: "anchor", label: "Trust anchor", question: "Who signs?" }] }],
  steps: [
    {
      scenario: "p2-treated",
      step: "P2",
      askTheRoom: "Should the family be told?",
      questions: [{ module: "M1", text: "What must be true for Ben to trust it?" }, { module: "M2", text: "Who decides?" }],
      capabilities: [{ id: "viewer", label: "A viewer" }],
      tags: [{ table: "rights", row: "anchor", why: "a signature crosses" }],
    },
    { scenario: "p1-checked", step: "P1", questions: [{ module: "M1", text: "Where does it break?" }] },
  ],
  assessment: { scales: [{ id: "status", label: "Where we stand", options: [{ id: "yes", label: "Exists" }, { id: "no", label: "Absent" }] }] },
  sheets: [{ id: "s1", label: "Sheet 1", title: "Our journey", modules: ["M1"], assessmentStrip: true }],
  resources: [{ id: "card", title: "Facilitator card", kind: "job-aid", body: "1. Ask.", steps: ["p2-treated#P2"], modules: ["M1"] }],
});
clearDeclaredVisualisers();

const TOP = join(REPO, "top");
const corpus = readJourneyCorpus(TOP);
const files = renderJourneyPages(corpus, { route: "en/top/journeys", title: "Top demonstrator" }, "top");
const at = (path: string): string => {
  const f = files.find((x: PageFile) => x.path === path);
  if (!f) throw new Error(`no page ${path}; have ${files.map((x) => x.path).join(", ")}`);
  return String(f.content);
};

describe("the reader finds every journey the checkout's declarations hold", () => {
  test("both instances' journeys and workshops, by kind, each parsed", () => {
    expect(corpus.journeys.map((j) => `${j.instance}:${j.scenario.id}`).sort()).toEqual(
      ["lower:p1-checked", "lower:p2-treated", "top:t-group", "top:t1-away", "top:t2-home"].sort(),
    );
    expect(corpus.workshops.map((w) => w.workshop.id)).toEqual(["policy"]);
  });

  test("a file that does not parse is a finding with its reason, not a silent skip", () => {
    expect(corpus.problems.map((p) => `${p.instance}:${p.file}`)).toEqual(["top:journeys/broken.json"]);
    expect(corpus.problems[0]!.message).toContain('"zed"');
  });

  test("the edges' targets: actors, stories, blocks, ladders, requirements", () => {
    expect(corpus.actors.get("lower")?.get("ana")?.persona?.name).toBe("Ana");
    expect(corpus.stories.get("lower")?.has("pilgrim-1")).toBe(true);
    expect(corpus.blocks.get("lower")?.blocks.has("wallet")).toBe(true);
    // Only a directory declaring `building-blocks` is read for a catalogue.
    expect(corpus.blocks.get("lower")?.blocks.has("stray")).toBe(false);
    expect(corpus.ladders.get("lower")?.get("trust")?.map((c) => c.code)).toEqual(["paper", "shared"]);
    expect(corpus.requirements.get("LOW-REQ-001")?.title).toBe("Read the summary");
  });
});

describe("the declared route", () => {
  test("is the instance's visualiser renderedBy journeys-viewer, under the locale", () => {
    expect(journeysRoute(TOP)).toBe("en/top/journeys");
    expect(journeysRoute(join(REPO, "lower"))).toBeUndefined();
    expect(journeyFiles(join(REPO, "lower"))).toBeUndefined();
    expect(journeyFiles(TOP)!.files.every((f) => f.path.startsWith("en/top/journeys/"))).toBe(true);
  });
});

describe("the index: all journeys, by instance, by partOf, along follows", () => {
  const index = at("index.html");
  test("names every instance's journeys, the declaring instance first", () => {
    expect(index.indexOf('id="top"')).toBeLessThan(index.indexOf('id="lower"'));
    for (const t of ["P1 — Checked", "P2 — Treated", "T — The whole trip", "T1 — Away", "T2 — Home"]) expect(index).toContain(t);
  });
  test("a sub-journey sits inside its parent, and siblings follow their chain", () => {
    const group = index.slice(index.indexOf("T — The whole trip"));
    expect(group).toContain('class="jv-tree jv-tree-sub"');
    expect(group.indexOf("T1 — Away")).toBeLessThan(group.indexOf("T2 — Home"));
    expect(index.indexOf("P1 — Checked")).toBeLessThan(index.indexOf("P2 — Treated"));
  });
  test("each instance is a sub-graph page", () => {
    expect(at("lower/index.html")).toContain("Lower layer");
    expect(at("top/index.html")).toContain("journeys/broken.json");
  });
  test("every page says which Tool drew it", () => {
    for (const f of files.filter((x) => x.path.endsWith(".html"))) expect(renderedByOf(String(f.content))).toBe("journeys-viewer");
  });
});

describe("a journey page", () => {
  const p2 = at("lower/p2-treated/index.html");
  test("a lane per person present, and the feeling curve", () => {
    expect(p2).toContain('class="jv-row jv-lane"');
    expect((p2.match(/class="jv-curve"/g) ?? []).length).toBe(2);
    expect(p2).toContain("--c:#123456");
  });
  test("each step: its anchor, its trust state from the ladder, gaps", () => {
    expect(p2).toContain(`id="${stepAnchor("P2")}"`);
    expect(p2).toContain("<b>Shared</b>");
    expect(p2).toContain("No transaction for this yet.");
  });
  test("the BPMN drawing, inlined, with the step's flow nodes highlighted", () => {
    expect(p2).toContain('data-element-id="Task_Read" data-jv-hl=""');
    expect(p2).not.toContain('data-element-id="Task_Other" data-jv-hl');
    expect(p2).not.toContain("<?xml");
  });
  test("stories, requirements, examples and blocks resolve, and what does not is drawn as unresolved", () => {
    expect(p2).toContain("Show my summary abroad".charAt(0).toLowerCase() + "how my summary abroad");
    expect(p2).toContain("https://github.com/example/lower/blob/HEAD/skills/requirements/low-req-001.json");
    expect(p2).toMatch(/jv-unresolved"><span class="jv-code">ghost-story/);
    expect(p2).toMatch(/LOW-REQ-404<\/span> no <code>req:<\/code> node/);
    expect(p2).toContain("Health wallet");
    expect(p2).toContain("not in a catalogue");
  });
  test("the workshop layer of another instance shows under the step it names", () => {
    expect(p2).toContain("Should the family be told?");
    expect(p2).toContain('href="../../top/workshops/policy/m1/"');
    expect(p2).toContain('data-jv-store');
    expect(p2).toContain("a signature crosses");
  });
  test("follows and partOf are links", () => {
    expect(p2).toContain('href="../../lower/p1-checked/" rel="prev"');
    expect(at("top/t1-away/index.html")).toContain('href="../../top/t-group/" rel="up"');
  });
});

describe("illustrations: the picture carries no text, the page does", () => {
  test("a resolved src is copied beside the page, with the step title above and the alt below as page text", () => {
    const p2 = at("lower/p2-treated/index.html");
    const fig = p2.slice(p2.indexOf('<figure class="jv-illus">'));
    expect(fig).toContain(`<img src="img/${stepAnchor("P2")}.png" alt="Ben reads the summary on a tablet."`);
    expect(fig.indexOf("Step P2")).toBeLessThan(fig.indexOf("<img"));
    expect(fig.indexOf("<figcaption>")).toBeGreaterThan(fig.indexOf("<img"));
    const img = files.find((f) => f.path === `lower/p2-treated/img/${stepAnchor("P2")}.png`);
    expect(img && String(img.content)).toContain("PNG fixture");
  });
  test("without a picture, the journey page carries the brief: style, cast and the step's prompt", () => {
    const t1 = at("top/t1-away/index.html");
    expect(t1).toContain('<details class="jv-brief"><summary>Illustration brief');
    expect(t1).toContain("The white tent city of Mina at midday");
    expect(t1).toContain("Warm, flat digital illustration");
    expect(t1).toContain("Pilgrim, 61, slim");
    expect(t1).toContain("Keep medical signs text-free.");
    expect(t1).not.toContain('class="jv-illus"');
  });
});

describe("the workshop layer", () => {
  test("a module page lists its questions along the journey, linking each step", () => {
    const m1 = at("top/workshops/policy/m1/index.html");
    expect(m1.indexOf("Where does it break?")).toBeLessThan(m1.indexOf("What must be true for Ben to trust it?"));
    expect(m1).toContain(`href="../../../../lower/p2-treated/#${stepAnchor("P2")}"`);
    expect(m1).toContain("Name the capabilities");
    expect(m1).toContain("Facilitator card");
  });
  test("a module's tables are drawn on its page", () => {
    expect(at("top/workshops/policy/m2/index.html")).toContain("Trust anchor");
  });
  test("the sheets page carries one sheet per declared sheet, with its assessment strip", () => {
    const sheets = at("top/workshops/policy/sheets/index.html");
    expect((sheets.match(/class="jv-sheet /g) ?? []).length).toBe(1);
    expect(sheets).toContain('class="jv-strip"');
    expect(sheets).toContain("A viewer");
  });
});

describe("helpers", () => {
  test("orderByFollows walks each chain from its start", () => {
    const j = (id: string, follows?: string) => ({ instance: "x", file: "", scenario: { id, follows } }) as never;
    expect(orderByFollows([j("c", "b"), j("a"), j("b", "a"), j("z", "elsewhere")]).map((x: { scenario: { id: string } }) => x.scenario.id)).toEqual(["a", "b", "c", "z"]);
  });
  test("bpmnFigure never assembles a comment opener from a drawing's pieces", () => {
    // A one-pass strip turned this into an unclosed `<!--` that hid the rest of the page.
    const svg = '<svg><!<!---->--<g data-element-id="A"></g></svg>';
    const out = bpmnFigure(svg, ["A"], "c");
    expect(out).toContain("<!<!---->--<g");
    expect(out).not.toMatch(/<!--(?!--)<g/);
    expect(out).toContain('data-element-id="A" data-jv-hl=""');
    expect(out).toContain("<figcaption>c</figcaption>");
  });
  test("bpmnFigure leaves a drawing alone when no task is named", () => {
    expect(bpmnFigure('<svg><g data-element-id="A"></g></svg>', undefined, "c")).not.toContain("data-jv-hl");
  });
});
