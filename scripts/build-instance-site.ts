#!/usr/bin/env bun
/**
 * Build an instance's own site from its checkout, check it, and (optionally)
 * publish it: the root site, or a branch preview at `STAGING/<branch>/`.
 *
 * @module cat-harness-tools/scripts/build-instance-site
 *
 * Owner, 2026-10-10: publishing is agent-run, never a GitHub Actions workflow,
 * and staging previews are agent-run too (bean `n3h9`). Until now the recipe
 * lived only as prose in a Routine's prompt (a downstream's publish Routine), so
 * every runner re-typed it and each copy could drift. This is that recipe as
 * one command, the same for an agent, a person or a Routine:
 *
 *   bun run cat-harness-tools/scripts/build-instance-site.ts --root <checkout> \
 *     --instance <name> --title "<label>" --home <page.md> \
 *     --pre "<the instance's own gate>" --source-step "<generator> --into {docs}" \
 *     [--staging <branch>] [--publish --remote <git url>]
 *
 * Steps, each a stop on failure (never a skip):
 *
 *  1. mount the closure `index.config.json` pins (`remote-mount.ts`), unless `--no-mount`
 *  2. `bun install` in the checkout and in every mounted instance with a package.json
 *  3. each `--pre` command, in the checkout (the instance's own gates)
 *  4. landing data and the chrome: sync-docs-harness, gen-landing-data, compose-docs --shell,
 *     gen-navbar-include; `--home` becomes the site's index.md; each `--source-step` runs
 *     with `{docs}` replaced by the site source
 *  5. Jekyll, as preview-site.sh does it: remote_theme dropped (codeload is not reachable
 *     everywhere), title and description from the instance's declaration, baseurl from the
 *     git remote (`/<repo>`, or `/<repo>/STAGING/<branch>` for a preview)
 *  6. mount-instance-docs, pdf-viewer, set-html-lang, publish-id-lookup,
 *     rail-standalone-pages, `.nojekyll`
 *  7. every relative or base-rooted href/src/action in every page resolves to a file
 *     under the site (read with an HTML parser, HTMLRewriter, not a regex)
 *  8. with `--publish`: the root replaces the branch but keeps `STAGING/` and `_render-log/`;
 *     a preview replaces only `STAGING/<branch>/`
 *
 * What it does NOT do: decide whether to publish. `--publish` is the caller's
 * explicit act; without it the run builds and checks, and says where the site is.
 *
 * @covers none — a build step: it composes existing generators and judges no graph
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { publishSite } from "@litlfred/bootstrap-tools/scripts/publish-site.ts";
import { readDeclaration, siteDirFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";

const TOOLS = "cat-harness-tools/scripts";

export interface BuildOptions {
  root: string;
  instance: string;
  title?: string;
  linkRoot: string;
  out: string;
  home?: string;
  pre: string[];
  sourceSteps: string[];
  staging?: string;
  mount: boolean;
  publish: boolean;
  remote?: string;
  message?: string;
}

/** A branch name safe to use as one path segment under STAGING/. */
export function stagingDir(branch: string): string {
  const seg = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (seg === "" || seg === "." || seg === "..") throw new Error(`branch ${JSON.stringify(branch)} gives no usable STAGING/ segment`);
  return `STAGING/${seg}`;
}

/** owner and repository name from a GitHub remote URL (https or ssh). */
export function ownerRepo(url: string): { owner: string; repo: string } | undefined {
  const m = url.trim().match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1]!, repo: m[2]! } : undefined;
}

/** Jekyll's build config: the instance's own, minus the remote theme it cannot fetch. */
export function buildConfig(configYml: string): string {
  return configYml
    .split("\n")
    .filter((l) => !/^remote_theme:/.test(l))
    .map((l) => l.replace(/^(\s*)- jekyll-remote-theme\s*$/, "$1- jekyll-seo-tag"))
    .join("\n");
}

/** The override layered on top: what the declaration and the remote say, never a guess. */
export function overrideConfig(o: { title: string; description?: string; baseurl: string; url: string }): string {
  const q = (s: string) => JSON.stringify(s);
  return [
    `title: ${q(o.title)}`,
    ...(o.description ? [`description: ${q(o.description.split("\n")[0]!)}`] : []),
    `baseurl: ${q(o.baseurl)}`,
    `url: ${q(o.url)}`,
    "theme: just-the-docs",
    "",
  ].join("\n");
}

/** Every `.html` file under `dir`, skipping vendored assets. */
function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (relative(dir, p).split(sep).join("/") === "assets/vendor") continue;
        walk(p);
      } else if (n.endsWith(".html")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The href/src/action values of one page, read by an HTML parser. */
export async function pageUrls(html: string): Promise<string[]> {
  const urls: string[] = [];
  await new HTMLRewriter()
    .on("*", {
      element(el) {
        for (const a of ["href", "src", "action"]) {
          const v = el.getAttribute(a);
          if (v) urls.push(v);
        }
      },
    })
    .transform(new Response(html))
    .text();
  return urls;
}

/**
 * Where a URL lands under the site, or undefined when it is not ours to check
 * (external, a scheme, a bare anchor). `base` is the site's path prefix
 * (`/repo/` or `/repo/STAGING/x/`); a root-absolute path outside it is a MISS,
 * reported as such, because the published site cannot serve it.
 */
export function targetOf(url: string, pageRel: string, base: string): string | "outside-base" | undefined {
  const u = url.split("#")[0]!.split("?")[0]!;
  if (u === "" || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) return undefined;
  if (u.startsWith("/")) return u.startsWith(base) ? decodeURIComponent(u.slice(base.length)) : "outside-base";
  const dir = dirname(pageRel);
  const parts = (dir === "." ? [] : dir.split("/")).concat(decodeURIComponent(u).split("/"));
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/") + (u.endsWith("/") ? "/" : "");
}

/** True when `rel` resolves to a file the way a static host serves it. */
function served(site: string, rel: string): boolean {
  const p = join(site, rel);
  if (rel === "" || rel.endsWith("/")) return existsSync(join(p, "index.html"));
  if (existsSync(p)) return statSync(p).isFile() || existsSync(join(p, "index.html"));
  return existsSync(`${p}.html`);
}

export async function checkLinks(site: string, base: string): Promise<{ pages: number; files: number; misses: string[] }> {
  const misses: string[] = [];
  const pages = htmlFiles(site);
  for (const page of pages) {
    const rel = relative(site, page).split(sep).join("/");
    for (const url of await pageUrls(readFileSync(page, "utf-8"))) {
      const t = targetOf(url, rel, base);
      if (t === undefined) continue;
      if (t === "outside-base" || !served(site, t)) misses.push(`${rel}: ${url}`);
    }
  }
  let files = 0;
  const count = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) count(p);
      else files++;
    }
  };
  count(site);
  return { pages: pages.length, files, misses };
}

function run(label: string, cmd: string, cwd: string): void {
  console.log(`▶ ${label}`);
  const r = spawnSync("bash", ["-c", cmd], { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status}): ${cmd}`);
}

function capture(cmd: string, cwd: string): string {
  const r = spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** The jekyll executable preview-site.sh uses: the gem's own exe (`bundle exec jekyll` is not on PATH everywhere). */
function jekyllExe(): string {
  const found = capture("ls -d /opt/rbenv/versions/*/lib/ruby/gems/*/gems/jekyll-[0-9]*/exe/jekyll 2>/dev/null | head -1 || true", "/");
  if (found) return `ruby ${found}`;
  return "jekyll";
}

export async function buildInstanceSite(o: BuildOptions): Promise<{ site: string; base: string }> {
  const root = resolve(o.root);
  const decl = readDeclaration(root);
  if (!decl) throw new Error(`${root} holds no instance declaration`);
  if (decl.name !== o.instance) throw new Error(`${root} declares ${decl.name}, not ${o.instance}`);
  const remote = capture("git remote get-url origin", root);
  const gh = ownerRepo(remote);
  if (!gh) throw new Error(`origin ${remote} is not a GitHub repository: the base path cannot be read`);
  const title = o.title ?? decl.title ?? decl.name;
  const staging = o.staging === undefined ? undefined : stagingDir(o.staging);
  const baseurl = `/${gh.repo}${staging ? `/${staging}` : ""}`;
  const out = resolve(o.out);
  const docs = join(out, "site-source");
  const site = join(out, "_site");

  if (o.mount) run("mount the pinned closure", `bun run ${JSON.stringify(join(import.meta.dir, "remote-mount.ts"))}`, root);
  const lockFile = join(root, "index.lock.json");
  const mounted: string[] = existsSync(lockFile)
    ? (JSON.parse(readFileSync(lockFile, "utf-8")).instances ?? []).map((i: { path?: string }) => i.path).filter((p: unknown): p is string => typeof p === "string")
    : [];
  run("install", ["bun install >/dev/null", ...mounted.filter((p) => existsSync(join(root, p, "package.json"))).map((p) => `(cd ${JSON.stringify(p)} && bun install >/dev/null)`)].join(" && "), root);
  for (const p of o.pre) run(`pre: ${p}`, p, root);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  run("sync docs harness", `bun run ${TOOLS}/sync-docs-harness.ts`, root);
  run("landing data", `bun run ${TOOLS}/gen-landing-data.ts`, root);
  const scope = `--instance ${JSON.stringify(o.instance)} --title ${JSON.stringify(title)} --link-root ${JSON.stringify(o.linkRoot)}`;
  run("chrome", `bun run ${TOOLS}/compose-docs.ts --out ${JSON.stringify(docs)} --shell ${scope}`, root);
  run("navbar", `bun run ${TOOLS}/gen-navbar-include.ts ${scope} --out ${JSON.stringify(join(docs, "_includes/generated/navbar-footer.html"))}`, root);
  if (o.home) copyFileSync(join(root, o.home), join(docs, "index.md"));
  for (const s of o.sourceSteps) run(`source: ${s}`, s.replaceAll("{docs}", JSON.stringify(docs)), root);

  // The Gemfile is the mounted harness's, in the site directory its declaration names.
  const harness = join(root, "cat-harness");
  const gemDir = join(harness, siteDirFor(harness));
  writeFileSync(join(out, "build-config.yml"), buildConfig(readFileSync(join(docs, "_config.yml"), "utf-8")));
  writeFileSync(
    join(out, "override.yml"),
    overrideConfig({ title, description: typeof decl.description === "string" ? decl.description : undefined, baseurl, url: `https://${gh.owner}.github.io` }),
  );
  run("bundle install", "bundle install >/dev/null", gemDir);
  run(
    "jekyll",
    `BUNDLE_GEMFILE=${JSON.stringify(join(gemDir, "Gemfile"))} bundle exec ${jekyllExe()} build --source ${JSON.stringify(docs)} --destination ${JSON.stringify(site)} --config ${JSON.stringify(join(out, "build-config.yml"))},${JSON.stringify(join(out, "override.yml"))}`,
    gemDir,
  );

  const s = JSON.stringify(site);
  run("mount instance docs", `bun run ${TOOLS}/mount-instance-docs.ts --site ${s}`, root);
  run("pdf viewer", `bun run ${TOOLS}/pdf-viewer.ts --site ${s} --allow "https://cdn.jsdelivr.net/gh/${gh.owner}/" --allow "https://raw.githubusercontent.com/${gh.owner}/"`, root);
  run("html lang", `bun run ${TOOLS}/set-html-lang.ts --site ${s}`, root);
  run("identifier lookup", `bun run ${TOOLS}/publish-id-lookup.ts --site ${s}`, root);
  run("rail on standalone pages", `bun run ${TOOLS}/rail-standalone-pages.ts --site ${s} --built cat-harness --foreign-site --home-label ${JSON.stringify(title)} --instance ${JSON.stringify(o.instance)}`, root);
  writeFileSync(join(site, ".nojekyll"), "");

  const links = await checkLinks(site, `${baseurl}/`);
  console.log(`links: ${links.pages} html pages, ${links.misses.length} unresolved; ${links.files} files`);
  if (links.misses.length > 0) {
    for (const m of links.misses.slice(0, 50)) console.error(`  ✗ ${m}`);
    throw new Error(`${links.misses.length} unresolved link(s): the site is not published`);
  }

  if (o.publish) {
    if (!o.remote) throw new Error("--publish needs --remote <git url>");
    const message = o.message ?? `Publish ${o.instance} ${capture("git rev-parse --short HEAD", root)}${staging ? ` preview of ${o.staging}` : ""}`;
    const r = publishSite(
      staging
        ? { site, remote: o.remote, into: staging, message, name: "Claude", email: "noreply@anthropic.com" }
        : { site, remote: o.remote, keep: ["STAGING", "_render-log"], message, name: "Claude", email: "noreply@anthropic.com" },
    );
    if (r.state === "failed") throw new Error(`publish failed: ${r.reason}`);
    console.log(r.state === "published" ? `published ${r.commit} (attempt ${r.attempt})` : "branch already current");
  } else {
    console.log(`built, not published: ${site} (base ${baseurl}/)`);
  }
  return { site, base: `${baseurl}/` };
}

if (import.meta.main) {
  const a = process.argv.slice(2);
  const one = (k: string): string | undefined => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const many = (k: string): string[] => a.flatMap((x, i) => (x === k && a[i + 1] !== undefined ? [a[i + 1]!] : []));
  const root = one("--root") ?? ".";
  const instance = one("--instance");
  if (!instance) {
    console.error(
      "usage: build-instance-site.ts --root <checkout> --instance <name> [--title <t>] [--link-root <url>] [--out <dir>] [--home <md>]\n" +
        "         [--pre <cmd>]... [--source-step <cmd with {docs}>]... [--staging <branch>] [--no-mount] [--publish --remote <git url>] [--message <m>]",
    );
    process.exit(2);
  }
  try {
    await buildInstanceSite({
      root,
      instance,
      title: one("--title"),
      linkRoot: one("--link-root") ?? "https://litlfred.github.io/folio-assistant",
      out: one("--out") ?? join(resolve(root), "..", `${instance}-site`),
      home: one("--home"),
      pre: many("--pre"),
      sourceSteps: many("--source-step"),
      staging: one("--staging"),
      mount: !a.includes("--no-mount"),
      publish: a.includes("--publish"),
      remote: one("--remote"),
      message: one("--message"),
    });
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}
