import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { ArchimateConfigSchema, layerOf, modelXmlOf, parseArchimate, readArchimate, zipEntry } from "@litlfred/cat-harness/archimate/schemas/archimate.ts";
import { renderViewSvg, wrap } from "./render-view.ts";
import { checkCommitted } from "./check-archimate.ts";
import { PAGE_CONFIG_ID, pagesFor } from "./gen-archimate-pages.ts";
import { thinPageConfigOf } from "../../scripts/thin-page.ts";

/** A small Archi model: two elements in a group, a serving and an access relationship, a note. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" name="Tiny &lt;RA&gt;" id="id-model" version="5.0.0">
  <folder name="Application" id="id-f1" type="application">
    <element xsi:type="archimate:ApplicationComponent" name="Registry &lt;script&gt;" id="id-a">
      <documentation>Holds the records.</documentation>
      <property key="owner" value="WHO"/>
    </element>
    <element xsi:type="archimate:ApplicationService" name="Lookup" id="id-b"/>
    <element xsi:type="archimate:DataObject" name="Record" id="id-c"/>
  </folder>
  <folder name="Relations" id="id-f2" type="relations">
    <element xsi:type="archimate:ServingRelationship" id="id-r1" source="id-b" target="id-a"/>
    <element xsi:type="archimate:AccessRelationship" id="id-r2" source="id-a" target="id-c" accessType="1"/>
  </folder>
  <folder name="Views" id="id-f3" type="diagrams">
    <element xsi:type="archimate:ArchimateDiagramModel" name="Overview" id="id-v1" viewpoint="application_cooperation">
      <child xsi:type="archimate:Group" id="id-g" name="Platform">
        <bounds x="100" y="50" width="400" height="200"/>
        <child xsi:type="archimate:DiagramObject" id="id-da" archimateElement="id-a">
          <bounds x="20" y="40" width="-1" height="-1"/>
          <sourceConnection xsi:type="archimate:Connection" id="id-c2" source="id-da" target="id-dc" archimateRelationship="id-r2">
            <bendpoint startX="0" startY="80" endX="-100" endY="0"/>
          </sourceConnection>
        </child>
      </child>
      <child xsi:type="archimate:DiagramObject" id="id-db" archimateElement="id-b">
        <bounds x="120" y="300" width="120" height="55"/>
        <sourceConnection xsi:type="archimate:Connection" id="id-c1" source="id-db" target="id-da" archimateRelationship="id-r1"/>
      </child>
      <child xsi:type="archimate:DiagramObject" id="id-dc" archimateElement="id-c">
        <bounds x="400" y="300" width="120" height="55"/>
      </child>
      <child xsi:type="archimate:Note" id="id-n">
        <bounds x="600" y="50" width="185" height="80"/>
        <content>A note &amp; its text</content>
      </child>
    </element>
  </folder>
</archimate:model>`;

/** A zip archive of one entry, stored (method 0) or deflated (8). */
function zipOf(name: string, data: Buffer, deflate: boolean): Buffer {
  const body = deflate ? deflateRawSync(data) : data;
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + n.length + body.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + n.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, n, body, central, n, eocd]);
}

describe("reading a model", () => {
  const m = parseArchimate(XML);

  it("reads elements with their layer, documentation, properties and folder", () => {
    expect(m.name).toBe("Tiny <RA>");
    const a = m.elements.find((e) => e.id === "id-a")!;
    expect(a).toMatchObject({ type: "ApplicationComponent", layer: "Application", documentation: "Holds the records.", folder: ["Application"] });
    expect(a.properties).toEqual([{ key: "owner", value: "WHO" }]);
  });

  it("reads relationships, defaulting nothing it was told", () => {
    expect(m.relationships.find((r) => r.id === "id-r1")).toMatchObject({ type: "Serving", source: "id-b", target: "id-a" });
    expect(m.relationships.find((r) => r.id === "id-r2")).toMatchObject({ type: "Access", accessType: "read" });
  });

  it("makes a nested object's bounds absolute, and gives -1 Archi's default size", () => {
    const v = m.views[0]!;
    expect(v.viewpoint).toBe("application_cooperation");
    expect(v.nodes.find((n) => n.id === "id-da")).toMatchObject({ x: 120, y: 90, w: 120, h: 55, parent: "id-g" });
    expect(v.nodes.find((n) => n.id === "id-n")).toMatchObject({ kind: "note", text: "A note & its text" });
    expect(v.connections.map((c) => c.id).sort()).toEqual(["id-c1", "id-c2"]);
  });

  it("reads Archi's zipped archive, stored or deflated", () => {
    for (const deflate of [false, true]) {
      const zip = zipOf("model.xml", Buffer.from(XML), deflate);
      expect(zipEntry(zip, "model.xml")!.toString()).toBe(XML);
      expect(modelXmlOf(zip)).toBe(XML);
      expect(readArchimate(zip).elements.length).toBe(3);
    }
  });

  it("refuses an id that is not filename-safe rather than rewriting it", () => {
    expect(() => parseArchimate(XML.replace('id="id-b"', 'id="id b"'))).toThrow(/not filename-safe/);
  });

  it("puts each element type in its ArchiMate layer", () => {
    expect([layerOf("BusinessActor"), layerOf("Node"), layerOf("Goal"), layerOf("Capability"), layerOf("WorkPackage"), layerOf("Grouping")]).toEqual([
      "Business", "Technology", "Motivation", "Strategy", "Implementation & Migration", "Other",
    ]);
  });
});

describe("drawing a view", () => {
  const m = parseArchimate(XML);
  const svg = renderViewSvg(m, m.views[0]!, { elementHref: (id) => `../elements/${id}/` });

  it("escapes every string from the model", () => {
    expect(svg).toContain("Registry &lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });

  it("links each box to its element, and draws each relationship with its own ends", () => {
    expect(svg).toContain('href="../elements/id-a/" target="_top"');
    expect(svg).toContain('marker-end="url(#arrow-open)"');
    // A read access draws its arrow at the source end.
    expect(svg).toContain('marker-start="url(#arrow-small)"');
  });

  it("draws a box whose element is missing as missing, not as nothing", () => {
    const broken = parseArchimate(XML.replace('archimateElement="id-c"', 'archimateElement="id-gone"'));
    expect(renderViewSvg(broken, broken.views[0]!)).toContain("(element missing from the model)");
  });

  it("wraps a long name to the box and marks what it cut", () => {
    expect(wrap("Central Health Workforce Registry and Exchange Services", 160, 2)).toEqual(["Central Health Workforce", "Registry and Exchange…"]);
  });
});

describe("an instance", () => {
  const make = (config: object, extra?: (dir: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), "archimate-"));
    writeFileSync(join(root, "tiny.json"), JSON.stringify({ name: "tiny", iriBase: "https://example.org/tiny/", directories: [{ id: "archimate", path: "archimate/", graphTypologies: ["archimate"] }] }));
    mkdirSync(join(root, "archimate", "1.0.0"), { recursive: true });
    writeFileSync(join(root, "archimate", "1.0.0", "model.archimate"), XML);
    writeFileSync(join(root, "archimate", "cat-archimate.config.json"), JSON.stringify(config));
    extra?.(join(root, "archimate"));
    return root;
  };
  const config = { $schema: "cat-archimate-config/v1", directory: "archimate", models: [{ id: "1.0.0", file: "1.0.0/model.archimate" }] };

  it("refuses a model id declared twice", () => {
    expect(ArchimateConfigSchema.safeParse({ ...config, models: [config.models[0], config.models[0]] }).success).toBe(false);
  });

  it("is consistent when every model is configured, parses and resolves", () => {
    const root = make(config);
    try {
      expect(checkCommitted(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("says so when a model is held that the config does not name", () => {
    const root = make(config, (d) => writeFileSync(join(d, "stray.archimate"), XML));
    try {
      expect(checkCommitted(root).join("\n")).toMatch(/stray\.archimate: held, but/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a page and an IRI for the model and every view, element and relationship", () => {
    const root = make(config);
    try {
      const { graphPath, files } = pagesFor(root);
      expect(graphPath).toBe("archimate");
      const pages = files.filter((f) => f.path.endsWith("/index.html"));
      expect(pages.length).toBe(1 + 1 + 3 + 2);
      expect(files.some((f) => f.path === "1.0.0/views/id-v1.svg")).toBe(true);
      for (const f of files.filter((x) => x.path.endsWith(".jsonld"))) {
        expect(JSON.parse(f.content)["@id"]).toBe(`https://example.org/tiny/archimate/${f.path}`);
      }
      const el = JSON.parse(files.find((f) => f.path === "1.0.0/elements/id-a.jsonld")!.content);
      expect(el["@type"]).toBe("archimate:ApplicationComponent");
      const rel = JSON.parse(files.find((f) => f.path === "1.0.0/relationships/id-r1.jsonld")!.content);
      expect(rel["archimate:source"]["@id"]).toBe("https://example.org/tiny/archimate/1.0.0/elements/id-b.jsonld");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a page copies nothing of the model: its config points at the normalised model relative to itself", () => {
    const root = make(config);
    try {
      for (const p of pagesFor(root).files.filter((f) => f.path.endsWith("/index.html"))) {
        const cfg = thinPageConfigOf(p.content, PAGE_CONFIG_ID)!;
        expect(cfg.model).toBe(p.path.split("/").length === 2 ? "./model.json" : "../../model.json");
        expect(p.content).not.toContain("Holds the records.");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("declares the rail's left-hand section: the model's views, relative to each page", () => {
    const root = make(config);
    try {
      const files = pagesFor(root).files;
      const navOf = (path: string) => {
        const m = /<script type="application\/json" data-fa-visualiser-nav>(.*?)<\/script>/.exec(files.find((f) => f.path === path)!.content);
        return JSON.parse(m![1]!);
      };
      expect(navOf("1.0.0/index.html")[0].items).toEqual([{ label: "Overview", href: "./views/id-v1/" }]);
      expect(navOf("1.0.0/views/id-v1/index.html")[0]).toMatchObject({ href: "../../", items: [{ href: "../../views/id-v1/" }] });
      expect(navOf("index.html")[0].items).toEqual([{ label: "Tiny <RA>", href: "1.0.0/" }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to write pages into a graph that is not served", () => {
    const root = make(config);
    try {
      expect(() => pagesFor(root, { requireServed: true })).toThrow(/served: true/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
