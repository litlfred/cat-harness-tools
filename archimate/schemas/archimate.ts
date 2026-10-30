/**
 * The ArchiMate harness's shapes: what an instance declares, and how an Archi
 * model becomes nodes — the model, each of its views, elements and
 * relationships — with an IRI each.
 *
 * @module cat-harness/archimate/schemas/archimate
 * @graphNode schema
 * @conformsTo opengroup-archimate-3.0
 *
 * ## The node is the model; views, elements and relationships are nodes inside it
 *
 * The `openapi` subgraph's shape, applied to an ArchiMate model (owner,
 * 2026-10-09: *"need new specialixed harness (like openapi) for archimate
 * content in the KG"*). A directory of graph typology `archimate` holds Archi
 * models, one node each, and every view, element and relationship in a model
 * is a node of its own: `<…>/<model>/<views|elements|relationships>/<id>.jsonld`,
 * with its rendering — a thin page — at `<…>/<id>/`.
 *
 * ## Ids are the model's own
 *
 * Archi gives every object an id (`id-<32 hex>`), and those ids are what a
 * mapping, a comment or another model already cites — the RA mapper keys its
 * mappings on them, so they survive a change of version. They are used as
 * they are; one that is not filename-safe is refused rather than rewritten,
 * because a rewritten id is an IRI nobody chose.
 *
 * ## What is read, and what is not
 *
 * Archi's native format (`.archimate`): plain XML, or the zipped archive Archi
 * writes when a model holds images, whose `model.xml` is the same XML. The
 * Open Group exchange format is not read yet. Of a diagram, what a picture
 * needs: each object's bounds made ABSOLUTE (Archi nests a child's bounds in
 * its parent's), its fill colour where one is set, groups, notes, and each
 * connection with its relative bendpoints. Custom images, fonts and
 * figure alternates beyond the first are not read; a view drawn without them
 * is still the view.
 */
import { inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

/** A model id and every object id: one path segment, filename-safe. */
const SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * `cat-archimate.config.json` — at the instance's root, or inside the
 * directory it declares with graph typology `archimate`; the root wins. It
 * names each model the instance holds, by its file inside that directory.
 *
 * Unlike an OpenAPI document, an ArchiMate model is usually AUTHORED where it
 * is held (smart-ra's are drawn in Archi and committed), so a model is named
 * by its `file` in place. Ingesting one from another repository is a later
 * addition and would add a `source`, as the openapi config has.
 */
export const ARCHIMATE_CONFIG_SCHEMA_TAG = "cat-archimate-config/v1";
export const ArchimateConfigModelSchema = z
  .object({
    /** The model's id: its page directory and its IRI segment. A version (`0.2.0`) is a good one. */
    id: z.string().regex(SEGMENT),
    /** The `.archimate` file, relative to the declared directory. */
    file: z
      .string()
      .regex(/\.archimate$/, "an Archi .archimate file")
      .refine((f) => !f.startsWith("/") && !f.split("/").includes(".."), "relative to the declared directory, without `..`"),
    /** What a reader calls it. Absent, the model's own name is used. */
    title: z.string().min(1).optional(),
    /** One sentence on what this model is and why the instance holds it. */
    description: z.string().min(1).optional(),
  })
  .strict();
export const ArchimateConfigSchema = z
  .object({
    $schema: z.literal(ARCHIMATE_CONFIG_SCHEMA_TAG),
    /** The `<instance>.json` directory id of graph typology `archimate` the models are held in. */
    directory: z.string().min(1),
    models: z.array(ArchimateConfigModelSchema).min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    for (const [i, m] of c.models.entries()) {
      if (seen.has(m.id)) ctx.addIssue({ code: "custom", path: ["models", i, "id"], message: `model id "${m.id}" is declared twice` });
      seen.add(m.id);
    }
  });
export type ArchimateConfig = z.infer<typeof ArchimateConfigSchema>;

// ── The layers ───────────────────────────────────────────────────────────

/** ArchiMate 3's layers and aspects, as a reader groups elements. */
export const ARCHIMATE_LAYERS = ["Strategy", "Business", "Application", "Technology", "Physical", "Motivation", "Implementation & Migration", "Other"] as const;
export type ArchimateLayer = (typeof ARCHIMATE_LAYERS)[number];

/** The layer an element type belongs to (ArchiMate 3.2, §3–§13). */
export function layerOf(type: string): ArchimateLayer {
  if (/^(Resource|Capability|ValueStream|CourseOfAction)$/.test(type)) return "Strategy";
  if (/^Business|^(Contract|Representation|Product)$/.test(type)) return "Business";
  if (/^Application|^DataObject$/.test(type)) return "Application";
  if (/^Technology|^(Node|Device|SystemSoftware|Path|CommunicationNetwork|Artifact)$/.test(type)) return "Technology";
  if (/^(Equipment|Facility|DistributionNetwork|Material)$/.test(type)) return "Physical";
  if (/^(Stakeholder|Driver|Assessment|Goal|Outcome|Principle|Requirement|Constraint|Meaning|Value)$/.test(type)) return "Motivation";
  if (/^(WorkPackage|Deliverable|ImplementationEvent|Plateau|Gap)$/.test(type)) return "Implementation & Migration";
  return "Other";
}

// ── The normalised model ─────────────────────────────────────────────────

export interface ArchimateProperty {
  key: string;
  value: string;
}
export interface ArchimateElement {
  id: string;
  /** The ArchiMate type without Archi's prefix: `ApplicationComponent`. */
  type: string;
  name: string;
  layer: ArchimateLayer;
  documentation?: string;
  properties: ArchimateProperty[];
  /** The folder path it is filed under in the model tree. */
  folder: string[];
}
export interface ArchimateRelationship {
  id: string;
  /** The relationship type without prefix or suffix: `Composition`, `Serving`. */
  type: string;
  source: string;
  target: string;
  name?: string;
  documentation?: string;
  /** Access only: `write` (Archi's default), `read`, `access` or `readwrite`. */
  accessType?: "write" | "read" | "access" | "readwrite";
  /** Association only. */
  directed?: boolean;
  /** Influence only: the strength, e.g. `+` or `--`. */
  strength?: string;
  properties: ArchimateProperty[];
}
/** A box on a diagram, its bounds absolute. */
export interface ArchimateViewNode {
  id: string;
  kind: "element" | "group" | "note" | "view-ref";
  /** The element it shows (`element`), or the view it refers to (`view-ref`). */
  ref?: string;
  /** A group's label, or a note's text. */
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The diagram object it is drawn inside, if any. */
  parent?: string;
  fill?: string;
  /** Archi's `type="1"`: the element drawn as its figure's alternate. */
  alternate?: boolean;
}
/** A line on a diagram. Its ends are diagram ids — a node's, or another connection's. */
export interface ArchimateViewConnection {
  id: string;
  /** The relationship it shows; absent for a plain line between a note and a box. */
  relationship?: string;
  source: string;
  target: string;
  /** Archi's relative bendpoints: offsets from the source's and the target's centres. */
  bendpoints: Array<{ startX: number; startY: number; endX: number; endY: number }>;
}
export interface ArchimateView {
  id: string;
  name: string;
  viewpoint?: string;
  documentation?: string;
  folder: string[];
  nodes: ArchimateViewNode[];
  connections: ArchimateViewConnection[];
}
export interface ArchimateModel {
  id: string;
  name: string;
  /** Archi's model `version` attribute — the tool's file version, not the model's. */
  archiVersion?: string;
  documentation?: string;
  properties: ArchimateProperty[];
  elements: ArchimateElement[];
  relationships: ArchimateRelationship[];
  views: ArchimateView[];
}

// ── Reading the bytes ────────────────────────────────────────────────────

/**
 * One entry of a zip archive, by name — the central directory read, the
 * entry stored (0) or deflated (8). Enough for Archi's archive format and no
 * more: no zip64, no encryption, which Archi does not write.
 */
export function zipEntry(buf: Buffer, name: string): Buffer | undefined {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive: no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (entry === name) {
      const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(dataAt, dataAt + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip entry ${name}: compression method ${method} is not supported`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

/** The model XML a `.archimate` file holds: the file itself, or `model.xml` inside Archi's archive. */
export function modelXmlOf(bytes: Buffer): string {
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) {
    const xml = zipEntry(bytes, "model.xml");
    if (!xml) throw new Error("an Archi archive with no model.xml");
    return xml.toString("utf8");
  }
  return bytes.toString("utf8");
}

const ARRAYS = new Set(["folder", "element", "child", "sourceConnection", "property", "bendpoint", "feature", "purpose"]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ARRAYS.has(name),
});

type X = Record<string, unknown>;
const arr = (v: unknown): X[] => (Array.isArray(v) ? (v as X[]) : []);
const str = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "object") return str((v as X)["#text"]);
  const s = String(v).trim();
  return s === "" ? undefined : s;
};
const xsiType = (x: X): string => String(x["@xsi:type"] ?? "").replace(/^archimate:/, "");
const props = (x: X): ArchimateProperty[] =>
  arr(x.property).map((p) => ({ key: String(p["@key"] ?? ""), value: String(p["@value"] ?? "") }));
const ACCESS = ["write", "read", "access", "readwrite"] as const;

function checkId(id: unknown, what: string): string {
  const s = String(id ?? "");
  if (!SEGMENT.test(s)) throw new Error(`${what} has an id that is not filename-safe: "${s}"`);
  return s;
}

/** Archi's default size for an object whose bounds say `-1`. */
const DEFAULT_W = 120;
const DEFAULT_H = 55;

/** Parse Archi's native model XML into the normalised model. */
export function parseArchimate(xml: string): ArchimateModel {
  const doc = parser.parse(xml) as X;
  const root = doc["archimate:model"] as X | undefined;
  if (!root) throw new Error("not an Archi model: no <archimate:model> root");
  const model: ArchimateModel = {
    id: checkId(root["@id"], "the model"),
    name: String(root["@name"] ?? ""),
    ...(root["@version"] ? { archiVersion: String(root["@version"]) } : {}),
    ...(str(arr(root.purpose)[0]) ? { documentation: str(arr(root.purpose)[0]) } : {}),
    properties: props(root),
    elements: [],
    relationships: [],
    views: [],
  };

  const walkFolder = (folder: X, path: string[]) => {
    for (const e of arr(folder.element)) {
      const type = xsiType(e);
      const id = checkId(e["@id"], `${type} "${e["@name"] ?? ""}"`);
      const documentation = str(e.documentation);
      if (type === "ArchimateDiagramModel" || type === "SketchModel" || type === "CanvasModel") {
        if (type !== "ArchimateDiagramModel") continue;
        model.views.push(readView(e, id, path, documentation));
      } else if (type.endsWith("Relationship")) {
        const accessType = e["@accessType"] !== undefined ? ACCESS[Number(e["@accessType"])] : undefined;
        model.relationships.push({
          id,
          type: type.replace(/Relationship$/, ""),
          source: checkId(e["@source"], `relationship ${id}'s source`),
          target: checkId(e["@target"], `relationship ${id}'s target`),
          ...(str(e["@name"]) ? { name: str(e["@name"]) } : {}),
          ...(documentation ? { documentation } : {}),
          ...(type === "AccessRelationship" ? { accessType: accessType ?? "write" } : {}),
          ...(type === "AssociationRelationship" ? { directed: e["@directed"] === "true" } : {}),
          ...(type === "InfluenceRelationship" && str(e["@strength"]) ? { strength: str(e["@strength"]) } : {}),
          properties: props(e),
        });
      } else {
        model.elements.push({
          id,
          type,
          name: String(e["@name"] ?? ""),
          layer: layerOf(type),
          ...(documentation ? { documentation } : {}),
          properties: props(e),
          folder: path,
        });
      }
    }
    for (const f of arr(folder.folder)) walkFolder(f, [...path, String(f["@name"] ?? "")]);
  };
  for (const f of arr(root.folder)) walkFolder(f, [String(f["@name"] ?? "")]);
  return model;
}

function readView(e: X, id: string, folder: string[], documentation: string | undefined): ArchimateView {
  const view: ArchimateView = {
    id,
    name: String(e["@name"] ?? ""),
    ...(str(e["@viewpoint"]) ? { viewpoint: str(e["@viewpoint"]) } : {}),
    ...(documentation ? { documentation } : {}),
    folder,
    nodes: [],
    connections: [],
  };
  const walk = (children: X[], ox: number, oy: number, parent: string | undefined) => {
    for (const c of children) {
      const type = xsiType(c);
      const cid = checkId(c["@id"], `a diagram object in view "${view.name}"`);
      const b = (arr(c.bounds)[0] ?? (c.bounds as X | undefined) ?? {}) as X;
      const x = ox + Number(b["@x"] ?? 0);
      const y = oy + Number(b["@y"] ?? 0);
      const w = Number(b["@width"] ?? -1);
      const h = Number(b["@height"] ?? -1);
      const node: ArchimateViewNode = {
        id: cid,
        kind: "element",
        x,
        y,
        w: w > 0 ? w : DEFAULT_W,
        h: h > 0 ? h : DEFAULT_H,
        ...(parent ? { parent } : {}),
        ...(str(c["@fillColor"]) ? { fill: str(c["@fillColor"]) } : {}),
      };
      if (type === "DiagramObject") {
        node.ref = String(c["@archimateElement"] ?? "");
        if (c["@type"] === "1") node.alternate = true;
      } else if (type === "Group") {
        node.kind = "group";
        node.text = String(c["@name"] ?? "");
      } else if (type === "Note") {
        node.kind = "note";
        node.text = str(c.content) ?? "";
      } else if (type === "DiagramModelReference") {
        node.kind = "view-ref";
        node.ref = String(c["@model"] ?? "");
      } else {
        continue;
      }
      view.nodes.push(node);
      for (const s of arr(c.sourceConnection)) {
        view.connections.push({
          id: checkId(s["@id"], `a connection in view "${view.name}"`),
          ...(s["@archimateRelationship"] ? { relationship: String(s["@archimateRelationship"]) } : {}),
          source: String(s["@source"] ?? cid),
          target: String(s["@target"] ?? ""),
          bendpoints: arr(s.bendpoint).map((p) => ({
            startX: Number(p["@startX"] ?? 0),
            startY: Number(p["@startY"] ?? 0),
            endX: Number(p["@endX"] ?? 0),
            endY: Number(p["@endY"] ?? 0),
          })),
        });
      }
      walk(arr(c.child), x, y, cid);
    }
  };
  walk(arr(e.child), 0, 0, undefined);
  return view;
}

/** Read a `.archimate` file's bytes into the normalised model. */
export function readArchimate(bytes: Buffer): ArchimateModel {
  return parseArchimate(modelXmlOf(bytes));
}
