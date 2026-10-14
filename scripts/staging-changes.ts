#!/usr/bin/env bun
/**
 * The CHANGES page of a staging preview: `STAGING/<slug>/changes/`.
 *
 * Owner, 2026-10-14: *"when we have a STAGING preview branch, we need a new
 * visualizer endpoint that at least in an index.html lists all of the changed
 * assets in the repo and, where known, downstream changed/derivative assets in
 * its dependency cone ... it should also check difference between gh-pages
 * root and the STAGING/<BRANCH> dirs in a list of its changes (QA check - some
 * were not in the dependency cone)"*.
 *
 * Three lists, each from a tool that already answers it; this file computes
 * none of them anew except the first one's mount expansion and the folding
 * the third needs:
 *
 * | list | from |
 * |---|---|
 * | 1. changed SOURCE assets | the branch's file list, with every re-pinned mount in `index.lock.json` EXPANDED into the files that changed between its two pins (`expandRepins`) |
 * | 2. downstream RENDERED assets, predicted | the docs renderer's `rendered-impact.json` (skill `rendered-impact`), computed over list 1 |
 * | 3. the QA check | the built preview against the site published at the `gh-pages` ROOT (`measureSites`), sorted by `comparePrediction` into in-cone and NOT in the cone |
 *
 * ## Why a re-pin has to be expanded
 *
 * A change to a mounted instance (smart-base, say) reaches this site as a
 * one-line edit to `index.lock.json`. Handed to a renderer as it is, that
 * predicts nothing, and the reviewer is shown one JSON file. So each mount
 * whose commit moved is diffed in its OWN repository between the two pins,
 * and each changed file is mapped through the lock's `directories` to the
 * path it is mounted at. A pin that cannot be diffed is said, never dropped.
 *
 * ## Why the QA diff compares the page BODY, with the base folded
 *
 * A preview is built under `/<repo>/STAGING/<slug>/` and main under `/<repo>/`,
 * and each stamps its own build into the chrome. Compared byte for byte every
 * page differs, and the QA list would name all of them. So, in text files,
 * the preview's base is folded to main's, the `BUILD_STAMPS` are blanked, and
 * an HTML page is compared by its `<main>` element when it has one: the
 * content a reader reviews, not the navigation every page repeats. The page
 * states this rule, because a difference outside `<main>` is not reported.
 *
 * Usage:
 *   bun run cat-harness-tools/scripts/staging-changes.ts expand \
 *     --changed-files pr-files.txt --base-lock base.lock.json --head-lock index.lock.json \
 *     --out-list changed-expanded.txt --out-json sources.json
 *   bun run cat-harness-tools/scripts/staging-changes.ts render --sources sources.json \
 *     [--predicted rendered-impact.json] [--before pages-root --after _site \
 *      --staging-base /repo/STAGING/slug --site-base /repo --base <sha>] \
 *     --site-url https://o.github.io/repo/ --staging-url https://o.github.io/repo/STAGING/slug/ \
 *     --repo o/repo --head <sha> --branch <b> --slug <s> [--pr <n>] --out _site/changes
 *
 * @module cat-harness-tools/scripts/staging-changes
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
  BUILD_STAMPS,
  comparePrediction,
  isGenericIndex,
  RENDERED_IMPACT_TAG,
  RenderedImpactSchema,
  type PredictionCheck,
  type RenderedFile,
  type RenderedImpact,
  type RenderedRole,
} from "@litlfred/cat-harness/schemas/rendered-impact.ts";

export const STAGING_CHANGES_TAG = "staging-changes/v1" as const;

// ─── 1. Source assets ──────────────────────────────────────────────────────

export type SourceStatus = "added" | "modified" | "removed" | "renamed" | "changed";

export interface SourceChange {
  /** The path in THIS checkout (a mounted file at its mount path). */
  path: string;
  status: SourceStatus;
  /** The previous path, for a rename. */
  from?: string;
  /** `owner/repo` the file lives in. */
  repository: string;
  /** The path in that repository. */
  upstreamPath: string;
  /** The commit the file is read at (head side; base side for a removal). */
  ref?: string;
  /** The mount it came through, or absent for the checkout's own file. */
  instance?: string;
  /** False for a file the instance's repository changed outside every directory the lock mounts. */
  mounted: boolean;
}

export interface Repin {
  instance: string;
  repository: string;
  from: string | null;
  to: string | null;
  /** How many files changed between the pins, or null when it could not be listed. */
  files: number | null;
  /** Why the change between the pins is not (fully) listed. */
  doubt?: string;
}

export interface Sources {
  $schema: typeof STAGING_CHANGES_TAG;
  repository: string;
  head?: string;
  changes: SourceChange[];
  repins: Repin[];
}

interface LockDirectory {
  path: string;
  upstreamPath: string;
}
interface LockInstance {
  instance: string;
  repository: string;
  sha: string;
  directories?: LockDirectory[];
}
export interface Lock {
  instances?: LockInstance[];
}

/** One file a repository's diff between two commits reports. */
export interface DiffEntry {
  status: Exclude<SourceStatus, "changed">;
  path: string;
  from?: string;
}

/** Lists what changed in `repository` between two commits; throws when it cannot. */
export type Differ = (repository: string, from: string, to: string) => DiffEntry[];

/** Where an upstream path is mounted in this checkout, by the longest declared directory that holds it. */
export function mountedPath(upstream: string, dirs: readonly LockDirectory[]): string | undefined {
  let best: LockDirectory | undefined;
  for (const d of dirs) {
    const up = d.upstreamPath.replace(/\/+$/, "");
    const holds = up === "." || up === "" || upstream === up || upstream.startsWith(`${up}/`);
    if (holds && (!best || up.length > best.upstreamPath.replace(/\/+$/, "").length)) best = d;
  }
  if (!best) return undefined;
  const up = best.upstreamPath.replace(/\/+$/, "");
  const rest = up === "." || up === "" ? upstream : upstream.slice(up.length).replace(/^\//, "");
  const to = best.path.replace(/\/+$/, "");
  return rest ? `${to}/${rest}` : to;
}

/**
 * The files each re-pinned mount changed, at their mount paths. A mount whose
 * commit did not move contributes nothing; one added or removed, or whose two
 * pins could not be diffed, is a `Repin` with its `doubt` and no files.
 */
export function expandRepins(base: Lock, head: Lock, differ: Differ): { repins: Repin[]; changes: SourceChange[] } {
  const before = new Map((base.instances ?? []).map((i) => [i.instance, i]));
  const after = new Map((head.instances ?? []).map((i) => [i.instance, i]));
  const repins: Repin[] = [];
  const changes: SourceChange[] = [];
  for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(name);
    const b = after.get(name);
    if (a && b && a.sha === b.sha && a.repository === b.repository) continue;
    const repository = (b ?? a)!.repository;
    if (!a || !b || a.repository !== b.repository) {
      repins.push({
        instance: name,
        repository,
        from: a?.sha ?? null,
        to: b?.sha ?? null,
        files: null,
        doubt: !a ? "newly mounted: every file under its directories is new here" : !b ? "no longer mounted: every file it supplied is gone" : `moved from ${a.repository} to ${b.repository}`,
      });
      continue;
    }
    const dirs = [...(a.directories ?? []), ...(b.directories ?? [])];
    let entries: DiffEntry[];
    try {
      entries = differ(repository, a.sha, b.sha);
    } catch (e) {
      repins.push({ instance: name, repository, from: a.sha, to: b.sha, files: null, doubt: `could not list the files changed between the pins: ${(e as Error).message.split("\n")[0]}` });
      continue;
    }
    repins.push({ instance: name, repository, from: a.sha, to: b.sha, files: entries.length });
    for (const e of entries) {
      const at = mountedPath(e.path, dirs);
      changes.push({
        path: at ?? e.path,
        status: e.status,
        ...(e.from ? { from: mountedPath(e.from, dirs) ?? e.from } : {}),
        repository,
        upstreamPath: e.path,
        ref: e.status === "removed" ? a.sha : b.sha,
        instance: name,
        mounted: at !== undefined,
      });
    }
  }
  return { repins, changes };
}

/** `git diff --name-status` output, as `DiffEntry`s. */
export function parseNameStatus(text: string): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [code, p1, p2] = line.split("\t");
    const c = code[0];
    if (c === "R" && p2) out.push({ status: "renamed", from: p1, path: p2 });
    else if (c === "A") out.push({ status: "added", path: p1 });
    else if (c === "D") out.push({ status: "removed", path: p1 });
    else if (c === "C" && p2) out.push({ status: "added", path: p2 });
    else out.push({ status: "modified", path: p1 });
  }
  return out;
}

/** The real differ: both commits fetched without blobs into a scratch repository, then their trees compared. */
export const gitDiffer: Differ = (repository, from, to) => {
  const dir = mkdtempSync(join(tmpdir(), "staging-changes-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf-8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init", "-q");
    git("fetch", "-q", "--depth=1", "--filter=blob:none", `https://github.com/${repository}`, from, to);
    return parseNameStatus(git("diff", "--name-status", "-M", "-l0", from, to));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** A PR's file list: `path`, or `status<TAB>path` as the REST API names statuses. */
export function parseChangedList(text: string): { path: string; status: SourceStatus; from?: string }[] {
  const api: Record<string, SourceStatus> = { added: "added", removed: "removed", modified: "modified", renamed: "renamed", changed: "modified", copied: "added" };
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split("\t");
      if (parts.length === 1) return { path: parts[0], status: "changed" as const };
      const [s, path, from] = parts;
      return { path, status: api[s] ?? "changed", ...(from ? { from } : {}) };
    });
}

/** List 1: the checkout's own changed files, and every re-pinned mount's files at their mount paths. */
export function collectSources(o: { repository: string; head?: string; changed: string; base?: Lock; headLock?: Lock; differ: Differ; lockFile?: string }): Sources {
  const own = parseChangedList(o.changed).map(
    (c): SourceChange => ({ path: c.path, status: c.status, ...(c.from ? { from: c.from } : {}), repository: o.repository, upstreamPath: c.path, ...(o.head ? { ref: o.head } : {}), mounted: true }),
  );
  const lockFile = o.lockFile ?? "index.lock.json";
  const touchesLock = own.some((c) => c.path === lockFile);
  const { repins, changes } = touchesLock && o.base && o.headLock ? expandRepins(o.base, o.headLock, o.differ) : { repins: [], changes: [] };
  if (touchesLock && (!o.base || !o.headLock)) {
    repins.push({ instance: "*", repository: o.repository, from: null, to: null, files: null, doubt: `${lockFile} changed, but its base side was not supplied: re-pinned mounts are not expanded` });
  }
  return { $schema: STAGING_CHANGES_TAG, repository: o.repository, ...(o.head ? { head: o.head } : {}), changes: [...own, ...changes], repins };
}

/** The paths a renderer's cone is computed over: every changed mounted path, and a rename's old path too. */
export function coneInputs(s: Sources): string[] {
  const out = new Set<string>();
  for (const c of s.changes) {
    if (!c.mounted) continue;
    out.add(c.path);
    if (c.from) out.add(c.from);
  }
  return [...out].sort();
}

// ─── 3. The QA check: the preview against the gh-pages root ────────────────

/** Never compared: other previews, the render log, git's own files. */
export const PUBLISH_ROOT_OTHERS = /^(STAGING|_render-log|\.git)(\/|$)/;
/** The staging job's own files beside a preview, which main's publish never writes. */
export const PREVIEW_ARTEFACTS =
  /^(changes\/.*|changeset\.json|changeset-text\.json|rendered-impact\.json|rendered-measured\.json|blocks\.json|block-qa\.json|review-comments\.json|visual-diff\.json|visual\/.*|\.staged-at|staging-preview\.json)$/;

const TEXTUAL = /\.(html?|css|js|json|jsonld|xml|txt|svg|md)$/i;

/** Every occurrence of the preview's base, as main's (`/r/STAGING/s` → `/r`), path-aligned. */
export function foldBase(text: string, stagingBase: string, siteBase: string): string {
  const from = stagingBase.replace(/\/+$/, "");
  const to = siteBase.replace(/\/+$/, "");
  return from ? text.split(from).join(to) : text;
}

/** The content of a page's `<main>` element, or the whole page when it has none. */
export function pageBody(html: string): string {
  const open = html.search(/<main[\s>]/i);
  const close = html.toLowerCase().lastIndexOf("</main>");
  return open >= 0 && close > open ? html.slice(open, close) : html;
}

export interface CompareRule {
  stagingBase: string;
  siteBase: string;
}

/** The hash a file is compared by, under the folding rule. */
export function comparableHash(path: string, bytes: Buffer, rule: CompareRule | undefined): string {
  if (!TEXTUAL.test(path)) return createHash("sha256").update(bytes).digest("hex");
  let text = bytes.toString("utf-8");
  if (rule) text = foldBase(text, rule.stagingBase, rule.siteBase);
  for (const [re, blank] of BUILD_STAMPS) text = text.replace(re, blank);
  if (/\.html?$/i.test(path)) text = pageBody(text);
  return createHash("sha256").update(text).digest("hex");
}

function walk(root: string, skip: RegExp, rule: CompareRule | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(root, p).split("\\").join("/");
      if (skip.test(rel) || skip.test(`${rel}/`)) continue;
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) out.set(rel, comparableHash(rel, readFileSync(p), rule));
    }
  }
  return out;
}

/**
 * The build diff of a preview against the site published at the publish root.
 * The root side leaves out every other preview and the render log; the
 * preview side leaves out the staging job's own files.
 */
export function measureSites(o: { before: string; after: string; rule?: CompareRule; head?: string; base?: string }): RenderedImpact {
  const a = walk(o.before, PUBLISH_ROOT_OTHERS, undefined);
  const b = walk(o.after, PREVIEW_ARTEFACTS, o.rule);
  const role = (p: string): RenderedRole => (isGenericIndex(p) ? "index" : p.endsWith(".html") ? "content" : "data");
  const files: RenderedFile[] = [];
  for (const [p, h] of b) {
    const old = a.get(p);
    if (old === undefined) files.push({ path: p, change: "added", role: role(p), via: [] });
    else if (old !== h) files.push({ path: p, change: "changed", role: role(p), via: [] });
  }
  for (const p of a.keys()) if (!b.has(p)) files.push({ path: p, change: "removed", role: role(p), via: [] });
  files.sort((x, y) => x.path.localeCompare(y.path));
  return RenderedImpactSchema.parse({
    $schema: RENDERED_IMPACT_TAG,
    renderer: "publish-root-diff",
    method: "build-diff",
    ...(o.base ? { base: o.base } : {}),
    ...(o.head ? { head: o.head } : {}),
    files,
  });
}

export interface QaCheck {
  /** `known` when the root was built from this branch's base; `not-base` when main has moved since. */
  status: "known" | "not-base" | "unknown-before";
  beforeCommit: string | null;
  baseCommit: string | null;
  measured: number;
  /** Changed or added in the preview, and NOT in the predicted cone: the finding. */
  notInCone: RenderedFile[];
  /** In the cone and measured. */
  confirmed: string[];
  /** In the cone, not measured. */
  unconfirmed: PredictionCheck["unconfirmed"];
  /** On the root, not in the preview (an instance the preview does not carry, or a page the build dropped), by top directory. */
  absent: { dir: string; count: number; sample: string[] }[];
}

/** A single prediction from several renderers' files. */
export function mergeImpacts(impacts: readonly RenderedImpact[]): RenderedImpact {
  const files = new Map<string, RenderedFile>();
  for (const i of impacts) for (const f of i.files) if (!files.has(f.path)) files.set(f.path, f);
  return RenderedImpactSchema.parse({
    $schema: RENDERED_IMPACT_TAG,
    renderer: impacts.map((i) => i.renderer).join("+") || "none",
    method: "cone",
    files: [...files.values()],
    undetermined: impacts.flatMap((i) => i.undetermined),
  });
}

export function qaCheck(predicted: RenderedImpact, measured: RenderedImpact, beforeCommit: string | null, baseCommit: string | null): QaCheck {
  const check = comparePrediction(predicted, measured);
  const missed = new Set(check.missed);
  const byPath = new Map(measured.files.map((f) => [f.path, f]));
  const notInCone: RenderedFile[] = [];
  const absent = new Map<string, string[]>();
  for (const p of missed) {
    const f = byPath.get(p)!;
    if (f.change !== "removed") notInCone.push(f);
    else {
      const dir = p.includes("/") ? p.slice(0, p.indexOf("/")) : "(root)";
      absent.set(dir, [...(absent.get(dir) ?? []), p]);
    }
  }
  return {
    status: !beforeCommit ? "unknown-before" : beforeCommit === baseCommit ? "known" : "not-base",
    beforeCommit,
    baseCommit,
    measured: measured.files.length,
    notInCone,
    confirmed: check.confirmed,
    unconfirmed: check.unconfirmed,
    absent: [...absent].map(([dir, ps]) => ({ dir, count: ps.length, sample: ps.slice(0, 20) })).sort((x, y) => y.count - x.count || x.dir.localeCompare(y.dir)),
  };
}

// ─── The page ──────────────────────────────────────────────────────────────

export interface PageInput {
  sources: Sources;
  predicted?: RenderedImpact;
  qa?: QaCheck;
  /** Why there is no QA check, when there is none. */
  qaAbsent?: string;
  siteUrl: string;
  stagingUrl: string;
  branch: string;
  slug: string;
  pr?: string;
  generatedAt: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
const slash = (u: string) => (u.endsWith("/") ? u : `${u}/`);
const short = (sha?: string | null) => (sha ? sha.slice(0, 7) : "?");

function blobUrl(c: SourceChange): string | undefined {
  return c.ref ? `https://github.com/${c.repository}/blob/${c.ref}/${enc(c.upstreamPath)}` : undefined;
}

function pageLinks(path: string, change: string, o: PageInput): string {
  const before = change === "added" ? "" : `<a href="${esc(slash(o.siteUrl) + enc(path))}">main</a>`;
  const after = change === "removed" ? "" : `<a href="${esc(slash(o.stagingUrl) + enc(path))}">preview</a>`;
  return [before, after].filter(Boolean).join(" · ") || "—";
}

function badge(kind: string): string {
  return `<span class="b b-${esc(kind)}">${esc(kind)}</span>`;
}

function sourceTable(rows: SourceChange[]): string {
  return `<table><thead><tr><th>status</th><th>file</th><th>source</th></tr></thead><tbody>${rows
    .map((c) => {
      const url = blobUrl(c);
      const name = `<code>${esc(c.path)}</code>${c.from ? ` <span class="muted">from <code>${esc(c.from)}</code></span>` : ""}${c.mounted ? "" : ' <span class="muted">(outside every mounted directory: reaches no page here)</span>'}`;
      return `<tr data-q="${esc(c.path.toLowerCase())}"><td>${badge(c.status)}</td><td>${name}</td><td>${url ? `<a href="${esc(url)}">${esc(c.repository)}@${short(c.ref)}</a>` : esc(c.repository)}</td></tr>`;
    })
    .join("")}</tbody></table>`;
}

function renderedTable(files: readonly RenderedFile[], o: PageInput, measured?: Set<string>): string {
  return `<table><thead><tr><th>change</th><th>rendered file</th><th>role</th><th>reached through</th><th>compare</th>${measured ? "<th>measured</th>" : ""}</tr></thead><tbody>${files
    .map(
      (f) =>
        `<tr data-q="${esc(f.path.toLowerCase())}"><td>${badge(f.change)}</td><td><code>${esc(f.path)}</code>${(f.anchors ?? []).map((a) => ` <a class="muted" href="${esc(slash(o.stagingUrl) + enc(f.path))}#${esc(encodeURIComponent(a))}">#${esc(a)}</a>`).join("")}</td><td>${esc(f.role)}</td><td class="via">${f.via.map((v) => `<code>${esc(v)}</code>`).join(" → ") || '<span class="muted">—</span>'}</td><td>${pageLinks(f.path, f.change, o)}</td>${measured ? `<td>${measured.has(f.path) ? '<span class="ok">✓ changed</span>' : '<span class="muted">not measured</span>'}</td>` : ""}</tr>`,
    )
    .join("")}</tbody></table>`;
}

/** The whole page, self-contained: no script or stylesheet from anywhere else. */
export function renderPage(o: PageInput): string {
  const s = o.sources;
  const own = s.changes.filter((c) => !c.instance);
  const byInstance = new Map<string, SourceChange[]>();
  for (const c of s.changes) if (c.instance) byInstance.set(c.instance, [...(byInstance.get(c.instance) ?? []), c]);
  const predicted = o.predicted;
  const measured = o.qa ? new Set([...o.qa.confirmed]) : undefined;
  const qa = o.qa;

  const counts = [
    `<div class="tile"><b>${s.changes.length}</b><span>source files changed</span></div>`,
    `<div class="tile"><b>${predicted ? predicted.files.length : "?"}</b><span>rendered files predicted${predicted && predicted.undetermined.length ? ` · ${predicted.undetermined.length} input(s) undetermined` : ""}</span></div>`,
    qa
      ? `<div class="tile ${qa.notInCone.length ? "warn" : "good"}"><b>${qa.notInCone.length}</b><span>changed on the preview, NOT in the cone</span></div>`
      : `<div class="tile"><b>?</b><span>not measured</span></div>`,
  ].join("");

  const repinRows = s.repins
    .map(
      (r) =>
        `<li><b>${esc(r.instance)}</b> <span class="muted">${esc(r.repository)}</span> ${r.from && r.to ? `<a href="https://github.com/${esc(r.repository)}/compare/${esc(r.from)}...${esc(r.to)}">${short(r.from)}…${short(r.to)}</a>` : `${short(r.from)} → ${short(r.to)}`} — ${r.files === null ? `<span class="warn-t">${esc(r.doubt ?? "not listed")}</span>` : `${r.files} file(s)`}</li>`,
    )
    .join("");

  const sec1 = `<section id="sources"><h2>1. Changed source assets</h2>
<p>Every file this branch changes. A re-pinned mount in <code>index.lock.json</code> is expanded into the files that changed in its own repository between the two pins, shown at the path it is mounted at.</p>
${s.repins.length ? `<h3>Re-pinned mounts</h3><ul>${repinRows}</ul>` : ""}
<h3>This repository <span class="muted">(${esc(s.repository)}, ${own.length})</span></h3>
${own.length ? sourceTable(own) : '<p class="muted">No file of its own.</p>'}
${[...byInstance]
  .map(([name, rows]) => `<details open><summary><b>${esc(name)}</b> <span class="muted">(${rows.length})</span></summary>${sourceTable(rows)}</details>`)
  .join("")}
</section>`;

  const sec2 = `<section id="cone"><h2>2. Downstream rendered assets — the dependency cone</h2>
${
  predicted
    ? `<p>Predicted before the build by <code>${esc(predicted.renderer)}</code> from the files above (skill <code>rendered-impact</code>). <em>Reached through</em> is the chain from a changed input to the file.</p>
${predicted.files.length ? renderedTable(predicted.files, o, measured) : '<p class="muted">The cone names no rendered file.</p>'}
${
  predicted.undetermined.length
    ? `<h3>Inputs the renderer could not place <span class="muted">(${predicted.undetermined.length})</span></h3><p>Not "no change": the renderer cannot say which files these reach. The QA check below is what measures them.</p><table><thead><tr><th>input</th><th>scope</th><th>why</th></tr></thead><tbody>${predicted.undetermined
        .map((u) => `<tr data-q="${esc(u.input.toLowerCase())}"><td><code>${esc(u.input)}</code></td><td>${esc(u.scope)}</td><td>${esc(u.reason)}</td></tr>`)
        .join("")}</tbody></table>`
    : ""
}`
    : `<p class="warn-t">Not known: this build wrote no prediction (<code>rendered-impact.json</code>). That is not "nothing changes".</p>`
}
</section>`;

  let sec3: string;
  if (!qa) {
    sec3 = `<section id="qa"><h2>3. QA — the preview against the <code>gh-pages</code> root</h2><p class="warn-t">Not measured: ${esc(o.qaAbsent ?? "no published root site to compare with")}. That is not "nothing missed".</p></section>`;
  } else {
    const stale =
      qa.status === "known"
        ? `<p class="ok">The root was built from <code>${short(qa.beforeCommit)}</code>, this branch's base, so a difference below is this branch's.</p>`
        : qa.status === "not-base"
          ? `<p class="warn-t">The root was built from <code>${short(qa.beforeCommit)}</code>, not this branch's base <code>${short(qa.baseCommit)}</code>: main has moved since, so some differences below may be main's own.</p>`
          : `<p class="warn-t">The root records no build commit (<code>build.json</code>), so a difference below may be main's own.</p>`;
    sec3 = `<section id="qa"><h2>3. QA — the preview against the <code>gh-pages</code> root</h2>
<p>Every file of this preview compared with the same path on the published site at the root. ${qa.measured} file(s) differ. Compared: the <code>&lt;main&gt;</code> element of a page (the navigation every page repeats is left out), with the preview's base URL folded to the site's and build stamps blanked; any other file byte for byte.</p>
${stale}
<h3>Changed, but not in the dependency cone <span class="muted">(${qa.notInCone.length})</span></h3>
${qa.notInCone.length ? `<p>Each of these differs from the root and no renderer predicted it: a reviewer was not told to look. Either the cone is missing an edge, or something outside this branch changed it.</p>${renderedTable(qa.notInCone, o)}` : '<p class="ok">None: everything the build changed was predicted.</p>'}
<h3>In the cone, and changed <span class="muted">(${qa.confirmed.length})</span></h3>
${qa.confirmed.length ? `<details><summary>show</summary><ul class="paths">${qa.confirmed.map((p) => `<li data-q="${esc(p.toLowerCase())}"><code>${esc(p)}</code> — ${pageLinks(p, "changed", o)}</li>`).join("")}</ul></details>` : '<p class="muted">None.</p>'}
<h3>In the cone, but unchanged <span class="muted">(${qa.unconfirmed.length})</span></h3>
<p class="muted">Expected for a page that loads its data in the browser; otherwise the cone is wider than it needs to be (safe, but say so).</p>
${qa.unconfirmed.length ? `<details><summary>show</summary><ul class="paths">${qa.unconfirmed.map((u) => `<li data-q="${esc(u.path.toLowerCase())}"><code>${esc(u.path)}</code> <span class="muted">${esc(u.role)}</span></li>`).join("")}</ul></details>` : ""}
<h3>On the root, not in this preview <span class="muted">(${qa.absent.reduce((n, a) => n + a.count, 0)})</span></h3>
<p class="muted">Usually a part of the site this preview does not carry (it is left out of the cone and stubbed). A content page here that the branch did not mean to remove is a finding.</p>
${qa.absent.length ? `<table><thead><tr><th>directory</th><th>files</th><th>e.g.</th></tr></thead><tbody>${qa.absent.map((a) => `<tr data-q="${esc(a.dir.toLowerCase())}"><td><code>${esc(a.dir)}/</code></td><td>${a.count}</td><td>${a.sample.slice(0, 3).map((p) => `<code>${esc(p)}</code>`).join(", ")}</td></tr>`).join("")}</tbody></table>` : ""}
</section>`;
  }

  const prLink = o.pr ? ` · <a href="https://github.com/${esc(s.repository)}/pull/${esc(o.pr)}">pull request #${esc(o.pr)}</a>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Changes — ${esc(o.branch)}</title>
<style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#dcdce0;--tile:#f5f5f7;--ok:#1a7f37;--warn:#9a6700;--warn-bg:#fff8e1;--accent:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececf0;--muted:#a0a0a8;--line:#34343a;--tile:#1f1f23;--ok:#5cc878;--warn:#e3b341;--warn-bg:#2d2610;--accent:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1200px;margin:0 auto;padding:16px}a{color:var(--accent)}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
h1{font-size:1.5rem;margin:.2em 0}h2{margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:.2em}h3{margin-top:1.4em;font-size:1.05rem}
.muted{color:var(--muted)}.ok{color:var(--ok)}.warn-t{color:var(--warn)}
.tiles{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.tile{background:var(--tile);border-radius:8px;padding:10px 14px;min-width:180px;flex:1}
.tile b{display:block;font-size:1.6rem}.tile.warn{background:var(--warn-bg)}.tile.warn b{color:var(--warn)}.tile.good b{color:var(--ok)}
table{border-collapse:collapse;width:100%;margin:8px 0;display:block;overflow-x:auto}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;font-size:13px;color:var(--muted)}.via code{font-size:12px}
.b{display:inline-block;font-size:12px;padding:0 6px;border-radius:4px;background:var(--tile);border:1px solid var(--line)}
.b-added{color:var(--ok)}.b-removed{color:#c5221f}.b-renamed,.b-changed,.b-modified{color:var(--accent)}
ul.paths{columns:2 360px}nav a{margin-right:12px}
#filter{width:100%;max-width:420px;padding:6px 10px;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
details{margin:8px 0}summary{cursor:pointer}
</style></head><body><main>
<p class="muted"><a href="${esc(o.stagingUrl)}">← the preview</a> · <a href="${esc(o.siteUrl)}">the published site</a>${prLink} · <a href="changes.json">changes.json</a></p>
<h1>What this branch changes</h1>
<p>Branch <code>${esc(o.branch)}</code> (preview <code>${esc(o.slug)}</code>) at <a href="https://github.com/${esc(s.repository)}/commit/${esc(s.head ?? "")}"><code>${short(s.head)}</code></a>. Generated ${esc(o.generatedAt)}.</p>
<div class="tiles">${counts}</div>
<nav><a href="#sources">1. sources</a><a href="#cone">2. dependency cone</a><a href="#qa">3. QA against the root</a></nav>
<p><label for="filter">Filter every list by path: </label><br><input id="filter" type="search" placeholder="e.g. smart-base/processes" autocomplete="off"></p>
${sec1}
${sec2}
${sec3}
</main>
<script>
(function(){var f=document.getElementById("filter");if(!f)return;f.addEventListener("input",function(){var q=f.value.trim().toLowerCase();document.querySelectorAll("[data-q]").forEach(function(el){el.hidden=!!q&&el.getAttribute("data-q").indexOf(q)<0;});if(q)document.querySelectorAll("details").forEach(function(d){d.open=true;});});})();
</script>
</body></html>
`;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function readJson<T>(p: string | undefined): T | undefined {
  return p && existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as T) : undefined;
}

if (import.meta.main) {
  const [cmd, ...argv] = process.argv.slice(2);
  const arg = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (cmd === "expand") {
    const changedFile = arg("--changed-files");
    const changed = changedFile && existsSync(changedFile) ? readFileSync(changedFile, "utf-8") : "";
    const sources = collectSources({
      repository: arg("--repo") ?? process.env.GITHUB_REPOSITORY ?? "unknown/unknown",
      head: arg("--head"),
      changed,
      base: readJson<Lock>(arg("--base-lock")),
      headLock: readJson<Lock>(arg("--head-lock") ?? "index.lock.json"),
      differ: gitDiffer,
    });
    const list = coneInputs(sources);
    if (arg("--out-list")) writeFileSync(arg("--out-list")!, list.join("\n") + (list.length ? "\n" : ""));
    if (arg("--out-json")) writeFileSync(arg("--out-json")!, JSON.stringify(sources, null, 2) + "\n");
    console.error(`staging-changes: ${sources.changes.length} changed file(s), ${list.length} cone input(s), ${sources.repins.length} re-pinned mount(s)`);
    for (const r of sources.repins) console.error(`  · ${r.instance} ${short(r.from)}…${short(r.to)}: ${r.files ?? r.doubt}`);
  } else if (cmd === "render") {
    const sources = readJson<Sources>(arg("--sources"));
    const out = arg("--out");
    const [siteUrl, stagingUrl] = [arg("--site-url"), arg("--staging-url")];
    if (!sources || !out || !siteUrl || !stagingUrl) {
      console.error("usage: staging-changes.ts render --sources <json> --out <dir> --site-url <url> --staging-url <url> [--predicted <json>] [--before <dir> --after <dir> --staging-base <path> --site-base <path> --base <sha>]");
      process.exit(2);
    }
    const raw = readJson<unknown>(arg("--predicted"));
    const predicted = raw === undefined ? undefined : mergeImpacts((Array.isArray(raw) ? raw : [raw]).map((r) => RenderedImpactSchema.parse(r)));
    let qa: QaCheck | undefined;
    let qaAbsent: string | undefined;
    const [before, after] = [arg("--before"), arg("--after")];
    if (!before || !after) qaAbsent = "no --before/--after site given";
    else if (!existsSync(join(before, "index.html"))) qaAbsent = `the publish root (${before}) holds no site`;
    else {
      const measured = measureSites({
        before,
        after,
        rule: arg("--staging-base") ? { stagingBase: arg("--staging-base")!, siteBase: arg("--site-base") ?? "" } : undefined,
        base: arg("--base"),
        head: sources.head,
      });
      const stamp = readJson<{ sha?: string }>(join(before, "build.json"));
      qa = qaCheck(predicted ?? mergeImpacts([]), measured, stamp?.sha ?? null, arg("--base") ?? null);
    }
    mkdirSync(out, { recursive: true });
    const page: PageInput = {
      sources,
      ...(predicted ? { predicted } : {}),
      ...(qa ? { qa } : { qaAbsent }),
      siteUrl,
      stagingUrl,
      branch: arg("--branch") ?? "",
      slug: arg("--slug") ?? "",
      ...(arg("--pr") ? { pr: arg("--pr") } : {}),
      generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    };
    writeFileSync(join(out, "index.html"), renderPage(page));
    writeFileSync(join(out, "changes.json"), JSON.stringify({ $schema: STAGING_CHANGES_TAG, sources, predicted: predicted ?? null, qa: qa ?? null, qaAbsent: qaAbsent ?? null }, null, 2) + "\n");
    console.error(
      `staging-changes: wrote ${join(out, "index.html")} — ${sources.changes.length} source(s), ${predicted?.files.length ?? "?"} predicted, ` +
        (qa ? `${qa.measured} measured, ${qa.notInCone.length} NOT in the cone` : `not measured (${qaAbsent})`),
    );
    for (const f of (qa?.notInCone ?? []).slice(0, 20)) console.error(`  · not in the cone: ${f.path}`);
  } else {
    console.error("usage: staging-changes.ts expand|render …  (see the module header)");
    process.exit(2);
  }
}
