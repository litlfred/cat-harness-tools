/**
 * The metamodel a model actually uses, derived from the model and checked
 * against ArchiMate's relationship table. Never drawn by hand.
 *
 * @module cat-harness/archimate/schemas/metamodel
 * @conformsTo opengroup-archimate-3.0
 * @covers archimate
 *
 * Owner, 2026-10-31: "i dont really like native UML, rather derived", then
 * "make mechanical tools as parts of skills/processes". A reference
 * architecture's metamodel (which element types it uses, and which
 * relationships it draws between them) used to be a hand-drawn view, with
 * placeholder elements named after the types. Here it is computed:
 *
 * - every element type in the model, with how many elements it has;
 * - every pattern (source type, relationship type, target type), with how many
 *   relationships follow it and which ones;
 * - for each pattern, whether ArchiMate allows it (Appendix B, as Archi holds
 *   it: `archimate-relationships.json`, written by
 *   `scripts/import-archi-relationships.ts`);
 * - the placeholder elements: an element whose name is its own type's name
 *   ("Goal", "Application Component (MS)"). They are how a metamodel gets
 *   drawn by hand, so they and their relationships are listed, and kept out of
 *   the patterns, which describe the architecture itself.
 *
 * The same result is written as JSON, as Graphviz DOT (laid out to SVG by
 * `archimate-pages`), and as a Mermaid class diagram.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { layerOf, type ArchimateLayer, type ArchimateModel } from "./archimate.ts";

/** The committed table, beside this module. */
export const TABLE_FILE = join(dirname(fileURLToPath(import.meta.url)), "archimate-relationships.json");

export interface RelationshipTable {
  $schema: "archimate-relationship-table/v1";
  /** The ArchiMate version the table encodes (Archi's `<relationships version>`). */
  archimateVersion: string;
  source: { repository: string; commit: string; path: string; license: string; copyright: string };
  /** Key letter → Archi relationship type, e.g. `r` → `RealizationRelationship`. */
  keys: Record<string, string>;
  /** Source type → target type → the key letters allowed between them. */
  allowed: Record<string, Record<string, string>>;
}

let cached: RelationshipTable | undefined;
/** The committed relationship table. */
export function relationshipTable(): RelationshipTable {
  return (cached ??= JSON.parse(readFileSync(TABLE_FILE, "utf8")) as RelationshipTable);
}

/**
 * Whether ArchiMate allows `relationship` from `source` to `target`; undefined
 * when the table does not know one of the types (an Archi diagram type, say),
 * so "not allowed" is never claimed without the table saying so.
 */
export function isAllowed(table: RelationshipTable, source: string, relationship: string, target: string): boolean | undefined {
  const row = table.allowed[source];
  if (row === undefined || (table.allowed[target] === undefined && target !== "Relationship")) return undefined;
  const letters = row[target] ?? "";
  return [...letters].some((ch) => relKind(table.keys[ch] ?? "") === relKind(relationship));
}

/** A relationship type without Archi's suffix: `RealizationRelationship` and `Realization` are both `Realization`. */
export const relKind = (relationship: string): string => relationship.replace(/Relationship$/, "");

/** `ApplicationComponent` → `Application Component`. */
export const typeName = (type: string): string => type.replace(/([a-z])([A-Z])/g, "$1 $2");

/**
 * An element named after its own type, give or take a parenthesised suffix:
 * "Goal", "application component", "Capability (MS)".
 */
export function isPlaceholder(e: { type: string; name: string }): boolean {
  // A Grouping or Junction left with its default name is structure, not a stand-in for a type.
  if (e.type === "Grouping" || e.type === "Junction") return false;
  const n = e.name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  return n !== "" && n === typeName(e.type).toLowerCase();
}

export interface MetamodelType {
  type: string;
  layer: ArchimateLayer;
  /** Elements of this type, placeholders not counted. */
  elements: number;
}

export interface MetamodelPattern {
  source: string;
  /** The relationship type as the model reader gives it, e.g. `Realization`. */
  relationship: string;
  target: string;
  count: number;
  /** Allowed by ArchiMate's table; undefined when the table does not know a type. */
  allowed: boolean | undefined;
  /** The relationships that follow it, by id, in model order. */
  relationships: string[];
}

export interface Metamodel {
  $schema: "archimate-metamodel/v1";
  model: string;
  name: string;
  archimateVersion: string;
  types: MetamodelType[];
  patterns: MetamodelPattern[];
  placeholders: Array<{ id: string; type: string; name: string }>;
  /** Relationships with a placeholder at either end: the hand-drawn metamodel, left out of `patterns`. */
  placeholderRelationships: string[];
  /** Relationships following a pattern ArchiMate does not allow. */
  notAllowed: number;
}

/** The metamodel `model` uses. Deterministic: types and patterns sorted by count, then name. */
export function metamodelOf(model: ArchimateModel, modelId: string, table: RelationshipTable = relationshipTable()): Metamodel {
  const elements = new Map(model.elements.map((e) => [e.id, e]));
  const relIds = new Set(model.relationships.map((r) => r.id));
  const placeholders = model.elements.filter(isPlaceholder);
  const ph = new Set(placeholders.map((e) => e.id));
  const typeCount = new Map<string, number>();
  for (const e of model.elements) if (!ph.has(e.id)) typeCount.set(e.type, (typeCount.get(e.type) ?? 0) + 1);
  const typeOfEnd = (id: string): string | undefined => elements.get(id)?.type ?? (relIds.has(id) ? "Relationship" : undefined);
  const patterns = new Map<string, MetamodelPattern>();
  const placeholderRelationships: string[] = [];
  for (const r of model.relationships) {
    if (ph.has(r.source) || ph.has(r.target)) {
      placeholderRelationships.push(r.id);
      continue;
    }
    const s = typeOfEnd(r.source);
    const t = typeOfEnd(r.target);
    if (s === undefined || t === undefined) continue; // a dangling end: archimate-check's finding, not this one
    const key = `${s}\u0000${r.type}\u0000${t}`;
    const p = patterns.get(key) ?? { source: s, relationship: r.type, target: t, count: 0, allowed: isAllowed(table, s, r.type, t), relationships: [] };
    p.count++;
    p.relationships.push(r.id);
    patterns.set(key, p);
  }
  const byCount = <T extends { count?: number; elements?: number }>(n: (x: T) => string) => (a: T, b: T) =>
    (b.count ?? b.elements ?? 0) - (a.count ?? a.elements ?? 0) || n(a).localeCompare(n(b));
  const list = [...patterns.values()].sort(byCount((p) => `${p.source} ${p.relationship} ${p.target}`));
  return {
    $schema: "archimate-metamodel/v1",
    model: modelId,
    name: model.name,
    archimateVersion: table.archimateVersion,
    types: [...typeCount].map(([type, n]) => ({ type, layer: layerOf(type), elements: n })).sort(byCount((t) => t.type)),
    patterns: list,
    placeholders: placeholders.map((e) => ({ id: e.id, type: e.type, name: e.name })),
    placeholderRelationships,
    notAllowed: list.filter((p) => p.allowed === false).reduce((n, p) => n + p.count, 0),
  };
}

/** How each relationship reads, as a verb from source to target. */
export const VERB: Record<string, string> = {
  Composition: "composed of",
  Aggregation: "aggregates",
  Assignment: "assigned to",
  Realization: "realises",
  Specialization: "specialises",
  Serving: "serves",
  Access: "accesses",
  Influence: "influences",
  Triggering: "triggers",
  Flow: "flows to",
  Association: "associated with",
};
export const verbOf = (relationship: string): string => VERB[relKind(relationship)] ?? typeName(relKind(relationship)).toLowerCase();

/** ArchiMate's line for each relationship, in Graphviz's terms. */
const DOT_EDGE: Record<string, string> = {
  Composition: `dir=both, arrowtail=diamond, arrowhead=none`,
  Aggregation: `dir=both, arrowtail=odiamond, arrowhead=none`,
  Assignment: `dir=both, arrowtail=dot, arrowhead=normal`,
  Realization: `style=dashed, arrowhead=empty`,
  Specialization: `arrowhead=empty`,
  Serving: `arrowhead=vee`,
  Access: `style=dotted, arrowhead=vee, arrowsize=0.6`,
  Influence: `style=dashed, arrowhead=vee`,
  Triggering: `arrowhead=normal`,
  Flow: `style=dashed, arrowhead=normal`,
  Association: `arrowhead=none`,
};

const LAYER_FILL: Record<ArchimateLayer, string> = {
  Strategy: "#f5deaa",
  Business: "#ffffb5",
  Application: "#b5ffff",
  Technology: "#c9e7b7",
  Physical: "#c9e7b7",
  Motivation: "#ccccff",
  "Implementation & Migration": "#ffe0e0",
  Other: "#ffffff",
};

/** ArchiMate's layers, top to bottom, as a layered view stacks them. */
const LAYER_ORDER: ArchimateLayer[] = ["Motivation", "Strategy", "Business", "Application", "Technology", "Physical", "Implementation & Migration", "Other"];

const dq = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The metamodel as Graphviz DOT: one box per type, grouped by layer, one line
 * per pattern labelled with its verb and count. A pattern ArchiMate does not
 * allow is drawn red and marked ✗.
 */
export function metamodelDot(mm: Metamodel): string {
  const used = new Set<string>([...mm.types.map((t) => t.type), ...mm.patterns.flatMap((p) => [p.source, p.target])]);
  const count = new Map(mm.types.map((t) => [t.type, t.elements]));
  const byLayer = new Map<ArchimateLayer, string[]>();
  for (const t of [...used].filter((t) => t !== "Relationship").sort()) {
    const l = layerOf(t);
    byLayer.set(l, [...(byLayer.get(l) ?? []), t]);
  }
  const lines = [
    `digraph ${dq(`${mm.name} — metamodel in use`)} {`,
    // ArchiMate's own stacking: motivation on top, technology at the bottom.
    // Each layer is one rank, and the ranks are drawn bottom-up, so that the
    // lines that run up the layers (realises, serves, influences) point up.
    `  graph [rankdir=TB, newrank=true, fontname="Helvetica", fontsize=11, nodesep=0.45, ranksep=1.1];`,
    `  node [shape=box, style="filled", fontname="Helvetica", fontsize=11, margin="0.12,0.06"];`,
    `  edge [fontname="Helvetica", fontsize=9, color="#444444", fontcolor="#333333"];`,
  ];
  const layers = LAYER_ORDER.filter((l) => byLayer.has(l));
  layers.forEach((layer, i) => {
    const types = byLayer.get(layer)!;
    lines.push(`  subgraph cluster_${i} {`, `    label=${dq(layer)}; labeljust=l; style="rounded,dashed"; color="#999999"; fontcolor="#666666";`, `    rank=same;`);
    for (const t of types) lines.push(`    ${dq(t)} [label=${dq(`${typeName(t)}\n${count.get(t) ?? 0} element(s)`)}, fillcolor=${dq(LAYER_FILL[layer])}];`);
    lines.push(`  }`);
  });
  for (let i = 1; i < layers.length; i++) lines.push(`  ${dq(byLayer.get(layers[i])![0])} -> ${dq(byLayer.get(layers[i - 1])![0])} [style=invis, weight=10];`);
  if (used.has("Relationship")) lines.push(`  "Relationship" [label="(a relationship)", shape=plaintext, style=""];`);
  for (const p of mm.patterns) {
    const bad = p.allowed === false;
    const label = `${bad ? "✗ " : ""}${verbOf(p.relationship)} ×${p.count}`;
    lines.push(`  ${dq(p.source)} -> ${dq(p.target)} [label=${dq(label)}, ${DOT_EDGE[relKind(p.relationship)] ?? ""}${bad ? `, color="#c0392b", fontcolor="#c0392b", penwidth=2` : ""}];`);
  }
  lines.push(`}`);
  return `${lines.join("\n")}\n`;
}

/** Mermaid's class-diagram arrow for each relationship, source on the left. */
const MERMAID_ARROW: Record<string, string> = {
  Composition: "*--",
  Aggregation: "o--",
  Realization: "..|>",
  Specialization: "--|>",
  Serving: "-->",
  Triggering: "-->",
  Assignment: "-->",
  Access: "..>",
  Influence: "..>",
  Flow: "..>",
  Association: "--",
};

/** The metamodel as a Mermaid class diagram, for readers and tools that take Mermaid. */
export function metamodelMermaid(mm: Metamodel): string {
  const id = (t: string): string => (t === "Relationship" ? "ArchimateRelationship" : t);
  const lines = ["classDiagram", `  %% ${mm.name}: metamodel in use, derived by archimate-metamodel. Do not edit.`];
  for (const t of mm.types) lines.push(`  class ${id(t.type)}["${typeName(t.type)}"]`, `  <<${t.layer}>> ${id(t.type)}`);
  for (const p of mm.patterns) {
    lines.push(`  ${id(p.source)} ${MERMAID_ARROW[relKind(p.relationship)] ?? "--"} ${id(p.target)} : ${p.allowed === false ? "✗ " : ""}${verbOf(p.relationship)} ×${p.count}`);
  }
  return `${lines.join("\n")}\n`;
}
