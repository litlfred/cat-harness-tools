/**
 * Beans by process: which beans sit at which BPMN step, across every workflow
 * instance of a bean store, and the same view for one bean.
 *
 * @module scripts/processed-beans
 * @covers none — it JOINS committed workflow instances with the store's beans
 *   and the diagrams they run; the state visualiser renders the two pages
 *
 * Owner, 2026-11-02 (cat-harness-tools#1413, bean `folio-assistant-pbv1`):
 * *"visualizer that shows all the beans by process ... visualize the BPMN with
 * marks to show beans are at which process. ability to filter, query, search
 * for last updated to find stalled ... similar but for single bean."*
 *
 * ## Two pages, one projection
 *
 * `workflow-view.ts` draws one page per INSTANCE. This adds the two views it
 * lacks: `processed-beans/` (every process with an instance, each diagram
 * marked with how many beans wait at each step) and `processed-bean/?bean=<id>`
 * (one bean through every instance that names it). Both read one projection,
 * {@link processedBeansRows}, embedded in the page, so the filters run in the
 * browser and the URL query keeps them (`?q=&process=&stale=30`).
 *
 * ## Nothing new about "stuck"
 *
 * The stuck kinds are `stuckStatesOf`'s. This adds two the per-instance page
 * shows in prose and the table needs as words: `bean-missing` (the instance
 * names a bean the store does not hold) and `node-missing` (a token sits on a
 * step the current diagram no longer has, so no marker can be drawn for it).
 *
 * ## Lazy drawings
 *
 * The diagrams are the SVGs `render:bpmn` already publishes. A page fetches
 * each one only when its card scrolls near the viewport, so a store with many
 * processes costs one request per diagram the reader actually looks at.
 */
import type { BeanNode } from "./beans.ts";
import type { InstanceState } from "../src/workflow/instance.js";
import { lastMoved, stuckStatesOf, STUCK_AFTER_DAYS, dayOf } from "./workflow-view.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A bean an instance names, as the page shows it. */
export interface ProcessedBean {
  id: string;
  /** False when the store does not hold this bean (deleted, or another store's). */
  found: boolean;
  title?: string;
  status?: string;
  updatedAt?: string;
}

/** One instance, joined with its beans and its diagram. */
export interface ProcessedRow {
  instance: string;
  /** The per-instance page, relative to the page embedding this row. */
  href?: string;
  process: string;
  source: string;
  /** The published SVG, relative to the page, when one is published. */
  drawing?: string;
  status: string;
  /** Completed, or every token rests on an end event, or no token at all and completed. */
  finished: boolean;
  tokens: string[];
  /** Steps in the history, other than where the tokens are. */
  done: string[];
  lastMoved?: string;
  /** Whole days between `lastMoved` and the build's reference time. */
  ageDays?: number;
  beans: ProcessedBean[];
  /** Stuck kinds, by word: `stuckStatesOf`'s plus `bean-missing` and `node-missing`. */
  stuck: string[];
  /** Tokens on steps the current diagram does not have. */
  missingNodes: string[];
}

/** What {@link processedBeansRows} reads. */
export interface ProcessedBeansInput {
  instances: readonly InstanceState[];
  beans: readonly BeanNode[];
  now: Date;
  /** Each instance's diagram node ids and end events, by instance id, when its diagram was found. */
  diagrams: ReadonlyMap<string, { nodes: ReadonlySet<string>; ends: ReadonlySet<string> }>;
  drawingFor: (source: string) => string | undefined;
  instanceHref: (id: string) => string | undefined;
}

/** The projection both pages embed. Pure: the same input gives the same rows. */
export function processedBeansRows(input: ProcessedBeansInput): ProcessedRow[] {
  const byId = new Map(input.beans.map((b) => [b.id, b]));
  return input.instances
    .map((s): ProcessedRow => {
      const diagram = input.diagrams.get(s.id);
      const ends = diagram?.ends ?? new Set<string>();
      const atEnd = s.tokens.length > 0 && s.tokens.every((t) => ends.has(t));
      const finished = s.status === "completed" || atEnd;
      const ids = [...new Set([...(s.bean ? [s.bean] : []), ...(s.carriedBeans ?? [])])];
      const beans = ids.map((id): ProcessedBean => {
        const b = byId.get(id);
        return b ? { id, found: true, title: b.title, status: b.status, updatedAt: b.updatedAt } : { id, found: false };
      });
      const missingNodes = diagram ? s.tokens.filter((t) => !diagram.nodes.has(t)) : [];
      const stuck = [...new Set(stuckStatesOf(s, input.beans, input.now, ends).map((x) => x.kind as string))];
      if (!finished && beans.some((b) => !b.found)) stuck.push("bean-missing");
      if (missingNodes.length > 0) stuck.push("node-missing");
      const moved = lastMoved(s);
      const movedMs = moved ? Date.parse(moved) : Number.NaN;
      const tokens = new Set(s.tokens);
      const done = [...new Set((s.history ?? []).map((h) => h.node).filter((n): n is string => typeof n === "string" && !tokens.has(n)))];
      const drawing = s.source ? input.drawingFor(s.source) : undefined;
      const href = input.instanceHref(s.id);
      return {
        instance: s.id,
        ...(href ? { href } : {}),
        process: s.processId,
        source: s.source ?? "",
        ...(drawing ? { drawing } : {}),
        status: s.status ?? "",
        finished,
        tokens: [...s.tokens],
        done,
        ...(moved ? { lastMoved: moved } : {}),
        ...(Number.isNaN(movedMs) ? {} : { ageDays: Math.floor((input.now.getTime() - movedMs) / DAY_MS) }),
        beans,
        stuck,
        missingNodes,
      };
    })
    .sort((a, b) => (a.lastMoved ?? "").localeCompare(b.lastMoved ?? "") || a.instance.localeCompare(b.instance));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON safe inside a `<script>` element. */
function scriptJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

/** The pages' own styles. Ink follows the theme; a state is told by its word, never by hue alone. */
export const PB_CSS = `.pb-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.6rem; margin: 0 0 1rem; }
.pb-filters label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; font-weight: 600; }
.pb-filters input, .pb-filters select { font: inherit; font-size: 0.95rem; padding: 0.35rem 0.45rem; min-width: 0; }
.pb-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1rem; padding: 0; list-style: none; }
.pb-chips li::before { content: none; }
.pb-chip { border: 1px solid rgba(127,127,127,0.5); border-radius: 999px; padding: 0.05rem 0.6rem; font-size: 0.8rem; }
.pb-chip.is-stalled { border-color: #b86a00; border-width: 2px; }
.pb-chip.is-broken { border-color: #b3263e; border-width: 2px; border-style: dashed; }
.pb-card { border: 1px solid rgba(127,127,127,0.4); border-radius: 8px; padding: 0.8rem 1rem; margin: 0 0 1rem; }
.pb-card h2 { font-size: 1.05rem; margin: 0 0 0.2rem; }
.pb-diagram { overflow-x: auto; background: #fff; border-radius: 6px; margin: 0.5rem 0; min-height: 4rem; }
.pb-diagram svg { display: block; min-width: 56rem; max-width: none; height: auto; }
.pb-diagram .pb-token .djs-visual > :first-child { stroke: #0d6e78 !important; stroke-width: 5px !important; }
.pb-diagram .pb-token.pb-stalled .djs-visual > :first-child { stroke: #b86a00 !important; }
.pb-diagram .pb-done .djs-visual > :first-child { stroke-dasharray: 6 4 !important; }
.pb-mark { cursor: pointer; }
.pb-mark text { font: 600 18px ui-monospace, monospace; fill: #fff; }
.pb-table { overflow-x: auto; }
.pb-table table { font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.pb-table button { all: unset; cursor: pointer; text-decoration: underline; }
.pb-hist { list-style: none; padding: 0; margin: 0; }
.pb-hist li::before { content: none; }
.pb-hist li { margin: 0 0 0.4rem; font-size: 0.85rem; }`;

/**
 * The client: reads the embedded rows, filters them from the form (kept in the
 * URL query), draws one card per process and a table, and fetches a card's
 * drawing only when it nears the viewport.
 */
const PB_SCRIPT = String.raw`<script>
(function () {
  var root = document.querySelector("[data-pb]");
  if (!root) return;
  var ROWS = JSON.parse(document.getElementById("pb-rows").textContent);
  var MODE = root.getAttribute("data-pb");
  var STALL = +root.getAttribute("data-pb-stall");
  var UP = root.getAttribute("data-pb-up");
  var seg = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  var beanHref = function (id) { return seg.test(id) ? UP + "processed-bean/" + id + "/" : null; };
  var procHref = function (id) { return seg.test(id) ? UP + "processed-beans/" + id + "/" : null; };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var stalled = function (r) { return !r.finished && r.ageDays != null && r.ageDays > STALL; };
  var cache = {};
  function fetchSvg(href) {
    if (!cache[href]) {
      var url = new URL(href, document.baseURI);
      cache[href] = fetch(url).then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); }).then(function (t) { return { text: t, url: url }; });
    }
    return cache[href];
  }
  // Draws the diagram into host and marks steps: marks = { node: { rows: [...], done: bool } }.
  function draw(host, href, marks, onMark) {
    fetchSvg(href).then(function (got) {
      var svg = new DOMParser().parseFromString(got.text, "image/svg+xml").documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return;
      svg.querySelectorAll("script").forEach(function (s) { s.remove(); });
      svg.querySelectorAll("a").forEach(function (a) {
        ["href", "xlink:href"].forEach(function (k) { var h = a.getAttribute(k); if (h) a.setAttribute(k, new URL(h, got.url).href); });
      });
      svg = document.importNode(svg, true);
      host.replaceChildren(svg);
      Object.keys(marks).forEach(function (node) {
        var m = marks[node];
        var g = svg.querySelector('g.djs-element[data-element-id="' + CSS.escape(node) + '"]');
        if (!g) return;
        if (!m.rows.length) { g.classList.add("pb-done"); return; }
        var late = m.rows.some(stalled);
        g.classList.add("pb-token");
        if (late) g.classList.add("pb-stalled");
        var bb = g.getBBox(), t = g.transform.baseVal.consolidate();
        var tx = t ? t.matrix.e : 0, ty = t ? t.matrix.f : 0;
        var label = m.rows.length + (late ? " stalled" : "");
        var w = 24 + label.length * 11, x = tx + bb.x + bb.width - w / 2, y = ty + bb.y - 30;
        var ns = "http://www.w3.org/2000/svg";
        var mk = document.createElementNS(ns, "g");
        mk.setAttribute("class", "pb-mark"); mk.setAttribute("tabindex", "0"); mk.setAttribute("role", "button");
        var title = document.createElementNS(ns, "title");
        title.textContent = m.rows.map(function (r) { return r.beans.map(function (b) { return b.id + " — " + (b.title || "bean not in this store"); }).join("\n"); }).join("\n");
        var rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", x); rect.setAttribute("y", y); rect.setAttribute("rx", 13); rect.setAttribute("width", w); rect.setAttribute("height", 26);
        rect.setAttribute("fill", late ? "#b86a00" : "#0d6e78");
        var text = document.createElementNS(ns, "text");
        text.setAttribute("x", x + 12); text.setAttribute("y", y + 19); text.textContent = label;
        mk.append(title, rect, text);
        if (onMark) {
          mk.addEventListener("click", function () { onMark(node); });
          mk.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onMark(node); } });
        }
        svg.append(mk);
      });
    }).catch(function () { host.textContent = "The drawing could not be loaded; the steps are listed in the table."; });
  }
  function lazy(host, fn) {
    if (!("IntersectionObserver" in window)) return fn();
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); } }, { rootMargin: "300px" });
    io.observe(host);
  }
  function beanCell(r) {
    return r.beans.map(function (b) {
      var h = beanHref(b.id);
      return (h ? '<a href="' + esc(h) + '"><code>' + esc(b.id) + "</code></a> " : "<code>" + esc(b.id) + "</code> ") +
        (b.found ? esc(b.title) + ' <span class="pb-chip">' + esc(b.status) + "</span>" : '<span class="pb-chip is-broken">not in this store</span>');
    }).join("<br>") || "none named";
  }
  function stuckCell(r) {
    return r.stuck.map(function (k) { return '<span class="pb-chip ' + (k === "enabled-not-taken" ? "is-stalled" : "is-broken") + '">' + esc(k) + "</span>"; }).join(" ") || "none found";
  }
  function moved(r) { return r.lastMoved ? esc(r.lastMoved.slice(0, 10)) + " (" + r.ageDays + " days)" : "unknown"; }

  if (MODE === "all") {
    var F = { q: $("pb-q"), process: $("pb-process"), state: $("pb-state"), bean: $("pb-beanstatus"), stale: $("pb-stale") };
    var sortKey = "lastMoved", sortDir = 1;
    var match = function (r) {
      var q = F.q.value.trim().toLowerCase();
      var hay = [r.instance, r.process, r.tokens.join(" ")].concat(r.beans.map(function (b) { return b.id + " " + (b.title || ""); })).join(" ").toLowerCase();
      var st = F.stale.value === "" ? 0 : +F.stale.value;
      return (!q || hay.indexOf(q) >= 0) &&
        (!F.process.value || r.process === F.process.value) &&
        (!F.state.value || (F.state.value === "running" ? !r.finished : F.state.value === "finished" ? r.finished : r.stuck.length > 0)) &&
        (!F.bean.value || r.beans.some(function (b) { return (b.found ? b.status : "not in this store") === F.bean.value; })) &&
        (!st || (!r.finished && (r.ageDays == null || r.ageDays > st)));
    };
    var render = function () {
      var rows = ROWS.filter(match);
      var procs = [];
      rows.forEach(function (r) { if (procs.indexOf(r.process) < 0) procs.push(r.process); });
      $("pb-chips").innerHTML =
        '<li class="pb-chip">' + rows.length + " of " + ROWS.length + " instances</li>" +
        '<li class="pb-chip">' + procs.length + " processes</li>" +
        '<li class="pb-chip is-stalled">' + rows.filter(stalled).length + " stalled: not moved in " + STALL + "+ days</li>" +
        '<li class="pb-chip is-broken">' + rows.filter(function (r) { return r.stuck.indexOf("bean-closed") >= 0; }).length + " running on a closed bean</li>" +
        '<li class="pb-chip is-broken">' + rows.filter(function (r) { return r.stuck.indexOf("bean-missing") >= 0; }).length + " bean not in this store</li>";
      var cards = $("pb-cards");
      cards.replaceChildren();
      procs.forEach(function (proc) {
        var its = rows.filter(function (r) { return r.process === proc; });
        var marks = {};
        its.forEach(function (r) { r.tokens.forEach(function (t) { (marks[t] = marks[t] || { rows: [] }).rows.push(r); }); });
        var missing = [];
        its.forEach(function (r) { r.missingNodes.forEach(function (n) { if (missing.indexOf(n) < 0) missing.push(n); }); });
        var withDrawing = its.filter(function (r) { return r.drawing; })[0];
        var card = document.createElement("section");
        card.className = "pb-card";
        var ph = procHref(proc);
        card.innerHTML = "<h2>" + (ph && ROWS.some(function (r) { return r.process !== proc; }) ? '<a href="' + esc(ph) + '">' + esc(proc) + "</a>" : esc(proc)) + '</h2><p class="sv-sub"><code>' + esc(its[0].source) + "</code> · " +
          its.filter(function (r) { return !r.finished; }).length + " running, " + its.filter(function (r) { return r.finished; }).length +
          " finished. A badge counts the beans waiting at a step; select it to filter the table.</p>" +
          (withDrawing ? '<div class="pb-diagram"><p class="sv-sub">The drawing loads when this card scrolls into view.</p></div>' : '<p class="sv-sub">No drawing of this process is published, so the positions are in the table only.</p>') +
          (missing.length ? '<p class="sv-sub"><strong>node-missing</strong>: a token sits on ' + missing.map(function (n) { return "<code>" + esc(n) + "</code>"; }).join(", ") + ", which the current diagram does not have.</p>" : "");
        cards.append(card);
        if (withDrawing) {
          var host = card.querySelector(".pb-diagram");
          lazy(host, function () { draw(host, withDrawing.drawing, marks, function (node) { F.q.value = node; render(); $("pb-table").scrollIntoView(); }); });
        }
      });
      rows.sort(function (a, b) { return String(a[sortKey] == null ? "" : a[sortKey]).localeCompare(String(b[sortKey] == null ? "" : b[sortKey])) * sortDir; });
      $("pb-tbody").innerHTML = rows.map(function (r) {
        return "<tr><td>" + beanCell(r) + "</td><td><code>" + esc(r.process) + "</code></td><td>" +
          (r.tokens.map(function (t) { return "<code>" + esc(t) + "</code>"; }).join(", ") || "no step") + "</td><td>" +
          (r.href ? '<a href="' + esc(r.href) + '">' + esc(r.instance) + "</a>" : esc(r.instance)) + " · " + (r.finished ? "finished" : "running") +
          "</td><td>" + moved(r) + "</td><td>" + stuckCell(r) + "</td></tr>";
      }).join("") || '<tr><td colspan="6">No instance matches these filters.</td></tr>';
    };
    Object.keys(F).forEach(function (k) { F[k].addEventListener("input", render); });
    document.querySelectorAll("[data-pb-sort]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.getAttribute("data-pb-sort"); sortDir = sortKey === k ? -sortDir : 1; sortKey = k; render(); });
    });
    render();
  } else {
    var show = function () {
      var id = root.getAttribute("data-pb-bean");
      var its = ROWS.filter(function (r) { return r.beans.some(function (b) { return b.id === id; }); });
      var b = its.length ? its[0].beans.filter(function (x) { return x.id === id; })[0] : null;
      var out = $("pb-one");
      out.innerHTML = (b ? '<section class="pb-card"><h2><code>' + esc(id) + "</code></h2><p>" + (b.found ? esc(b.title) + ' <span class="pb-chip">' + esc(b.status) + "</span> · updated " + esc((b.updatedAt || "").slice(0, 10)) : '<span class="pb-chip is-broken">not in this store</span>') +
        '</p><p class="sv-sub">Named by ' + its.length + " workflow instance(s). Solid outline: where the token is; dashed: steps already in the history.</p></section>" : "") +
        its.map(function (r, i) {
          var ph = procHref(r.process);
          return '<section class="pb-card"><h2>' + (ph ? '<a href="' + esc(ph) + '"><code>' + esc(r.process) + "</code></a>" : "<code>" + esc(r.process) + "</code>") + "</h2><p>" + (r.href ? '<a href="' + esc(r.href) + '">' + esc(r.instance) + "</a>" : esc(r.instance)) +
            " · " + (r.finished ? "finished" : "running") + " · last moved " + moved(r) + " · " + stuckCell(r) + "</p>" +
            (r.drawing ? '<div class="pb-diagram" id="pb-d' + i + '"></div>' : '<p class="sv-sub">No drawing of this process is published.</p>') +
            (r.missingNodes.length ? '<p class="sv-sub"><strong>node-missing</strong>: ' + r.missingNodes.map(function (n) { return "<code>" + esc(n) + "</code>"; }).join(", ") + " is not in the current diagram.</p>" : "") +
            "</section>";
        }).join("");
      its.forEach(function (r, i) {
        if (!r.drawing) return;
        var marks = {};
        r.done.forEach(function (n) { marks[n] = { rows: [] }; });
        r.tokens.forEach(function (n) { marks[n] = { rows: [r] }; });
        var host = $("pb-d" + i);
        lazy(host, function () { draw(host, r.drawing, marks); });
      });
    };
    show();
  }
})();
</script>`;

/** A URL segment: what a process id or bean id must be to get a page of its own. */
export const PB_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The routes these pages take under a bean store's page
 * (`<base>/<harness>/beans/<store>/`), every one a path IRI, never a query:
 * `processed-beans/`, `processed-beans/<processId>/` and
 * `processed-bean/<beanId>/`. An id that is not a URL segment gets no page,
 * and is shown as text where it is named.
 */
export function processedBeansRoutes(rows: readonly ProcessedRow[]): { processes: string[]; beans: string[] } {
  return {
    processes: [...new Set(rows.map((r) => r.process))].filter((p) => PB_SEGMENT.test(p)).sort(),
    beans: [...new Set(rows.flatMap((r) => r.beans.map((b) => b.id)))].filter((b) => PB_SEGMENT.test(b)).sort(),
  };
}

/** The lead sentence every page carries: what the rows are and when "stalled" starts. */
function lead(store: string, now: Date, up: string): string {
  return (
    `<p class="sv-sub">BPMN workflow instances recorded in <code>${esc(store)}</code>'s work plan, joined with the beans they name. ` +
    `Ages are measured on ${esc(dayOf(now))} (UTC, the day this page was built); an instance is <strong>stalled</strong> when it is running ` +
    `and has not moved for more than ${STUCK_AFTER_DAYS} days. A bean that no instance names is not on these pages: see ` +
    `<a href="${up}">the store page</a>. A running subprocess is followed on each instance's own page.</p>`
  );
}

function nav(store: string, up: string): string {
  return `<p class="sv-sub"><a href="${up}">${esc(store)}'s work plan</a> · <a href="${up}processed-beans/">beans by process</a> · <a href="${up}workflows/">every instance</a></p>`;
}

/**
 * `processed-beans/` (no `process`) or `processed-beans/<process>/`: the
 * processes with an instance, the beans on each diagram, filters. `rows` are
 * this page's rows, hrefs relative to it; `up` is the store page relative to it.
 */
export function processedBeansBody(store: string, rows: readonly ProcessedRow[], now: Date, up: string, process?: string): string {
  const procs = [...new Set(rows.map((r) => r.process))].sort();
  const beanStates = [...new Set(rows.flatMap((r) => r.beans.map((b) => (b.found ? b.status! : "not in this store"))))].sort();
  const id = process ? `processed-beans-${process}` : "processed-beans";
  return (
    `<h1 id="${esc(id)}">${process ? `Beans in <code>${esc(process)}</code>` : "Beans by process"}: ${esc(store)}</h1>` +
    nav(store, up) +
    lead(store, now, up) +
    `<div data-pb="all" data-pb-stall="${STUCK_AFTER_DAYS}" data-pb-up="${esc(up)}">` +
    `<form class="pb-filters" onsubmit="return false">` +
    `<label for="pb-q">Search<input id="pb-q" type="search" placeholder="bean, title, step, instance"></label>` +
    (process
      ? `<select id="pb-process" hidden><option value=""></option></select>`
      : `<label for="pb-process">Process<select id="pb-process"><option value="">All processes</option>${procs.map((p) => `<option>${esc(p)}</option>`).join("")}</select></label>`) +
    `<label for="pb-state">Instance<select id="pb-state"><option value="">Any</option><option value="running">Running</option><option value="finished">Finished</option><option value="stuck">Any stuck state</option></select></label>` +
    `<label for="pb-beanstatus">Bean status<select id="pb-beanstatus"><option value="">Any</option>${beanStates.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>` +
    `<label for="pb-stale">Not moved for<select id="pb-stale"><option value="">Any time</option><option value="${STUCK_AFTER_DAYS}">More than ${STUCK_AFTER_DAYS} days</option><option value="30">More than 30 days</option><option value="60">More than 60 days</option></select></label>` +
    `</form><ul class="pb-chips" id="pb-chips"></ul>` +
    (rows.length === 0 ? `<p class="sv-sub">No BPMN instance is recorded in this store, so no bean sits at any step.</p>` : "") +
    `<div id="pb-cards"></div>` +
    `<h2 class="sv-h2" id="pb-table">Beans in processes</h2>` +
    `<div class="pb-table"><table><thead><tr><th>bean</th><th><button type="button" data-pb-sort="process">process</button></th><th>step</th><th>instance</th><th><button type="button" data-pb-sort="lastMoved">last moved</button></th><th>stuck</th></tr></thead><tbody id="pb-tbody"></tbody></table></div>` +
    `</div><script type="application/json" id="pb-rows">${scriptJson(rows)}</script>` +
    PB_SCRIPT
  );
}

/** `processed-bean/<bean>/`: one bean through every instance that names it. `rows` are that bean's. */
export function processedBeanBody(store: string, bean: string, rows: readonly ProcessedRow[], now: Date, up: string): string {
  return (
    `<h1 id="processed-bean-${esc(bean)}">Bean <code>${esc(bean)}</code> in its processes</h1>` +
    nav(store, up) +
    lead(store, now, up) +
    `<div data-pb="one" data-pb-stall="${STUCK_AFTER_DAYS}" data-pb-up="${esc(up)}" data-pb-bean="${esc(bean)}"><div id="pb-one"></div></div>` +
    `<script type="application/json" id="pb-rows">${scriptJson(rows)}</script>` +
    PB_SCRIPT
  );
}

/** Rows with every page-relative href re-anchored one or more levels deeper. */
export function rebase(rows: readonly ProcessedRow[], prefix: string): ProcessedRow[] {
  const at = (h?: string) => (h === undefined || /^[a-z]+:|^\//.test(h) ? h : prefix + h);
  return rows.map((r) => ({ ...r, ...(r.href ? { href: at(r.href) } : {}), ...(r.drawing ? { drawing: at(r.drawing) } : {}) }));
}
