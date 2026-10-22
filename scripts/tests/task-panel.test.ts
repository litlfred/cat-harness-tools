/**
 * The ⓘ task panel on process pages (implementation spec §6).
 *
 * @module scripts/tests/task-panel.test
 *
 * Owner, 2026-10-16: *"an info icon on each task (bpmn-js overlay) opens a
 * small UML object view: task → skill → methodology, and lane Role → skills.
 * Every skill, methodology and role in the panel is a link to its own page.
 * It loads only when opened."* Pinned here: markers land on the shapes the
 * SVG draws, the page carries markers and no panel data, the sidecar carries
 * the object view, and every name with a page is a link while a name without
 * one stays text.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  autoDocsRowId,
  diagramBlock,
  diagramBounds,
  markersFor,
  methodologyPageDir,
  PANEL_SCRIPT,
  svgViewBox,
} from "../lib/task-panel.ts";
import { processPage, processRows, taskPanelData, type PanelContext, type ProcessRow } from "../gen-processes-viz.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

// A real-corpus sweep: about five seconds on a loaded runner, past bun's 5s default.
const CORPUS_TIMEOUT = 60_000;

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="D" targetNamespace="x">
  <bpmn:process id="P"><bpmn:task id="T1" name="One"/><bpmn:task id="T2" name="Two"/></bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">
    <bpmndi:BPMNShape id="S1" bpmnElement="T1"><dc:Bounds x="200" y="100" width="100" height="80"/></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe("marker placement", () => {
  test("the viewBox is read off the SVG root", () => {
    expect(svgViewBox(`<svg xmlns="x" width="100%" viewBox="155 55 830 530" version="1.1">`)).toEqual({ x: 155, y: 55, width: 830, height: 530 });
    expect(svgViewBox("<svg>")).toBeUndefined();
  });

  test("a marker sits on the shape's top-right corner, in percent; a task with no shape gets none", async () => {
    const bounds = await diagramBounds(BPMN);
    expect(bounds.get("T1")).toEqual({ x: 200, y: 100, width: 100, height: 80 });
    const m = markersFor([{ id: "T1", name: "One" }, { id: "T2", name: "Two" }], bounds, { x: 100, y: 50, width: 400, height: 200 });
    expect(m).toEqual([{ id: "T1", name: "One", left: 50, top: 25 }]);
  });
});

describe("the page block", () => {
  test("markers and an empty panel, and the data is NOT inlined", () => {
    const html = diagramBlock({ img: "a.svg", alt: "BPMN diagram: P", markers: [{ id: "T1", name: "One <b>", left: 50, top: 25 }], panelHref: "p.tasks.json" }).join("\n");
    expect(html).toContain('data-panel="p.tasks.json"');
    expect(html).toContain('data-task="T1"');
    expect(html).toContain("left:50%;top:25%");
    expect(html).toContain("One &lt;b&gt;");
    expect(html).toContain("hidden></div>");
    // Fetched on open, not before.
    expect(PANEL_SCRIPT).toContain("fetch(");
    expect(PANEL_SCRIPT.indexOf("fetch(")).toBeGreaterThan(PANEL_SCRIPT.indexOf("function load"));
    // Liquid would eat a double brace in the page.
    expect(PANEL_SCRIPT).not.toMatch(/\{\{|\{%/);
    // Values go in as text, never as markup.
    expect(PANEL_SCRIPT).not.toContain("innerHTML");
  });

  test("no markers → the plain image it always was", () => {
    expect(diagramBlock({ img: "a.svg", alt: "x", markers: [], panelHref: "p" })).toEqual(['<img src="a.svg" alt="x" style="max-width:100%">']);
  });
});

describe("link spellings", () => {
  test("a methodology page is <instance>/<name>/, as #422 spells it", () => {
    expect(methodologyPageDir("cat-harness", "raci")).toBe("cat-harness/raci/");
  });
  test("a role link lands on gen-auto-docs' row id", () => {
    expect(autoDocsRowId("cat-harness/scenarios/roles.json#reviewer")).toBe("a-cat-harness-scenarios-roles-json-reviewer");
  });
});

describe("the object view", () => {
  const row = {
    id: "P",
    stem: "p",
    name: "P",
    steps: [
      { id: "T1", name: "Review", lane: "Reviewers", type: "bpmn:UserTask", skills: ["review", "unpaged"] },
      { id: "T2", name: "Anyone", lane: "Actor", type: "bpmn:Task", skills: [] },
    ],
    laneDetails: [
      {
        id: "L1",
        name: "Reviewers",
        roleRef: "lead",
        binding: "bound",
        roleId: "lead",
        roleSkills: [
          { skill: "review", via: "reviewer", depth: 1 },
          { skill: "sign-off", via: "lead", depth: 0 },
        ],
        activitySkills: ["review"],
      },
      { id: "L2", name: "Actor", binding: "variable", roleSkills: [], activitySkills: [] },
    ],
  } as unknown as ProcessRow;
  const ctx: PanelContext = {
    skillHref: (s) => (s === "unpaged" ? undefined : `../../../reference/skill-instructions/${s}.html`),
    methodologyHref: (m) => (m === "raci" ? "../../../en/cat-harness/methodologies/cat-harness/raci/" : undefined),
    roleHref: (r) => `../../../cat-harness/auto-docs/index/roles/index.html#a-${r}`,
    roleTitle: (r) => (r === "lead" ? "Lead reviewer" : undefined),
    usesMethodology: (s) => (s === "review" ? ["raci", "unknown-method"] : undefined),
  };
  const data = taskPanelData(row, [row], ctx);

  test("task → skills → methodologies, each a link where a page exists", () => {
    const t = data.tasks["T1"]!;
    expect(t.skills[0]).toEqual({
      name: "review",
      href: "../../../reference/skill-instructions/review.html",
      methodologies: [
        { name: "raci", href: "../../../en/cat-harness/methodologies/cat-harness/raci/" },
        { name: "unknown-method" },
      ],
    });
    // No page → no href, and no `uses-methodology` → no methodologies key at all.
    expect(t.skills[1]).toEqual({ name: "unpaged" });
  });

  test("lane Role → its skills, inherited ones naming where they came from", () => {
    const r = data.tasks["T1"]!.role!;
    expect(r.name).toBe("lead");
    expect(r.href).toContain("#a-lead");
    expect(r.title).toBe("Lead reviewer");
    expect(r.skills).toEqual([
      { name: "review", href: "../../../reference/skill-instructions/review.html", via: "reviewer" },
      { name: "sign-off", href: "../../../reference/skill-instructions/sign-off.html" },
    ]);
  });

  test("a lane naming no role says why, rather than showing nothing", () => {
    expect(data.tasks["T2"]!.role).toBeUndefined();
    expect(data.tasks["T2"]!.binding).toBe("variable");
  });
});

describe("the real corpus", () => {
  const REPO = resolve(dirname(HARNESS_ROOT));
  test("a rendered diagram gets markers, and its page carries the panel", async () => {
    const rows = (await processRows(REPO)).filter((r) => r.svg !== undefined && r.loadError === undefined);
    if (rows.length === 0 || !existsSync(join(REPO, rows[0]!.svg!))) return; // no rendered art in this checkout
    const withMarkers = rows.filter((r) => (r.markers ?? []).length > 0);
    expect(withMarkers.length).toBeGreaterThan(0);
    const r = withMarkers[0]!;
    expect(r.markers!.every((m) => m.left >= 0 && m.left <= 100 && m.top >= 0 && m.top <= 100)).toBe(true);
    expect(processPage(r, rows, new Set())).toContain(`data-panel="${r.stem}.tasks.json"`);
  }, CORPUS_TIMEOUT);
});
