/**
 * edit-links — the ONE recipe for "edit this on GitHub" and "give feedback on
 * this" links, for every page the platform publishes (owner, 2026-10-06:
 * "make sure feedback/edit links are changed across all harness/visualizers
 * to be dynamic"). Moved here from the core layer's `block-actions.ts` so
 * the harness's own generators can use it: the harness may not import core,
 * and core re-exports this.
 *
 * Originally block-actions: every rendered block links back to where it can be changed:
 * **[edit]** opens the block's Markdown source in GitHub's editor, and
 * **[feedback]** opens a new GitHub issue about that block, from the folio's
 * own issue form when it has one. Bean `uphx`, REQ-17 of the round 2
 * public-comment CRD (owner, 2026-10-06: *"each block should also have an
 * [edit] and [feedback] icons … back to edit source on github or create an
 * issue to change block contents"*, and *"make this common folio-asst-core
 * functionality … create an issue w/ optional parameterized template"*).
 *
 * The FHIR layer's IG builder already does this per heading ("Edit this page
 * on GitHub" and a 📣 feedback icon); this
 * is the same reader affordance for a document folio, per BLOCK, because a
 * block is what a comment, a change-set and an edit are about.
 *
 * ## The template is the folio's, and optional
 *
 * A folio that wants structured feedback adds a GitHub issue form,
 * `.github/ISSUE_TEMPLATE/block-feedback.yml` by default. The link then names
 * that template and prefills ONLY the fields the form declares, by id, from
 * {@link BlockContext}: `block`, `section`, `source`, `page`, `url`. A field
 * the form does not declare is not sent, so a form can ask for as little as
 * it likes. With no form the link opens a blank issue whose body carries the
 * same facts, so the link works on day one.
 *
 * Nothing here decides anything or writes to GitHub: it builds URLs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HARNESS_ROOT } from "../../scripts/lib/roots.ts";

/** What a block's links are built from. */
export interface BlockContext {
  /** The block's label: its anchor id on the page. */
  label: string;
  /** The block's source, relative to the repository root (`folio/<doc>/<ch>/<root>.md`). */
  source: string;
  /** The section the block is in, as its heading reads. */
  section?: string;
  /** The page the block renders on, relative to the site root (`<doc>/index.html`). */
  page?: string;
  /** The line the thing starts on in its source, when known: the source link points at it. */
  line?: number;
  /** A repository other than the config's, for a source in a submodule (`sourceLinks` resolves it). */
  repo?: string;
  /** The block's address as the reader sees it, when the site's URL is not configured (the browser knows it). */
  pageUrl?: string;
}

export interface BlockActionsConfig {
  /** `owner/repo`. Without it there is nothing to link to, and no links are drawn. */
  repo?: string;
  /** The branch [edit] opens. Default `main`: an edit proposes a change to the published text. */
  branch?: string;
  /** The issue form, a file name under `.github/ISSUE_TEMPLATE/`. Absent: a blank issue. */
  template?: string;
  /** The form's field ids, so only declared fields are prefilled. Read by {@link readIssueForm}. */
  templateFields?: string[];
  /** Labels to put on the new issue. */
  labels?: string[];
  /** The published site's base URL, so an issue can link back to the block. */
  siteUrl?: string;
  /**
   * The content the page shows, by slug (`dpi-h-ra`): every feedback issue is
   * CODED with it, in the title (`Feedback [dpi-h-ra]: …`), the body and a
   * form's `content` field. The title, not a label, because GitHub drops a
   * prefilled label for a reporter who cannot triage (owner, 2026-10-06:
   * "plain issues + coding for content slug").
   */
  content?: string;
  /**
   * The site's variable values as KG nodes (`values.jsonld`, written by
   * `gen-values-jsonld.ts`), relative to the page or absolute: the ✍ suggest
   * editor shows each variable's current value from it.
   */
  values?: string;
  /**
   * The page's KG (`<slug>/graph.jsonld`), relative to the page or absolute:
   * the labels and bibliography keys a profile's checker warns against.
   */
  graph?: string;
  /**
   * The ✍ suggest editor. `module`/`css`/`katex`: where Milkdown Crepe, its
   * stylesheet and KaTeX load from, when not the site's own bundle at
   * `assets/vendor/crepe/` (`scripts/suggest-editor.ts`; tests, a mirror).
   * `profiles`: the editor-checker bundles for this page's blocks
   * (`bundleEditorProfiles` in `pipeline/editor-profiles.ts`), and
   * `katexMacros` the page's KaTeX macro table they are handed.
   */
  suggest?: {
    module?: string;
    css?: string;
    katex?: string;
    katexMacros?: Record<string, string>;
    profiles?: Array<{ id: string; module: string; kinds?: string[]; extensions?: string[]; rawLatexFirstFor?: string[] }>;
  };
}

export const DEFAULT_TEMPLATE = "block-feedback.yml";

const enc = encodeURIComponent;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** GitHub's editor on the block's source. Proposing the edit makes a branch and a PR. */
export function editUrl(cfg: BlockActionsConfig, source: string, repo?: string): string | undefined {
  const r = repo ?? cfg.repo;
  if (!r) return undefined;
  return `https://github.com/${r}/edit/${cfg.branch ?? "main"}/${source.split("/").map(enc).join("/")}`;
}

/** The block's source as GitHub shows it. */
export function sourceUrl(cfg: BlockActionsConfig, source: string, line?: number, repo?: string): string | undefined {
  const r = repo ?? cfg.repo;
  if (!r) return undefined;
  return `https://github.com/${r}/blob/${cfg.branch ?? "main"}/${source.split("/").map(enc).join("/")}${line ? `#L${line}` : ""}`;
}

/** The block's address on the published site, when the site's URL is known. */
export function blockPageUrl(cfg: BlockActionsConfig, b: BlockContext): string | undefined {
  if (!cfg.siteUrl || !b.page) return b.pageUrl;
  return `${cfg.siteUrl.replace(/\/$/, "")}/${b.page}#${enc(b.label)}`;
}

/**
 * A new issue about the block. With a template, only the fields the form
 * declares are prefilled; without one, the facts go in the body.
 */
export function feedbackUrl(cfg: BlockActionsConfig, b: BlockContext): string | undefined {
  if (!cfg.repo) return undefined;
  const values: Record<string, string> = {
    block: b.label,
    section: b.section ?? "",
    source: b.source,
    page: b.page ?? "",
    url: blockPageUrl(cfg, b) ?? "",
    content: cfg.content ?? "",
  };
  const q = new URLSearchParams();
  q.set("title", `Feedback${cfg.content ? ` [${cfg.content}]` : ""}: ${b.section ? `${b.section} — ` : ""}${b.label}`);
  if (cfg.labels?.length) q.set("labels", cfg.labels.join(","));
  if (cfg.template) {
    q.set("template", cfg.template);
    for (const f of cfg.templateFields ?? []) if (values[f]) q.set(f, values[f]);
  } else {
    const facts = [
      ...(cfg.content ? [`**Content:** \`${cfg.content}\``] : []),
      `**Block:** \`${b.label}\``,
      ...(b.section ? [`**Section:** ${b.section}`] : []),
      `**Source:** ${sourceUrl(cfg, b.source, b.line, b.repo)}`,
      ...(values.url ? [`**On the site:** ${values.url}`] : []),
    ];
    // The comment matrix's columns, so public-comment intake reads the issue
    // like a returned row (the folio site's format, now everyone's).
    q.set("body", [...facts, "", "**Type:** general | technical | editorial", "", "**Comment:**", "", "", "**Proposed change:**", ""].join("\n"));
  }
  return `https://github.com/${cfg.repo}/issues/new?${q}`;
}

/**
 * The field ids an issue form declares (`id:` under `body:`), or `undefined`
 * when the folio has no such form. A plain line scan, as the forms are flat
 * YAML and this needs only the ids.
 */
export function readIssueForm(repoRoot: string, template = DEFAULT_TEMPLATE): string[] | undefined {
  const p = join(repoRoot, ".github", "ISSUE_TEMPLATE", template);
  if (!existsSync(p)) return undefined;
  return [...readFileSync(p, "utf-8").matchAll(/^\s+id:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/gm)].map((m) => m[1]!);
}

/** The links for one block, as HTML. Empty when no repository is known. */
export function blockActionsHtml(cfg: BlockActionsConfig, b: BlockContext): string {
  const edit = editUrl(cfg, b.source);
  const fb = feedbackUrl(cfg, b);
  if (!edit || !fb) return "";
  return (
    `<span class="block-actions" data-block="${esc(b.label)}">` +
    `<a class="ba-edit" href="${esc(edit)}" title="Edit this block's source on GitHub (${esc(b.source)})">✎ edit</a>` +
    `<a class="ba-feedback" href="${esc(fb)}" title="Give feedback on this block (opens a GitHub issue)">📣 feedback</a>` +
    `</span>`
  );
}

/**
 * The same URLs, built in the browser. A lazy document page (bean v433) has
 * hundreds of blocks, and a feedback URL carries its prefilled issue, so
 * writing every href into the page cost 864 KB on the DPI-H document. The
 * compact form writes each block's facts as data attributes and this builds
 * the hrefs when a pointer or focus reaches them. `block-actions.test.ts`
 * evaluates it and holds it equal to {@link editUrl} and {@link feedbackUrl}.
 */
export const BLOCK_URLS_JS = `function faBlockUrls(c, b) {
  var enc = encodeURIComponent;
  var path = b.source.split("/").map(enc).join("/");
  var branch = c.branch || "main";
  var repo = b.repo || c.repo;
  var src = "https://github.com/" + repo + "/blob/" + branch + "/" + path + (b.line ? "#L" + b.line : "");
  var url = c.siteUrl && b.page ? c.siteUrl.replace(/\\/$/, "") + "/" + b.page + "#" + enc(b.label) : (b.pageUrl || "");
  var values = { block: b.label, section: b.section || "", source: b.source, page: b.page || "", url: url, content: c.content || "" };
  var q = new URLSearchParams();
  q.set("title", "Feedback" + (c.content ? " [" + c.content + "]" : "") + ": " + (b.section ? b.section + " \u2014 " : "") + b.label);
  if (c.labels && c.labels.length) q.set("labels", c.labels.join(","));
  if (c.template) {
    q.set("template", c.template);
    (c.templateFields || []).forEach(function (f) { if (values[f]) q.set(f, values[f]); });
  } else {
    var facts = c.content ? ["**Content:** \\u0060" + c.content + "\\u0060"] : [];
    facts.push("**Block:** \\u0060" + b.label + "\\u0060");
    if (b.section) facts.push("**Section:** " + b.section);
    facts.push("**Source:** " + src);
    if (url) facts.push("**On the site:** " + url);
    q.set("body", facts.concat(["", "**Type:** general | technical | editorial", "", "**Comment:**", "", "", "**Proposed change:**", ""]).join("\\n"));
  }
  return { edit: "https://github.com/" + repo + "/edit/" + branch + "/" + path, suggest: "https://github.com/" + repo + "/edit/" + branch + "/" + path, source: src, feedback: "https://github.com/" + c.repo + "/issues/new?" + q };
}`;

/**
 * The browser half, one script for every page: fills each `a[data-fa-link]`
 * (`edit`, `source` or `feedback`) from the facts on its nearest
 * `[data-src]` host the first time a pointer, focus or touch reaches it, so a
 * page carries facts, not hundreds of URLs, and every page builds the same
 * URL from one recipe. Configuration is a `#fa-edit-cfg` JSON block, else
 * `<meta name="fa-repo">` / `<meta name="fa-branch">` (the docs site's head).
 * `window.faEditLinks.fill(root)` fills eagerly for a page that wants to.
 */
export const EDIT_LINKS_RUNTIME = `(() => {
  if (window.faEditLinks) return;
  ${BLOCK_URLS_JS}
  let cfg = null;
  const config = () => {
    if (cfg) return cfg;
    const el = document.getElementById("fa-edit-cfg");
    if (el) cfg = JSON.parse(el.textContent);
    else {
      const meta = (n) => { const m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : undefined; };
      cfg = { repo: meta("fa-repo"), branch: meta("fa-branch") || "main" };
    }
    return cfg;
  };
  // A link that names a GitHub file but carries no facts (a generator wrote
  // its href from data, e.g. sourceLinks) gives them up from its own URL.
  const GH = /^https:\\/\\/github\\.com\\/([^/]+\\/[^/]+)\\/(?:blob|edit)\\/([^/]+)\\/([^#?]+)(?:#L(\\d+))?$/;
  const adopt = (a) => {
    const m = GH.exec(a.getAttribute("href") || "");
    if (!m) return false;
    a.dataset.repo = m[1]; a.dataset.branch = m[2];
    a.dataset.src = m[3].split("/").map(decodeURIComponent).join("/");
    if (m[4]) a.dataset.line = m[4];
    return true;
  };
  const ready = (host) => {
    if (host.dataset.ready) return;
    if (!host.dataset.src && !(host.matches("a[data-fa-link]") && adopt(host))) return;
    const c0 = config();
    const c = host.dataset.branch ? Object.assign({}, c0, { branch: host.dataset.branch }) : c0;
    if (!c.repo && !host.dataset.repo) return;
    host.dataset.ready = "1";
    const label = host.dataset.block || host.dataset.src;
    const u = faBlockUrls(c, { label: label, source: host.dataset.src, section: host.dataset.sec,
      line: host.dataset.line ? Number(host.dataset.line) : undefined, repo: host.dataset.repo, page: host.dataset.page || c.page,
      pageUrl: location.href.split("#")[0] + "#" + encodeURIComponent(label) });
    const links = host.matches("a[data-fa-link]") ? [host] : host.querySelectorAll("a[data-fa-link]");
    // Only this host's own links: a nested host (a Lean link inside a block's row) fills itself.
    for (const a of links) if ((a === host || a.closest("[data-src]") === host) && u[a.dataset.faLink]) a.href = u[a.dataset.faLink];
  };
  const fill = (root) => { addSuggest(root); for (const h of (root || document).querySelectorAll("[data-src], a[data-fa-link]")) ready(h); };
  // A page that learns its repository later (the folio site reads it from its outline) says so here.
  const configure = (c) => { cfg = c; };
  // ── ✍ suggest: a block's Markdown in a WYSIWYG editor, the change as a prefilled issue ──
  //
  // Beside every ✎ edit link whose source is Markdown, on any page of any
  // harness. The editor (Milkdown Crepe, MIT) is imported only on first use.
  // The text is read through the block's KG node (<block>.jsonld, its text)
  // from the repository itself, and the change leaves as a GitHub issue the
  // reader submits: no OAuth, no token, no server. Variables, directives and
  // LaTeX references are the reader's to change, add or delete; what is
  // checked is that each is well-formed, and the panel under the editor shows
  // each variable's current value from the site's values.jsonld. Nothing read
  // is written as HTML.
  const TOKENISH = /\\{\\{[\\s\\S]*?\\}\\}|\\{%[\\s\\S]*?%\\}|:{1,2}[A-Za-z][\\w-]*\\[[^\\]\\n]*\\](?:\\{[^}\\n]*\\})?|\\\\[A-Za-z]+\\{[^}\\n]*\\}/g;
  // Variables, directives and LaTeX references stay the reader's to change,
  // add or delete. They are wrapped in \\u27e6 \\u27e7 only so the editor's
  // Markdown escaping cannot corrupt them, and unwrapped on submit; what is
  // checked is that each one is still well-formed, nothing more (owner,
  // 2026-10-14: "I only want that the syntax is valid").
  const wrap = (md) => md.replace(TOKENISH, (m) => "\\u27e6" + m + "\\u27e7");
  // The same, less the LaTeX references: for a profile that keeps LaTeX verbatim itself.
  const TOKENS_NO_LATEX = /\\{\\{[\\s\\S]*?\\}\\}|\\{%[\\s\\S]*?%\\}|:{1,2}[A-Za-z][\\w-]*\\[[^\\]\\n]*\\](?:\\{[^}\\n]*\\})?/g;
  const unwrap = (md) => md.replace(/\\u27e6([^\\u27e6\\u27e7]*)\\u27e7/g, (m, inner) => inner.replace(/\\\\([!-\\/:-@\\[-\\u0060{-~])/g, "$1"));
  const LIQUID = /^\\{\\{\\s*[A-Za-z_][\\w-]*(?:\\.[\\w-]+|\\[\\d+\\])*\\s*(?:\\|\\s*[A-Za-z_]\\w*(?:\\s*:\\s*[^|{}]+?)?\\s*)*\\}\\}$/;
  const TAG = /^\\{%\\s*[A-Za-z_]\\w*[^%]*%\\}$/;
  const DIRECTIVE = /^:{1,2}[A-Za-z][\\w-]*\\[[^\\]\\n]*\\](?:\\{[^{}\\n]*\\})?$/;
  const LATEXREF = /^\\\\[A-Za-z]+\\{[^{}\\n]+\\}$/;
  // latex === false: a profile's own checker reads the LaTeX, so this coarse check does not.
  const syntaxErrors = (md, latex) => {
    const bad = [];
    for (const m of md.matchAll(/\\{\\{[\\s\\S]*?(?:\\}\\}|$)|\\{%[\\s\\S]*?(?:%\\}|$)/g)) if (!LIQUID.test(m[0]) && !TAG.test(m[0])) bad.push(m[0]);
    for (const m of md.matchAll(/:{1,2}[A-Za-z][\\w-]*\\[[^\\n]*?(?:\\](?:\\{[^\\n]*?\\})?|$)/gm)) if (!DIRECTIVE.test(m[0])) bad.push(m[0]);
    if (latex !== false) for (const m of md.matchAll(/\\\\(?:cite|ref|eqref|autoref|cref)\\b[^\\s]*/g)) if (!LATEXREF.test(m[0].replace(/[.,;:)]+$/, ""))) bad.push(m[0]);
    return bad;
  };
  // Variable names and, when the site published them, their current values.
  const variablesIn = (md) => Array.from(md.matchAll(/\\{\\{\\s*([A-Za-z_][\\w.\\-\\[\\]]*)/g), (m) => m[1]);
  const lineDiff = (a, b) => {
    const x = a.split("\\n"), y = b.split("\\n"), n = x.length, m = y.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { out.push(" " + x[i]); i++; j++; }
      else if (j < m && (i === n || L[i][j + 1] > L[i + 1][j])) out.push("+" + y[j++]);
      else out.push("-" + x[i++]);
    }
    // Two lines of context around each change.
    const keep = out.map((l, k) => out.slice(Math.max(0, k - 2), k + 3).some((c) => c[0] !== " "));
    const hunks = [];
    out.forEach((l, k) => { if (keep[k]) hunks.push(l); else if (hunks.length && hunks[hunks.length - 1] !== "@@") hunks.push("@@"); });
    if (hunks[hunks.length - 1] === "@@") hunks.pop();
    return hunks.join("\\n");
  };
  const raw = (repo, branch, path) => "https://raw.githubusercontent.com/" + repo + "/" + branch + "/" + path.split("/").map(encodeURIComponent).join("/");
  const sourceOf = (a) => {
    // From the link's parent: ready() gives a link with no facts of its own
    // (the ✍ link beside ✎ edit) a data-src adopted from its href, and the
    // block's label is the host's, not the link's.
    const h = a.parentElement && a.parentElement.closest("[data-src]");
    if (h && h.dataset.src) return { src: h.dataset.src, label: h.dataset.block || h.dataset.src, repo: h.dataset.repo, branch: h.dataset.branch, mode: h.dataset.suggestMode };
    if (a.dataset.src || adopt(a)) return { src: a.dataset.src, label: a.dataset.block || a.dataset.src, repo: a.dataset.repo, branch: a.dataset.branch, mode: a.dataset.suggestMode };
    return null;
  };
  const el = (tag, props, kids) => { const e = Object.assign(document.createElement(tag), props || {}); for (const k of kids || []) e.append(k); return e; };
  // A block's YAML front matter is not the reader's to edit: Crepe would turn
  // it into a thematic break and a setext heading. It is kept aside, unchanged.
  const FRONT_MATTER = /^---\\n[\\s\\S]*?\\n---\\n/;
  // The site root, from any same-origin URL under /assets/ the page already
  // loads (a page is served at several depths, and the runtime is often
  // inlined, so it cannot use its own script's URL); the editor bundle is under it.
  // The page's own site root: the longest root of a same-origin /assets/ URL
  // the page loads that also contains this page (a page can load another
  // site's chrome from the same origin, /folio-assistant/assets/…).
  const vendorBase = () => {
    let best = null;
    for (const e of document.querySelectorAll("script[src], link[href]")) {
      let u;
      try { u = new URL(e.getAttribute("src") || e.getAttribute("href"), location.href); } catch (x) { continue; }
      const i = u.pathname.indexOf("/assets/");
      if (u.origin !== location.origin || i < 0) continue;
      const root = u.pathname.slice(0, i + 1);
      if (location.pathname.indexOf(root) === 0 && (!best || root.length > best.length)) best = root;
    }
    return best === null ? null : location.origin + best + "assets/vendor/crepe/";
  };
  // The KG labels and bibliography keys a profile's checker warns against, read once from the page's graph.
  let kgRefs;
  const kgReferences = async (c) => {
    if (kgRefs !== undefined) return kgRefs;
    kgRefs = null;
    const g = c.graph ? await fetch(c.graph).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    const nodes = g && (g["@graph"] || g);
    if (!Array.isArray(nodes)) return kgRefs;
    const labels = [], keys = [];
    for (const n of nodes) {
      if (n && typeof n.label === "string" && n.label) labels.push(n.label);
      const m = n && typeof n["@id"] === "string" ? /(?:^|\\/)references\\/([^/#?]+)$/.exec(n["@id"]) : null;
      if (m) keys.push(decodeURIComponent(m[1]));
    }
    // A graph with no reference nodes says nothing about citations: that check is skipped, not failed.
    kgRefs = keys.length ? { labels: labels, citeKeys: keys } : { labels: labels };
    return kgRefs;
  };
  // A profile (an editor-checker node the site bundled, e.g. folio-assistant-sci's
  // paper-latex) for the block's kind: its checker, and its Crepe settings.
  // Or a mode: a profile whose module opens its own editor (a Questionnaire
  // form builder, in the page or in another window) over a file it declares by
  // extension. A host names one with data-suggest-mode.
  const profilesOf = (c) => ((c.suggest && c.suggest.profiles) || []).filter((p) => p && p.module);
  const fileOk = (p, src) => (p.extensions && p.extensions.length ? p.extensions.some((x) => src.endsWith(x)) : /\\.md$/.test(src));
  const suggestable = (c, s) => (!s.mode && /\\.md$/.test(s.src)) || profilesOf(c).some((p) => fileOk(p, s.src) && (!s.mode || p.id === s.mode));
  const profileFor = (c, kind, s) => s.mode
    ? profilesOf(c).find((p) => p.id === s.mode)
    : profilesOf(c).find((p) => fileOk(p, s.src) && (!p.kinds || p.kinds.indexOf(kind) >= 0));
  // The issue: prefilled by URL, or, past GitHub's URL limit, carried on the clipboard.
  const openIssue = async (repo, title, body, template, status) => {
    const q = { title: title, body: body };
    if (template) q.template = template;
    let url = "https://github.com/" + repo + "/issues/new?" + new URLSearchParams(q);
    if (url.length > 7000) {
      try { await navigator.clipboard.writeText(body); } catch (e) { status.textContent = "Too long for a link, and the clipboard is blocked."; return false; }
      url = "https://github.com/" + repo + "/issues/new?" + new URLSearchParams({ title: title, body: "The suggested change is on the clipboard: paste it here." });
    }
    window.open(url, "_blank", "noopener");
    return true;
  };
  const findingItem = (f) => el("li", { className: f.severity === "error" ? "bad" : "warn", textContent: (f.severity === "error" ? "Error" : "Warning") + (f.line ? " (line " + f.line + ")" : "") + ": " + f.message });
  const suggest = async (a) => {
    const s = sourceOf(a), c = config();
    if (!s || !suggestable(c, s)) return;
    const repo = s.repo || c.repo, branch = s.branch || c.branch || "main";
    const status = el("p", { className: "fa-suggest-status", textContent: "Loading " + s.src + " …" });
    const host = el("div", { className: "fa-suggest-editor" });
    const send = el("button", { type: "button", textContent: "Submit as an issue", disabled: true });
    const close = el("button", { type: "button", textContent: "Cancel" });
    const toggle = el("button", { type: "button", hidden: true });
    const vars = el("ul", { className: "fa-suggest-vars" });
    const dlg = el("dialog", { className: "fa-suggest" }, [el("h2", { textContent: "Suggest a change: " + s.label }), status, host, vars, el("p", {}, [send, " ", toggle, " ", close])]);
    let surface = null;
    close.onclick = () => { if (surface) surface.destroy(); dlg.close(); dlg.remove(); };
    if (!document.getElementById("fa-suggest-css"))
      document.head.append(el("style", { id: "fa-suggest-css", textContent: "dialog.fa-suggest{width:min(60rem,95vw);max-height:90vh;overflow:auto;padding:1rem 1.25rem}dialog.fa-suggest h2{font-size:1.1rem;margin:0 0 .5rem}.fa-suggest-status{color:#5b6770;font-size:.9rem}.fa-suggest-editor{border:1px solid #d6dde2;min-height:12rem;margin:.5rem 0}.fa-suggest-editor textarea{width:100%;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:.9rem;border:0;padding:.5rem}.fa-suggest-vars{font-size:.85rem;color:#5b6770;margin:.25rem 0;padding-left:1.2rem}.fa-suggest-vars .bad{color:#b3261e}.fa-suggest-vars .warn{color:#8a5a00}" }));
    document.body.append(dlg);
    dlg.showModal();
    let path = s.src, original, kind = String(s.label).split(":")[0];
    try {
      // The KG node names the block's text and its kind; a page without one falls back to the source.
      const node = await fetch(raw(repo, branch, s.src.replace(/\\.md$/, ".jsonld"))).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (node && typeof node.text === "string") path = s.src.replace(/[^/]*$/, "") + node.text;
      if (node && typeof node.kind === "string") kind = node.kind;
      const r = await fetch(raw(repo, branch, path));
      if (!r.ok) throw new Error(r.status + " reading " + path);
      original = await r.text();
    } catch (e) { status.textContent = "Could not load the block: " + e.message; return; }
    const fm = FRONT_MATTER.exec(original);
    const head = fm ? fm[0] : "", body = original.slice(head.length);
    // The site's variable values, as KG nodes (values.jsonld), when it publishes them.
    const values = c.values ? await fetch(c.values).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    const valueOf = (key) => {
      const nodes = values && (values["@graph"] || values);
      const n = Array.isArray(nodes) ? nodes.find((x) => x.key === key) : null;
      return n ? String(n.formatted !== undefined ? n.formatted : n.value) : undefined;
    };
    // The block's profile, when the site declares one for its kind. A profile
    // that fails to load leaves the generic editor and its generic checks.
    const prof = profileFor(c, kind, s);
    let mod = null, notes = [];
    if (prof) {
      try { mod = await import(new URL(prof.module, location.href).href); }
      catch (e) { notes.push("The " + (prof.id || "profile") + " checks did not load (" + e.message + ")."); }
    }
    const facts = ["**Block:** \\u0060" + s.label + "\\u0060", "**Source:** https://github.com/" + repo + "/blob/" + branch + "/" + path, "**On the site:** " + location.href.split("#")[0] + "#" + encodeURIComponent(s.label)];
    // A mode: its own editor, the same issue flow over the text it hands back.
    // get() may be async (an editor in another window answers by postMessage);
    // it is read on submit, not polled.
    if (mod && typeof mod.open === "function") {
      const ctx = { text: original, src: s.src, path: path, label: s.label, kind: kind, repo: repo, branch: branch, config: c, status: (m) => { status.textContent = String(m); } };
      let handle;
      try { handle = await mod.open(host, ctx); }
      catch (e) { status.textContent = "The " + (prof.id || "editor") + " did not open: " + e.message; return; }
      surface = { name: "mode", get: () => handle.get(), base: original, destroy: () => { try { if (handle && handle.dispose) handle.dispose(); } catch (e) {} } };
      status.textContent = notes.join(" ");
      send.disabled = false;
      send.onclick = async () => {
        let now;
        try { now = await surface.get(); } catch (e) { status.textContent = "Could not read the edit: " + e.message; return; }
        if (typeof now !== "string" || now === original) { status.textContent = "Nothing has changed yet."; return; }
        let found = [];
        if (typeof mod.check === "function") {
          try { found = (await mod.check(original, now, { kg: (await kgReferences(c)) || undefined })) || []; }
          catch (e) { found = [{ severity: "warning", message: "the checker failed: " + e.message }]; }
        }
        vars.replaceChildren(...found.map(findingItem));
        const errs = found.filter((f) => f.severity === "error");
        if (errs.length) { status.textContent = "Fix first: " + errs.map((f) => String(f.message).slice(0, 60)).join(" \\u00b7 "); return; }
        let custom = null;
        if (typeof mod.issue === "function") { try { custom = await mod.issue(original, now, ctx); } catch (e) { custom = null; } }
        const title = (custom && custom.title) || "Suggested edit: " + s.label;
        const body = (custom && custom.body) || facts.concat(["", "**Suggested change**, made in the " + (prof.id || "profile") + " editor:", "", "\\u0060\\u0060\\u0060diff", lineDiff(original, now), "\\u0060\\u0060\\u0060", "", "**Why:**", ""]).join("\\n");
        if (await openIssue(c.repo || repo, title, body, custom && custom.template, status)) close.onclick();
      };
      return;
    }
    const km = (c.suggest && c.suggest.katexMacros) || {};
    const macros = mod && typeof mod.macros === "function" ? mod.macros(km) : undefined;
    const kg = mod && typeof mod.check === "function" ? await kgReferences(c) : null;
    // A profile that keeps LaTeX verbatim itself (remarkFirst) must not have it wrapped in \\u27e6 \\u27e7 as well.
    const latexOwned = !!(mod && mod.remarkFirst);
    const wrapped = latexOwned ? body.replace(TOKENS_NO_LATEX, (m) => "\\u27e6" + m + "\\u27e7") : wrap(body);
    let katex = null;
    // The visual surface: Crepe, with the profile's latex settings, node views
    // and first remark transformer. Its base is Crepe's round-trip of the
    // source, so escapes Crepe adds are not counted as the reader's change.
    const visual = async (text) => {
      // The site's own bundle (suggest-editor.ts): Crepe and KaTeX from one
      // copy of ProseMirror, its stylesheet with every import resolved.
      const sc = c.suggest || {};
      const base = vendorBase();
      const moduleUrl = sc.module || (base && base + "crepe.js");
      if (!moduleUrl) throw new Error("this site has no editor bundle (assets/vendor/crepe/)");
      const css = sc.css || (base && !sc.module ? base + "crepe.css" : null);
      if (css && !document.querySelector('link[href="' + css + '"]')) document.head.append(el("link", { rel: "stylesheet", href: css }));
      const lib = await import(moduleUrl);
      const Crepe = lib.Crepe;
      if (mod && mod.nodeViews && !katex) katex = sc.katex ? (await import(sc.katex)).default : lib.default;
      const box = el("div");
      host.replaceChildren(box);
      const opts = { root: box, defaultValue: text };
      if (mod && typeof mod.latexConfig === "function") opts.featureConfigs = { [Crepe.Feature.Latex]: mod.latexConfig(km) };
      const crepe = new Crepe(opts);
      if (mod && (mod.remarkFirst || mod.nodeViews))
        // Milkdown's own InitReady timer, found in the schema's wait list so no
        // second copy of @milkdown/core is imported: after it, before the schema
        // builds the parser, is when a remark plugin can still go first.
        crepe.editor.use((ctx) => {
          const init = (ctx.get("schemaTimer") || []).find((t) => t && t.name === "InitReady");
          return async () => {
            if (init) await ctx.wait(init);
            if (typeof mod.remarkFirst === "function") ctx.update("remarkPlugins", mod.remarkFirst(macros));
            if (mod.nodeViews && katex) ctx.update("nodeView", (v) => v.concat(Object.keys(mod.nodeViews).map((n) => [n, mod.nodeViews[n](katex, km)])));
          };
        });
      await crepe.create();
      const get = () => unwrap(crepe.getMarkdown());
      return { name: "visual", get: get, base: get(), destroy: () => { try { crepe.destroy(); } catch (e) {} } };
    };
    // The raw surface: the block's Markdown as it is, LaTeX and all.
    const rawSurface = (text) => {
      const ta = el("textarea", { value: text, rows: 18 });
      host.replaceChildren(ta);
      return { name: "raw", get: () => ta.value, base: body, destroy: () => {} };
    };
    const rawFirst = !!(prof && prof.rawLatexFirstFor && prof.rawLatexFirstFor.indexOf(kind) >= 0);
    try {
      surface = rawFirst ? rawSurface(body) : await visual(wrapped);
    } catch (e) {
      // No editor (offline, blocked CDN): the same flow over plain Markdown.
      surface = rawSurface(body);
      notes.push("The visual editor did not load (" + e.message + "); editing the Markdown directly.");
    }
    const describe = () => {
      if (surface.name === "raw") return "Editing the raw Markdown" + (mod ? " and LaTeX" : "") + ".";
      return wrapped === body ? "" : "Variables, glossary terms and references are shown in \\u27e6 \\u27e7: change, add or delete them freely; their syntax is checked when you submit.";
    };
    status.textContent = notes.concat([describe()]).filter(Boolean).join(" ");
    // Both surfaces when a profile serves the block (owner, 2026-10-14: "both").
    if (prof && mod) {
      toggle.hidden = false;
      const label = () => { toggle.textContent = surface.name === "raw" ? "Edit visually" : "Edit as raw text"; };
      label();
      toggle.onclick = async () => {
        const text = surface.get();
        const next = surface.name === "raw" ? "visual" : "raw";
        surface.destroy();
        try { surface = next === "raw" ? rawSurface(text) : await visual(latexOwned ? text.replace(TOKENS_NO_LATEX, (m) => "\\u27e6" + m + "\\u27e7") : wrap(text)); }
        catch (e) { surface = rawSurface(text); notes.push("The visual editor did not load (" + e.message + ")."); }
        label();
        status.textContent = notes.concat([describe()]).filter(Boolean).join(" ");
      };
    }
    // What the profile's checker says the edit introduces: errors block, warnings do not.
    const findings = (text) => {
      if (!mod || typeof mod.check !== "function" || text === surface.base) return [];
      try { return mod.check(surface.base, text, { macros: macros, kg: kg || undefined }) || []; }
      catch (e) { return [{ severity: "warning", message: "the checker failed: " + e.message, line: 0 }]; }
    };
    // Live: each variable and its current value, any item whose syntax is broken, and the profile's findings.
    const refresh = () => {
      if (!dlg.isConnected) return clearInterval(timer);
      const text = surface.get();
      const items = variablesIn(text).map((k) => { const v = valueOf(k); return el("li", { textContent: k + (v === undefined ? (values ? " \\u2014 not a published variable" : " \\u2014 value not published") : " = " + v) }); });
      for (const b of syntaxErrors(text, !mod)) items.push(el("li", { className: "bad", textContent: "Not well-formed: " + b.slice(0, 80) }));
      for (const f of findings(text)) items.push(findingItem(f));
      vars.replaceChildren(...items);
    };
    const timer = setInterval(refresh, 800);
    refresh();
    send.disabled = false;
    send.onclick = async () => {
      const now = surface.get();
      if (now === surface.base) { status.textContent = "Nothing has changed yet."; return; }
      const errs = syntaxErrors(now, !mod).concat(findings(now).filter((f) => f.severity === "error").map((f) => f.message));
      if (errs.length) { status.textContent = "Fix the syntax first: " + errs.map((e) => e.slice(0, 60)).join(" \\u00b7 "); return; }
      const how = surface.name === "raw" ? "in the raw editor" : "in the visual editor (the diff is against the editor's rendering of the source)";
      const issue = facts.concat(["", "**Suggested change**, made " + how + ":", "", "\\u0060\\u0060\\u0060diff", lineDiff(surface.base, now), "\\u0060\\u0060\\u0060", "", "**Why:**", ""]).join("\\n");
      if (await openIssue(c.repo || repo, "Suggested edit: " + s.label, issue, undefined, status)) close.onclick();
    };
  };
  const SUGGEST_TITLE = "Suggest a change in a visual editor (opens a GitHub issue)";
  const addSuggest = (root) => {
    // Only over a real DOM: the runtime is also evaluated against stubs (a
    // viewer's own tests), where there is nothing to add a link to.
    const r = root || document;
    if (!r || typeof r.querySelectorAll !== "function") return;
    for (const a of r.querySelectorAll('a[data-fa-link="edit"], a.ba-edit')) {
      if (a.nextElementSibling && a.nextElementSibling.dataset.faLink === "suggest") continue;
      const s = sourceOf(a);
      if (!s || !suggestable(config(), s)) continue;
      const b = el("a", { className: "ba-suggest", href: a.getAttribute("href") || "#", title: SUGGEST_TITLE, textContent: "✍ suggest", tabIndex: 0 });
      b.dataset.faLink = "suggest";
      a.after(b);
    }
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[data-fa-link="suggest"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    suggest(a);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => addSuggest());
  else addSuggest();
  window.faEditLinks = { urls: faBlockUrls, fill: fill, configure: configure };
  // Both the link reached and the host it sits in: a pointer that lands
  // straight on a compact host's link (no gap crossed) or keyboard focus on it
  // matches the bare link first, which carries no facts of its own.
  for (const ev of ["pointerover", "focusin", "touchstart"])
    document.addEventListener(ev, (e) => {
      if (!e.target.closest) return;
      const a = e.target.closest("a[data-fa-link]"), h = e.target.closest("[data-src]");
      if (a) ready(a);
      if (h && h !== a) ready(h);
    }, { passive: true });
})();`;

/** The published asset, `cat-harness/site-chrome/assets/js/edit-links.js`: the runtime, as a file. A test holds them equal. */
export function editLinksAsset(): string {
  return `/*
 * edit-links.js: the "edit on GitHub" and "feedback" links of every page,
 * built in the browser from one recipe. GENERATED from
 * cat-harness/src/core/edit-links.ts (EDIT_LINKS_RUNTIME); do not edit here.
 * cat-harness/src/core/tests/edit-links.test.ts fails if the two differ.
 */
${EDIT_LINKS_RUNTIME}
`;
}

/** One block's links in the compact form: facts as data, hrefs filled by the runtime. */
export function compactActionsHtml(b: BlockContext): string {
  return (
    `<span class="block-actions" data-block="${esc(b.label)}" data-src="${esc(b.source)}"${b.section ? ` data-sec="${esc(b.section)}"` : ""}${b.repo ? ` data-repo="${esc(b.repo)}"` : ""}>` +
    // tabindex: an <a> without href takes no keyboard focus, and focus is
    // one of the events that fills it.
    `<a class="ba-edit" data-fa-link="edit" tabindex="0" title="Edit this block's source on GitHub">✎ edit</a>` +
    `<a class="ba-feedback" data-fa-link="feedback" tabindex="0" title="Give feedback on this block (opens a GitHub issue)">📣 feedback</a>` +
    `</span>`
  );
}

/**
 * One link, for a generator that shows a single "✎ Edit" (or source, or
 * feedback) beside an item. Edit and source keep a plain href as the
 * no-JavaScript fallback; the runtime replaces it from the shared recipe.
 */
export function editLinkHtml(
  cfg: BlockActionsConfig,
  o: { source: string; kind?: "edit" | "source" | "feedback"; text?: string; label?: string; line?: number; repo?: string; className?: string },
): string {
  const kind = o.kind ?? "edit";
  const fallback = kind === "edit" ? editUrl(cfg, o.source, o.repo) : kind === "source" ? sourceUrl(cfg, o.source, o.line, o.repo) : undefined;
  const text = o.text ?? (kind === "edit" ? "✎ Edit" : kind === "source" ? "Source" : "📣 Feedback");
  return (
    `<a class="${o.className ?? "fa-edit-link"}" data-fa-link="${kind}" data-src="${esc(o.source)}"` +
    `${o.label ? ` data-block="${esc(o.label)}"` : ""}${o.line ? ` data-line="${o.line}"` : ""}${o.repo ? ` data-repo="${esc(o.repo)}"` : ""}` +
    `${fallback ? ` href="${esc(fallback)}"` : ` tabindex="0"`}>${esc(text)}</a>`
  );
}

/** The runtime and its configuration, inline, for a page outside the docs site. */
export function compactActionsScript(cfg: BlockActionsConfig, page?: string): string {
  const c = JSON.stringify({ ...cfg, ...(page ? { page } : {}) }).replace(/</g, "\\u003c");
  return `<script type="application/json" id="fa-edit-cfg">${c}</script>
<script>
${EDIT_LINKS_RUNTIME}
</script>`;
}

export const BLOCK_ACTIONS_CSS = `
.block-actions { float:right; font-size:.75rem; margin-left:.6rem; opacity:.55; white-space:nowrap; }
.block-actions:hover, .block-actions:focus-within { opacity:1; }
.block-actions a { text-decoration:none; margin-left:.5rem; }
.block-actions .ba-existing { margin-left:.5rem; }
`;

/**
 * Insert each block's links right after its anchor (`<a id="<label>"></a>`,
 * which the document build emits before every labelled block). A label with
 * no anchor on the page is skipped; the count of inserted blocks is returned
 * so a build can report it.
 */
export function injectBlockActions(
  html: string,
  blocks: Iterable<BlockContext>,
  cfg: BlockActionsConfig,
  opts: { compact?: boolean } = {},
): { html: string; inserted: number } {
  if (!cfg.repo) return { html, inserted: 0 };
  let out = html;
  let inserted = 0;
  let page: string | undefined;
  for (const b of blocks) {
    const anchor = new RegExp(`(<a id="${b.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*>\\s*</a>)`);
    if (!anchor.test(out)) continue;
    out = out.replace(anchor, `$1${opts.compact ? compactActionsHtml(b) : blockActionsHtml(cfg, b)}`);
    if (page === undefined) page = b.page;
    inserted++;
  }
  if (inserted) out = out.replace("</head>", `<style>${BLOCK_ACTIONS_CSS}</style></head>`);
  if (inserted && opts.compact) out = out.replace("</body>", `${compactActionsScript(cfg, page)}</body>`);
  return { html: out, inserted };
}

/** `bun run cat-harness-tools/src/core/edit-links.ts --write-asset` regenerates the published runtime. */
if (import.meta.main && process.argv.includes("--write-asset")) {
  const { writeFileSync } = await import("node:fs");
  const { readDeclaration, siteFileFor } = await import("@litlfred/cat-harness/schemas/cat-harness.js");
  const harness = join(HARNESS_ROOT);
  const own = readDeclaration(harness);
  if (!own) throw new Error(`${harness} declares no instance: nowhere to publish the runtime`);
  const out = join(harness, siteFileFor(harness, "assets/js/edit-links.js"));
  writeFileSync(out, editLinksAsset());
  console.error(`✓ wrote ${out}`);
}

/**
 * The single-link form as Markdown, for a generator that writes kramdown:
 * `[text](plain href){: .class data-fa-link=… data-src=… }`. The plain href is
 * the no-JS fallback; edit-links.js replaces it from the shared recipe.
 */
export function markdownEditLink(
  cfg: BlockActionsConfig,
  o: { source: string; kind?: "edit" | "source"; text?: string; className?: string; title?: string; line?: number; repo?: string },
): string {
  const kind = o.kind ?? "edit";
  const href = kind === "edit" ? editUrl(cfg, o.source, o.repo) : sourceUrl(cfg, o.source, o.line, o.repo);
  const text = o.text ?? (kind === "edit" ? "✎ Edit" : "Source");
  if (!href) return text;
  const repo = o.repo ?? cfg.repo;
  const attrs = [
    o.className ? `.${o.className}` : "",
    o.title ? `title="${o.title.replace(/"/g, "&quot;")}"` : "",
    `data-fa-link="${kind}"`,
    `data-src="${esc(o.source)}"`,
    repo ? `data-repo="${esc(repo)}"` : "",
    o.line ? `data-line="${o.line}"` : "",
  ].filter(Boolean);
  return `[${text}](${href}){: ${attrs.join(" ")} }`;
}

/** `owner/repo` for this checkout's GitHub origin, else the given fallback: what a generator's links name. */
export function repoOf(repoWebUrl: string | undefined, fallback = "litlfred/folio-assistant"): string {
  return repoWebUrl?.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1] ?? fallback;
}
