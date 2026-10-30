#!/usr/bin/env bun
/**
 * Every internal link in a BUILT site, checked against the files the site
 * holds — and, with `--fix`, the two kinds of dead link that have one right
 * answer repointed first.
 *
 * @module scripts/site-dead-links
 * @graphNode none — a check over a built site, not a schema
 *
 * litlfred/folio-assistant#2741: a link check of the published tree found 262
 * missing targets linked from 399 places, and nothing in CI had ever looked.
 * `site-links.ts` checks the navbar tiles only. This checks every `href` and
 * `src` of every page, after the build, against the tree that ships.
 *
 * ## What `--fix` repoints, and why only these
 *
 * 1. **A translation that does not exist.** A translated page links its
 *    sibling in the same locale (`process/es/publication-workflow.html`) or a
 *    locale-prefixed asset (`/es/assets/img/workflows/x.svg`). When that
 *    target is missing and the same path WITHOUT the locale segment exists,
 *    the link goes to it: the reader gets the English page or diagram rather
 *    than a 404. Only non-English UN locales are dropped (`en/` is a route
 *    segment of the viewers, not a translation).
 * 2. **A source file the site does not publish.** Docs link the `.md`,
 *    `.bpmn`, `.dmn`, `.json` or `.ts` beside them, written relative to where
 *    the page sat in its repository. The site serves no such file. When the
 *    missing path's tail names exactly ONE file in the checkout (at least two
 *    segments, the longest tail that matches), the link goes to that file on
 *    GitHub, at the commit the index pins (`index.lock.json`). Two or more
 *    candidates are left alone: a guess is worse than a reported dead link.
 *
 * Everything else is reported, never guessed at. The report is the check:
 * exit 1 when any internal link is still dead, so the workflow can carry it as
 * "reported, not blocking" the way it carries the tiles check.
 *
 * Usage (or `bun run cat site:dead-links`):
 *   bun run cat-harness-tools/scripts/site-dead-links.ts --site  ./_site --root . [--fix] [--repo litlfred/folio-assistant --sha <commit>] [--report dead.tsv]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import { UN_LOCALES } from "@litlfred/cat-harness/schemas/content/translation.ts";

/** Locales a page can be TRANSLATED into: the UN set without the source. */
export const TRANSLATED_LOCALES: ReadonlySet<string> = new Set(UN_LOCALES.filter((l) => l !== "en"));

/** Directories of a checkout that are never a link's source. */
const SKIP_DIRS = new Set([".git", "node_modules", "_site", "_docs", ".jekyll-cache", ".bundle", "vendor"]);

const ATTR = /\s(href|src)="([^"]*)"/g;

/** A link this check owns: internal, and not an anchor, a script URL or unrendered Liquid. */
export function isInternal(value: string): boolean {
  if (value === "" || value.startsWith("#") || value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  // Unrendered Liquid, and a script's template literal caught by the attribute pattern.
  if (value.includes("{{") || value.includes("{%") || value.includes("${")) return false;
  return true;
}

/** The site-relative path a link on page `page` (site-relative) points at, or undefined when it leaves the site. */
export function targetOf(page: string, value: string, basePath: string): string | undefined {
  const bare = value.replace(/[?#].*$/, "");
  if (bare === "") return undefined;
  let path: string;
  try {
    path = decodeURI(bare);
  } catch {
    path = bare;
  }
  let joined: string;
  if (path.startsWith("/")) {
    const base = basePath.replace(/\/+$/, "");
    if (base !== "" && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length) || "/";
    joined = posix.normalize(path).replace(/^\/+/, "");
  } else {
    joined = posix.normalize(posix.join(posix.dirname(page), path));
  }
  if (joined === ".." || joined.startsWith("../")) return undefined;
  return joined === "." ? "" : joined;
}

/** Whether GitHub Pages serves something at `rel` in `site`: a file, a directory index, or `rel.html`. */
export function served(site: string, rel: string): boolean {
  const abs = join(site, rel);
  if (existsSync(abs)) {
    if (!statSync(abs).isDirectory()) return true;
    return existsSync(join(abs, "index.html"));
  }
  return !rel.endsWith("/") && rel !== "" && existsSync(`${abs}.html`);
}

/** The same path with its translated-locale segments dropped, or undefined when it has none. */
export function withoutLocale(rel: string): string | undefined {
  const parts = rel.split("/");
  const kept = parts.filter((p) => !TRANSLATED_LOCALES.has(p));
  return kept.length === parts.length ? undefined : kept.join("/");
}

/** Where a checkout file lives on GitHub: the repository and commit that supplied it. */
export interface Origin {
  /** Checkout-relative directory the repository is mounted at ("" for the root). */
  path: string;
  repository: string;
  ref: string;
  /** The mount's root inside the repository ("" when the whole repository). */
  upstreamRoot: string;
}

/** The mounts `index.lock.json` pins, deepest path first, plus the checkout itself. */
export function originsOf(root: string, self: { repository: string; ref: string } | undefined): Origin[] {
  const out: Origin[] = [];
  const lockFile = join(root, "index.lock.json");
  if (existsSync(lockFile)) {
    const lock = JSON.parse(readFileSync(lockFile, "utf-8")) as {
      mounts?: { harness: string; path?: string; repository: string; ref: string }[];
      instances?: { path: string; repository: string; sha: string; upstreamRoot?: string }[];
    };
    for (const m of lock.mounts ?? []) out.push({ path: m.path ?? m.harness, repository: m.repository, ref: m.ref, upstreamRoot: "" });
    for (const i of lock.instances ?? []) out.push({ path: i.path, repository: i.repository, ref: i.sha, upstreamRoot: i.upstreamRoot ?? "" });
  }
  if (self) out.push({ path: "", repository: self.repository, ref: self.ref, upstreamRoot: "" });
  return out.sort((a, b) => b.path.length - a.path.length);
}

/** The GitHub URL of a checkout-relative file, from the deepest mount holding it. */
export function blobUrl(file: string, origins: readonly Origin[]): string | undefined {
  const o = origins.find((x) => x.path === "" || file === x.path || file.startsWith(`${x.path}/`));
  if (!o) return undefined;
  const inMount = o.path === "" ? file : file.slice(o.path.length + 1);
  const inRepo = o.upstreamRoot ? `${o.upstreamRoot.replace(/\/+$/, "")}/${inMount}` : inMount;
  return `https://github.com/${o.repository}/blob/${o.ref}/${inRepo}`;
}

/** Every file in the checkout, checkout-relative, `/`-separated. */
export function checkoutFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
      } else if (e.isFile()) {
        out.push(relative(root, join(dir, e.name)).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

/** Index of checkout files by their last `k` path segments, for every k ≥ 2. */
export function tailIndex(files: readonly string[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.split("/");
    for (let k = 2; k <= parts.length; k++) {
      const tail = parts.slice(-k).join("/");
      const list = idx.get(tail);
      if (list) list.push(f);
      else idx.set(tail, [f]);
    }
  }
  return idx;
}

/** The ONE checkout file a missing site path names by its longest matching tail, or undefined. */
export function sourceFor(rel: string, idx: ReadonlyMap<string, readonly string[]>): string | undefined {
  const parts = rel.replace(/\/+$/, "").split("/");
  for (let k = parts.length; k >= 2; k--) {
    const hits = idx.get(parts.slice(-k).join("/"));
    if (hits === undefined) continue;
    return hits.length === 1 ? hits[0] : undefined;
  }
  return undefined;
}

/** A dead link, after any repointing. */
export interface DeadLink {
  page: string;
  value: string;
  target: string;
}

export interface Repoint {
  page: string;
  from: string;
  to: string;
  why: "locale" | "source";
}

/**
 * Top-level directories of a published branch that this build did not write:
 * staging previews and the render log are carried over from earlier deploys,
 * so their links are each preview's own business.
 */
const CARRIED = new Set(["STAGING", "_render-log"]);

/** Every HTML page under `site` that this build wrote, site-relative. */
export function sitePages(site: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!(dir === site && CARRIED.has(e.name))) walk(abs);
      } else if (e.isFile() && e.name.endsWith(".html")) out.push(relative(site, abs).split(sep).join("/"));
    }
  };
  walk(site);
  return out;
}

/** The new attribute value for a dead link, or undefined when neither rule has one answer. */
export function repointFor(
  site: string,
  page: string,
  target: string,
  resolveSource: (rel: string) => string | undefined,
): { to: string; why: Repoint["why"] } | undefined {
  const plain = withoutLocale(target);
  if (plain !== undefined && served(site, plain)) {
    const rel = posix.relative(posix.dirname(page), plain) || ".";
    return { to: target.endsWith("/") && !rel.endsWith("/") ? `${rel}/` : rel, why: "locale" };
  }
  const url = resolveSource(target);
  return url === undefined ? undefined : { to: url, why: "source" };
}

/** Check (and with `fix`, repoint) every page. Returns what is still dead and what was repointed. */
export function checkSite(opts: {
  site: string;
  basePath: string;
  fix: boolean;
  resolveSource: (rel: string) => string | undefined;
}): { dead: DeadLink[]; repointed: Repoint[]; pages: number } {
  const dead: DeadLink[] = [];
  const repointed: Repoint[] = [];
  const pages = sitePages(opts.site);
  for (const page of pages) {
    const file = join(opts.site, page);
    const html = readFileSync(file, "utf-8");
    let changed = false;
    const next = html.replace(ATTR, (whole, attr: string, value: string) => {
      if (!isInternal(value)) return whole;
      const target = targetOf(page, value, opts.basePath);
      if (target === undefined || served(opts.site, target)) return whole;
      if (opts.fix) {
        const r = repointFor(opts.site, page, target, opts.resolveSource);
        if (r) {
          const suffix = value.match(/[?#].*$/)?.[0] ?? "";
          repointed.push({ page, from: value, to: r.to + suffix, why: r.why });
          changed = true;
          return ` ${attr}="${r.to}${suffix}"`;
        }
      }
      dead.push({ page, value, target });
      return whole;
    });
    if (changed) writeFileSync(file, next);
  }
  return { dead, repointed, pages: pages.length };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const site = arg("--site") ?? "./_site";
  const root = arg("--root") ?? ".";
  const fix = process.argv.includes("--fix");
  const basePath = arg("--base-path") ?? "";
  const repo = arg("--repo");
  const sha = arg("--sha");
  if (!existsSync(site)) {
    console.error(`site-dead-links: no built site at ${site} — COULD NOT DETERMINE, not a pass.`);
    process.exit(2);
  }
  let resolveSource: (rel: string) => string | undefined = () => undefined;
  if (fix) {
    const origins = originsOf(root, repo && sha ? { repository: repo, ref: sha } : undefined);
    const idx = tailIndex(checkoutFiles(root));
    resolveSource = (rel) => {
      const f = sourceFor(rel, idx);
      return f === undefined ? undefined : blobUrl(f, origins);
    };
  }
  const { dead, repointed, pages } = checkSite({ site, basePath, fix, resolveSource });
  const byWhy = (w: Repoint["why"]): number => repointed.filter((r) => r.why === w).length;
  if (fix) console.log(`site-dead-links: repointed ${byWhy("locale")} link(s) to the untranslated page and ${byWhy("source")} to their source on GitHub`);
  const targets = new Map<string, { n: number; page: string }>();
  for (const d of dead) {
    const t = targets.get(d.target);
    if (t) t.n++;
    else targets.set(d.target, { n: 1, page: d.page });
  }
  const report = arg("--report");
  if (report) {
    const rows = [...targets].sort((a, b) => b[1].n - a[1].n).map(([t, v]) => `${v.n}\t/${t}\t/${v.page}`);
    writeFileSync(report, ["pages_linking\tmissing_target\texample_page", ...rows].join("\n") + "\n");
  }
  console.log(`site-dead-links: ${pages} page(s), ${targets.size} missing target(s) linked from ${dead.length} place(s)`);
  for (const [t, v] of [...targets].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) console.log(`  ✗ /${t}  (${v.n}×, e.g. /${v.page})`);
  process.exit(dead.length === 0 ? 0 : 1);
}
