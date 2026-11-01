/**
 * Draw a layered ArchiMate view as a poster: bands of cards, with the type
 * and spacing of a printed figure, instead of Archi's own boxes and bounds.
 *
 * @module cat-harness/archimate/scripts/render-poster
 * @covers archimate
 *
 * `render-view.ts` draws a view exactly as Archi stored it. This one draws the
 * same view the way a report's figure shows a layered architecture (owner,
 * 2026-11-01, Q-IV-4 A): every box's colour is still its ArchiMate layer
 * (`figure-theme.ts`), but the layout is worked out from the view's
 * structure, not copied from its coordinates.
 *
 * ## What it reads from the view
 *
 * - **Bands.** Each top-level Grouping in the left-hand stack is a band, in
 *   the order the view has them top to bottom. A top-level Grouping to the
 *   right of that stack is a side column, drawn dashed, beside every band.
 * - **Frames.** A band whose Groupings sit one above the other is a frame
 *   holding those as bands; whose Groupings sit side by side, a row of panels,
 *   each holding its own cards. Elements beside the panels are cards of their own.
 * - **Cards.** One per element: its name, and the `note` property's text
 *   split at " · " into lines. A card whose element has the `star` property
 *   set to `true` gets a star. In the side column, an element whose note is a
 *   list of five or more short items is drawn as pills.
 * - **Marks** (option): a filled dot on an element with `formerName` (renamed),
 *   a ring on one with `candidateMatch` (a new element beside a similar one).
 *
 * Every string is escaped: a name is text, never markup.
 */
import type { ArchimateElement, ArchimateModel, ArchimateView, ArchimateViewNode } from "../schemas/archimate.ts";
import { fillOfType, outlineOf, THEME } from "./figure-theme.ts";

export interface PosterOptions {
  /** The property holding a card's short text. Default `figureNote`. */
  noteProperty?: string;
  /** The property that stars a card when `true`. Default `star`. */
  starProperty?: string;
  /** The words under a starred card and in the key, e.g. "REDDHI component". Default none. */
  starLabel?: string;
  /** Mark renamed and candidate-match elements, with a key. Default false. */
  marks?: boolean;
  /** Link each card to its element's page. */
  elementHref?: (elementId: string) => string;
  /** The heading. Default: the view's name. */
  title?: string;
  /** Total width in px. Default 1800. */
  width?: number;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Greedy word wrap to `n` characters a line. */
export function wrapWords(s: string, n: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (cur && cur.length + 1 + w.length > n) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  return cur ? [...out, cur] : out;
}

/** A note's items; short ones share a line, as a printed figure sets them. */
export function noteItems(note: string | undefined, merge = true): string[] {
  const raw = (note ?? "").split(" · ").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const t of raw) {
    const last = out[out.length - 1];
    if (merge && last !== undefined && t.length < 14 && last.length + t.length < 30) out[out.length - 1] = `${last} · ${t}`;
    else out.push(t);
  }
  return out;
}

interface Tree {
  node: ArchimateViewNode;
  el?: ArchimateElement;
  kids: Tree[];
}

const isGroup = (t: Tree): boolean => t.el?.type === "Grouping" || t.node.kind === "group";
const prop = (e: ArchimateElement | undefined, k: string): string | undefined => e?.properties.find((p) => p.key === k)?.value;
const nameOf = (t: Tree): string => t.el?.name ?? t.node.text ?? "";

export function renderPosterSvg(model: ArchimateModel, view: ArchimateView, opts: PosterOptions = {}): string {
  const NOTE = opts.noteProperty ?? "figureNote";
  const STAR = opts.starProperty ?? "star";
  const W = opts.width ?? 1800;
  const els = new Map(model.elements.map((e) => [e.id, e]));
  const trees = new Map<string, Tree>();
  for (const n of view.nodes) if (n.kind === "element" || n.kind === "group") trees.set(n.id, { node: n, el: n.ref ? els.get(n.ref) : undefined, kids: [] });
  const roots: Tree[] = [];
  for (const t of trees.values()) {
    const p = t.node.parent ? trees.get(t.node.parent) : undefined;
    (p ? p.kids : roots).push(t);
  }
  const byPos = (a: Tree, b: Tree) => a.node.y - b.node.y || a.node.x - b.node.x;
  for (const t of trees.values()) t.kids.sort(byPos);
  const tops = roots.filter(isGroup).sort(byPos);
  const left = Math.min(...tops.map((t) => t.node.x));
  const stack = tops.filter((t) => t.node.x <= left + 20);
  const side = tops.filter((t) => t.node.x > left + 20);

  const out: string[] = [];
  const T = (x: number, y: number, s: string, size: number, weight = 400, fill: string = THEME.body, anchor = "start", italic = false) =>
    out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`);
  const R = (x: number, y: number, w: number, h: number, fill: string, stroke = "none", rx = 6, sw = 1, dash = "") =>
    out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  let starred = false;
  let marked = false;
  const mark = (x: number, y: number, e?: ArchimateElement) => {
    if (!opts.marks || !e) return;
    const former = prop(e, "formerName");
    const cand = prop(e, "candidateMatch");
    if (former !== undefined) out.push(`<circle cx="${x}" cy="${y}" r="5" fill="#2b6cb0"><title>renamed from ${esc(former)}</title></circle>`);
    else if (cand !== undefined) out.push(`<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#c05621" stroke-width="2"><title>new; may match ${esc(cand)}</title></circle>`);
    else return;
    marked = true;
  };

  // A card: measured first, then drawn at the height of its row.
  const cardLines = (t: Tree, w: number) => {
    const title = wrapWords(nameOf(t), Math.max(8, Math.floor(w / 7.4)));
    const body: string[] = [];
    for (const item of noteItems(prop(t.el, NOTE))) wrapWords(item, Math.max(8, Math.floor(w / 6.3) - 2)).forEach((l, i) => body.push(i ? `  ${l}` : `· ${l}`));
    const star = prop(t.el, STAR) === "true";
    return { title, body, star, h: 14 + 15 * title.length + 12 * body.length + (star && opts.starLabel ? 16 : 0) + 8 };
  };
  const card = (t: Tree, x: number, y: number, w: number, h: number) => {
    const { title, body, star } = cardLines(t, w);
    const fill = fillOfType(t.el?.type ?? "");
    const href = t.el && opts.elementHref ? opts.elementHref(t.el.id) : undefined;
    if (href) out.push(`<a href="${esc(href)}">`);
    R(x, y, w, h, fill, outlineOf(fill), 6, 1.3);
    let ty = y + 17;
    for (const l of title) {
      T(x + 9, ty, l, 11.5, 700, THEME.ink);
      ty += 15;
    }
    ty += 1;
    for (const l of body) {
      T(x + 9, ty, l, 9.5, 400, THEME.body);
      ty += 12;
    }
    if (star) {
      starred = true;
      T(x + w - 10, y + 20, "★", 18, 400, THEME.star, "end");
      if (opts.starLabel) T(x + 9, y + h - 8, opts.starLabel, 9, 400, THEME.starText, "start", true);
    }
    mark(x + w - (star ? 26 : 9), y + h - 9, t.el);
    if (href) out.push("</a>");
  };
  // A row of cards across `w`, wrapping at ten; returns its height.
  const cardRow = (items: Tree[], x: number, y: number, w: number, draw: boolean): number => {
    const per = Math.min(items.length, 10) || 1;
    const bw = (w - 10 * (per - 1)) / per;
    let total = 0;
    for (let r = 0; r * per < items.length; r++) {
      const row = items.slice(r * per, r * per + per);
      const h = Math.max(...row.map((t) => cardLines(t, bw).h));
      if (draw) row.forEach((t, i) => card(t, x + i * (bw + 10), y + total, bw, h));
      total += h + 10;
    }
    return total - 10;
  };
  // A row of panels (Groupings side by side) and loose cards; returns its height.
  const panelRow = (items: Tree[], x: number, y: number, w: number, draw: boolean): number => {
    const units = items.reduce((n, t) => n + (isGroup(t) ? Math.max(1, t.kids.length) : 1), 0);
    const gap = 10;
    const uw = (w - gap * (items.length - 1)) / units;
    const widthOf = (t: Tree) => uw * (isGroup(t) ? Math.max(1, t.kids.length) : 1) + (isGroup(t) ? gap * (Math.max(1, t.kids.length) - 1) / Math.max(1, t.kids.length) : 0);
    const headOf = (t: Tree, pw: number) => wrapWords(prop(t.el, NOTE) ?? "", Math.floor(pw / 5.2)).slice(0, 2);
    const inner = (t: Tree, pw: number) => (pw - 16 - 8 * (t.kids.length - 1)) / Math.max(1, t.kids.length);
    let h = 0;
    for (const t of items) {
      const pw = widthOf(t);
      h = Math.max(h, isGroup(t) ? 24 + 12 * headOf(t, pw).length + 8 + Math.max(0, ...t.kids.map((k) => cardLines(k, inner(t, pw)).h)) + 8 : cardLines(t, pw).h);
    }
    if (!draw) return h;
    let cx = x;
    for (const t of items) {
      const pw = widthOf(t);
      if (isGroup(t)) {
        R(cx, y, pw, h, "#ffffff", THEME.bandStroke, 6, 1.2);
        T(cx + 10, y + 18, nameOf(t), 13, 700, THEME.ink);
        const head = headOf(t, pw);
        head.forEach((l, i) => T(cx + 10, y + 31 + i * 11, l, 9, 400, THEME.muted, "start", true));
        const top = y + 24 + 12 * head.length + 8;
        const iw = inner(t, pw);
        t.kids.forEach((k, i) => card(k, cx + 8 + i * (iw + 8), top, iw, y + h - 8 - top));
      } else card(t, cx, y, pw, h);
      cx += pw + gap;
    }
    return h;
  };
  const stackedGroups = (t: Tree) => {
    const g = t.kids.filter(isGroup);
    return g.length > 1 && g.length === t.kids.length && new Set(g.map((k) => k.node.y)).size === g.length;
  };
  const PAD = 36;
  const COLW = side.length ? 270 : 0;
  const LW = W - 2 * PAD - (side.length ? COLW + 16 : 0);
  // A band; returns its height.
  const band = (t: Tree, x: number, y: number, w: number, draw: boolean): number => {
    const sub = prop(t.el, NOTE);
    const hdr = sub ? 40 : 28;
    if (stackedGroups(t)) {
      let h = hdr;
      for (const k of t.kids) h += band(k, x + 8, y + h, w - 16, draw) + 10;
      if (draw) {
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h + 4}" rx="10" fill="none" stroke="${THEME.frame}" stroke-width="2.2"/>`);
        T(x + 14, y + 20, nameOf(t).toUpperCase(), 12, 700, THEME.frame);
        if (sub) T(x + 14, y + 34, sub, 10, 400, THEME.muted, "start", true);
      }
      return h + 4;
    }
    const panels = t.kids.some(isGroup);
    const inner = panels ? panelRow(t.kids, x + 12, y + hdr, w - 24, false) : cardRow(t.kids, x + 12, y + hdr, w - 24, false);
    const h = hdr + inner + 12;
    if (draw) {
      R(x, y, w, h, THEME.band, THEME.bandStroke, 8, 1.4);
      T(x + 14, y + 19, nameOf(t).toUpperCase(), 11, 700, THEME.ink);
      if (sub) T(x + 14, y + 33, sub, 10, 400, THEME.muted, "start", true);
      if (panels) panelRow(t.kids, x + 12, y + hdr, w - 24, true);
      else cardRow(t.kids, x + 12, y + hdr, w - 24, true);
    }
    return h;
  };

  const TOP = 82;
  let y = TOP;
  for (const t of stack) y += band(t, PAD, y, LW, true) + 12;
  let bottom = y - 12;
  // The side column, beside every band.
  if (side.length) {
    const x = W - PAD - COLW;
    const body: string[] = [];
    const save = out.length;
    let yy = TOP + 14;
    for (const g of side) {
      T(x + COLW / 2, yy + 10, nameOf(g).toUpperCase(), 13, 700, THEME.ink, "middle");
      yy += 26;
      for (const k of g.kids) {
        const items = noteItems(prop(k.el, NOTE), false);
        if (items.length >= 5 && items.every((s) => s.length <= 24)) {
          T(x + 12, yy + 4, nameOf(k).toUpperCase(), 10.5, 700, THEME.ink);
          yy += 12;
          let px = x + 12;
          const fill = fillOfType(k.el?.type ?? "");
          for (const p of items) {
            const pw = p.length * 5.6 + 18;
            if (px + pw > x + COLW - 10) {
              px = x + 12;
              yy += 24;
            }
            out.push(`<rect x="${px.toFixed(1)}" y="${yy.toFixed(1)}" width="${pw.toFixed(1)}" height="19" rx="9.5" fill="${fill}" stroke="${outlineOf(fill)}" stroke-width="1.1"/>`);
            T(px + pw / 2, yy + 13, p, 9, 700, THEME.ink, "middle");
            px += pw + 6;
          }
          mark(x + COLW - 18, yy - 8, k.el);
          yy += 34;
        } else {
          const h = cardLines(k, COLW - 24).h;
          card(k, x + 12, yy, COLW - 24, h);
          yy += h + 12;
        }
      }
    }
    const col = out.splice(save);
    bottom = Math.max(bottom, yy);
    R(x, TOP, COLW, bottom - TOP, THEME.band, THEME.header, 10, 2, "8 5");
    out.push(...col, ...body);
  }
  // Key.
  let ky = bottom + 28;
  const key: string[] = [];
  if (starred && opts.starLabel) key.push(`<text x="${PAD}" y="${ky}" font-size="11" fill="${THEME.ink}"><tspan fill="${THEME.star}" font-size="14">★</tspan> ${esc(opts.starLabel)}</text>`);
  if (marked) {
    const kx = PAD + (key.length ? 220 : 0);
    key.push(`<circle cx="${kx + 6}" cy="${ky - 4}" r="5" fill="#2b6cb0"/><text x="${kx + 18}" y="${ky}" font-size="11" fill="${THEME.ink}">renamed (old name kept as formerName)</text>`);
    key.push(`<circle cx="${kx + 286}" cy="${ky - 4}" r="5" fill="none" stroke="#c05621" stroke-width="2"/><text x="${kx + 298}" y="${ky}" font-size="11" fill="${THEME.ink}">new element beside a similar one (candidateMatch)</text>`);
  }
  if (!key.length) ky -= 20;
  const H = ky + 20;
  const title = opts.title ?? view.name;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${THEME.font}' role="img" aria-label="${esc(title)}">`,
    `<rect width="${W}" height="${H}" fill="${THEME.page}"/>`,
    `<text x="${PAD}" y="44" font-size="26" font-weight="800" fill="${THEME.ink}">${esc(title)}</text>`,
    `<text x="${PAD}" y="64" font-size="11" fill="${THEME.muted}" font-style="italic">Drawn from the ArchiMate model “${esc(model.name)}”, view “${esc(view.name)}”</text>`,
    ...out,
    ...key,
    "</svg>",
  ].join("\n");
}

if (import.meta.main) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { readArchimate } = await import("../schemas/archimate.ts");
  const args = process.argv.slice(2);
  const flag = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const model = flag("model");
  const viewName = flag("view");
  const outPath = flag("out");
  if (!model || !viewName || !outPath) {
    console.error('usage: render-poster.ts --model <model.xml|.archimate> --view "<name>" --out <file.svg> [--note-property k] [--star-property k] [--star-label text] [--marks]');
    process.exit(2);
  }
  const m = readArchimate(readFileSync(model));
  const v = m.views.find((x) => x.name === viewName);
  if (!v) {
    console.error(`no view "${viewName}"; the model has: ${m.views.map((x) => x.name).join(" | ")}`);
    process.exit(1);
  }
  writeFileSync(outPath, renderPosterSvg(m, v, { noteProperty: flag("note-property"), starProperty: flag("star-property"), starLabel: flag("star-label"), marks: args.includes("--marks") }));
  console.log(`wrote ${outPath}`);
}
