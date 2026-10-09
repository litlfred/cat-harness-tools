/**
 * Draw one ArchiMate view as SVG, from the model's own diagram: the bounds
 * Archi stored for every box, and the bendpoints it stored for every line.
 *
 * @module cat-harness/archimate/scripts/render-view
 * @covers archimate
 *
 * ## Why here, and not Archi's own report
 *
 * Archi's HTML report draws views too, but it needs the tool itself — a JVM,
 * a virtual display and a 200 MB download per CI run — and what it draws is a
 * raster nobody can link into. This draws from the same coordinates, with no
 * tool, into SVG whose every box links to its element's page. It is a
 * rendering OF the model, never a copy kept beside it: regenerated on every
 * build, so a change made in Archi shows on the next one.
 *
 * ## The notation, as far as it is drawn
 *
 * ArchiMate 3.2's colours per layer (Archi's defaults, which every view in
 * the WHO models was drawn in), its shapes by aspect — square for structure,
 * rounded for behaviour, a pill for a service, a clipped corner for a
 * motivation element — and its relationship lines with their own ends. Each
 * box carries its type as a small label in its corner, not Archi's icons:
 * the icons are the tool's artwork, not the notation's. A box whose element
 * the model does not hold is drawn hatched and named as missing, never
 * dropped, so a broken reference shows where it is.
 *
 * Every string from the model is escaped: the model is its authors', and a
 * name is text, never markup.
 */
import type { ArchimateElement, ArchimateLayer, ArchimateModel, ArchimateRelationship, ArchimateView, ArchimateViewNode } from "@litlfred/cat-harness/archimate/schemas/archimate.ts";

/** Archi's default fill per layer. */
export const LAYER_FILL: Record<ArchimateLayer, string> = {
  Strategy: "#f5deaa",
  Business: "#ffffb5",
  Application: "#b5ffff",
  Technology: "#c9e7b7",
  Physical: "#c9e7b7",
  Motivation: "#ccccff",
  "Implementation & Migration": "#ffe0e0",
  Other: "#ffffff",
};

/** Archi's default outline: the fill, darkened — not black. */
export function outlineOf(fill: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(fill);
  if (!m) return "#555";
  const n = parseInt(m[1]!, 16);
  const d = (c: number) => Math.round(c * 0.55).toString(16).padStart(2, "0");
  return `#${d(n >> 16)}${d((n >> 8) & 255)}${d(n & 255)}`;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** `ApplicationComponent` → `Application Component`. */
export const typeLabel = (type: string): string => type.replace(/([a-z])([A-Z])/g, "$1 $2");

const FONT = 11;
const CHAR_W = FONT * 0.56;
const LINE_H = FONT * 1.25;

/** Greedy word wrap to a width, by an average glyph width. */
export function wrap(text: string, width: number, maxLines: number): string[] {
  const per = Math.max(4, Math.floor(width / CHAR_W));
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= per) line = next;
      else {
        if (line) lines.push(line);
        line = word.length > per ? `${word.slice(0, per - 1)}…` : word;
      }
    }
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/…$/, "").slice(0, per - 1)}…`;
    return kept;
  }
  return lines;
}

/** How an element's box is outlined: square, rounded, a pill, or a clipped corner. */
function shapeOf(e: ArchimateElement | undefined): "rect" | "round" | "pill" | "clipped" | "junction" {
  if (!e) return "rect";
  if (e.type === "Junction") return "junction";
  if (e.layer === "Motivation") return "clipped";
  if (/Service$/.test(e.type) || e.type === "ValueStream") return "pill";
  if (/(Process|Function|Interaction|Event)$/.test(e.type) || /^(Capability|CourseOfAction|WorkPackage)$/.test(e.type)) return "round";
  return "rect";
}

function box(n: ArchimateViewNode, shape: ReturnType<typeof shapeOf>, fill: string, extra: string): string {
  const { x, y, w, h } = n;
  if (shape === "pill") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, w / 2)}" fill="${fill}"${extra}/>`;
  if (shape === "round") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}"${extra}/>`;
  if (shape === "clipped") {
    const c = Math.min(10, w / 4, h / 4);
    const pts = [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
    return `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}"${extra}/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;
}

function textBlock(lines: string[], cx: number, top: number, cls: string): string {
  return (
    `<text class="${cls}" x="${cx}" y="${top + FONT}" text-anchor="middle">` +
    lines.map((l, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : LINE_H}">${esc(l)}</tspan>`).join("") +
    `</text>`
  );
}

type Pt = { x: number; y: number };
const centre = (n: ArchimateViewNode): Pt => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/** Where the segment from a box's centre towards `p` leaves the box. */
function clip(n: ArchimateViewNode, toward: Pt): Pt {
  const c = centre(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : n.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : n.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy, 1);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** The ends and line style each relationship type is drawn with. */
function lineStyle(r: ArchimateRelationship | undefined): { start?: string; end?: string; dash?: string } {
  switch (r?.type) {
    case "Composition":
      return { start: "diamond-filled" };
    case "Aggregation":
      return { start: "diamond-hollow" };
    case "Assignment":
      return { start: "dot", end: "arrow-filled" };
    case "Realization":
      return { end: "triangle-hollow", dash: "6 4" };
    case "Serving":
      return { end: "arrow-open" };
    case "Access": {
      const a = r.accessType ?? "write";
      return { dash: "2 3", ...(a === "write" || a === "readwrite" ? { end: "arrow-small" } : {}), ...(a === "read" || a === "readwrite" ? { start: "arrow-small" } : {}) };
    }
    case "Influence":
      return { end: "arrow-open", dash: "6 4" };
    case "Triggering":
      return { end: "arrow-filled" };
    case "Flow":
      return { end: "arrow-filled", dash: "8 4" };
    case "Specialization":
      return { end: "triangle-hollow" };
    case "Association":
      return r.directed ? { end: "arrow-small" } : {};
    default:
      return {};
  }
}

const MARKERS = `<defs>
<marker id="arrow-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#333" stroke-width="1.3"/></marker>
<marker id="arrow-filled" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L11 6 L1 11 Z" fill="#333"/></marker>
<marker id="arrow-small" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#333" stroke-width="1.2"/></marker>
<marker id="triangle-hollow" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="13" markerHeight="13" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L13 7 L1 13 Z" fill="#fff" stroke="#333" stroke-width="1.2"/></marker>
<marker id="diamond-filled" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 5 L8 1 L15 5 L8 9 Z" fill="#333"/></marker>
<marker id="diamond-hollow" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 5 L8 1 L15 5 L8 9 Z" fill="#fff" stroke="#333" stroke-width="1.2"/></marker>
<marker id="dot" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3.2" fill="#333"/></marker>
<pattern id="missing" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#d33" stroke-width="2"/></pattern>
</defs>`;

const STYLE = `<style>
.av-name{font:600 ${FONT}px system-ui,-apple-system,"Segoe UI",sans-serif;fill:#111}
.av-type{font:italic 8px system-ui,sans-serif;fill:#555}
.av-group{font:600 ${FONT}px system-ui,sans-serif;fill:#333}
.av-note{font:${FONT - 1}px system-ui,sans-serif;fill:#222}
.av-rel{font:9px system-ui,sans-serif;fill:#333;paint-order:stroke;stroke:#fff;stroke-width:3px}
a:hover rect,a:hover polygon,a:focus rect,a:focus polygon{stroke:#06c;stroke-width:2.5}
</style>`;

export interface RenderOptions {
  /** The href a box links to, given its element's id; absent, boxes are not links. */
  elementHref?: (elementId: string) => string;
  /** The href a relationship line links to; absent, lines are not links. */
  relationshipHref?: (relationshipId: string) => string;
  /** The href a view-reference box links to. */
  viewHref?: (viewId: string) => string;
}

/** One view as a standalone SVG document. */
export function renderViewSvg(model: ArchimateModel, view: ArchimateView, opts: RenderOptions = {}): string {
  const elements = new Map(model.elements.map((e) => [e.id, e]));
  const relationships = new Map(model.relationships.map((r) => [r.id, r]));
  const views = new Map(model.views.map((v) => [v.id, v]));
  const nodes = new Map(view.nodes.map((n) => [n.id, n]));

  const pad = 20;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const n of view.nodes) {
    grow(n.x, n.y);
    grow(n.x + n.w, n.y + n.h);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 200; maxY = 60; }

  const out: string[] = [];
  for (const n of view.nodes) {
    if (n.kind === "group") {
      const fill = n.fill ?? "#f2f2f2";
      out.push(
        `<g class="av-g"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${esc(fill)}" fill-opacity=".55" stroke="#888"/>` +
          `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${LINE_H + 6}" fill="${esc(fill)}" stroke="#888"/>` +
          `<text class="av-group" x="${n.x + 6}" y="${n.y + FONT + 3}">${esc(wrap(n.text ?? "", n.w - 12, 1)[0] ?? "")}</text></g>`,
      );
    } else if (n.kind === "note") {
      const f = 10;
      const pts = [[n.x, n.y], [n.x + n.w - f, n.y], [n.x + n.w, n.y + f], [n.x + n.w, n.y + n.h], [n.x, n.y + n.h]];
      const lines = wrap(n.text ?? "", n.w - 12, Math.max(1, Math.floor((n.h - 8) / LINE_H)));
      out.push(
        `<g class="av-n"><polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${esc(n.fill ?? "#ffffff")}" stroke="#888"/>` +
          `<text class="av-note" x="${n.x + 6}" y="${n.y + FONT + 4}">` +
          lines.map((l, i) => `<tspan x="${n.x + 6}" dy="${i === 0 ? 0 : LINE_H}">${esc(l)}</tspan>`).join("") +
          `</text></g>`,
      );
    } else if (n.kind === "view-ref") {
      const v = views.get(n.ref ?? "");
      const label = v?.name ?? "(missing view)";
      const shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#dcdcdc" stroke="#555"/>` + textBlock(wrap(label, n.w - 10, 3), n.x + n.w / 2, n.y + 6, "av-name");
      out.push(v && opts.viewHref ? `<a href="${esc(opts.viewHref(v.id))}" target="_top"><title>View: ${esc(label)}</title>${shape}</a>` : `<g>${shape}</g>`);
    } else {
      const e = elements.get(n.ref ?? "");
      const shape = shapeOf(e);
      if (shape === "junction") {
        const c = centre(n);
        out.push(`<circle cx="${c.x}" cy="${c.y}" r="${Math.min(n.w, n.h) / 2}" fill="#000"/>`);
        continue;
      }
      const fill = e ? n.fill ?? LAYER_FILL[e.layer] : "url(#missing)";
      const name = e ? e.name : "(element missing from the model)";
      const type = e ? typeLabel(e.type) : "";
      const lines = wrap(name, n.w - 10, Math.max(1, Math.floor((n.h - 14) / LINE_H)));
      const body =
        box(n, shape, esc(fill), ` stroke="${e ? outlineOf(fill) : "#d33"}" stroke-width="1"`) +
        (type ? `<text class="av-type" x="${n.x + n.w - (shape === "pill" ? n.h / 3 : shape === "clipped" ? 9 : 5)}" y="${n.y + 10}" text-anchor="end">${esc(type)}</text>` : "") +
        textBlock(lines, n.x + n.w / 2, n.y + 12, "av-name");
      const title = `<title>${esc(name)}${type ? ` (${esc(type)})` : ""}</title>`;
      out.push(e && opts.elementHref ? `<a href="${esc(opts.elementHref(e.id))}" target="_top">${title}${body}</a>` : `<g>${title}${body}</g>`);
    }
  }

  // Lines over boxes. A connection may end on another connection (a relationship
  // on a relationship): that end is the other line's midpoint, unclipped.
  const mid = new Map<string, Pt>();
  const ends = (id: string): { at: Pt; node?: ArchimateViewNode } | undefined => {
    const n = nodes.get(id);
    if (n) return { at: centre(n), node: n };
    const m = mid.get(id);
    return m ? { at: m } : undefined;
  };
  const pending = [...view.connections];
  for (let guard = 0; pending.length && guard < 4; guard++) {
    for (let i = 0; i < pending.length; ) {
      const c = pending[i]!;
      const s = ends(c.source);
      const t = ends(c.target);
      if (!s || !t) { i++; continue; }
      pending.splice(i, 1);
      const k = c.bendpoints.length;
      const bends = c.bendpoints.map((b, j) => {
        const wgt = (j + 1) / (k + 1);
        return { x: (1 - wgt) * (s.at.x + b.startX) + wgt * (t.at.x + b.endX), y: (1 - wgt) * (s.at.y + b.startY) + wgt * (t.at.y + b.endY) };
      });
      const first = bends[0] ?? t.at;
      const last = bends[k - 1] ?? s.at;
      const a = s.node ? clip(s.node, first) : s.at;
      const z = t.node ? clip(t.node, last) : t.at;
      const pts = [a, ...bends, z];
      const half = pts.length % 2 === 1 ? pts[(pts.length - 1) / 2]! : { x: (pts[pts.length / 2 - 1]!.x + pts[pts.length / 2]!.x) / 2, y: (pts[pts.length / 2 - 1]!.y + pts[pts.length / 2]!.y) / 2 };
      mid.set(c.id, half);
      for (const p of pts) grow(p.x, p.y);
      const r = c.relationship ? relationships.get(c.relationship) : undefined;
      const st = lineStyle(r);
      const d = `M${pts.map((p) => `${round(p.x)} ${round(p.y)}`).join(" L")}`;
      const line =
        `<path d="${d}" fill="none" stroke="#333" stroke-width="1.2"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}` +
        `${st.start ? ` marker-start="url(#${st.start})"` : ""}${st.end ? ` marker-end="url(#${st.end})"` : ""}/>` +
        // A wide transparent twin, so a thin line is easy to point at.
        `<path d="${d}" fill="none" stroke="transparent" stroke-width="8"/>`;
      const label = [r?.name, r?.type === "Influence" ? r.strength : undefined].filter(Boolean).join(" ");
      const text = label ? `<text class="av-rel" x="${round(half.x)}" y="${round(half.y - 3)}" text-anchor="middle">${esc(label)}</text>` : "";
      const title = r ? `<title>${esc(typeLabel(r.type))}${r.name ? `: ${esc(r.name)}` : ""}</title>` : "";
      out.push(r && opts.relationshipHref ? `<a href="${esc(opts.relationshipHref(r.id))}" target="_top">${title}${line}${text}</a>` : `<g>${title}${line}${text}</g>`);
    }
  }

  const vx = Math.floor(minX - pad);
  const vy = Math.floor(minY - pad);
  const vw = Math.ceil(maxX - minX + 2 * pad);
  const vh = Math.ceil(maxY - minY + 2 * pad);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" role="img" aria-labelledby="av-title">` +
    `<title id="av-title">${esc(view.name)} — ${esc(model.name)}</title>${STYLE}${MARKERS}` +
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#fff"/>` +
    out.join("\n") +
    `</svg>\n`
  );
}

const round = (n: number): number => Math.round(n * 10) / 10;
