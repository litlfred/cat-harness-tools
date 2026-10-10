#!/usr/bin/env bun
/**
 * stage-local — the ONE agent publish path: build a folio's or an IG's site in
 * the agent's own checkout and push it to the publish branch, as a preview
 * or as the main site, without an Actions runner.
 *
 * @module scripts/stage-local
 * @covers none — a PUBLISHER, not an audit: it builds and deploys one preview and judges nothing
 *
 * ```sh
 * bun run cat-harness-tools/scripts/stage-local.ts --repo ../smart-ra [--branch B] [--plan | --dry-run | --artifact DIR]
 * ```
 *
 * ## One command, every agent-run publish (owner, 2026-10-10)
 *
 * *"isnt this what is happening with smart-immz, smart-trust? i want one
 * consolidated worfklow."* smart-ra, smart-immunizations and smart-trust are
 * agent-run: their publish workflows are dispatch-only and are documentation
 * of what this path must match, never something an agent dispatches. So:
 *
 * - **which publisher** is read from the repository's own workflow files
 *   ({@link detectPublisher}): a caller of `folio-staging.yml` is a folio, a
 *   caller of smart-base's `fhirbuild.yml`/`ghbuild.yml` an IG
 *   (`stage-local-ig.ts`);
 * - **main site or preview** follows the branch ({@link chooseTarget}): the
 *   default branch publishes the main site at the root as `publish-main`
 *   does ({@link composeMain}: `publish-main-site.ts`, the `main-site`
 *   render-log entry, `main-site: from <sha>`); any other branch a preview;
 * - every run prints its plan first, `--plan` stops there, and `--dry-run`
 *   builds and composes the commit in a temporary publish-branch worktree
 *   without pushing.
 *
 * ## Why this exists
 *
 * Owner, 2026-10-07: *"do agent-triggered staging next"* — chosen over
 * logging it, after a measurement. smart-ra's dispatch of `staging.yml` that
 * morning (run 37584204273) waited **33 min** for a runner and then ran for
 * 45 s. The agent that asked for it had the checkout, the platform and bun in
 * hand the whole time.
 *
 * ## What it does NOT remove, and says so
 *
 * A push to the publish branch is deployed by GitHub's own `pages build and
 * deployment`, which is ALSO an Actions run. The same morning that run took
 * **47 min**, of which about a minute was work. Nothing here can skip it: the
 * official URL is served by Pages, and Pages deploys on a runner. So this
 * removes the first wait and not the second, and its output says the preview
 * is live only once that deploy has run.
 *
 * ## A folio's preview: the same steps as the workflow, read from the folio
 *
 * The folio's own workflow (`staging.yml`) passes `build_command`,
 * `site_dir`, `folio_dir`, `platform_dir` and `publish_branch` to the
 * reusable `folio-staging.yml`. Those inputs are READ from that file, never
 * restated here, so a folio that changes its build changes it once. Then, in
 * the workflow's order:
 *
 * 1. the slug, by the workflow's rule ({@link slugOf}), refused when it names
 *    no single path segment (bean `fuzm`);
 * 2. the folio's build command, run in the folio checkout;
 * 3. the rail, `rail-standalone-pages.ts`, with the workflow's arguments;
 * 4. the ChangeSet and the rendered impact against the base branch, so the
 *    review page has its data;
 * 5. the banner, `staging-banner.ts`, saying the preview was built locally;
 * 6. the push, held by `staging-push-gate.ts` exactly as the workflow is
 *    (issue #1956): a preview never lands while the main site's Pages build
 *    it would cancel is running. The commit message starts `staging(<slug>)`,
 *    which is how the gate and every later push recognise a staging commit.
 *    The preview REPLACES the slug's directory (bean `85im`), the build is
 *    checked non-empty before anything is deleted (bean `oisv`), and the
 *    render log gets its entry (`render-log.ts`).
 *
 * Not run: the QA sweep, block screenshots, review-comment ingestion and the
 * PR comment. The banner names the preview as built locally so a reviewer is
 * not told those exist.
 *
 * ## `--artifact <dir>`: a preview with no GitHub in the loop
 *
 * The second half of the owner's choice: the same build, written as a BUNDLE a
 * claude.ai Artifact can carry, and nothing pushed. The agent then publishes
 * `<dir>/index.html` with the files `<dir>/artifact.json` lists; it is live in
 * about a minute and private until shared. An Artifact holds at most
 * {@link ARTIFACT_MAX_FILES} files per publish and {@link ARTIFACT_MAX_BYTES}
 * bytes, so when the site is bigger, whole top-level directories are left out,
 * the ones holding the most files first (smart-ra's 2,931 node-kind pages
 * under `en/`), and `artifact.json` names each one left out and how many
 * files it held: a link into one of them 404s in the Artifact, and a reviewer
 * is told rather than left to find out.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

import { siteDirFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";

import { waitFor } from "../src/core/retry.js";
import { PUSH_BASE_MS, PUSH_CAP_MS } from "./backoff-sleep.ts";
import { MANIFEST, RESERVED } from "./publish-main-site.ts";
import {
  applyIgDeploy,
  branchDirOf,
  callerInputs,
  commandWorks,
  type Detected,
  detectPublisher,
  type ExprContext,
  fetchWorkflow,
  FOLIO_WORKFLOW,
  IG_WORKFLOWS,
  type IgTarget,
  type Publisher,
  igTarget,
  missingPrerequisites,
  PAGES_SIBLING,
  planIgSteps,
  readIgDeploys,
  readWorkflow,
  readWorkflows,
  runIgBuild,
} from "./stage-local-ig.ts";
import { decide, readTip } from "./staging-push-gate.ts";

/** Files one Artifact publish may carry, the page included (the Artifact tool's limit is 255; one is the page). */
export const ARTIFACT_MAX_FILES = 254;
/** Bytes one Artifact publish may carry (the tool's limit is 64 MB; a margin for the page). */
export const ARTIFACT_MAX_BYTES = 60 * 1024 * 1024;

export interface ArtifactBundle {
  page: "index.html";
  /** Published paths, relative to the bundle directory, the page excluded. */
  files: string[];
  bytes: number;
  /** Top-level directories left out to fit, with how many files each held. */
  dropped: { dir: string; files: number; bytes: number }[];
}

/**
 * Which files of a built site fit one Artifact publish. Pure over the listing:
 * `files` maps each site-relative path to its size. Whole top-level
 * directories are dropped, most files first, until the rest fits; a site whose
 * root files alone do not fit is refused.
 */
export function artifactBundle(files: Map<string, number>): ArtifactBundle {
  if (!files.has("index.html")) throw new Error("the site has no index.html to open the Artifact on");
  const top = new Map<string, { files: number; bytes: number }>();
  for (const [p, n] of files) {
    const i = p.indexOf("/");
    if (i < 0) continue;
    const d = p.slice(0, i);
    const t = top.get(d) ?? { files: 0, bytes: 0 };
    top.set(d, { files: t.files + 1, bytes: t.bytes + n });
  }
  const dropped: ArtifactBundle["dropped"] = [];
  const kept = () => [...files.entries()].filter(([p]) => p !== "index.html" && !dropped.some((d) => p.startsWith(`${d.dir}/`)));
  const fits = () => {
    const k = kept();
    return k.length <= ARTIFACT_MAX_FILES && k.reduce((a, [, n]) => a + n, 0) + (files.get("index.html") ?? 0) <= ARTIFACT_MAX_BYTES;
  };
  const order = [...top.entries()].sort((a, b) => b[1].files - a[1].files || b[1].bytes - a[1].bytes || a[0].localeCompare(b[0]));
  for (const [dir, t] of order) {
    if (fits()) break;
    dropped.push({ dir, ...t });
  }
  if (!fits()) throw new Error(`even the site's root files exceed one Artifact publish (${ARTIFACT_MAX_FILES} files, ${ARTIFACT_MAX_BYTES} bytes)`);
  const k = kept();
  return { page: "index.html", files: k.map(([p]) => p).sort(), bytes: k.reduce((a, [, n]) => a + n, 0) + files.get("index.html")!, dropped };
}

/**
 * Where the bundle carries the platform's own assets. Not `_platform`: the
 * Artifact service reserves top-level names that start with `_`.
 */
export const PLATFORM_ASSETS = "platform-assets";

/**
 * The platform assets a page loads from the platform's PUBLISHED site — the
 * rail's script and style, `<root>/assets/<path>.js|.css` with `<root>` the
 * page's `data-fa-root` — and the bundle-relative path each is rewritten to.
 * Pure over the files' text. Links to other platform PAGES stay as they are:
 * following one leaves the Artifact, which is what a link should do.
 */
export function platformAssetRefs(texts: Map<string, string>): { roots: string[]; assets: string[] } {
  const roots = new Set<string>();
  for (const t of texts.values()) for (const m of t.matchAll(/data-fa-root="(https?:\/\/[^"]+)"/g)) roots.add(m[1]!.replace(/\/+$/, ""));
  const assets = new Set<string>();
  for (const root of roots) {
    const esc = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const t of texts.values()) for (const m of t.matchAll(new RegExp(`${esc}/assets/([^"'\\s)?#]+\\.(?:js|css))`, "g"))) assets.add(m[1]!);
  }
  return { roots: [...roots].sort(), assets: [...assets].sort() };
}

/**
 * An Artifact runs only scripts from its allowed hosts, so the rail's script
 * and style, loaded from the platform's published site, would not run there.
 * Copy each from the platform checkout's own site directory into
 * `<out>/platform-assets/assets/` and point every page at the copy. An asset the
 * platform does not have is left pointing at the published site.
 */
function vendorPlatformAssets(out: string, files: string[], platform: string): string[] {
  const textual = files.filter((f) => /\.(html|css|js)$/.test(f));
  const texts = new Map(textual.map((f) => [f, readFileSync(join(out, f), "utf-8")] as const));
  const { roots, assets } = platformAssetRefs(texts);
  const instances = existsSync(platform) ? readdirSync(platform, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => join(platform, e.name)) : [];
  const source = (rel: string) => {
    for (const inst of instances) {
      let dir: string;
      try {
        dir = siteDirFor(inst);
      } catch {
        continue;
      }
      const f = join(inst, dir, "assets", rel);
      if (existsSync(f)) return f;
    }
    return undefined;
  };
  const copied: string[] = [];
  for (const rel of assets) {
    const from = source(rel);
    if (!from) continue;
    const to = `${PLATFORM_ASSETS}/assets/${rel}`;
    mkdirSync(dirname(join(out, to)), { recursive: true });
    cpSync(from, join(out, to));
    copied.push(to);
  }
  for (const [f, t] of texts) {
    let u = t;
    for (const to of copied) {
      const rel = to.slice(`${PLATFORM_ASSETS}/assets/`.length);
      const local = relative(dirname(join(out, f)), join(out, to)).split("\\").join("/");
      for (const root of roots) u = u.split(`${root}/assets/${rel}`).join(local);
    }
    if (u !== t) writeFileSync(join(out, f), u);
  }
  return copied;
}

function listSite(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else if (e.isFile()) out.set(r, statSync(join(d, e.name)).size);
    }
  };
  walk(dir, "");
  return out;
}

/** The staging workflow's inputs this needs, as the folio's own file passes them. */
export interface StagingInputs {
  build_command: string;
  site_dir: string;
  folio_dir: string;
  platform_dir: string;
  publish_branch: string;
}

const DEFAULTS: Omit<StagingInputs, "build_command"> = {
  site_dir: "_site",
  folio_dir: "folio",
  platform_dir: "folio-assistant",
  publish_branch: "gh-pages",
};

/**
 * The `with:` inputs of the folio's staging workflow. A line-level read, not a
 * YAML parser: the file is one `uses:` job whose inputs are single-line scalars,
 * which is the shape `folio_init` writes. Undefined when there is no
 * `build_command`, since nothing can be built without it.
 */
export function readStagingInputs(yaml: string): StagingInputs | undefined {
  const got: Record<string, string> = {};
  for (const m of yaml.matchAll(/^\s+(build_command|site_dir|folio_dir|platform_dir|publish_branch):\s*(.+?)\s*$/gm)) {
    let v = m[2]!;
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    if (m[2]!.startsWith("'")) v = v.replace(/''/g, "'");
    got[m[1]!] = v;
  }
  if (!got.build_command) return undefined;
  return { ...DEFAULTS, ...got } as StagingInputs;
}

/**
 * The workflow's slug rule: anything outside `[A-Za-z0-9._-]` becomes `-`,
 * runs collapse, ends trim. Undefined when the result names no single path
 * segment, because the deploy then deletes `STAGING/<slug>` (bean `plj1`).
 */
export function slugOf(branch: string): string | undefined {
  const s = branch.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s === "" || s === "." || s === ".." ? undefined : s;
}

/** Files a preview's data steps write that are not a site on their own (the workflow's list). */
const DATA_ONLY = /^(changeset\.json|changeset-text\.json|rendered-impact\.json|rendered-measured\.json|blocks\.json|block-qa\.json|review-comments\.json|visual-diff\.json|visual)$/;

/** True when the build wrote at least one file that is a page, not only data (bean `oisv`). */
export function builtSomething(siteDir: string): boolean {
  return existsSync(siteDir) && readdirSync(siteDir).some((f) => !DATA_ONLY.test(f));
}

/** `owner/repo` from a GitHub remote URL, or undefined. */
export function ownerRepoOf(remote: string): string | undefined {
  return /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote.trim())?.[1];
}

/** `<instance>/<rel>` in the first of the platform's top-level directories that has it, or undefined. */
export function inPlatform(platform: string, rel: string): string | undefined {
  if (!existsSync(platform)) return undefined;
  for (const d of readdirSync(platform, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort()) {
    const f = join(platform, d, rel);
    if (existsSync(f)) return f;
  }
  return undefined;
}

const git = (cwd: string, args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();

function run(cwd: string, cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} … exited ${r.status}`);
}

/**
 * Where this platform's pin keeps a script: `cat-harness-tools/scripts/` since
 * the 70lx split, `cat-harness/scripts/` before it. The folio's own build
 * command makes the same fallback, so a folio pinned either side of the split
 * publishes.
 */
export const SCRIPT_HOMES = ["cat-harness-tools/scripts", "cat-harness/scripts"] as const;

export function platformScript(platform: string, name: string): string {
  for (const h of SCRIPT_HOMES) {
    const f = join(platform, h, name);
    if (existsSync(f)) return f;
  }
  throw new Error(`${name}: in none of ${SCRIPT_HOMES.map((h) => join(platform, h)).join(", ")}`);
}

/** The default branch from `git ls-remote --symref origin HEAD`, or undefined. */
export function parseSymref(out: string): string | undefined {
  return /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(out)?.[1];
}

function readDefaultBranch(repo: string): string | undefined {
  const r = spawnSync("git", ["-C", repo, "ls-remote", "--symref", "origin", "HEAD"], { encoding: "utf-8" });
  const remote = r.status === 0 ? parseSymref(r.stdout) : undefined;
  if (remote) return remote;
  const l = spawnSync("git", ["-C", repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf-8" });
  return l.status === 0 ? l.stdout.trim().replace(/^origin\//, "") || undefined : undefined;
}

export type Target = "main" | "preview";

/**
 * Main site or preview. The default branch publishes the main site, as the
 * workflows do (`publish-main` runs only there, and the stage job skips it);
 * any other branch publishes a preview. `--main` says so explicitly and is
 * refused off the default branch: the root is the "before" side every
 * preview is compared with, and a feature branch there would make every
 * comparison wrong.
 */
export function chooseTarget(o: { branch: string; defaultBranch?: string; main?: boolean }): Target {
  if (o.main) {
    if (o.defaultBranch && o.branch !== o.defaultBranch) throw new Error(`--main publishes the site at the publish root, and '${o.branch}' is not the default branch '${o.defaultBranch}'; refusing`);
    return "main";
  }
  if (!o.defaultBranch) throw new Error("could not read the default branch from origin; pass --main on the default branch, or run where origin is reachable");
  return o.branch === o.defaultBranch ? "main" : "preview";
}

/** The commit `publish-main` writes, with its run link replaced by where this was built. */
export function mainCommitMessage(sha: string, branch: string, runUrl: string): string[] {
  return [`main-site: from ${sha}`, `render-log: rendered the root from ${branch}`, `built locally: ${runUrl}`];
}

/** The commit a staging preview writes. `staging(` is how the push gate recognises one. */
export function previewCommitMessage(slug: string, sha: string, runUrl: string): string[] {
  return [`staging(${slug}): from ${sha}`, `render-log: rendered STAGING/${slug}`, `built locally: ${runUrl}`];
}

/** What one publish wrote into the publish-branch checkout: the commit to make, and the paths to stage. */
export interface Composed {
  commit: string[];
  add: string[];
}

type Script = (name: string) => string;

function renderLog(script: Script, pages: string, o: { kind: string; path: string; slug: string; branch: string; sha: string; runUrl: string; summary: string }): void {
  execFileSync("bun", ["run", script("render-log.ts"), "--dir", pages, "--event", "rendered", "--kind", o.kind, "--path", o.path, "--slug", o.slug, "--branch", o.branch, "--commit", o.sha, "--run", o.runUrl], { input: JSON.stringify({ summary: o.summary }), stdio: ["pipe", "inherit", "inherit"] });
}

/** A preview: `STAGING/<slug>/` replaced wholesale (bean `85im`), and its render-log entry. */
export function composePreview(pages: string, site: string, o: { slug: string; branch: string; sha: string; runUrl: string; script: Script }): Composed {
  const dest = join(pages, "STAGING", o.slug);
  rmSync(dest, { recursive: true, force: true });
  cpSync(site, dest, { recursive: true });
  renderLog(o.script, pages, { kind: "staging-preview", path: `STAGING/${o.slug}`, slug: o.slug, branch: o.branch, sha: o.sha, runUrl: o.runUrl, summary: "folio staging preview published (built locally by an agent)" });
  return { commit: previewCommitMessage(o.slug, o.sha, o.runUrl), add: [`STAGING/${o.slug}`, "_render-log"] };
}

/**
 * The main site, as `publish-main` lays it: the platform's
 * `publish-main-site.ts` replaces only what its manifest names, so `STAGING/`,
 * `_render-log/` and anything a person put at the root stay; then the
 * `main-site` render-log entry for `/`.
 */
export function composeMain(pages: string, site: string, o: { branch: string; sha: string; runUrl: string; script: Script }): Composed {
  execFileSync("bun", ["run", o.script("publish-main-site.ts"), "--site", site, "--pages", pages, "--commit", o.sha], { stdio: ["ignore", "inherit", "inherit"] });
  renderLog(o.script, pages, { kind: "main-site", path: "/", slug: o.branch, branch: o.branch, sha: o.sha, runUrl: o.runUrl, summary: `${o.branch}'s site published at the root (built locally by an agent)` });
  return { commit: mainCommitMessage(o.sha, o.branch, o.runUrl), add: ["."] };
}

/** An IG's output, laid out as its workflow's deploy step lays it. */
export function composeIg(pages: string, folder: string, t: IgTarget): Composed {
  applyIgDeploy(pages, folder, t, (from, to) => cpSync(from, to, { recursive: true }));
  return { commit: t.commit, add: [t.dest || "."] };
}

/** What a run will do, printed before it does anything. */
export interface StagePlan {
  kind: "folio" | "ig";
  /** The repository's own workflow, and the reusable one it calls. */
  caller: string;
  workflow: string;
  note?: string;
  target: Target;
  branch: string;
  defaultBranch?: string;
  sha: string;
  publishBranch: string;
  dest: string;
  url: string;
  replaces: string;
  preserved: string[];
  build: string[];
  renderLog?: { kind: string; path: string };
  gate: string;
  commit: string[];
  /** IG only: each workflow step, and what this path does with it. */
  steps?: { name: string; action: string; reason?: string }[];
  notRun: string[];
  missing?: string[];
}

export function formatPlan(p: StagePlan): string {
  const l = [
    `plan: ${p.kind} ${p.target === "main" ? "MAIN SITE" : "preview"} of ${p.branch} (${p.sha.slice(0, 7)}) → ${p.publishBranch}:${p.dest}`,
    `  mirrors     ${p.caller} → ${p.workflow}`,
    ...(p.note ? [`  note        ${p.note}`] : []),
    `  default     ${p.defaultBranch ?? "(unknown)"}`,
    `  url         ${p.url}`,
    `  replaces    ${p.replaces}`,
    `  preserves   ${p.preserved.join(", ")}`,
    `  build       ${p.build.join("\n              ")}`,
    ...(p.renderLog ? [`  render-log  rendered ${p.renderLog.kind} ${p.renderLog.path}`] : ["  render-log  none (the workflow writes none)"]),
    `  gate        ${p.gate}`,
    `  commit      ${p.commit.join(" / ")}`,
    ...(p.steps ?? []).map((s) => `  step ${s.action.padEnd(6)} ${s.name}${s.reason ? ` — ${s.reason}` : ""}`),
    ...p.notRun.map((n) => `  not run     ${n}`),
    ...(p.missing?.length ? p.missing.map((m) => `  MISSING     ${m}`) : []),
  ];
  return l.join("\n");
}

export interface StageOptions {
  repo: string;
  branch?: string;
  base?: string;
  runUrl?: string;
  /** Build, and compose the commit in a temporary publish-branch worktree; push nothing. */
  dryRun?: boolean;
  /** Print the plan and stop: nothing is built, nothing written. */
  plan?: boolean;
  /** Publish the main site at the root. Implied on the default branch; refused off it. */
  main?: boolean;
  /** Write an Artifact bundle here instead of pushing. */
  artifact?: string;
  /** IG: read the reusable workflow from this local checkout instead of fetching it. */
  workflowSource?: string;
  /** Which publisher, when the repository's workflows call both (the folio by default). */
  publisher?: Publisher;
  log?: (s: string) => void;
}

export interface StageResult {
  kind: "folio" | "ig";
  target: Target;
  slug: string;
  url: string;
  pushed: boolean;
  commit?: string;
  site: string;
  plan: StagePlan;
  /** With `dryRun`: the commit composed and discarded, as `git diff --shortstat` reads it. */
  composed?: string;
  /** With `artifact`: the bundle written, and where. */
  bundle?: ArtifactBundle & { dir: string };
}

interface PushLoop {
  repo: string;
  publishBranch: string;
  dryRun?: boolean;
  /** Hold the push on `staging-push-gate.ts` (previews only, as the workflow). */
  gate: boolean;
  /** Push attempts before giving up (without the gate). */
  attempts: number;
  compose: (pages: string) => Composed;
  url: string;
  log: (s: string) => void;
}

/**
 * Check out the publish branch in a temporary worktree, compose the publish
 * there, commit, and push — or, with `dryRun`, stop after the commit. Every
 * attempt starts from the branch's current tip, so a lost race is recomposed
 * on the winner rather than rebased over it.
 */
async function pushLoop(o: PushLoop): Promise<{ pushed: boolean; commit?: string; composed?: string }> {
  const pages = mkdtempSync(join(tmpdir(), "stage-local-"));
  const exists = spawnSync("git", ["-C", o.repo, "ls-remote", "--exit-code", "--heads", "origin", o.publishBranch], { stdio: "ignore" }).status === 0;
  const orphan = exists ? undefined : `stage-local-orphan-${process.pid}`;
  try {
    if (exists) {
      git(o.repo, ["fetch", "-q", "--depth=1", "origin", o.publishBranch]);
      git(o.repo, ["worktree", "add", "-q", "--detach", pages, "FETCH_HEAD"]);
    } else {
      o.log(`· no ${o.publishBranch} branch yet; starting one`);
      git(o.repo, ["worktree", "add", "-q", "--orphan", "-b", orphan!, pages]);
    }
    const queuedMs = Date.now();
    for (let lost = 0, failed = 0, attempt = 1; ; attempt++) {
      if (exists) {
        git(pages, ["fetch", "-q", "--depth=1", "origin", o.publishBranch]);
        git(pages, ["reset", "-q", "--hard", "FETCH_HEAD"]);
        git(pages, ["clean", "-q", "-fdx"]);
      }
      if (o.gate && exists && !o.dryRun) {
        const tip = readTip(pages);
        if (!tip) throw new Error("could not read the publish branch tip — refusing to call the window open");
        const d = decide(tip, Date.now(), queuedMs);
        if (d.expired) throw new Error("waited past the gate's deadline: the publish branch is being pushed continuously; not deployed");
        if (!d.open) {
          const ms = Math.max(d.openAtMs - Date.now(), 0) + 5_000;
          o.log(`· gate closed — ${d.reason}; waiting ${Math.round(ms / 1000)}s`);
          await new Promise((r) => setTimeout(r, ms));
          continue;
        }
      }
      const before = exists ? git(pages, ["rev-parse", "HEAD"]) : undefined;
      const c = o.compose(pages);
      git(pages, ["add", "-A", "--", ...c.add]);
      if (git(pages, ["status", "--porcelain"]) === "") {
        o.log("· the publish is unchanged; nothing to push");
        return { pushed: false };
      }
      const stat = git(pages, ["diff", "--cached", "--shortstat"]);
      git(pages, ["commit", "-q", ...c.commit.flatMap((m) => ["-m", m])]);
      if (o.dryRun) {
        o.log(`✓ --dry-run: composed ${git(pages, ["rev-parse", "--short", "HEAD"])} "${c.commit[0]}" on ${o.publishBranch} in a temporary worktree (${stat}); nothing pushed`);
        return { pushed: false, composed: stat };
      }
      const r = spawnSync("git", ["-C", pages, "push", "-q", "origin", `HEAD:${o.publishBranch}`], { stdio: "inherit" });
      if (r.status === 0) {
        const commit = git(pages, ["rev-parse", "HEAD"]);
        o.log(`✓ pushed ${commit.slice(0, 7)} to ${o.publishBranch}; live at ${o.url} once GitHub's Pages deploy has run`);
        return { pushed: true, commit };
      }
      if (!exists) throw new Error(`could not start ${o.publishBranch}; not deployed`);
      if (o.gate) {
        // A rejection with the tip MOVED is a lost race: the gate now holds this
        // push for that one's window. With the tip UNMOVED it is our failure.
        git(pages, ["fetch", "-q", "--depth=1", "origin", o.publishBranch]);
        if (git(pages, ["rev-parse", "FETCH_HEAD"]) !== before) {
          if (++lost > 20) throw new Error("lost the race to the publish branch 20 times; not deployed");
        } else if (++failed >= 3) throw new Error("push rejected 3 times with the tip unmoved; not deployed");
      } else {
        if (attempt >= o.attempts) throw new Error(`could not publish after ${o.attempts} attempts; not deployed`);
        const ms = waitFor(attempt, PUSH_BASE_MS, PUSH_CAP_MS);
        o.log(`· push rejected; recomposing on the new tip in ${Math.round(ms / 1000)}s`);
        await new Promise((res) => setTimeout(res, ms));
      }
    }
  } finally {
    spawnSync("git", ["-C", o.repo, "worktree", "remove", "--force", pages]);
    if (orphan) spawnSync("git", ["-C", o.repo, "branch", "-D", orphan], { stdio: "ignore" });
  }
}

function writeArtifact(site: string, out: string, platform: string | undefined, meta: Record<string, string>, log: (s: string) => void): ArtifactBundle & { dir: string } {
  const dir = resolve(out);
  const b = artifactBundle(listSite(site));
  rmSync(dir, { recursive: true, force: true });
  for (const p of [b.page, ...b.files]) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(site, p), join(dir, p));
  }
  const vendored = platform ? vendorPlatformAssets(dir, [b.page, ...b.files], platform) : [];
  if (b.files.length + vendored.length > ARTIFACT_MAX_FILES) throw new Error(`with the platform's ${vendored.length} asset(s) the bundle exceeds one Artifact publish`);
  b.files = [...b.files, ...vendored].sort();
  if (vendored.length) log(`· carried ${vendored.length} platform asset(s) into the bundle: an Artifact loads scripts only from its allowed hosts`);
  writeFileSync(join(dir, "artifact.json"), JSON.stringify({ $schema: "stage-local-artifact/v1", ...meta, ...b }, null, 1) + "\n");
  for (const d of b.dropped) log(`· left out ${d.dir}/ (${d.files} files) to fit one Artifact publish; links into it 404 there`);
  log(`✓ Artifact bundle in ${dir}: index.html + ${b.files.length} files, ${(b.bytes / 1048576).toFixed(1)} MB; nothing pushed`);
  return { ...b, dir };
}

/** Steps of `folio-staging.yml` this path does not run, and why — said in every plan. */
const FOLIO_NOT_RUN = {
  preview: ["the QA sweep, block screenshots, review-comment ingestion and the PR comment (the banner names the preview as built locally)"],
  main: ["nothing of publish-main's own steps; its run link is replaced by `built locally: <commit url>`"],
};

export async function stageLocal(o: StageOptions): Promise<StageResult> {
  const log = o.log ?? ((s: string) => console.error(s));
  const repo = resolve(o.repo);
  const detected = detectPublisher(readWorkflows(repo), o.publisher);
  const branch = o.branch ?? git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const sha = git(repo, ["rev-parse", "HEAD"]);
  // The CONFIGURED url, not `remote get-url`: an `insteadOf` rewrite (a mirror,
  // a proxy) changes where git talks to, not which repository this is.
  const ownerRepo = ownerRepoOf(git(repo, ["config", "--get", "remote.origin.url"]));
  if (!ownerRepo) throw new Error("origin is not a GitHub remote");
  const [owner, name] = ownerRepo.split("/") as [string, string];
  const pagesRoot = `https://${owner}.github.io/${name}`;
  const gh = `https://github.com/${ownerRepo}`;
  const runUrl = o.runUrl ?? `${gh}/commit/${sha}`;
  const defaultBranch = readDefaultBranch(repo);
  const target = chooseTarget({ branch, defaultBranch, ...(o.main ? { main: true } : {}) });
  if (target === "main" && !o.plan) {
    // The root is main as PUSHED: publish-main builds the commit the push
    // event names. A local commit nobody has pushed is not main's site.
    git(repo, ["fetch", "-q", "origin", defaultBranch ?? branch]);
    const tip = git(repo, ["rev-parse", "FETCH_HEAD"]);
    if (tip !== sha) throw new Error(`HEAD ${sha.slice(0, 7)} is not origin/${defaultBranch ?? branch}'s tip ${tip.slice(0, 7)}; the main site is published from the pushed default branch only`);
  }
  const caller = `.github/workflows/${detected.caller}`;
  const workflow = `${detected.uses.owner}/${detected.uses.repo}/${detected.uses.path}@${detected.uses.ref}`;
  if (detected.alsoCalls) log(`· this repository also calls ${detected.alsoCalls.file} (${detected.alsoCalls.caller}); building the ${detected.kind} — pass --publisher ${detected.alsoCalls.kind} for the other`);

  if (detected.kind === "ig") return stageIg({ o, log, repo, detected, branch, sha, ownerRepo, pagesRoot, runUrl, defaultBranch, target, caller, workflow });

  const inputs = readStagingInputs(readFileSync(join(repo, caller), "utf-8"));
  if (!inputs) throw new Error(`${caller}: no build_command — this folio has no staging workflow to mirror`);
  const slug = target === "main" ? branch : slugOf(branch);
  if (!slug) throw new Error(`branch '${branch}' gives no safe staging slug`);
  const url = target === "main" ? `${pagesRoot}/` : `${pagesRoot}/STAGING/${slug}/`;
  const platform = resolve(repo, inputs.platform_dir);
  const site = resolve(repo, inputs.site_dir);
  const base = o.base ?? defaultBranch ?? "main";
  const plan: StagePlan = {
    kind: "folio", caller, workflow, target, branch, ...(defaultBranch ? { defaultBranch } : {}), sha,
    publishBranch: inputs.publish_branch,
    dest: target === "main" ? "/" : `STAGING/${slug}/`,
    url,
    replaces: target === "main" ? `only the files the last main publish listed in ${MANIFEST}` : `STAGING/${slug}/, wholesale (bean 85im)`,
    preserved: target === "main" ? [...RESERVED, "any root file no manifest names"] : ["everything outside STAGING/" + slug + "/"],
    build: [inputs.build_command, "rail-standalone-pages.ts", ...(target === "preview" ? ["changeset.ts + document-rendered-impact.ts (when the platform has them)", "staging-banner.ts"] : [])],
    renderLog: target === "main" ? { kind: "main-site", path: "/" } : { kind: "staging-preview", path: `STAGING/${slug}` },
    gate: target === "main" ? "none, as publish-main: the main publish is what staging-push-gate protects; 3 push attempts" : "staging-push-gate.ts (issue #1956)",
    commit: target === "main" ? mainCommitMessage(sha, branch, runUrl) : previewCommitMessage(slug, sha, runUrl),
    notRun: FOLIO_NOT_RUN[target],
  };
  log(formatPlan(plan));
  const done = (r: Partial<StageResult>): StageResult => ({ kind: "folio", target, slug, url, pushed: false, site, plan, ...r });
  if (o.plan) return done({});

  if (!existsSync(join(platform, "cat-harness"))) throw new Error(`${platform}: the platform is not checked out where ${caller} names it`);
  const script = (n: string) => platformScript(platform, n);

  log(`· building ${ownerRepo}@${branch} (${sha.slice(0, 7)}) → ${plan.dest}`);
  rmSync(site, { recursive: true, force: true });
  run(repo, "bash", ["-c", inputs.build_command]);
  if (!builtSomething(site)) throw new Error(`the build produced no site in ${site} — refusing to deploy`);

  run(repo, "bun", ["run", script("rail-standalone-pages.ts"), "--site", site, "--built", "cat-harness", "--foreign-site", "--home-label", name]);

  if (target === "preview") {
    git(repo, ["fetch", "-q", "origin", base]);
    // The ChangeSet and the rendered impact are a content layer's, above this
    // one: found in whichever of the platform's instances carries them, never
    // named here. A platform without them gets no review data, and the review
    // page says so, as the workflow does when it has no renderer.
    // declared-path-literal: a path INSIDE another platform instance, resolved
    // by inPlatform against each instance's root, never against this one.
    const changeset = inPlatform(platform, "schemas/changeset.ts");
    if (changeset) run(repo, "bun", ["run", changeset, "--folio", inputs.folio_dir, "--base", `origin/${base}`, "--head", "worktree", "--out", join(site, "changeset.json"), "--text-out", join(site, "changeset-text.json")]);
    else log("· this platform has no ChangeSet tool: no review data on this preview");
    const impact = inPlatform(platform, "scripts/document-rendered-impact.ts");
    if (changeset && impact) {
      run(repo, "bun", ["run", impact, "--root", ".", "--base", `origin/${base}`, "--head", "HEAD", "--changeset", join(site, "changeset.json"), "--outline", join(site, "outline.json"), "--build-command", inputs.build_command, "--out", join(site, "rendered-impact.json")]);
    }

    run(repo, "bun", [
      "run", script("staging-banner.ts"),
      "--site", site, "--branch", branch, "--sha", sha.slice(0, 7),
      "--built", `${new Date().toISOString().replace(/\.\d+Z$/, "Z")} (built locally by an agent)`,
      "--pr", "n/a", "--pr-url", `${gh}/pulls?q=head%3A${encodeURIComponent(branch)}`,
      "--branch-url", `${gh}/tree/${branch}`, "--issues-url", `${gh}/issues`,
      "--run-url", runUrl, "--main-site", pagesRoot, "--before-ref", base,
    ]);
  }

  if (o.artifact) return done({ bundle: writeArtifact(site, o.artifact, platform, { slug, branch, sha }, log) });

  const compose = target === "main"
    ? (pages: string) => composeMain(pages, site, { branch, sha, runUrl, script })
    : (pages: string) => composePreview(pages, site, { slug, branch, sha, runUrl, script });
  const r = await pushLoop({ repo, publishBranch: inputs.publish_branch, ...(o.dryRun ? { dryRun: true } : {}), gate: target === "preview", attempts: 3, compose, url, log });
  return done(r);
}

interface IgRun {
  o: StageOptions;
  log: (s: string) => void;
  repo: string;
  detected: Detected;
  branch: string;
  sha: string;
  ownerRepo: string;
  pagesRoot: string;
  runUrl: string;
  defaultBranch: string | undefined;
  target: Target;
  caller: string;
  workflow: string;
}

async function stageIg(a: IgRun): Promise<StageResult> {
  const { o, log, repo, detected, branch, sha, ownerRepo, pagesRoot, runUrl, target } = a;
  const u = detected.uses;
  let path = u.path;
  let note: string | undefined;
  let wf = readWorkflow(fetchWorkflow(u, path, o.workflowSource));
  let deploys = readIgDeploys(wf);
  if (!deploys.main && !deploys.candidate) {
    path = u.path.replace(/[^/]+$/, PAGES_SIBLING);
    note = `${u.file} deploys nothing to Pages (it triggers build.fhir.org's auto-build); the Pages build its callers describe is ${PAGES_SIBLING} beside it, read at @${u.ref}`;
    wf = readWorkflow(fetchWorkflow(u, path, o.workflowSource));
    deploys = readIgDeploys(wf);
  }
  const isDefault = target === "main";
  const t0 = igTarget(deploys, { isDefault, branchDir: branchDirOf(branch), sha, runUrl });
  const callerWith = callerInputs(readFileSync(join(repo, a.caller), "utf-8"), u);
  const github = { repository: ownerRepo, ref: `refs/heads/${branch}`, ref_name: branch, head_ref: "", sha, event_name: "workflow_dispatch", workspace: repo, server_url: "https://github.com", run_id: "", actor: "stage-local" };
  const planCtx: ExprContext = { github, inputs: { ...wf.inputs, ...callerWith }, env: { IS_DEFAULT_BRANCH: String(isDefault), BRANCH_DIR: branchDirOf(branch), BRANCH_NAME: branch }, steps: {} };
  const steps = planIgSteps(wf, planCtx);
  const missing = missingPrerequisites(steps, commandWorks);
  const url = `${pagesRoot}/${t0.dest ? `${t0.dest}/` : ""}`;
  const plan: StagePlan = {
    kind: "ig", caller: a.caller, workflow: `${u.owner}/${u.repo}/${path}@${u.ref}`, ...(note ? { note } : {}),
    target, branch, ...(a.defaultBranch ? { defaultBranch: a.defaultBranch } : {}), sha,
    publishBranch: t0.deploy.branch, dest: t0.dest ? `${t0.dest}/` : "/", url,
    replaces: t0.keep ? "every root entry the deploy step's clean does not exclude" : t0.deploy.clean ? `${t0.dest}/, wholesale` : `files in ${t0.dest}/ that the build writes (clean: false — nothing deleted)`,
    preserved: t0.keep ?? [`everything outside ${t0.dest}/`],
    build: [`the runnable steps of ${path} below, in its order, in the checkout as on a runner (it writes input/scripts/, ${t0.deploy.folder}/, temp/ there)`],
    gate: "none, as the workflow: its deploy step pushes without one; 3 push attempts",
    commit: t0.commit,
    steps: steps.map((s) => ({ name: s.name, action: s.action, ...(s.reason ? { reason: s.reason } : {}) })),
    notRun: [
      ...(t0.deploy.singleCommit ? ["single-commit: the deploy action force-pushes one orphan commit, erasing the branch's history; this path commits on top and never force-pushes"] : []),
      ...(u.file !== PAGES_SIBLING ? [`${u.file}'s own job (the build.fhir.org trigger): an external build, not this repository's Pages`] : []),
    ],
    ...(missing.length ? { missing } : {}),
  };
  log(formatPlan(plan));
  const site = join(repo, t0.deploy.folder);
  const done = (r: Partial<StageResult>): StageResult => ({ kind: "ig", target, slug: branchDirOf(branch), url, pushed: false, site, plan, ...r });
  if (o.plan) return done({});
  if (missing.length) {
    if (o.dryRun) {
      log(`✓ --dry-run: plan only — this machine lacks ${missing.length} prerequisite(s) to build, listed above; nothing built, nothing pushed`);
      return done({});
    }
    throw new Error(`cannot build this IG here: missing ${missing.join("; ")}`);
  }

  log(`· building ${ownerRepo}@${branch} (${sha.slice(0, 7)}) with ${path}`);
  rmSync(site, { recursive: true, force: true });
  const ctx = runIgBuild(repo, wf, { github, inputs: planCtx.inputs, env: {}, steps: {} }, log);
  const ranDefault = ctx.env.IS_DEFAULT_BRANCH;
  if (ranDefault !== undefined && ranDefault !== String(isDefault)) throw new Error(`the workflow's own step decided IS_DEFAULT_BRANCH=${ranDefault}, and this run planned ${isDefault}; refusing to publish to the wrong place`);
  const t = igTarget(deploys, { isDefault, branchDir: ctx.env.BRANCH_DIR || branchDirOf(branch), sha, runUrl });
  if (!existsSync(site) || listSite(site).size === 0) throw new Error(`the build produced nothing in ${site} — refusing to deploy`);

  if (o.artifact) return done({ bundle: writeArtifact(site, o.artifact, undefined, { slug: branchDirOf(branch), branch, sha }, log) });
  const r = await pushLoop({ repo, publishBranch: t.deploy.branch, ...(o.dryRun ? { dryRun: true } : {}), gate: false, attempts: 3, compose: (pages) => composeIg(pages, site, t), url, log });
  return done(r);
}

const USAGE = `usage: stage-local.ts [--repo DIR] [--branch B] [--base B] [--run-url URL] [--main] [--plan | --dry-run | --artifact DIR] [--workflow-source DIR] [--publisher folio|ig]

  One command for every agent-run publish: a folio (its workflow calls ${FOLIO_WORKFLOW}) or an
  IG (it calls smart-base's ${IG_WORKFLOWS.join(" or ")}), preview or main site. The default
  branch publishes the main site; any other branch a preview.

  --plan             print what would be built and where, and stop
  --dry-run          build, and compose the commit in a temporary publish-branch worktree; push nothing
  --main             publish the main site (implied on the default branch; refused off it)
  --artifact DIR     write a claude.ai Artifact bundle instead of pushing
  --workflow-source  IG: read the reusable workflow from this checkout instead of fetching it
  --publisher        folio or ig, when the repository's workflows call both (folio by default:
                     it owns the publish root, and an IG root deploy is a clean one)`;

function publisherOf(s: string): Publisher {
  if (s !== "folio" && s !== "ig") throw new Error(`--publisher is folio or ig, not '${s}'`);
  return s;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }
  const opt = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  try {
    const r = await stageLocal({
      repo: opt("repo") ?? process.cwd(),
      ...(opt("branch") ? { branch: opt("branch")! } : {}),
      ...(opt("base") ? { base: opt("base")! } : {}),
      ...(opt("run-url") ? { runUrl: opt("run-url")! } : {}),
      dryRun: argv.includes("--dry-run"),
      plan: argv.includes("--plan"),
      main: argv.includes("--main"),
      ...(opt("artifact") ? { artifact: opt("artifact")! } : {}),
      ...(opt("workflow-source") ? { workflowSource: opt("workflow-source")! } : {}),
      ...(opt("publisher") ? { publisher: publisherOf(opt("publisher")!) } : {}),
    });
    const { plan: _plan, ...rest } = r;
    console.log(JSON.stringify(rest));
  } catch (e) {
    console.error(`✗ stage-local (${basename(process.argv[1] ?? "")}): ${(e as Error).message}`);
    process.exit(1);
  }
}
