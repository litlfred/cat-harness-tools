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
 *   bun run cat-harness-tools/scripts/build-instance-site.ts --root <checkout> --instance <name>
 *
 * reads the steps from `<name>.config.json` `site.build` ({@link recipeFromConfig}).
 * Any step flag below replaces it whole (no merging of flags and recipe):
 *
 *   bun run cat-harness-tools/scripts/build-instance-site.ts --root <checkout> \
 *     --instance <name> --home <page.md> \
 *     --pre <package script> --source-step <package script> --site-step <package script> \
 *     [--staging <branch>] [--publish --remote <git url>]
 *
 * Steps, each a stop on failure (never a skip):
 *
 *  1. mount the closure `index.config.json` pins (`remote-mount.ts`), unless `--no-mount`.
 *     A build writes into its mounts (the harness's `_data/harness.json`, `node_modules`), and
 *     remote-mount rightly refuses to overwrite a mount that no longer hashes to its lock. So
 *     `--fresh` first removes exactly the paths the lock names, and only paths the checkout
 *     itself does not track: an explicit choice, never a default
 *  2. `bun install --no-save` in the checkout and in every mounted instance
 *     with a package.json, so a mount still hashes to its lock and the next mount can verify it
 *  3. each `--pre` package script (`bun run <name>`), in the checkout: the instance's own gates
 *  4. landing data and the chrome: sync-docs-harness, gen-landing-data, compose-docs --shell,
 *     gen-navbar-include; `--home` becomes the site's index.md; each `--source-step` package
 *     script runs as `bun run <name> <site source>`
 *
 * `--pre`, `--source-step` and `--site-step` take package SCRIPT NAMES, never commands: the
 * Tool contract admits no input that can carry a shell payload (check:tools),
 * so what runs is what the instance's own package.json says, and nothing else.
 *  5. Jekyll, as preview-site.sh does it: remote_theme dropped (codeload is not reachable
 *     everywhere), title and description from the instance's declaration, baseurl from the
 *     git remote (`/<repo>`, or `/<repo>/STAGING/<branch>` for a preview)
 *  6. each `--site-step` package script, as `bun run <name> <built site>`: a generator that
 *     writes finished pages AFTER the site is built (gen-node-kind-pages says so of itself).
 *     As a source step its pages would pass through Jekyll, which drops every `_`-prefixed
 *     directory: a node at `docs/_data/node-kinds` lost its page that way. Then
 *     mount-instance-docs, pdf-viewer, set-html-lang, publish-id-lookup,
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
import { siteFileFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { findDeclarationFile } from "@litlfred/cat-harness/schemas/instance-roots.ts";

const TOOLS = "cat-harness-tools/scripts";

export interface BuildOptions {
  root: string;
  instance: string;
  linkRoot: string;
  out: string;
  home?: string;
  pre: string[];
  sourceSteps: string[];
  /** Package scripts run as `bun run <name> <built site>` after Jekyll: generators that write finished pages. */
  siteSteps?: string[];
  staging?: string;
  mount: boolean;
  /** Remove the lock's mount paths first, so a build that wrote into them cannot block the next mount. */
  fresh: boolean;
  publish: boolean;
  remote?: string;
  message?: string;
  /**
   * The site's title and description when the checkout declares no instance:
   * a repository that only mounts layers (`index.config.json`), such as an IG
   * repository on its base harness. `instance` is then the chrome's SCOPE, an
   * instance the checkout mounts, and the title is the site's own.
   */
  identity?: { title: string; description?: string };
  /** More root entries a root publish keeps, beside `STAGING/` and `_render-log/`. */
  keep?: string[];
}

/**
 * The environment every step runs with, so a step needs no flag for what the
 * build already knows: the site's base path, and the file in which a step
 * lists the pages whose links are the CONTENT's own (see {@link checkLinks}).
 */
export const STEP_ENV = { baseurl: "FOLIO_SITE_BASEURL", upstreamPages: "FOLIO_SITE_UPSTREAM_PAGES" } as const;

/**
 * How a step runs: `bun run <name>` from the checkout's own `package.json`, or,
 * in a checkout with none (it only mounts layers), through `run-script.ts`,
 * which finds the name among the mounted layers' checkout scripts. Either way
 * a step is a script NAME, never a command.
 */
export function stepCommand(root: string, name: string): string {
  if (!SCRIPT_NAME.test(name)) throw new Error(`${JSON.stringify(name)} is not a package script name`);
  return existsSync(join(root, "package.json")) ? `bun run ${name}` : `bun run ${JSON.stringify(join(import.meta.dir, "run-script.ts"))} ${name}`;
}

/**
 * The site-relative pages a step listed as carrying the content's own links:
 * one path per line, `#` comments and blank lines ignored.
 */
export function readUpstreamPages(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, "utf-8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")));
}

/** A branch name safe to use as one path segment under STAGING/. */
export function stagingDir(branch: string): string {
  const seg = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (seg === "" || seg === "." || seg === "..") throw new Error(`branch ${JSON.stringify(branch)} gives no usable STAGING/ segment`);
  return `STAGING/${seg}`;
}

/**
 * The fields of the instance's declaration this tool reads: name, title and
 * description, and only those. Read STRUCTURALLY, as remote-mount reads mount
 * fields (bean qump): a full read needs every graph typology the declaration
 * names to be registered, and some are registered by the layers the mount
 * lays down (an instance may name a kind, such as `catalogue`, that a layer it
 * mounts registers). Run from a sibling toolset,
 * the full read refused a declaration the build could otherwise serve.
 */
export function siteFields(text: string, file: string): { name: string; title?: string; description?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const r = raw as { name?: unknown; title?: unknown; description?: unknown };
  if (typeof r?.name !== "string" || r.name === "") throw new Error(`${file} declares no name`);
  return {
    name: r.name,
    title: typeof r.title === "string" ? r.title : undefined,
    description: typeof r.description === "string" ? r.description : undefined,
  };
}

/** A package script name: what `--pre` and `--source-step` accept, and nothing that could carry a shell payload. */
export const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;

/** The steps that build an instance's site, as its own package script names. */
export interface SiteRecipe {
  home?: string;
  pre: string[];
  sourceSteps: string[];
  siteSteps: string[];
}

/**
 * The recipe `<instance>.config.json` declares under `site.build`, or
 * undefined when it declares none. Owner, 2026-10-10: "i want one
 * consolidated worfklow". The recipe lived only as prose in a folio's
 * AGENTS.md, so `stage-local.ts` could not find it and every runner re-typed
 * it. The cat-harness schema is `HarnessSiteBuildSchema`. It is read here
 * structurally, so this compiles against a cat-harness pin from before that
 * schema, and every step is held to {@link SCRIPT_NAME} exactly as the flags are.
 */
export function recipeFromConfig(root: string, instance: string): SiteRecipe | undefined {
  const file = join(resolve(root), `${instance}.config.json`);
  if (!existsSync(file)) return undefined;
  const build = (JSON.parse(readFileSync(file, "utf-8")) as { site?: { build?: Record<string, unknown> } }).site?.build;
  if (build === undefined) return undefined;
  const list = (k: string): string[] => {
    const v = build[k] ?? [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && SCRIPT_NAME.test(x))) {
      throw new Error(`${file}: site.build.${k} must be a list of package script names`);
    }
    return v as string[];
  };
  const home = build.home;
  if (home !== undefined && typeof home !== "string") throw new Error(`${file}: site.build.home must be a path`);
  return { ...(home !== undefined ? { home } : {}), pre: list("pre"), sourceSteps: list("sourceSteps"), siteSteps: list("siteSteps") };
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

/**
 * Every unresolved link of the built site. A link on a page in `upstream` is
 * returned apart, in `upstreamMisses`: that page carries the CONTENT's own
 * links (an IG's source pages, the IG Publisher's output), whose dead links
 * are the content's to fix and are reported, while a dead link on any other
 * page is the build's and refuses the publish.
 */
export async function checkLinks(site: string, base: string, upstream: ReadonlySet<string> = new Set()): Promise<{ pages: number; files: number; misses: string[]; upstreamMisses: string[] }> {
  const misses: string[] = [];
  const upstreamMisses: string[] = [];
  const pages = htmlFiles(site);
  for (const page of pages) {
    const rel = relative(site, page).split(sep).join("/");
    for (const url of await pageUrls(readFileSync(page, "utf-8"))) {
      const t = targetOf(url, rel, base);
      if (t === undefined) continue;
      if (t === "outside-base" || !served(site, t)) (upstream.has(rel) ? upstreamMisses : misses).push(`${rel}: ${url}`);
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
  return { pages: pages.length, files, misses, upstreamMisses };
}

function run(label: string, cmd: string, cwd: string, env: Record<string, string> = {}): void {
  console.log(`▶ ${label}`);
  const r = spawnSync("bash", ["-c", cmd], { cwd, stdio: "inherit", env: { ...process.env, ...env } });
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

/**
 * Keep a MOUNTED file as pinned across a build that rewrites it.
 *
 * `sync-docs-harness` writes the tiles into `cat-harness/docs/_data/harness.json`,
 * which every later step (landing data, chrome, rail) reads. In a folio that
 * mounts cat-harness, that file is part of a pinned layer: rewriting it left the
 * mount no longer matching index.lock.json, so the NEXT build's mount step
 * refused (`cat-harness/ modified`) until the mount was laid down again by hand
 * (litlfred/dth-hrh, 2026-10-14). Returns the function that puts the pinned
 * bytes back, or removes the file if there was none; a no-op when `path` is not
 * inside a mount (cat-harness building its own site commits the file).
 */
export function keepPinned(path: string, mountDirs: readonly string[], root: string): () => void {
  const rel = relative(resolve(root), resolve(path));
  const inMount = mountDirs.some((m) => rel === m || rel.startsWith(`${m}/`));
  if (!inMount) return () => {};
  const pinned = existsSync(path) ? readFileSync(path) : undefined;
  return () => {
    if (pinned === undefined) rmSync(path, { force: true });
    else writeFileSync(path, pinned);
  };
}

export async function buildInstanceSite(o: BuildOptions): Promise<{ site: string; base: string }> {
  const root = resolve(o.root);
  const declFile = findDeclarationFile(root);
  const declared = declFile === undefined ? undefined : siteFields(readFileSync(join(root, declFile), "utf-8"), join(root, declFile));
  if (!declared && !o.identity) throw new Error(`${root} holds no instance declaration`);
  if (declared && !o.identity && declared.name !== o.instance) throw new Error(`${root} declares ${declared.name}, not ${o.instance}`);
  // With an identity the site is the checkout's own and `instance` only scopes the chrome.
  const decl = o.identity ? { name: o.instance, title: o.identity.title, description: o.identity.description } : declared!;
  const remote = capture("git remote get-url origin", root);
  const gh = ownerRepo(remote);
  if (!gh) throw new Error(`origin ${remote} is not a GitHub repository: the base path cannot be read`);
  const title = decl.title ?? decl.name;
  for (const n of [...o.pre, ...o.sourceSteps, ...(o.siteSteps ?? [])]) if (!SCRIPT_NAME.test(n)) throw new Error(`${JSON.stringify(n)} is not a package script name`);
  if (o.keep?.some((k) => k === "" || k.includes("/") || k === "." || k === "..")) throw new Error(`keep names root entries, not paths: ${JSON.stringify(o.keep)}`);
  const staging = o.staging === undefined ? undefined : stagingDir(o.staging);
  const baseurl = `/${gh.repo}${staging ? `/${staging}` : ""}`;
  const out = resolve(o.out);
  const docs = join(out, "site-source");
  const site = join(out, "_site");

  if (o.fresh) {
    const lockPath = join(root, "index.lock.json");
    const paths: string[] = existsSync(lockPath)
      ? (JSON.parse(readFileSync(lockPath, "utf-8")).instances ?? []).map((i: { path?: string }) => i.path).filter((p: unknown): p is string => typeof p === "string")
      : [];
    for (const p of paths) {
      if (p === "" || p === "." || p.startsWith("/") || p.split("/").includes("..")) throw new Error(`lock path ${JSON.stringify(p)} is not a subdirectory of the checkout`);
      if (capture(`git ls-files -- ${JSON.stringify(p)} | head -1`, root) !== "") throw new Error(`${p} holds files the checkout tracks; --fresh removes only mounts`);
      rmSync(join(root, p), { recursive: true, force: true });
    }
    console.log(`▶ fresh: removed ${paths.length} mount path(s) the lock names`);
  }
  if (o.mount) run("mount the pinned closure", `bun run ${JSON.stringify(join(import.meta.dir, "remote-mount.ts"))}`, root);
  const lockFile = join(root, "index.lock.json");
  const mounted: string[] = existsSync(lockFile)
    ? (JSON.parse(readFileSync(lockFile, "utf-8")).instances ?? []).map((i: { path?: string }) => i.path).filter((p: unknown): p is string => typeof p === "string")
    : [];
  const ownPackage = existsSync(join(root, "package.json"));
  run("install", [...(ownPackage ? ["bun install --no-save >/dev/null"] : ["true"]), ...mounted.filter((p) => existsSync(join(root, p, "package.json"))).map((p) => `(cd ${JSON.stringify(p)} && bun install --no-save >/dev/null)`)].join(" && "), root);
  const upstreamFile = join(out, "upstream-pages.txt");
  const stepEnv = { [STEP_ENV.baseurl]: baseurl, [STEP_ENV.upstreamPages]: upstreamFile };
  for (const p of o.pre) run(`pre: ${p}`, stepCommand(root, p), root, stepEnv);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(upstreamFile, "");
  // The harness data the build rewrites lives in the cat-harness mount: put the pinned
  // bytes back afterwards, failed build or not, so the mount stays as the lock pins it.
  const harnessDir = join(root, "cat-harness");
  const restoreHarnessData = keepPinned(join(harnessDir, siteFileFor(harnessDir, "_data/harness.json")), mounted, root);
  const s = JSON.stringify(site);
  try {
    run("sync docs harness", `bun run ${TOOLS}/sync-docs-harness.ts`, root);
    run("landing data", `bun run ${TOOLS}/gen-landing-data.ts`, root);
    const scope = `--instance ${JSON.stringify(o.instance)} --title ${JSON.stringify(title)} --link-root ${JSON.stringify(o.linkRoot)}`;
    run("chrome", `bun run ${TOOLS}/compose-docs.ts --out ${JSON.stringify(docs)} --shell ${scope}`, root);
    run("navbar", `bun run ${TOOLS}/gen-navbar-include.ts ${scope} --out ${JSON.stringify(join(docs, "_includes/generated/navbar-footer.html"))}`, root);
    if (o.home) copyFileSync(join(root, o.home), join(docs, "index.md"));
    for (const s of o.sourceSteps) run(`source: ${s}`, `${stepCommand(root, s)} ${JSON.stringify(docs)}`, root, stepEnv);

    // The Gemfile is the mounted harness's, in its site CHROME (semantic subgraphs, slice 1).
    const harness = join(root, "cat-harness");
    // Bundler writes Gemfile.lock beside the Gemfile: copy it out, so the mount stays as pinned.
    const gemDir = join(out, "gems");
    mkdirSync(gemDir, { recursive: true });
    for (const f of ["Gemfile", "Gemfile.lock"]) {
      const src = join(harness, siteFileFor(harness, f));
      if (existsSync(src)) copyFileSync(src, join(gemDir, f));
    }
    writeFileSync(join(out, "build-config.yml"), buildConfig(readFileSync(join(docs, "_config.yml"), "utf-8")));
    writeFileSync(
      join(out, "override.yml"),
      overrideConfig({ title, description: decl.description, baseurl, url: `https://${gh.owner}.github.io` }),
    );
    run("bundle install", "bundle install >/dev/null", gemDir);
    run(
      "jekyll",
      `BUNDLE_GEMFILE=${JSON.stringify(join(gemDir, "Gemfile"))} bundle exec ${jekyllExe()} build --source ${JSON.stringify(docs)} --destination ${JSON.stringify(site)} --config ${JSON.stringify(join(out, "build-config.yml"))},${JSON.stringify(join(out, "override.yml"))}`,
      gemDir,
    );

    for (const st of o.siteSteps ?? []) run(`site: ${st}`, `${stepCommand(root, st)} ${s}`, root, stepEnv);
    run("mount instance docs", `bun run ${TOOLS}/mount-instance-docs.ts --site ${s}`, root);
    run("pdf viewer", `bun run ${TOOLS}/pdf-viewer.ts --site ${s} --allow "https://cdn.jsdelivr.net/gh/${gh.owner}/" --allow "https://raw.githubusercontent.com/${gh.owner}/"`, root);
    run("html lang", `bun run ${TOOLS}/set-html-lang.ts --site ${s}`, root);
    run("identifier lookup", `bun run ${TOOLS}/publish-id-lookup.ts --site ${s}`, root);
    run("rail on standalone pages", `bun run ${TOOLS}/rail-standalone-pages.ts --site ${s} --built cat-harness --foreign-site --home-label ${JSON.stringify(title)} --instance ${JSON.stringify(o.instance)}`, root);
  } finally {
    restoreHarnessData();
  }
  writeFileSync(join(site, ".nojekyll"), "");

  const upstream = readUpstreamPages(upstreamFile);
  const links = await checkLinks(site, `${baseurl}/`, upstream);
  console.log(`links: ${links.pages} html pages, ${links.misses.length} unresolved; ${links.files} files`);
  if (links.upstreamMisses.length > 0) {
    console.log(`links: ${links.upstreamMisses.length} unresolved on ${upstream.size} page(s) the content supplies (reported, not gated: the content's own to fix):`);
    for (const m of links.upstreamMisses.slice(0, 20)) console.log(`  · ${m}`);
  }
  if (links.misses.length > 0) {
    for (const m of links.misses.slice(0, 50)) console.error(`  ✗ ${m}`);
    throw new Error(`${links.misses.length} unresolved link(s): the site is not published`);
  }

  if (o.publish) {
    if (!o.remote) throw new Error("--publish needs --remote <git url>");
    const message = o.message ?? `Publish ${o.instance} ${capture("git rev-parse --short HEAD", root)}${staging ? ` preview of ${o.staging}` : ""}`;
    // `into` and `keep` arrived in bootstrap-tools#16 (adea857). An older
    // bootstrap-tools ignores unknown options, so a preview would REPLACE THE
    // WHOLE BRANCH and a root publish would delete every preview. Refuse
    // rather than guess: the options are typed locally so this compiles
    // against either version, and the running one is checked for support.
    if (!publishSite.toString().includes("o.into")) {
      throw new Error("the mounted bootstrap-tools' publish-site predates --into/--keep (bootstrap-tools#16): publishing would replace the whole branch; re-pin bootstrap-tools to adea857 or later");
    }
    const opts: Parameters<typeof publishSite>[0] & { into?: string; keep?: string[] } = staging
      ? { site, remote: o.remote, into: staging, message, name: "Claude", email: "noreply@anthropic.com" }
      : { site, remote: o.remote, keep: [...new Set(["STAGING", "_render-log", ...(o.keep ?? [])])], message, name: "Claude", email: "noreply@anthropic.com" };
    const r = publishSite(opts);
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
      "usage: build-instance-site.ts --root <checkout> --instance <name> [--link-root <url>] [--out <dir>] [--home <md>]\n" +
        "         [--pre <script>]... [--source-step <script>]... [--site-step <script>]... [--staging <branch>] [--no-mount | --fresh] [--publish --remote <git url>] [--message <m>]",
    );
    process.exit(2);
  }
  // Explicit step flags win. With none, the instance's own `site.build`.
  const stepsOrRecipe = (): Pick<BuildOptions, "home" | "pre" | "sourceSteps" | "siteSteps"> => {
    const flags = { home: one("--home"), pre: many("--pre"), sourceSteps: many("--source-step"), siteSteps: many("--site-step") };
    if (flags.home !== undefined || flags.pre.length + flags.sourceSteps.length + flags.siteSteps.length > 0) return flags;
    const r = recipeFromConfig(root, instance);
    if (r === undefined) return flags;
    console.log(`steps: from ${instance}.config.json site.build`);
    return r;
  };
  try {
    await buildInstanceSite({
      root,
      instance,
      linkRoot: one("--link-root") ?? "https://litlfred.github.io/folio-assistant",
      out: one("--out") ?? join(resolve(root), "..", `${instance}-site`),
      ...stepsOrRecipe(),
      staging: one("--staging"),
      mount: !a.includes("--no-mount"),
      fresh: a.includes("--fresh"),
      publish: a.includes("--publish"),
      remote: one("--remote"),
      message: one("--message"),
    });
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}
