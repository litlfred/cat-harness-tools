import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import type { ArchimateModel } from "../schemas/archimate.ts";
import { SLUG_LEDGER_FILE, SLUG_MAX, SlugLedgerSchema, ledgerText, planSlugs, slugify, type ModelLedger } from "../schemas/slugs.ts";
import { checkCommitted, slugPlans } from "./check-archimate.ts";
import { PAGE_CONFIG_ID, pagesFor, sitePathOf } from "./gen-archimate-pages.ts";
import { thinPageConfigOf } from "../../scripts/thin-page.ts";

/** A model of named elements and views, nothing drawn: all {@link planSlugs} reads. */
function model(elements: Array<[string, string, string?]>, views: Array<[string, string, string?]> = []): ArchimateModel {
  const props = (slug?: string) => (slug ? [{ key: "slug", value: slug }] : []);
  return {
    id: "id-model",
    name: "M",
    properties: [],
    elements: elements.map(([id, name, slug]) => ({ id, type: "ApplicationComponent", name, layer: "Application", properties: props(slug), folder: [] })),
    relationships: [],
    views: views.map(([id, name, slug]) => ({ id, name, properties: props(slug), folder: [], nodes: [], connections: [] })),
  };
}
const slugs = (l: ModelLedger, kind: "views" | "elements" = "elements") => Object.fromEntries(Object.entries(l[kind] ?? {}).map(([id, e]) => [id, e.slug]));

describe("slugify", () => {
  it("makes lower-case words joined by dashes, accents dropped", () => {
    expect(slugify("1. Central Health Workforce Registry")).toBe("1-central-health-workforce-registry");
    expect(slugify("  Équipe de santé (draft) ")).toBe("equipe-de-sante-draft");
    expect(slugify("Registry <script>")).toBe("registry-script");
  });

  it("cuts a long name at a word break", () => {
    const s = slugify("Budget execution reports with actionable insights by program geography facility and more")!;
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s).toBe("budget-execution-reports-with-actionable-insights-by-program");
  });

  it("gives nothing for a name with nothing readable, or one that looks like an Archi id", () => {
    expect(slugify("")).toBeUndefined();
    expect(slugify("—")).toBeUndefined();
    expect(slugify("id-007936f8c2424b96ad1893ef0ff66059")).toBeUndefined();
  });
});

describe("planSlugs", () => {
  it("slugs every named view and element; a clash gives the later one its id's first hex", () => {
    const p = planSlugs(model([["id-aaaa1111", "Business Service"], ["id-bbbb2222", "Business Service"], ["id-c", ""]], [["id-v", "Overview"]]), undefined);
    expect(slugs(p.ledger)).toEqual({ "id-aaaa1111": "business-service", "id-bbbb2222": "business-service-bbbb" });
    expect(slugs(p.ledger, "views")).toEqual({ "id-v": "overview" });
    // Unnamed: no slug, so its page stays at its id.
    expect(p.slugOf.has("id-c")).toBe(false);
  });

  it("is stable: the plan of a model against its own ledger is that ledger", () => {
    const m = model([["id-a", "Lookup"], ["id-b", "Lookup"]]);
    const once = planSlugs(m, undefined).ledger;
    expect(planSlugs(m, once).ledger).toEqual(once);
  });

  it("a newcomer never takes a pinned slug, even when it comes first in the model", () => {
    const pinned = planSlugs(model([["id-old1", "Registry"]]), undefined).ledger;
    const p = planSlugs(model([["id-new1", "Registry"], ["id-old1", "Registry"]]), pinned);
    expect(slugs(p.ledger)).toEqual({ "id-old1": "registry", "id-new1": "registry-new1" });
  });

  it("a rename moves the page and keeps the old slug as an alias; renaming back drops it", () => {
    const pinned = planSlugs(model([["id-a", "Lifelong Health Record"]]), undefined).ledger;
    const renamed = planSlugs(model([["id-a", "Shared Health Record"]]), pinned).ledger;
    expect(renamed.elements!["id-a"]).toEqual({ slug: "shared-health-record", aliases: ["lifelong-health-record"] });
    const back = planSlugs(model([["id-a", "Lifelong Health Record"]]), renamed).ledger;
    expect(back.elements!["id-a"]).toEqual({ slug: "lifelong-health-record", aliases: ["shared-health-record"] });
  });

  it("an object that left the model keeps its entry, so its slug is never given to another", () => {
    const pinned = planSlugs(model([["id-gone", "Registry"]]), undefined).ledger;
    const p = planSlugs(model([["id-new2", "Registry"]]), pinned).ledger;
    expect(slugs(p)).toEqual({ "id-gone": "registry", "id-new2": "registry-new2" });
    // An alias is claimed for good too.
    const moved = planSlugs(model([["id-x", "B"]]), planSlugs(model([["id-x", "A"]]), undefined).ledger).ledger;
    expect(slugs(planSlugs(model([["id-x", "B"], ["id-y", "A"]]), moved).ledger)).toEqual({ "id-x": "b", "id-y": "a-y" });
  });

  it("an author's `slug` property wins; one that is not a slug, or is taken, is refused", () => {
    expect(slugs(planSlugs(model([["id-a", "1. Central Health Workforce Registry", "hwr"]]), undefined).ledger)).toEqual({ "id-a": "hwr" });
    expect(() => planSlugs(model([["id-a", "X", "Not A Slug"]]), undefined)).toThrow(/is not lower-case words/);
    const pinned = planSlugs(model([["id-a", "Hwr"]]), undefined).ledger;
    expect(() => planSlugs(model([["id-a", "Hwr"], ["id-b", "Other", "hwr"]]), pinned)).toThrow(/already claimed by id-a/);
  });

  it("the ledger schema refuses a slug claimed by two objects", () => {
    const bad = { $schema: "cat-archimate-slugs/v1", models: { "1.0.0": { elements: { "id-a": { slug: "x" }, "id-b": { slug: "y", aliases: ["x"] } } } } };
    expect(SlugLedgerSchema.safeParse(bad).success).toBe(false);
  });
});

/** The instance `archimate.test.ts` builds, with a second element named like the first, and optionally a ledger. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" name="Tiny" id="id-model" version="5.0.0">
  <folder name="Application" id="id-f1" type="application">
    <element xsi:type="archimate:ApplicationComponent" name="Health Worker Registry" id="id-a"/>
    <element xsi:type="archimate:ApplicationService" name="Lookup" id="id-b"/>
    <element xsi:type="archimate:ApplicationService" name="Lookup" id="id-c9"/>
  </folder>
  <folder name="Relations" id="id-f2" type="relations">
    <element xsi:type="archimate:ServingRelationship" id="id-r1" source="id-b" target="id-a"/>
  </folder>
  <folder name="Views" id="id-f3" type="diagrams">
    <element xsi:type="archimate:ArchimateDiagramModel" name="1. Central Health Workforce Registry" id="id-v1">
      <child xsi:type="archimate:DiagramObject" id="id-da" archimateElement="id-a"><bounds x="10" y="10" width="120" height="55"/></child>
      <child xsi:type="archimate:DiagramObject" id="id-db" archimateElement="id-b">
        <bounds x="10" y="200" width="120" height="55"/>
        <sourceConnection xsi:type="archimate:Connection" id="id-c1" source="id-db" target="id-da" archimateRelationship="id-r1"/>
      </child>
    </element>
  </folder>
</archimate:model>`;

function instance(xml = XML, ledger?: object): string {
  const root = mkdtempSync(join(tmpdir(), "archimate-slugs-"));
  writeFileSync(
    join(root, "tiny.json"),
    JSON.stringify({
      name: "tiny",
      iriBase: "https://example.org/tiny/",
      directories: [{ id: "archimate", path: "archimate/", graphTypologies: ["archimate"] }],
      visualisers: [{ id: "archimate", renderedBy: "archimate-pages", covers: ["archimate"] }],
    }),
  );
  mkdirSync(join(root, "archimate", "1.0.0"), { recursive: true });
  writeFileSync(join(root, "archimate", "1.0.0", "model.archimate"), xml);
  writeFileSync(join(root, "archimate", "cat-archimate.config.json"), JSON.stringify({ $schema: "cat-archimate-config/v1", directory: "archimate", models: [{ id: "1.0.0", file: "1.0.0/model.archimate" }] }));
  if (ledger) writeFileSync(join(root, "archimate", SLUG_LEDGER_FILE), typeof ledger === "string" ? ledger : ledgerText(ledger as never));
  return root;
}
/** An instance with its first ledger written, as `archimate-slugs.ts` would. */
function withLedger(xml = XML): string {
  const root = instance(xml);
  writeFileSync(join(root, "archimate", SLUG_LEDGER_FILE), ledgerText(slugPlans(root, { start: true }).ledger!));
  return root;
}

describe("pages at slugs", () => {
  it("with no ledger, nothing changes: pages at ids, no redirects", () => {
    const root = instance();
    try {
      const files = pagesFor(root).files;
      expect(files.some((f) => f.path === "1.0.0/views/id-v1/index.html")).toBe(true);
      expect(files.some((f) => thinPageConfigOf(f.content, PAGE_CONFIG_ID)?.kind === "redirect")).toBe(false);
      expect(JSON.parse(files.find((f) => f.path === "1.0.0/model.json")!.content).slugs).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("puts each view and element page at its slug, keeps the id IRI, and redirects the id path", () => {
    const root = withLedger();
    try {
      const files = pagesFor(root).files;
      const at = (p: string) => files.find((f) => f.path === p);
      const view = at("1.0.0/views/1-central-health-workforce-registry/index.html")!;
      expect(thinPageConfigOf(view.content, PAGE_CONFIG_ID)).toMatchObject({ kind: "view", id: "id-v1", node: "../id-v1.jsonld", svg: "../id-v1.svg" });
      expect(at("1.0.0/elements/lookup/index.html")).toBeDefined();
      expect(at("1.0.0/elements/lookup-c9/index.html")).toBeDefined();
      // Relationships keep id paths.
      expect(at("1.0.0/relationships/id-r1/index.html")).toBeDefined();
      // The IRI is the id, as before.
      expect(JSON.parse(at("1.0.0/views/id-v1.jsonld")!.content)["@id"]).toBe("https://example.org/tiny/archimate/1.0.0/views/id-v1.jsonld");
      // The old path lands on the page.
      const r = at("1.0.0/views/id-v1/index.html")!;
      expect(thinPageConfigOf(r.content, PAGE_CONFIG_ID)).toEqual({ kind: "redirect", to: "../1-central-health-workforce-registry/" });
      expect(r.content).toContain('<meta http-equiv="refresh" content="0; url=../1-central-health-workforce-registry/">');
      // The drawing, the rail and the loader all link the slug.
      expect(at("1.0.0/views/id-v1.svg")!.content).toContain('href="../elements/health-worker-registry/"');
      expect(at("1.0.0/index.html")!.content).toContain('"href":"./views/1-central-health-workforce-registry/"');
      expect(JSON.parse(at("1.0.0/model.json")!.content).slugs).toMatchObject({ "id-v1": "1-central-health-workforce-registry", "id-c9": "lookup-c9" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("after a rename, the old slug redirects too, and the check wants the ledger rewritten", () => {
    const root = withLedger();
    try {
      writeFileSync(join(root, "archimate", "1.0.0", "model.archimate"), XML.replace('name="Health Worker Registry"', 'name="Workforce Registry"'));
      expect(checkCommitted(root).join("\n")).toMatch(/cat-archimate\.slugs\.json: out of date/);
      writeFileSync(join(root, "archimate", SLUG_LEDGER_FILE), ledgerText(slugPlans(root).ledger!));
      expect(checkCommitted(root)).toEqual([]);
      const files = pagesFor(root).files;
      const to = (p: string) => thinPageConfigOf(files.find((f) => f.path === p)!.content, PAGE_CONFIG_ID)!.to;
      expect(to("1.0.0/elements/health-worker-registry/index.html")).toBe("../workforce-registry/");
      expect(to("1.0.0/elements/id-a/index.html")).toBe("../workforce-registry/");
      expect(JSON.parse(readFileSync(join(root, "archimate", SLUG_LEDGER_FILE), "utf8")).models["1.0.0"].elements["id-a"]).toEqual({ slug: "workforce-registry", aliases: ["health-worker-registry"] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("in a site, every link a page, a redirect or a drawing makes reaches a file the run writes", () => {
    const root = withLedger();
    try {
      const { graphPath, pageRoot, files } = pagesFor(root, { site: true });
      const at = (f: (typeof files)[number]) => sitePathOf({ graphPath, pageRoot }, f);
      const written = new Set(files.map(at));
      for (const f of files.filter((x) => x.page || x.path.endsWith(".svg"))) {
        const refs = [...f.content.matchAll(/(?:href|src|data)="([^"#:]+)"/g)].map((m) => m[1]!);
        const cfg = f.page && f.path !== "index.html" ? (thinPageConfigOf(f.content, PAGE_CONFIG_ID) ?? {}) : {};
        for (const k of ["node", "model", "svg", "to"]) if (typeof cfg[k] === "string") refs.push(cfg[k] as string);
        for (const r of refs) {
          const target = posix.normalize(posix.join(posix.dirname(at(f)), r));
          expect({ from: at(f), r, ok: written.has(target) || written.has(posix.join(target, "index.html")) }).toEqual({ from: at(f), r, ok: true });
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
