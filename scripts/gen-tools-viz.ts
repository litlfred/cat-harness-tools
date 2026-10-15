#!/usr/bin/env bun
/**
 * Render the `tools` graph — Tool nodes, how each is installed and invoked,
 * and which skill each one satisfies.
 *
 * @module cat-harness/scripts/gen-tools-viz
 * @covers tools
 *
 * ## Why this is its own page, and not a section of the skills page
 *
 * Owner, 2026-09-21: **"keep tools and skills separate!"**
 *
 * They were not. `cat-harness.json`'s `tools` entry declared
 * `coverage.docs: "cat-harness/docs/concepts/skills.md"` — a page titled *"Skills &
 * roles"* whose headings are Skills, Roles, Capabilities, with no tools
 * section anywhere in it. The tools graph had no documentation of its own and
 * pointed at a page about something else.
 *
 * That is worse than an absent page, and it is worth being precise about why:
 * an absent `docs` ref is a legible gap, while a ref that RESOLVES reports
 * coverage. The check in force asks only whether the path exists — it does —
 * so nothing had ever flagged it. `pb04` one level up: the link works and
 * points at the wrong thing.
 *
 * ## What a Tool is, against a skill — the distinction the page exists to keep
 *
 * A **skill** states a capability generically: what an actor needs to know to
 * perform a task. A **Tool** is one concrete way to exercise it — with an
 * installation, an invocation, and typed inputs and outputs. One skill may be
 * satisfied by several Tools, and a Tool may satisfy several skills.
 *
 * So the relation is `satisfies`, and it runs FROM a Tool TO a skill. This
 * page renders it from the tool side, which is the direction that does not
 * conflate them: it says "this tool is one way to do that", never "this skill
 * is a tool".
 *
 * ## It imports the graph rather than parsing it
 *
 * The nodes are authored as TypeScript calling `defineTool`, precisely so a
 * malformed one fails at `tsc`. A generator that re-parsed the source would
 * throw that away and invent a second, weaker reader of the same file —
 * which would then be free to disagree with the one the server uses.
 *
 * ## One page per instance — bean `folio-assistant-1nu0`
 *
 * Owner, 2026-10-15: *"per-instance pages"*. The page used to import
 * `cat-harness/tools/index.ts`, which holds cat-harness's own Tools and no
 * one else's, and its visualiser `covers` only cat-harness's `tools`
 * directory by id — so six instances that declare a `tools` graph read
 * *"no viewer yet"* in the navbar. It now reads every declared `tools` graph
 * through auto-discovery (`tools/discover.ts`, bean `p0za`), the reader
 * `check:tools` gates, and draws the way the schemas viewer does: the full KG
 * at `<locale>/<harness>/tools/`, and one sub-graph page per instance at
 * `<locale>/<harness>/tools/<instance>/`. The visualiser covers the KIND with
 * `subgraphs: "instance"`, and `viewersOf` covers a directory by kind only
 * where its sub-graph page exists — so an instance whose graph yields no
 * Tool gets no page and stays reported, never an empty page claiming to
 * show it.
 *
 * Usage:
 *   bun run cat-harness-tools/scripts/gen-tools-viz.ts
 *   bun run cat-harness-tools/scripts/gen-tools-viz.ts --check
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { declarationPathIn, instanceDirectoryForGraph } from "@litlfred/cat-harness/schemas/cat-harness.js";
import { instanceRootsIn } from "@litlfred/cat-harness/schemas/instance-roots.js";
import { visualiserRoute } from "@litlfred/cat-harness/schemas/visualiser-route.js";
import { discoverTools, toolsOf } from "../tools/discover.ts";
import { baseDocsDir } from "./compose-docs.js";
import { kgRoots } from "./known-skills.js";
import { skillPageHref, skillPagesOf } from "./lib/skill-pages.ts";
import { pageParts, renderedByOf, visualiserSitePath, withRenderedByFrontMatter } from "./viewer-declarations.js";
import { HARNESS_ROOT } from "./lib/roots.ts";
import { dirname } from "node:path";
import { localSiteDir } from "./lib/local-site-dir.ts";
import { siteTarget } from "./lib/site-target.ts";

/** This generator's Tool node (`tools/viewers.ts`), named on every page it draws. */
const VIEWER_TOOL = "tools-viewer";

const REPO = resolve(dirname(HARNESS_ROOT));
/** The graph typology this renders. A KIND, never a path. */
const KIND = "tools";

/** One Tool, reduced to what the page shows. */
export interface ToolRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** How it is installed — the declared keys, e.g. `none`, `cli`. */
  readonly install: string[];
  /** How it is invoked — `shell`, `mcp`, `inProcess`, `manual`. */
  readonly invoke: string[];
  /** Skills this tool is one way to exercise. */
  readonly satisfies: string[];
  readonly inputs: number;
  readonly outputs: number;
}

/** A `satisfies` entry, however it was written. */
function skillId(s: unknown): string {
  if (typeof s === "string") return s;
  const o = s as { skill?: string; ref?: string } | null;
  return o?.skill ?? o?.ref ?? String(s);
}

/**
 * The Tool nodes, reduced.
 *
 * Exported so the reduction is testable without the markdown: the `satisfies`
 * join is the part worth pinning, and a test that went through the rendered
 * table would be testing the table.
 */
export function toolRows(defs: readonly unknown[]): ToolRow[] {
  return defs
    .map((d) => {
      const t = d as Record<string, unknown>;
      const io = (t.io ?? {}) as { inputs?: unknown[]; outputs?: unknown[] };
      return {
        id: String(t.id ?? ""),
        title: String(t.title ?? t.id ?? ""),
        description: String(t.description ?? ""),
        install: Object.keys((t.install ?? {}) as object).sort(),
        invoke: Object.keys((t.invoke ?? {}) as object).sort(),
        satisfies: ((t.satisfies ?? []) as unknown[]).map(skillId).sort(),
        inputs: io.inputs?.length ?? 0,
        outputs: io.outputs?.length ?? 0,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}

/** Every skill document in the checkout, by id, so a `satisfies` can be resolved. */
export function skillIds(repo = REPO): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string, depth = 0): void => {
    if (depth > 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".md")) out.add(e.name.replace(/\.md$/, ""));
    }
  };
  // Every directory declaring a `kg` or `skills` graph, read from the
  // declarations — a hardcoded list here is the `check:declared-assets` shape,
  // and it would go stale the first time an instance is added.
  for (const declPath of instanceDeclarations(repo)) {
    const d = JSON.parse(readFileSync(declPath, "utf-8")) as {
      directories?: { path?: string; scope?: string; graphTypologies?: string[] }[];
    };
    const instanceRoot = join(declPath, "..");
    for (const entry of d.directories ?? []) {
      if (!entry.path) continue;
      const kinds = entry.graphTypologies ?? [];
      if (!kinds.includes("skills") && !kinds.includes("kg") && !kinds.includes("methodology")) continue;
      walk(join(entry.scope === "repository" ? repo : instanceRoot, entry.path));
    }
  }
  // And every skills root the checkout RESOLVES, which includes a directory an
  // instance holds by inheritance and does not restate (option A, bean
  // `1g4s`): sci's `skills/` is a member of the harness's `skills` graph, and
  // since placement PR1 (bean `ybwt`) it holds the paper skills harness tools
  // satisfy. Reading declarations alone missed it.
  const platform = join(repo, "cat-harness");
  if (existsSync(platform)) for (const d of kgRoots(platform)) walk(d);
  return out;
}

/**
 * Every INSTANCE declaration in the checkout.
 *
 * `declarationPathIn`, never a "does it have `directories`?" heuristic. That
 * heuristic sweeps in `beans/beans.json` and `todos/todos.json`, whose stem is
 * not their declared `name` — and it produced a wrong corpus for two separate
 * sessions on 2026-09-21 (`w4tq`, and this session's own `yunp` re-measure).
 * It is attractive because it is one line and NEARLY right, so it returns a
 * plausible answer rather than an error.
 */
function instanceDeclarations(repo: string): string[] {
  const out: string[] = [];
  const at = declarationPathIn(repo);
  if (at && existsSync(at)) out.push(at);
  for (const e of readdirSync(repo, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = declarationPathIn(join(repo, e.name));
    if (p && existsSync(p)) out.push(p);
  }
  return out;
}

/**
 * Where the page goes: the declared directory's own name (#1168 B7a-2b,
 * `conventionalPage`). Never a literal — `site-dir-single-answer` refuses one.
 */
export function pageRelPath(repo = REPO, subgraph?: string): string | undefined {
  // The route cat-harness DECLARES for this Tool's visualiser (owner,
  // 2026-10-09): `<locale>/<harness>/<id>/index.md`, never chosen here. A
  // sub-graph page is `<locale>/<harness>/<id>/<instance>/index.md`.
  try {
    const { rel, visualiser: v } = visualiserSitePath(join(repo, "cat-harness"), VIEWER_TOOL);
    if (subgraph === undefined) return rel;
    return visualiserRoute({ ...pageParts({ harness: v.harness, visualiser: v.id }), subgraph, asset: "index.md" });
  } catch {
    return undefined;
  }
}

/** One instance's slice of the tools graph: its declared name and its Tool rows. */
export interface ToolSubject {
  readonly name: string;
  readonly rows: ToolRow[];
}

/**
 * Every instance that declares a `tools` graph, with the Tools it yields, in
 * the order `instanceRootsIn` lists them. `empty` names the ones whose graph
 * yields no Tool: they get no page, and are reported rather than drawn.
 *
 * Read through auto-discovery (`toolsOf`), which THROWS on a declared graph
 * that does not load — a partial list would draw an instance as having fewer
 * Tools than it declares.
 */
export function toolSubjects(repo = REPO): { subjects: ToolSubject[]; empty: string[] } {
  const subjects: ToolSubject[] = [];
  const empty: string[] = [];
  for (const inst of instanceRootsIn(repo)) {
    if (instanceDirectoryForGraph(inst, "tools") === undefined) continue;
    const p = declarationPathIn(inst);
    const name = p && existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as { name?: string }).name : undefined;
    if (!name) continue;
    const rows = toolRows(toolsOf(inst));
    if (rows.length === 0) empty.push(name);
    else subjects.push({ name, rows });
  }
  return { subjects, empty };
}

/** How {@link page} titles and introduces the slice it draws. */
export interface PageScope {
  /** `undefined` for the full KG; else the instance whose Tools the page shows. */
  readonly instance?: string;
  /** The per-instance pages, for the full view's index of them. */
  readonly subjects?: readonly { name: string; count: number; href: string }[];
  /** The full view, relative to a sub-graph page. */
  readonly upHref?: string;
}

/** The base docs layer — the same answer `compose-docs.ts` uses. */

const CSS = `
.tg-tag{display:inline-block;padding:.05rem .4rem;border-radius:3px;font-size:.72rem;
  font-weight:600;white-space:nowrap;border:1px solid currentColor;margin-right:.2rem}
/* Bean rtuo: these inks were chosen for a LIGHT page and measured 2.33-2.54:1
   on this site's default dark one (#27262b), under the 4.5:1 text floor. The
   dark inks are the default; the site's light scheme keeps the originals,
   which clear 5.9:1 on white. Every ratio computed, not eyeballed. */
.tg-shell{color:#5cd3bd}   /* 8.23:1 on #27262b */
.tg-mcp{color:#b9a8ec}     /* 7.06:1 */
.tg-inproc{color:#86b8f2}  /* 7.26:1 */
.tg-manual{color:#f5a070}  /* 7.25:1 */
:root[data-fa-scheme="light"] .tg-shell{color:#0d6e5e}
:root[data-fa-scheme="light"] .tg-mcp{color:#6b5b95}
:root[data-fa-scheme="light"] .tg-inproc{color:#1d5fa8}
:root[data-fa-scheme="light"] .tg-manual{color:#a8430f}
.tg-grid{display:flex;flex-wrap:wrap;gap:.75rem;margin:1rem 0}
.tg-stat{flex:1 1 8rem;border:1px solid rgba(128,128,128,.35);border-radius:6px;padding:.5rem .7rem;text-decoration:none;color:inherit;display:block}
.tg-stat:hover,.tg-stat:focus{border-color:currentColor;text-decoration:none}
.tg-stat b{display:block;font-size:1.25rem;line-height:1.2}
.tg-stat span{font-size:.75rem;opacity:.75}
.table-wrapper{position:relative}
.table-wrapper table{min-width:36rem}
@media (max-width: 799.98px) {
  @supports (animation-timeline: scroll()) {
    .table-wrapper {
      mask-image: linear-gradient(to right,
        transparent 0, #000 var(--fa-cue-l, 0px),
        #000 calc(100% - var(--fa-cue-r, 2.5rem)), transparent 100%);
      animation: fa-scroll-cue linear both;
      animation-timeline: scroll(self inline);
    }
  }
  @supports not (animation-timeline: scroll()) {
    .table-wrapper {
      mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent 100%);
    }
  }
}
@property --fa-cue-l { syntax: "<length>"; inherits: false; initial-value: 0px; }
@property --fa-cue-r { syntax: "<length>"; inherits: false; initial-value: 0px; }
@keyframes fa-scroll-cue {
  0%   { --fa-cue-l: 0px;    --fa-cue-r: 2.5rem; }
  12%  { --fa-cue-l: 2.5rem; }
  88%  { --fa-cue-r: 2.5rem; }
  100% { --fa-cue-l: 2.5rem; --fa-cue-r: 0px; }
}
`;

const INVOKE_CLASS: Record<string, string> = {
  shell: "tg-shell",
  mcp: "tg-mcp",
  inProcess: "tg-inproc",
  manual: "tg-manual",
};

function badge(kind: string): string {
  return `<span class="tg-tag ${INVOKE_CLASS[kind] ?? ""}">${kind}</span>`;
}

/** Escape a cell so a pipe in a description cannot break the table. */
function cell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * `skillPages` is the set of skills with a published instruction page
 * (`lib/skill-pages.ts`): a `satisfies` naming one is a link, anything else
 * stays code — bean `qgjh`. `fromPage` is where this page is published, as
 * {@link pageRelPath} reads it from the declaration, so the link is relative
 * to it rather than assumed. With no `skillPages` nothing is linked, so its
 * default does not matter.
 */
export function page(
  rows: readonly ToolRow[],
  known: ReadonlySet<string>,
  skillPages: ReadonlySet<string> = new Set(),
  fromPage = "",
  scope: PageScope = {},
): string {
  const invoke = new Map<string, number>();
  const install = new Map<string, number>();
  for (const r of rows) {
    for (const k of r.invoke) invoke.set(k, (invoke.get(k) ?? 0) + 1);
    for (const k of r.install) install.set(k, (install.get(k) ?? 0) + 1);
  }
  const allSkills = new Set(rows.flatMap((r) => r.satisfies));
  const unresolved = [...allSkills].filter((s) => !known.has(s)).sort();
  const noSatisfies = rows.filter((r) => r.satisfies.length === 0);

  const title = scope.instance === undefined ? "Tools" : `Tools — ${scope.instance}`;
  const whose =
    scope.instance === undefined
      ? scope.subjects !== undefined
        ? "every instance in this checkout declares"
        : "this instance declares"
      : `${scope.instance} declares`;
  const b: string[] = [
    "---",
    `title: "${title}"`,
    `description: "The Tool nodes ${whose} — how each is installed and invoked, and which skill it satisfies."`,
    // The page is the Tools' own words, and a Tool may describe a Liquid
    // step in them: fhir-harness's build-ig-site named its include tags and
    // site-data references, and Jekyll failed smart-ra's whole build on the
    // page (2026-10-15). Nothing here is Liquid, so none is rendered.
    "render_with_liquid: false",
    "---",
    `<style>${CSS}</style>`,
    "",
    ...(scope.instance !== undefined
      ? [
          `The Tool nodes **${scope.instance}** declares in its \`tools\` graph${scope.upHref ? ` — one instance's slice of [every instance's tools](${scope.upHref})` : ""}.`,
          "",
        ]
      : []),
    "A **skill** states a capability generically: what an actor needs to know to",
    "perform a task. A **Tool** is one concrete way to exercise it, with an",
    "installation, an invocation and typed inputs and outputs. One skill may be",
    "satisfied by several tools, and one tool may satisfy several skills.",
    "",
    "They are separate graphs and this is the tools one. The relation between them",
    "is `satisfies`, and it runs **from a tool to a skill** — *this tool is one way",
    "to do that*, never *this skill is a tool*.",
    "",
    "<div class=\"tg-grid\">",
    `<a class="tg-stat" href="#every-tool"><b>${rows.length}</b><span>Tool nodes</span></a>`,
    `<a class="tg-stat" href="#does-every-satisfies-name-a-skill-that-exists"><b>${allSkills.size}</b><span>skills satisfied</span></a>`,
    `<a class="tg-stat" href="#how-they-are-invoked-and-installed"><b>${invoke.get("shell") ?? 0}</b><span>invoked as a shell command</span></a>`,
    `<a class="tg-stat" href="#how-they-are-invoked-and-installed"><b>${invoke.get("mcp") ?? 0}</b><span>reachable over MCP</span></a>`,
    "</div>",
    "",
    ...(scope.subjects !== undefined && scope.subjects.length > 0
      ? [
          "## By instance",
          "",
          "Each instance that declares a `tools` graph has its own page.",
          "",
          "| instance | tools |",
          "|---|---|",
          ...scope.subjects.map((x) => `| [${cell(x.name)}](${x.href}) | ${x.count} |`),
          "",
        ]
      : []),
    "## How they are invoked, and installed",
    "",
    "A tool may declare more than one invocation, so these do not sum to the total.",
    "",
    "| invocation | tools |",
    "|---|---|",
    ...[...invoke.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .map(([k, n]) => `| ${badge(k)} | ${n} |`),
    "",
    "| installation | tools |",
    "|---|---|",
    ...[...install.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .map(([k, n]) => `| \`${k}\` | ${n} |`),
    "",
    "## Does every `satisfies` name a skill that exists?",
    "",
  ];

  // The join, reported either way. "Nothing unresolved" and "the check did not
  // run" are different facts, and a section that appeared only on failure
  // could not tell them apart.
  if (unresolved.length === 0) {
    b.push(
      `Yes — all **${allSkills.size}** skills named across **${rows.length}** tools resolve to a`,
      "skill document in this checkout. A `satisfies` pointing at nothing would be a",
      "tool advertising a capability the graph cannot locate.",
      "",
    );
  } else {
    b.push(
      `**${unresolved.length} of ${allSkills.size} do not.** A \`satisfies\` naming a skill that is`,
      "not in this checkout is a dangling reference — the tool advertises a capability",
      "the graph cannot locate.",
      "",
      "| unresolved skill | named by |",
      "|---|---|",
      ...unresolved.map((s) => {
        const by = rows.filter((r) => r.satisfies.includes(s)).map((r) => `\`${r.id}\``);
        return `| \`${cell(s)}\` | ${by.join(", ")} |`;
      }),
      "",
    );
  }

  if (noSatisfies.length > 0) {
    b.push(
      `**${noSatisfies.length} tool(s) satisfy no skill at all**, which is a different gap: the`,
      "tool exists and nothing says what capability it is a way of exercising.",
      "",
      ...noSatisfies.map((r) => `- \`${cell(r.id)}\` — ${cell(r.title)}`),
      "",
    );
  }

  b.push("## Every tool", "", "| tool | what it does | invoked | satisfies | i/o |", "|---|---|---|---|---|");
  for (const r of rows) {
    const sat = r.satisfies.length
      ? r.satisfies
          .map((s) => {
            const href = skillPageHref(s, fromPage, skillPages);
            return href === undefined ? `\`${cell(s)}\`` : `[\`${cell(s)}\`](${href})`;
          })
          .join("<br>")
      : "**—**";
    b.push(
      `| <a id="${cell(r.id)}"></a>[\`${cell(r.id)}\`](#${cell(r.id)})<br>${cell(r.title)} | ${cell(r.description)} | ` +
        `${r.invoke.map(badge).join(" ")} | ${sat} | ${r.inputs} in / ${r.outputs} out |`,
    );
  }
  b.push("");
  return b.join("\n").trimEnd() + "\n";
}

/** The page as committed: {@link page} plus the directories it draws (#1168 B7a-2). */
export function publishedPage(
  rows: Parameters<typeof page>[0],
  known: Parameters<typeof page>[1],
  repo = REPO,
  scope: PageScope = {},
): string {
  // With no declared page there is no base to link from: render codes, never
  // guess a location.
  const rel = pageRelPath(repo, scope.instance);
  const skillPages = rel === undefined ? new Set<string>() : skillPagesOf(repo);
  return withRenderedByFrontMatter(
    page(rows, known, skillPages, rel ?? "", scope),
    VIEWER_TOOL,
  );
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  // Every declared `tools` graph, not cat-harness's alone (bean 1nu0). A
  // discovery failure is reported, never folded into "no tools".
  const found = discoverTools(REPO);
  if (found.failures.length > 0) {
    for (const f of found.failures) console.error(`::error::gen-tools-viz: ${f.dir ?? f.instance}: ${f.reason}`);
    process.exit(1);
  }
  const rows = toolRows(found.tools);
  if (rows.length === 0) {
    // A declared graph that yields nothing is the `dh4f` shape — scanning
    // nothing and reporting a clean run. Refuse rather than write an empty page.
    console.error("::error::gen-tools-viz: the tools graph yielded no nodes");
    process.exit(1);
  }
  const PAGE = pageRelPath(REPO);
  if (PAGE === undefined) {
    console.error(`::error::gen-tools-viz: no visualiser declared for graph typology '${KIND}'`);
    process.exit(1);
  }
  const known = skillIds(REPO);
  const { subjects, empty } = toolSubjects(REPO);
  const localDocs = localSiteDir(resolve(HARNESS_ROOT));
  const site = siteTarget(localDocs ?? baseDocsDir(REPO));

  /** Every page this run draws, site-relative, with its content. */
  const pages = new Map<string, string>();
  pages.set(
    PAGE,
    publishedPage(rows, known, REPO, {
      subjects: subjects.map((x) => ({ name: x.name, count: x.rows.length, href: `${x.name}/` })),
    }),
  );
  for (const x of subjects) {
    const rel = pageRelPath(REPO, x.name)!;
    pages.set(rel, publishedPage(x.rows, known, REPO, { instance: x.name, upHref: "../" }));
  }

  // ORPHANS: a sub-graph page this viewer drew for an instance that no
  // longer declares Tools. Only a page that says it is ours is touched.
  const viewDir = join(site, PAGE, "..");
  const drawn = new Set(subjects.map((x) => x.name));
  const orphans = existsSync(viewDir)
    ? readdirSync(viewDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !drawn.has(e.name))
        .map((e) => join(viewDir, e.name))
        .filter((d) => {
          const f = join(d, "index.md");
          return existsSync(f) && renderedByOf(readFileSync(f, "utf-8")) === VIEWER_TOOL;
        })
    : [];

  if (check) {
    let stale = 0;
    for (const [rel, rendered] of pages) {
      const out = join(site, rel);
      const current = existsSync(out) ? readFileSync(out, "utf-8") : "";
      if (current !== rendered) {
        console.error(`::error::gen-tools-viz: ${rel} is stale — run \`bun run cat tools:viz\``);
        stale++;
      }
    }
    for (const d of orphans) {
      console.error(`::error::gen-tools-viz: ${d} is an orphan — its instance declares no Tools now`);
      stale++;
    }
    if (stale > 0) process.exit(1);
    console.log(`✓ tools viewer is current — ${rows.length} tool(s), ${subjects.length} instance page(s)`);
  } else {
    for (const [rel, rendered] of pages) {
      const out = join(site, rel);
      mkdirSync(join(out, ".."), { recursive: true });
      writeFileSync(out, rendered);
    }
    for (const d of orphans) {
      rmSync(d, { recursive: true });
      console.log(`  ✗ pruned ${d}`);
    }
    const bad = [...new Set(rows.flatMap((r) => r.satisfies))].filter((s) => !known.has(s));
    console.log(`tools viewer: ${rows.length} tool(s) → ${PAGE}`);
    for (const x of subjects) console.log(`  ${x.name}: ${x.rows.length} tool(s) → ${pageRelPath(REPO, x.name)}`);
    console.log(bad.length === 0 ? "  every satisfies resolves" : `  ${bad.length} unresolved — shown on the page`);
  }
  // An instance that declares a `tools` graph yielding no Tool gets no page —
  // and is said, so its tile's "no viewer yet" is explained rather than silent.
  for (const n of empty) console.log(`  · ${n} declares a tools graph with no Tool nodes — no page drawn`);
}
