#!/usr/bin/env bun
/**
 * Write a JSON-LD node and a thin page for every ArchiMate model an instance
 * holds, and for every VIEW, ELEMENT and RELATIONSHIP in each — and draw every
 * view as SVG from the model's own diagram.
 *
 * @module cat-harness/archimate/scripts/gen-archimate-pages
 * @covers archimate
 *
 * Usage:
 *   bun run cat-harness/archimate/scripts/gen-archimate-pages.ts --instance <dir> --out <site-dir>
 *   bun run cat-harness/archimate/scripts/gen-archimate-pages.ts --instance <dir> [--check]
 *
 * With `--out`, they are written into a site being built — the way a folio's
 * staging build uses it, since a large model is thousands of nodes and nobody
 * should commit them. The DATA (every `.jsonld`, `.json`, `model.json`, drawn
 * view and the loader) is at the path the graph has in the instance,
 * `<site>/<graph path>/…`, so no IRI moves; the PAGES are under the locale,
 * `<site>/en/<graph path>/…` (folio-assistant#2527: every rendered page is
 * under `/<locale>/`). Each page reaches its data, and each drawn view its
 * pages, by a relative link across the two trees, so a preview under a
 * staging slug works the same.
 *
 * Without `--out` they are written into the graph itself, as
 * `gen-openapi-pages.ts` does, and `--check` gates them: pages beside their
 * data, as the directory is served verbatim at its own path.
 *
 * ## What is written, under the graph's path
 *
 * | path | what |
 * |---|---|
 * | `<m>.jsonld`, `.json` | the model as a node: its views, each by IRI |
 * | `<m>/` | the model's page: views, and elements by layer |
 * | `<m>/model.json` | the model, normalised — what the loader draws from |
 * | `<m>/views/<v>.svg` | the view, drawn (`render-view.ts`) |
 * | `<m>/views/<v>.jsonld`, `.json`, `<m>/views/<v>/` | a view's node and page |
 * | `<m>/elements/<e>.jsonld`, `.json`, `<m>/elements/<e>/` | an element's node and page |
 * | `<m>/relationships/<r>.jsonld`, `.json`, `<m>/relationships/<r>/` | a relationship's node and page |
 * | `index.html` | every model the graph holds |
 * | `assets/archimate.js`, `assets/archimate.css` | the one shared loader and its style |
 *
 * Ids are Archi's own (`schemas/archimate.ts` §"Ids are the model's own"), so
 * an element keeps its IRI across a model's versions wherever Archi kept its id.
 *
 * ## Vocabularies — borrowed, not minted
 *
 * The Open Group's ArchiMate exchange-format namespace names the types —
 * `archimate:ApplicationComponent`, `archimate:Composition` — exactly as the
 * exchange format spells them, which is Archi's spelling less its prefix and
 * its `Relationship` suffix. A relationship's ends are `archimate:source` and
 * `archimate:target`, as there. Names, descriptions and membership are
 * `schema:` and `dcterms:`. Nothing is minted in this project's namespaces.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { DOCS_SITE_BASE } from "@litlfred/cat-harness/schemas/jsonld.ts";
import { escHtml, thinPageConfigOf, thinPageHtml } from "../../scripts/thin-page.ts";
import { visualiserNavDeclaration, type VisualiserNavEntry } from "../../scripts/lib/navbar.ts";
import { findDeclarationFile } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { readArchimate, type ArchimateModel } from "@litlfred/cat-harness/archimate/schemas/archimate.ts";
import { renderViewSvg, typeLabel } from "./render-view.ts";
import { CONFIG_FILE, archimateDir, localDirOf, readConfig } from "./check-archimate.ts";
import { HARNESS_ROOT, TOOLS_ROOT } from "../../scripts/lib/roots.ts";
import { PAGE_LOCALE } from "../../scripts/viewer-declarations.ts";

/** The config-block id every page written here carries — how a run recognises its own output. */
export const PAGE_CONFIG_ID = "archimate-page";
const LOADER = "assets/archimate.js";
const STYLE = "assets/archimate.css";
const TEMPLATES = join(TOOLS_ROOT, "archimate", "scripts", "templates");

export const CONTEXT = {
  archimate: "http://www.opengroup.org/xsd/archimate/3.0/",
  schema: "https://schema.org/",
  dcterms: "http://purl.org/dc/terms/",
};

export interface Written {
  /** Path under the graph's directory. */
  path: string;
  content: string;
  /** A rendered page (an `index.html`), as opposed to data or the loader: what moves under the locale in a site. */
  page?: true;
}

/**
 * Where a written file goes in a SITE being built (`--out`), site-relative:
 * a page under the locale, `<locale>/<graph path>/<path>`; data at the graph's
 * own path, `<graph path>/<path>` (folio-assistant#2527).
 */
export function sitePathOf(graphPath: string, f: Written): string {
  return posix.join(...(f.page ? [PAGE_LOCALE] : []), graphPath, f.path);
}

interface Declaration {
  name: string;
  iriBase?: string;
  directories: Array<{ id: string; served?: boolean; path: string }>;
}

/** Where the instance's IRIs start: its own `iriBase`, else the platform's site under its name. */
export function iriBaseOf(decl: Declaration): string {
  const b = decl.iriBase ?? `${DOCS_SITE_BASE}${decl.name}/`;
  return b.endsWith("/") ? b : `${b}/`;
}

/**
 * Every file a run writes for one instance, keyed by its path under the graph.
 * `site`: the files are for a site being built (`--out`), so each page links
 * its data and loader, and each drawn view its pages, across the locale (see
 * {@link sitePathOf}); otherwise everything sits together in the graph.
 */
export function pagesFor(instanceRoot: string, opts: { requireServed?: boolean; site?: boolean } = {}): { graphPath: string; files: Written[] } {
  const config = readConfig(instanceRoot);
  const dir = archimateDir(instanceRoot, config);
  const declFile = findDeclarationFile(instanceRoot);
  if (declFile === undefined) throw new Error(`no instance declaration in ${resolve(instanceRoot)}`);
  const decl = JSON.parse(readFileSync(join(instanceRoot, declFile), "utf8")) as Declaration;
  const entry = decl.directories.find((d) => d.id === config.directory)!;
  // In the graph, the pages fetch what sits beside them, so the directory must
  // be published verbatim; into a site being built (`--out`), the site is
  // what is published and the question does not arise.
  if (opts.requireServed && !entry.served) {
    throw new Error(
      `${decl.name}: directory "${entry.id}" is not declared \`served: true\`, so a page could not fetch its model — ` +
        "no page is written (visualizer-loading §\"Where the data is served from\"); pass --out to write into a site build instead",
    );
  }
  const graphPath = localDirOf(instanceRoot, dir).replace(/\/$/, "");
  const base = `${iriBaseOf(decl)}${graphPath}/`;
  const files: Written[] = [];
  const site = opts.site === true;
  // A link from a page in directory `from` (graph-relative) to `rel`, written
  // relative to that directory in the GRAPH — which is where a site keeps the
  // data, while the page itself is under the locale.
  const toData = (from: string, rel: string): string =>
    site ? posix.relative(posix.join(PAGE_LOCALE, graphPath, from), posix.join(graphPath, from, rel)) : rel;
  // A link from a drawn view (data, in `<m>/views/`) to a page, the reverse way.
  const toPage = (from: string, rel: string): string =>
    site ? `${posix.relative(posix.join(graphPath, from), posix.join(PAGE_LOCALE, graphPath, from, rel))}/` : rel;
  const page = (path: string, depth: number, title: string, jsonld: string, config: Record<string, unknown>, body: string, tail?: string): Written =>
    thinPage(path, depth, title, jsonld, config, body, tail, toData);
  const json = (path: string, node: object) => {
    const text = `${JSON.stringify(node, null, 2)}\n`;
    files.push({ path: `${path}.jsonld`, content: text }, { path: `${path}.json`, content: text });
  };
  const listed: Array<{ id: string; title: string; views: number; elements: number }> = [];

  for (const cm of config.models) {
    const model = readArchimate(readFileSync(join(dir, cm.file)));
    const m = cm.id;
    const title = cm.title ?? model.name;
    listed.push({ id: m, title, views: model.views.length, elements: model.elements.length });
    const modelIri = `${base}${m}.jsonld`;
    const viewIri = (id: string) => `${base}${m}/views/${id}.jsonld`;
    const elIri = (id: string) => `${base}${m}/elements/${id}.jsonld`;
    const relIri = (id: string) => `${base}${m}/relationships/${id}.jsonld`;
    const elements = new Map(model.elements.map((e) => [e.id, e]));

    json(m, {
      "@context": CONTEXT,
      "@id": modelIri,
      "@type": "archimate:Model",
      "schema:identifier": m,
      "schema:name": title,
      ...(cm.description ?? model.documentation ? { "schema:description": cm.description ?? model.documentation } : {}),
      "dcterms:identifier": model.id,
      "schema:contentUrl": `${base}${cm.file.split("/").map(encodeURIComponent).join("/")}`,
      "schema:hasPart": model.views.map((v) => ({ "@id": viewIri(v.id), "@type": "archimate:Diagram", "schema:name": v.name })),
    });
    files.push({ path: `${m}/model.json`, content: `${JSON.stringify(normalisedFor(model, cm.file))}\n` });
    // The rail's left-hand section for this model's pages: the model, then its
    // views (`visualiserNavDeclaration`, the one writer of the format the
    // navbar pass reads). Relative to the page, so it holds in a preview.
    const nav = (toModel: string): string =>
      visualiserNavDeclaration([
        { label: title, href: toModel, items: model.views.map((v) => ({ label: v.name || "(unnamed view)", href: `${toModel}views/${v.id}/` })) },
        { label: "ArchiMate models", href: `${toModel}../` },
      ]);
    files.push(page(`${m}/index.html`, 1, title, toData(m, `../${m}.jsonld`), { kind: "model", node: toData(m, `../${m}.jsonld`), model: toData(m, "./model.json") },
      `<main class="am"><p class="am-up"><a href="../">← ArchiMate models</a></p><h1>${escHtml(title)}</h1>` +
        `<div class="am-body" aria-live="polite"><p>Loading the model…</p></div></main>`, nav("./")));

    for (const v of model.views) {
      const shown = [...new Set(v.nodes.filter((n) => n.kind === "element" && n.ref && elements.has(n.ref)).map((n) => n.ref!))];
      json(`${m}/views/${v.id}`, {
        "@context": CONTEXT,
        "@id": viewIri(v.id),
        "@type": "archimate:Diagram",
        "schema:identifier": v.id,
        "schema:name": v.name,
        ...(v.documentation ? { "schema:description": v.documentation } : {}),
        ...(v.viewpoint ? { "archimate:viewpoint": v.viewpoint } : {}),
        "schema:image": `${base}${m}/views/${v.id}.svg`,
        "schema:about": shown.map((id) => ({ "@id": elIri(id) })),
        "dcterms:isPartOf": modelIri,
      });
      // Relative to the SVG's own address (`<m>/views/`), so it links correctly
      // standalone, embedded as a figure, or in its page's <object>.
      // In a site the pages are under the locale and the drawing is not, so
      // there each link crosses to the page (`toPage`).
      const vd = `${m}/views`;
      files.push({
        path: `${m}/views/${v.id}.svg`,
        content: renderViewSvg(model, v, {
          elementHref: (id) => toPage(vd, `../elements/${id}/`),
          relationshipHref: (id) => toPage(vd, `../relationships/${id}/`),
          viewHref: (id) => toPage(vd, `./${id}/`),
        }),
      });
      const vp = `${m}/views/${v.id}`;
      files.push(page(`${vp}/index.html`, 3, `${v.name} — ${title}`, toData(vp, `../${v.id}.jsonld`),
        { kind: "view", node: toData(vp, `../${v.id}.jsonld`), model: toData(vp, "../../model.json"), id: v.id, svg: toData(vp, `../${v.id}.svg`) },
        `<main class="am am-wide"><p class="am-up"><a href="../../">← ${escHtml(title)}</a></p><h1>${escHtml(v.name)}</h1>` +
          `<p class="am-kind">View</p><div class="am-body" aria-live="polite"><p>Loading the view…</p></div></main>`, nav("../../")));
    }

    for (const e of model.elements) {
      json(`${m}/elements/${e.id}`, {
        "@context": CONTEXT,
        "@id": elIri(e.id),
        "@type": `archimate:${e.type}`,
        "schema:identifier": e.id,
        "schema:name": e.name,
        ...(e.documentation ? { "schema:description": e.documentation } : {}),
        "schema:category": e.layer,
        "dcterms:isPartOf": modelIri,
      });
      const ep = `${m}/elements/${e.id}`;
      files.push(page(`${ep}/index.html`, 3, `${e.name || typeLabel(e.type)} — ${title}`, toData(ep, `../${e.id}.jsonld`),
        { kind: "element", node: toData(ep, `../${e.id}.jsonld`), model: toData(ep, "../../model.json"), id: e.id },
        `<main class="am"><p class="am-up"><a href="../../">← ${escHtml(title)}</a></p><h1>${escHtml(e.name || "(unnamed)")}</h1>` +
          `<p class="am-kind">${escHtml(typeLabel(e.type))} · ${escHtml(e.layer)}</p><div class="am-body" aria-live="polite"><p>Loading the element…</p></div></main>`));
    }

    for (const r of model.relationships) {
      json(`${m}/relationships/${r.id}`, {
        "@context": CONTEXT,
        "@id": relIri(r.id),
        "@type": `archimate:${r.type}`,
        "schema:identifier": r.id,
        ...(r.name ? { "schema:name": r.name } : {}),
        ...(r.documentation ? { "schema:description": r.documentation } : {}),
        "archimate:source": { "@id": elements.has(r.source) ? elIri(r.source) : relIri(r.source) },
        "archimate:target": { "@id": elements.has(r.target) ? elIri(r.target) : relIri(r.target) },
        "dcterms:isPartOf": modelIri,
      });
      const label = `${typeLabel(r.type)}: ${elements.get(r.source)?.name ?? r.source} → ${elements.get(r.target)?.name ?? r.target}`;
      const rp = `${m}/relationships/${r.id}`;
      files.push(page(`${rp}/index.html`, 3, `${label} — ${title}`, toData(rp, `../${r.id}.jsonld`),
        { kind: "relationship", node: toData(rp, `../${r.id}.jsonld`), model: toData(rp, "../../model.json"), id: r.id },
        `<main class="am"><p class="am-up"><a href="../../">← ${escHtml(title)}</a></p><h1>${escHtml(r.name || typeLabel(r.type))}</h1>` +
          `<p class="am-kind">${escHtml(typeLabel(r.type))} relationship</p><div class="am-body" aria-live="polite"><p>Loading the relationship…</p></div></main>`));
    }
  }

  files.push({
    path: "index.html",
    page: true,
    content:
      `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>ArchiMate models — ${escHtml(decl.name)}</title><link rel="stylesheet" href="${toData("", STYLE)}"></head>\n<body><main class="am">` +
      `<h1>ArchiMate models</h1><ul>` +
      listed.map((l) => `<li><a href="${encodeURI(l.id)}/">${escHtml(l.title)}</a> <code>${escHtml(l.id)}</code> — ${l.views} view(s), ${l.elements} element(s)</li>`).join("") +
      `</ul></main>\n` +
      visualiserNavDeclaration([{ label: "ArchiMate models", href: "./", items: listed.map((l): VisualiserNavEntry => ({ label: l.title, href: `${encodeURI(l.id)}/` })) }]) +
      `\n</body></html>\n`,
  });
  files.push(
    { path: LOADER, content: readFileSync(join(TEMPLATES, "archimate.js"), "utf8") },
    { path: STYLE, content: readFileSync(join(TEMPLATES, "archimate.css"), "utf8") },
  );
  return { graphPath, files };
}

/**
 * A thin page `depth` directories below the graph's root; `tail`, a
 * declaration after its script. `toData` links the page's directory to the
 * loader, wherever the run keeps it (`pagesFor`).
 */
function thinPage(
  path: string,
  depth: number,
  title: string,
  jsonld: string,
  config: Record<string, unknown>,
  body: string,
  tail: string | undefined,
  toData: (from: string, rel: string) => string,
): Written {
  const up = "../".repeat(depth);
  const dir = posix.dirname(path);
  return {
    path,
    page: true,
    content: thinPageHtml({
      title,
      jsonld,
      script: toData(dir, `${up}${LOADER}`),
      stylesheet: toData(dir, `${up}${STYLE}`),
      configId: PAGE_CONFIG_ID,
      config,
      body,
      noscriptLead: `The page for ${escHtml(title)}`,
      ...(tail !== undefined ? { tail } : {}),
    }),
  };
}

/**
 * The model as the loader reads it: the normalised model, without diagram
 * geometry (the SVG carries that), plus which views show each element and
 * relationship — computed once here rather than in every reader's browser.
 */
export function normalisedFor(model: ArchimateModel, file: string) {
  const inViews: Record<string, string[]> = {};
  for (const v of model.views) {
    const seen = new Set<string>();
    for (const n of v.nodes) if (n.kind === "element" && n.ref) seen.add(n.ref);
    for (const c of v.connections) if (c.relationship) seen.add(c.relationship);
    for (const id of seen) (inViews[id] ??= []).push(v.id);
  }
  return {
    $schema: "folio-archimate-normalised/v1",
    id: model.id,
    name: model.name,
    file,
    ...(model.documentation ? { documentation: model.documentation } : {}),
    properties: model.properties,
    elements: model.elements,
    relationships: model.relationships,
    views: model.views.map((v) => ({
      id: v.id,
      name: v.name,
      ...(v.viewpoint ? { viewpoint: v.viewpoint } : {}),
      ...(v.documentation ? { documentation: v.documentation } : {}),
      folder: v.folder,
    })),
    inViews,
  };
}

/**
 * Files in the graph this generator wrote earlier and no longer would — found
 * by what they are: a thin page declaring {@link PAGE_CONFIG_ID}, a node file,
 * a drawn view, the normalised model, or the loader. The models, the config
 * and any README are never candidates.
 */
function orphans(root: string, wanted: Set<string>): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (wanted.has(p) || e.name.endsWith(".archimate") || e.name === "README.md" || e.name === CONFIG_FILE) continue;
      const ours =
        /\.(jsonld|svg)$/.test(e.name) ||
        e.name === "model.json" ||
        // A node's `.json` twin — never a `.json` that has no `.jsonld` beside it.
        (e.name.endsWith(".json") && existsSync(p.replace(/\.json$/, ".jsonld"))) ||
        p === join(root, LOADER) ||
        p === join(root, STYLE) ||
        (e.name === "index.html" && thinPageConfigOf(readFileSync(p, "utf8"), PAGE_CONFIG_ID) !== undefined);
      if (ours) out.push(p);
    }
  };
  walk(root);
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const instance = arg("instance");
  if (!instance) {
    console.error("usage: gen-archimate-pages.ts --instance <dir> (--out <site-dir> | [--check])");
    process.exit(2);
  }
  const out = arg("out");
  const check = process.argv.includes("--check");
  const root = resolve(instance);
  const { graphPath, files } = pagesFor(root, { requireServed: out === undefined, site: out !== undefined });
  const target = out ? join(resolve(out), graphPath) : archimateDir(root, readConfig(root));
  if (out) {
    for (const f of files) {
      const p = join(resolve(out), sitePathOf(graphPath, f));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.content);
    }
  } else {
    const wanted = new Set(files.map((f) => join(target, f.path)));
    let stale = 0;
    for (const f of files) {
      const p = join(target, f.path);
      const current = existsSync(p) ? readFileSync(p, "utf8") : undefined;
      if (current === f.content) continue;
      if (check) {
        console.error(`✗ ${p} is ${current === undefined ? "missing" : "stale"}`);
        stale++;
      } else {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, f.content);
      }
    }
    for (const p of orphans(target, wanted)) {
      if (check) {
        console.error(`✗ ${p} is an orphan — no node publishes it`);
        stale++;
      } else rmSync(p);
    }
    if (check && stale) {
      console.error(`${stale} file(s) out of date — run without --check`);
      process.exit(1);
    }
  }
  const pages = files.filter((f) => f.path.endsWith("/index.html")).length;
  const svgs = files.filter((f) => f.path.endsWith(".svg")).length;
  const where = out ? `${relative(process.cwd(), join(resolve(out), PAGE_LOCALE, graphPath))}/ (pages) and ${relative(process.cwd(), target)}/ (data)` : `${relative(process.cwd(), target)}/`;
  console.log(`${check ? "✓ current" : "wrote"}: ${instance} — ${pages} page(s), ${svgs} view drawing(s) in ${where}`);
}
