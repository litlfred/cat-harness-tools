/**
 * Is a BPMN diagram readable at 100%, without zooming? And is it tangled?
 *
 * Owner, 2026-10-31, on the content-change-review page: *"make the font a bit
 * bigger, the spacing a bit more compact so dont need to zoom as much"*, then
 * *"QA on too wide/too tall bpms?"*, then *"bpmn detangle skill including swap
 * lanes"*, *"add as QA and author check"*.
 *
 * ## The budget is arithmetic, not taste
 *
 * The renderer draws text at 14px in diagram units (bootstrap-tools
 * `TEXT_STYLE`). A page shows a diagram at most as wide as its band: about
 * 1200 CSS px once the nav rail is subtracted on a 1440px screen. A diagram
 * `W` units wide is shown at scale `min(1, 1200 / W)`, so its text reads at
 * `14 × 1200 / W` px. Keeping that at 12px or more gives `W ≤ 1400`.
 * Height: about 760px of a 900px viewport is left once the page's header and
 * the figure toolbar are drawn, so `H ≤ 760 × 14 / 12 ≈ 900`. A taller
 * diagram still reads, but needs scrolling to see its decisions together.
 * Change {@link FIT_WIDTH} and `TEXT_STYLE` together.
 *
 * ## What is checked
 *
 * | criterion | from |
 * |---|---|
 * | `diagram-too-wide` · `diagram-too-tall` | the DI extent, against the budget above |
 * | `label-overlap` | two drawn labels intersect (e.g. "Satisfied with changes?" over "No") |
 * | `label-on-edge` | a label sits on a flow that is not its own |
 * | `label-on-shape` | a label covers a task, event or gateway that is not its own |
 * | `edge-crossing` | two flows cross |
 * | `lane-order` | another order of the lanes makes the cross-lane flows shorter |
 *
 * Label positions come from where bpmn-js DREW them (`DrawnLayout`), because
 * a file with no `BPMNLabel` bounds leaves the placement to bpmn-js; without a
 * drawn layout, labels with DI bounds are checked and the rest are not.
 *
 * Text-level parsing on purpose, like `bpmn-render.ts`'s plane cut: rewriting
 * DI through a parse/serialise round trip risks the namespace prefixes.
 *
 * @module cat-harness-tools/src/workflow/diagram-fit
 */

/** Widest a diagram may be drawn and still read at 12px in a 1200px band. */
export const FIT_WIDTH = 1400;
/** Tallest a diagram may be drawn and still be seen whole on one screen. */
export const FIT_HEIGHT = 900;

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Finding {
  where: string;
  detail: string;
}

/** The DI of one plane: shapes (with any label bounds), edges and lanes. */
export interface DiLayout {
  shapes: Map<string, Box & { label?: Box }>;
  edges: Map<string, { points: Pt[]; label?: Box }>;
  /** Lane id → bounds, in the order the DI lists them. */
  lanes: Map<string, Box>;
  /** Participant (pool) id → bounds. */
  pools: Map<string, Box>;
  /** Sequence/message flow id → source and target ids. */
  flows: Map<string, { source: string; target: string; name?: string }>;
  /** Element id → its name, for messages. */
  names: Map<string, string>;
}

/** Where the renderer drew the external labels and the flows (bootstrap-tools `DrawnLayout`). */
export interface DrawnLabels {
  labels: (Box & { id: string; text: string })[];
  edges?: { id: string; points: Pt[] }[];
}

/** Width of the name strip bpmn-js draws down the left of a horizontal pool or lane. */
const HEADER = 30;

const num = (s: string | undefined): number => Number(s ?? "NaN");
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

function boundsIn(body: string): Box | undefined {
  const b = /<(?:\w+:)?Bounds\b([^>]*)\/?>/.exec(body);
  if (!b) return undefined;
  const box = { x: num(attr(b[1]!, "x")), y: num(attr(b[1]!, "y")), width: num(attr(b[1]!, "width")), height: num(attr(b[1]!, "height")) };
  return Object.values(box).every(Number.isFinite) ? box : undefined;
}

/** The first diagram plane only: the one the renderer draws (`bpmn-render.ts`). */
function firstPlane(xml: string): string {
  const m = /<(?:\w+:)?BPMNPlane\b[\s\S]*?<\/(?:\w+:)?BPMNPlane>/.exec(xml);
  return m ? m[0] : "";
}

/** Read the DI and the flow/lane/pool facts the checks need. */
export function readDi(xml: string): DiLayout {
  const plane = firstPlane(xml);
  const out: DiLayout = { shapes: new Map(), edges: new Map(), lanes: new Map(), pools: new Map(), flows: new Map(), names: new Map() };
  const laneIds = new Set([...xml.matchAll(/<(?:\w+:)?lane\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]!));
  const poolIds = new Set([...xml.matchAll(/<(?:\w+:)?participant\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]!));
  for (const m of xml.matchAll(/<(?:\w+:)?(sequenceFlow|messageFlow)\b([^>]*)>/g)) {
    const id = attr(m[2]!, "id"), source = attr(m[2]!, "sourceRef"), target = attr(m[2]!, "targetRef");
    if (id && source && target) out.flows.set(id, { source, target, name: attr(m[2]!, "name") || undefined });
  }
  for (const m of xml.matchAll(/<(?:\w+:)?\w+\b[^>]*\sid="([^"]+)"[^>]*\sname="([^"]*)"/g)) out.names.set(m[1]!, m[2]!);
  for (const m of plane.matchAll(/<(?:\w+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?BPMNShape>/g)) {
    const id = attr(m[1]!, "bpmnElement");
    const [own, labelPart] = m[2]!.split(/<(?:\w+:)?BPMNLabel\b/);
    const b = boundsIn(own!);
    if (!id || !b) continue;
    const label = labelPart ? boundsIn(labelPart) : undefined;
    if (laneIds.has(id)) out.lanes.set(id, b);
    else if (poolIds.has(id)) out.pools.set(id, b);
    else out.shapes.set(id, label ? { ...b, label } : b);
  }
  for (const m of plane.matchAll(/<(?:\w+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?BPMNEdge>/g)) {
    const id = attr(m[1]!, "bpmnElement");
    if (!id) continue;
    const [own, labelPart] = m[2]!.split(/<(?:\w+:)?BPMNLabel\b/);
    const points = [...own!.matchAll(/<(?:\w+:)?waypoint\b([^>]*)\/?>/g)].map((w) => ({ x: num(attr(w[1]!, "x")), y: num(attr(w[1]!, "y")) }));
    const label = labelPart ? boundsIn(labelPart) : undefined;
    out.edges.set(id, label ? { points, label } : { points });
  }
  return out;
}

/** The smallest box holding every shape, lane and pool. */
export function extent(di: DiLayout): Box | undefined {
  const all = [...di.shapes.values(), ...di.lanes.values(), ...di.pools.values()];
  if (all.length === 0) return undefined;
  const x0 = Math.min(...all.map((b) => b.x)), y0 = Math.min(...all.map((b) => b.y));
  const x1 = Math.max(...all.map((b) => b.x + b.width)), y1 = Math.max(...all.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ── Geometry ─────────────────────────────────────────────────────────────

/** Strict interior overlap, after shrinking each box by `inset` (anti-alias slack). */
export function boxesOverlap(a: Box, b: Box, inset = 1): boolean {
  return a.x + inset < b.x + b.width - inset && b.x + inset < a.x + a.width - inset &&
    a.y + inset < b.y + b.height - inset && b.y + inset < a.y + a.height - inset;
}

/** Does segment p→q pass through the interior of `b`? (Liang–Barsky clip.) */
export function segmentHitsBox(p: Pt, q: Pt, b: Box, inset = 1): boolean {
  const x0 = b.x + inset, x1 = b.x + b.width - inset, y0 = b.y + inset, y1 = b.y + b.height - inset;
  if (x0 >= x1 || y0 >= y1) return false;
  const dx = q.x - p.x, dy = q.y - p.y;
  let t0 = 0, t1 = 1;
  for (const [pk, qk] of [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]] as [number, number][]) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const r = qk / pk;
      if (pk < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return t1 > t0;
}

const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Do two segments cross at a single interior point? Touching ends and collinear runs do not count. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const segments = (pts: Pt[]): [Pt, Pt][] => pts.slice(1).map((q, i) => [pts[i]!, q]);

/**
 * Every pair of flows that cross, as `[a, b]` ids. Two flows meeting at a
 * shared node are not a crossing (`segmentsCross` ignores touching ends), but
 * two flows of one node that cross on the way are: that is the tangle.
 */
export function crossings(di: DiLayout): [string, string][] {
  const ids = [...di.edges.keys()];
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const sa = segments(di.edges.get(ids[i]!)!.points), sb = segments(di.edges.get(ids[j]!)!.points);
      if (sa.some(([p, q]) => sb.some(([r, s]) => segmentsCross(p, q, r, s)))) out.push([ids[i]!, ids[j]!]);
    }
  }
  return out;
}

// ── Lane order ───────────────────────────────────────────────────────────

/** Which lane each shape sits in, by its centre. */
export function laneOf(di: DiLayout): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, b] of di.shapes) {
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    for (const [lane, l] of di.lanes) {
      if (cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height) out.set(id, lane);
    }
  }
  return out;
}

/** Lanes top to bottom (horizontal pools). Nested lanes are not reordered: only leaf lanes of one pool. */
export function laneOrder(di: DiLayout): string[] {
  return [...di.lanes].sort((a, b) => a[1].y - b[1].y).map(([id]) => id);
}

/**
 * The cost of an order: every flow between two lanes costs the number of lane
 * boundaries it crosses. A flow crossing a lane it does not stop in is the
 * long detour the owner pointed at (Stage → Review crossing two lanes).
 */
export function laneOrderCost(di: DiLayout, order: readonly string[]): number {
  const at = new Map(order.map((l, i) => [l, i]));
  const lane = laneOf(di);
  let cost = 0;
  for (const f of di.flows.values()) {
    const a = at.get(lane.get(f.source) ?? ""), b = at.get(lane.get(f.target) ?? "");
    if (a !== undefined && b !== undefined) cost += Math.abs(a - b);
  }
  return cost;
}

function* permutations<T>(xs: readonly T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i]!, ...rest];
  }
}

/** Past this many lanes the search is not exhaustive (8! = 40320 is still cheap; 9! is not worth it). */
const EXHAUSTIVE_LANES = 8;

/**
 * The cheapest lane order. Ties keep the current order, so a diagram already
 * at its best is never churned. Lanes that do not all share one pool, or more
 * lanes than {@link EXHAUSTIVE_LANES}, return the current order.
 */
export function bestLaneOrder(di: DiLayout): { order: string[]; cost: number; current: number } {
  const order = laneOrder(di);
  const current = laneOrderCost(di, order);
  if (order.length < 2 || order.length > EXHAUSTIVE_LANES || nested(di)) return { order, cost: current, current };
  let best = { order, cost: current };
  for (const p of permutations(order)) {
    const c = laneOrderCost(di, p);
    if (c < best.cost) best = { order: p, cost: c };
  }
  return { ...best, current };
}

/** True when a lane sits inside another, or the lanes span different pools. */
function nested(di: DiLayout): boolean {
  const ls = [...di.lanes.values()];
  if (ls.some((a) => ls.some((b) => a !== b && a.y >= b.y && a.y + a.height <= b.y + b.height && a.height < b.height))) return true;
  const xs = new Set(ls.map((l) => `${l.x}/${l.width}`));
  return xs.size > 1;
}

// ── Rewriting DI: swap lanes ─────────────────────────────────────────────

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * Move every lane to its place in `order`, keeping each lane's height. Shapes
 * and same-lane flows move with their lane; a flow between two lanes is
 * re-routed as one elbow (out of the source's top or bottom, along to the
 * target's side), since its old bends were drawn for the old order. A
 * cross-lane flow's label bounds are dropped so bpmn-js places it beside the
 * new route rather than where the old route was.
 */
export function applyLaneOrder(xml: string, order: readonly string[]): string {
  const di = readDi(xml);
  const current = laneOrder(di);
  if (order.join() === current.join()) return xml;
  const top = Math.min(...current.map((l) => di.lanes.get(l)!.y));
  const dy = new Map<string, number>();
  let y = top;
  for (const l of order) {
    const b = di.lanes.get(l)!;
    dy.set(l, y - b.y);
    y += b.height;
  }
  const lane = laneOf(di);
  const moved = (id: string): Box | undefined => {
    const b = di.shapes.get(id);
    if (!b) return undefined;
    return { ...b, y: b.y + (dy.get(lane.get(id) ?? "") ?? 0) };
  };

  let plane = firstPlane(xml);
  const original = plane;
  plane = plane.replace(/(<(?:\w+:)?BPMNShape\b([^>]*)>)([\s\S]*?)(<\/(?:\w+:)?BPMNShape>)/g, (all, open: string, attrs: string, body: string, close: string) => {
    const id = attr(attrs, "bpmnElement") ?? "";
    const d = di.lanes.has(id) ? dy.get(id) : dy.get(lane.get(id) ?? "");
    if (!d) return all;
    return open + body.replace(/(<(?:\w+:)?Bounds\b[^>]*\sy=")([-\d.]+)(")/g, (_m, a: string, v: string, b: string) => a + fmt(Number(v) + d) + b) + close;
  });
  plane = plane.replace(/(<(?:\w+:)?BPMNEdge\b([^>]*)>)([\s\S]*?)(<\/(?:\w+:)?BPMNEdge>)/g, (all, open: string, attrs: string, body: string, close: string) => {
    const id = attr(attrs, "bpmnElement") ?? "";
    const f = di.flows.get(id);
    if (!f) return all;
    const ls = lane.get(f.source), lt = lane.get(f.target);
    if (ls === lt) {
      const d = dy.get(ls ?? "") ?? 0;
      if (!d) return all;
      return open + body.replace(/(\sy=")([-\d.]+)(")/g, (_m, a: string, v: string, b: string) => a + fmt(Number(v) + d) + b) + close;
    }
    const s = moved(f.source), t = moved(f.target);
    if (!s || !t) return all;
    const indent = /\n(\s*)<(?:\w+:)?waypoint/.exec(body)?.[1] ?? "        ";
    const prefix = /<(\w+:)?waypoint/.exec(body)?.[1] ?? "di:";
    const pts = elbow(s, t);
    const wps = pts.map((p) => `\n${indent}<${prefix}waypoint x="${fmt(p.x)}" y="${fmt(p.y)}" />`).join("");
    const closeIndent = /\n(\s*)$/.exec(body)?.[1] ?? "      ";
    return `${open}${wps}\n${closeIndent}${close}`;
  });
  return xml.replace(original, plane);
}

/** One orthogonal elbow from box `s` to box `t` in another lane. */
export function elbow(s: Box, t: Box): Pt[] {
  const scx = s.x + s.width / 2, tcx = t.x + t.width / 2, tcy = t.y + t.height / 2;
  const down = t.y > s.y;
  const start = { x: scx, y: down ? s.y + s.height : s.y };
  if (Math.abs(scx - tcx) < 1) return [start, { x: scx, y: down ? t.y : t.y + t.height }];
  const side = tcx > scx ? t.x : t.x + t.width;
  return [start, { x: scx, y: tcy }, { x: side, y: tcy }];
}

// ── The checks ───────────────────────────────────────────────────────────

/** Label boxes: drawn ones when given, else the DI's own `BPMNLabel` bounds. */
function labelBoxes(di: DiLayout, drawn?: DrawnLabels): { id: string; text: string; box: Box }[] {
  if (drawn) return drawn.labels.map((l) => ({ id: l.id, text: l.text, box: l }));
  const out: { id: string; text: string; box: Box }[] = [];
  for (const [id, s] of di.shapes) if (s.label) out.push({ id, text: di.names.get(id) ?? id, box: s.label });
  for (const [id, e] of di.edges) if (e.label) out.push({ id, text: di.flows.get(id)?.name ?? id, box: e.label });
  return out;
}

const q = (s: string): string => `"${s.replace(/\s+/g, " ").trim()}"`;

/** Every readable-at-100% and detangle criterion for one diagram, findings keyed by criterion id. */
export function diagramFit(xml: string, drawn?: DrawnLabels): Record<string, Finding[]> {
  const di = readDi(xml);
  const out: Record<string, Finding[]> = {
    "diagram-too-wide": [],
    "diagram-too-tall": [],
    "label-overlap": [],
    "label-on-edge": [],
    "label-on-shape": [],
    "edge-crossing": [],
    "lane-order": [],
  };
  const ext = extent(di);
  if (ext && ext.width > FIT_WIDTH) {
    out["diagram-too-wide"]!.push({
      where: "diagram",
      detail: `${Math.round(ext.width)} wide, budget ${FIT_WIDTH}: text shows at ${(14 * 1200 / ext.width).toFixed(1)}px in a 1200px band. ` +
        `Close the gaps between columns, stack steps of different lanes in one column, or split by phase.`,
    });
  }
  if (ext && ext.height > FIT_HEIGHT) {
    out["diagram-too-tall"]!.push({
      where: "diagram",
      detail: `${Math.round(ext.height)} tall, budget ${FIT_HEIGHT}: a reader scrolls to see it whole. Shrink lanes to their content, or split by phase.`,
    });
  }

  const labels = labelBoxes(di, drawn);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (boxesOverlap(labels[i]!.box, labels[j]!.box)) {
        out["label-overlap"]!.push({
          where: `${labels[i]!.id}+${labels[j]!.id}`,
          detail: `label ${q(labels[i]!.text)} overlaps ${q(labels[j]!.text)}. Give one a BPMNLabel position clear of the other (a gateway's question above it, its answers beside their flows).`,
        });
      }
    }
  }
  const edgePts = drawn?.edges ? new Map(drawn.edges.map((e) => [e.id, e.points])) : new Map([...di.edges].map(([id, e]) => [id, e.points]));
  for (const l of labels) {
    for (const [eid, pts] of edgePts) {
      if (eid === l.id) continue;
      if (segments(pts).some(([p, r]) => segmentHitsBox(p, r, l.box, 2))) {
        out["label-on-edge"]!.push({ where: `${l.id}/${eid}`, detail: `label ${q(l.text)} sits on flow ${eid}. Move the label off the line.` });
      }
    }
    // The name strip down the left of a horizontal pool or lane is drawn text too.
    for (const [hid, h] of [...di.pools, ...di.lanes]) {
      if (boxesOverlap(l.box, { x: h.x, y: h.y, width: HEADER, height: h.height })) {
        out["label-on-shape"]!.push({ where: `${l.id}/${hid}`, detail: `label ${q(l.text)} runs into the name of ${q(di.names.get(hid) ?? hid)}.` });
      }
    }
    // Its OWN shape too: a gateway's question wrapped onto the diamond is the
    // collision the owner circled, half of it.
    for (const [sid, s] of di.shapes) {
      if (boxesOverlap(l.box, s)) {
        out["label-on-shape"]!.push({ where: `${l.id}/${sid}`, detail: `label ${q(l.text)} covers ${q(di.names.get(sid) ?? sid)}.` });
      }
    }
  }

  for (const [a, b] of crossings(di)) {
    out["edge-crossing"]!.push({ where: `${a}×${b}`, detail: `flows ${a} and ${b} cross. Re-route one around the other, move a step, or swap lanes (\`bpmn:detangle\`).` });
  }
  const best = bestLaneOrder(di);
  if (best.cost < best.current) {
    const name = (id: string): string => di.names.get(id) ?? id;
    out["lane-order"]!.push({
      where: "lanes",
      detail: `flows cross ${best.current} lane boundaries; ordering the lanes ${best.order.map(name).join(" / ")} makes it ${best.cost}. ` +
        `Run \`bun run cat bpmn:detangle <file> --write\`.`,
    });
  }
  return out;
}
