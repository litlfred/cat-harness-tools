/**
 * The ⓘ task panel on a process page: an info marker on every task of the
 * drawn diagram, opening a small UML-style object view of what the task
 * requires and who performs it.
 *
 * @module scripts/lib/task-panel
 *
 * Owner, 2026-10-16 (thread "BPMN lane, role and skill modelling"; the
 * implementation spec's §6): *"Don't draw separate UML diagrams per process.
 * Instead, an info icon on each task opens a small UML object view: task →
 * skill → methodology, and lane Role → skills. Every skill, methodology and
 * role in the panel is a link to its own page. It loads only when opened."*
 *
 * ## What is drawn, and from what
 *
 *   «Task» name ──requires──▶ «Skill» s ──uses-methodology──▶ «Methodology» m
 *   «Lane» name ──names────▶ «Role» r ──hasSkill──▶ «Skill» …
 *
 * Every arrow is read, none inferred: `requires` from the task's
 * `<bootstrap.processes:skill ref>`, `uses-methodology` from the skill's own
 * front matter (cat-harness#325; absent → nothing shown, never "none"),
 * `names` from the lane's `partitionElementRef` (or the legacy ref), and
 * `hasSkill` from `roles.json`, closed over `inherits` with the ancestor that
 * supplied each.
 *
 * ## Thin and dynamic
 *
 * The page carries only the markers — one `<button>` per task, positioned in
 * percent of the diagram so they track the image at every width — and a small
 * inline client. The object view's DATA is a sidecar, `<stem>.tasks.json`,
 * fetched the first time any marker is opened and not before. A reader who
 * never clicks downloads nothing extra.
 *
 * ## Where the markers sit
 *
 * On the top-right corner of each task's shape, from the diagram's own BPMN
 * DI bounds (the layout the SVG was drawn from — bpmn-js does not lay out, it
 * renders the DI) mapped through the rendered SVG's `viewBox`. A task with no
 * DI shape, or a diagram with no SVG, gets no marker rather than one placed by
 * guesswork; the step table below the diagram still lists it.
 *
 * ## Links
 *
 * - Skill → its instruction page, `reference/skill-instructions/<s>.html`,
 *   when one is generated (the same test `processPage` already applies); a
 *   skill without one stays code rather than a link that 404s (bean `qgjh`).
 * - Methodology → its own page under the methodologies viewer,
 *   `<route>/<instance>/<name>/` — the URL pattern of cat-harness-tools #422
 *   (`nodePageDir`, owner 2026-10-16: *"use same URL pattern as other
 *   viewers"*), built here from the same declared route so it resolves once
 *   #422 lands.
 * - Role → its row on the auto-docs Roles index, the one page a Role has
 *   today: `<auto-docs route>/index/roles/index.html#<row id>`, the row id
 *   spelled exactly as `gen-auto-docs.ts` spells it.
 */
import { BpmnModdle } from "bpmn-moddle";

/** A rectangle in diagram coordinates. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One marker: the task it opens, and where it sits, in percent of the drawn diagram. */
export interface Marker {
  id: string;
  name: string;
  left: number;
  top: number;
}

/** A linkable name in the panel. `href` absent → shown as code, never as a guessed link. */
export interface PanelLink {
  name: string;
  href?: string;
}

/** One skill as the panel shows it, with the methodologies it says it uses. */
export interface PanelSkill extends PanelLink {
  /** `uses-methodology`, when the skill's front matter says it. Absent → not said. */
  methodologies?: PanelLink[];
}

/** One task's object view. */
export interface PanelTask {
  id: string;
  name: string;
  type: string;
  lane?: string;
  skills: PanelSkill[];
  /** For a call activity: the process it descends into. */
  calls?: PanelLink;
  /** The Role the lane names, with its skills — absent when the lane names none. */
  role?: PanelLink & { title?: string; skills: (PanelLink & { via?: string })[] };
  /** Why there is no role: the lane's binding verdict, when it is not `bound`. */
  binding?: string;
}

/** The sidecar a process page fetches on first open. */
export interface PanelData {
  $schema: "process-task-panel/v1";
  process: string;
  tasks: Record<string, PanelTask>;
}

/** The SVG's `viewBox`, or undefined when it carries none. */
export function svgViewBox(svg: string): Box | undefined {
  const m = /<svg\b[^>]*\bviewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  if (!m) return undefined;
  const [x, y, width, height] = m.slice(1, 5).map(Number) as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/**
 * Element id → its DI bounds, from the FIRST diagram's plane — the one the
 * renderer draws (`bpmn-render.ts`: the top-level plane is rendered, the rest
 * are counted). Parse warnings are ignored here on purpose: placement needs
 * only shapes, and whether the diagram is well-formed is `loadProcessModel`'s
 * question, already asked for the same file.
 */
export async function diagramBounds(xml: string): Promise<Map<string, Box>> {
  const out = new Map<string, Box>();
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  type Shape = { bpmnElement?: { id?: string }; bounds?: Box };
  const defs = rootElement as { diagrams?: { plane?: { planeElement?: Shape[] } }[] };
  for (const s of defs.diagrams?.[0]?.plane?.planeElement ?? []) {
    const id = s.bpmnElement?.id;
    if (id && s.bounds) out.set(id, { x: s.bounds.x, y: s.bounds.y, width: s.bounds.width, height: s.bounds.height });
  }
  return out;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Markers for `tasks`, on each shape's top-right corner. A task with no shape gets none. */
export function markersFor(
  tasks: readonly { id: string; name: string }[],
  bounds: ReadonlyMap<string, Box>,
  viewBox: Box,
): Marker[] {
  const out: Marker[] = [];
  for (const t of tasks) {
    const b = bounds.get(t.id);
    if (!b) continue;
    const left = ((b.x + b.width - viewBox.x) / viewBox.width) * 100;
    const top = ((b.y - viewBox.y) / viewBox.height) * 100;
    if (left < 0 || left > 100 || top < 0 || top > 100) continue;
    out.push({ id: t.id, name: t.name, left: round(left), top: round(top) });
  }
  return out;
}

/** The row id `gen-auto-docs.ts` gives an item — `a-<path, sanitised>` — so a link lands on the row. */
export function autoDocsRowId(path: string): string {
  return `a-${path.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

/** The methodology page directory, as #422's `nodePageDir` spells it. */
export function methodologyPageDir(instance: string, name: string): string {
  return `${encodeURIComponent(instance)}/${encodeURIComponent(name)}/`;
}

const escAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The client: opens the panel beside a marker, fetching the sidecar once.
 * Plain DOM, no library, and every value is inserted as TEXT (`textContent`),
 * never as markup — the names come from authored diagrams and front matter.
 * No double braces anywhere: the page is Liquid-processed (it sits inside the
 * page's raw block as well, belt and braces).
 */
export const PANEL_SCRIPT = `(function () {
  Array.prototype.forEach.call(document.querySelectorAll(".pt-diagram:not([data-pt-ready])"), init);
  function init(root) {
  root.setAttribute("data-pt-ready", "");
  var panel = root.querySelector(".pt-panel"), data = null, pending = null, open = null;
  function load() {
    if (data) return Promise.resolve(data);
    if (!pending) pending = fetch(root.getAttribute("data-panel")).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return r.json();
    }).then(function (j) { data = j; return j; });
    return pending;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function link(l, cls) {
    var e = el(l.href ? "a" : "code", cls, l.name);
    if (l.href) e.href = l.href; else e.title = "no page for this one";
    return e;
  }
  function obj(stereo, name, kind) {
    var box = el("div", "pt-obj pt-" + kind), head = el("div", "pt-head");
    head.appendChild(el("span", "pt-st", "\\u00ab" + stereo + "\\u00bb"));
    head.appendChild(typeof name === "string" ? el("b", null, name) : name);
    box.appendChild(head);
    return box;
  }
  function edge(label) { return el("div", "pt-edge", "\\u2502 " + label + " \\u25bc"); }
  function render(t) {
    panel.textContent = "";
    var close = el("button", "pt-close", "\\u00d7"); close.type = "button"; close.setAttribute("aria-label", "Close");
    close.onclick = function () { hide(); }; panel.appendChild(close);
    var task = obj(t.type.replace(/^bpmn:/, ""), t.name, "task");
    task.appendChild(el("div", "pt-attr", "id = " + t.id));
    if (t.lane) task.appendChild(el("div", "pt-attr", "lane = " + t.lane));
    panel.appendChild(task);
    if (t.calls) { panel.appendChild(edge("calls")); panel.appendChild(obj("Process", link(t.calls), "proc")); }
    t.skills.forEach(function (s) {
      panel.appendChild(edge("requires"));
      var sk = obj("Skill", link(s), "skill");
      (s.methodologies || []).forEach(function (m) {
        var row = el("div", "pt-attr"); row.appendChild(el("span", "pt-st", "uses-methodology \\u2192 "));
        row.appendChild(link(m)); sk.appendChild(row);
      });
      panel.appendChild(sk);
    });
    if (!t.skills.length && !t.calls) panel.appendChild(el("div", "pt-none", "This task names no skill."));
    if (t.role) {
      panel.appendChild(edge("lane names"));
      var role = obj("Role", link(t.role), "role");
      if (t.role.title) role.appendChild(el("div", "pt-attr", "title = " + t.role.title));
      var list = el("div", "pt-attr"); list.appendChild(el("span", "pt-st", "hasSkill: "));
      if (!t.role.skills.length) list.appendChild(el("i", null, "none listed"));
      t.role.skills.forEach(function (s, i) {
        if (i) list.appendChild(document.createTextNode(", "));
        list.appendChild(link(s));
        if (s.via) list.appendChild(el("span", "pt-via", " (via " + s.via + ")"));
      });
      role.appendChild(list); panel.appendChild(role);
    } else if (t.binding) {
      panel.appendChild(el("div", "pt-none", "Lane role: " + t.binding + "."));
    }
  }
  function hide() { panel.hidden = true; if (open) open.setAttribute("aria-expanded", "false"); open = null; }
  root.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".pt-mark");
    if (!b) return;
    if (open === b) { hide(); return; }
    if (open) open.setAttribute("aria-expanded", "false");
    open = b; b.setAttribute("aria-expanded", "true");
    panel.style.left = b.style.left; panel.style.top = b.style.top;
    panel.hidden = false; panel.textContent = "Loading\\u2026";
    load().then(function (j) {
      var t = j.tasks[b.getAttribute("data-task")];
      if (open === b) { if (t) render(t); else panel.textContent = "No details for this task."; }
    }).catch(function (e) { if (open === b) panel.textContent = "Could not load task details: " + e.message; });
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && open) hide(); });
  }
})();`;

/** Styles, scoped under `.pt-diagram`. Colours follow the page's own text colour where they can. */
export const PANEL_CSS = [
  ".pt-diagram{position:relative;width:100%}",
  ".pt-diagram>img{display:block;width:100%;height:auto}",
  ".pt-mark{position:absolute;transform:translate(-50%,-50%);width:1.35em;height:1.35em;padding:0;border-radius:50%;" +
    "border:1px solid #1f6feb;background:#fff;color:#1f6feb;font:bold 0.8em/1 sans-serif;cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,.25)}",
  ".pt-mark:hover,.pt-mark[aria-expanded=true]{background:#1f6feb;color:#fff}",
  ".pt-mark:focus-visible{outline:2px solid #1f6feb;outline-offset:2px}",
  ".pt-panel{position:absolute;z-index:5;margin:0.9em 0 0 -0.6em;max-width:min(26em,90vw);min-width:14em;padding:0.6em 0.7em;" +
    "background:#fff;color:#1b1f24;border:1px solid #8c959f;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:0.85em;line-height:1.35}",
  ".pt-close{position:absolute;top:0.2em;right:0.35em;border:0;background:none;font-size:1.2em;cursor:pointer;color:inherit}",
  ".pt-obj{border:1px solid #57606a;border-radius:3px;margin:0.15em 0}",
  ".pt-head{border-bottom:1px solid #57606a;padding:0.15em 0.45em;background:#f6f8fa;text-decoration:underline}",
  ".pt-head .pt-st{text-decoration:none;display:inline-block;margin-right:0.35em}",
  ".pt-attr{padding:0.1em 0.45em}",
  ".pt-st,.pt-via{color:#57606a;font-size:0.9em}",
  ".pt-edge{color:#57606a;font-size:0.85em;padding-left:1em}",
  ".pt-role .pt-head{background:#fff8c5}.pt-skill .pt-head{background:#ddf4ff}.pt-task .pt-head{background:#f6f8fa}",
  ".pt-none{color:#57606a;font-style:italic;margin-top:0.3em}",
].join("");

/**
 * The diagram block for a process page: the image, a marker per task, the
 * (empty, hidden) panel, and the client. `panelHref` is the sidecar's URL
 * relative to the page.
 */
export function diagramBlock(opts: { img: string; alt: string; markers: readonly Marker[]; panelHref: string }): string[] {
  if (opts.markers.length === 0) {
    return [`<img src="${escAttr(opts.img)}" alt="${escAttr(opts.alt)}" style="max-width:100%">`];
  }
  const L: string[] = [];
  L.push(`<style>${PANEL_CSS}</style>`);
  L.push(`<div class="pt-diagram" data-panel="${escAttr(opts.panelHref)}">`);
  L.push(`<img src="${escAttr(opts.img)}" alt="${escAttr(opts.alt)}">`);
  for (const m of opts.markers) {
    L.push(
      `<button type="button" class="pt-mark" data-task="${escAttr(m.id)}" style="left:${m.left}%;top:${m.top}%" ` +
        `aria-expanded="false" aria-label="About step: ${escAttr(m.name)}" title="About: ${escAttr(m.name)}">i</button>`,
    );
  }
  L.push(`<div class="pt-panel" role="dialog" aria-label="Task details" hidden></div>`);
  L.push(`</div>`);
  L.push(`<script>${PANEL_SCRIPT}</script>`);
  return L;
}
