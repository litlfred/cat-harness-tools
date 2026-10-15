import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expandRail, railDataJson } from "../lib/harness-rail.ts";
import { RAIL_SECTION_LABELS, bodyTag, injectNavbar } from "../lib/navbar.ts";
import { elementEnd, hasPageBar, hasThemeSidebar, stripThemeSidebar, withSiteBar } from "../lib/site-bar.ts";
import { railStandalonePages } from "../mount-instance-docs.ts";
import { PAGE_LAYOUT_CSS_FILE, PAGE_LAYOUT_JS_FILE } from "../page-layout.ts";

/**
 * One rail and one top bar on every page — owner, 2026-10-15: "folio rail
 * everywhere" (option A, a pass after Jekyll) and "Top bar, like IG sites".
 * The theme page here is just-the-docs 0.12's `default` layout, reduced to
 * the elements the pass touches.
 */
const THEME_PAGE = (title: string) => `<!DOCTYPE html>
<html lang="en-US"><head><meta charset="UTF-8"><title>${title}</title><link rel="stylesheet" href="/assets/css/just-the-docs-default.css"></head>
<body>
  <a class="skip-to-main" href="#main-content">Skip to main content</a>
  <header class="side-bar">
    <div class="site-header"><a href="/" class="site-title lh-tight">Site</a><button id="menu-button" class="site-button btn-reset" aria-label="Menu"></button></div>
    <nav aria-label="Main" id="site-nav" class="site-nav"><ul class="nav-list"><li class="nav-list-item"><a href="/" class="nav-list-link">Home</a></li></ul></nav>
    <div class="d-md-block d-none site-footer"><div class="fa-nav-in">harnesses</div></div>
  </header>
  <div class="main" id="top">
    <div id="main-header" class="main-header">
      <div class="search" role="search"><div class="search-input-wrap"><input type="text" id="search-input" class="search-input"><label for="search-input" class="search-label"></label></div><div id="search-results" class="search-results"></div></div>
    </div>
    <div class="main-content-wrap"><div id="main-content" class="main-content"><main><h1>${title}</h1><h2 id="a">A</h2><p>x</p><h2 id="b">B</h2><p>y</p></main>
    <hr><footer><div class="d-md-none mt-4 fs-2"><div class="fa-nav-in">harnesses again</div></div></footer></div></div>
  </div>
</body></html>`;

const fm = (o: Record<string, string | number>) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\nbody\n`;

function put(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
}

describe("stripThemeSidebar", () => {
  test("the side bar and the footer's mobile copy go; the content and the header stay", () => {
    const out = stripThemeSidebar(THEME_PAGE("Guide"));
    expect(hasThemeSidebar(out)).toBe(false);
    expect(out).not.toContain('id="site-nav"');
    expect(out).not.toContain("harnesses again");
    expect(out).toContain('<div id="main-header" class="main-header">');
    expect(out).toContain("<h1>Guide</h1>");
  });
  test("elementEnd counts nested elements", () => {
    const h = "<div a><div><div></div></div></div>tail";
    expect(h.slice(elementEnd(h, 0, "div"))).toBe("tail");
  });
});

describe("withSiteBar", () => {
  test("a theme page's header BECOMES the bar: home first, its own search, the picker's slot, the layout", () => {
    const out = withSiteBar(stripThemeSidebar(THEME_PAGE("Guide")), { toRoot: "..", title: "folio-assistant" });
    expect(out).toMatch(/<div id="main-header" class="main-header fa-site-bar fa-page-bar"><a class="fa-page-bar-home" href="\.\.\/">folio-assistant<\/a>\s*<div class="search"/);
    expect(out).toContain('data-fa-slot="locale"></span></div>');
    expect(out.split('id="search-input"').length).toBe(2);
    expect(out).toContain(`href="../${PAGE_LAYOUT_CSS_FILE}"`);
    expect(withSiteBar(out, { toRoot: "..", title: "x" })).toBe(out);
  });
  test("a page the theme did not lay out gets the same bar after the rail, with the theme's search when the site has it", () => {
    const page = `<!doctype html><html><head><title>t</title></head><body><nav class="fa-nav" aria-label="folio-assistant" data-fa-rail="pending"><a href="./">x</a></nav><p>replica</p></body></html>`;
    const out = withSiteBar(page, { toRoot: ".", title: "folio-assistant", search: ["assets/js/vendor/lunr.min.js", "assets/js/just-the-docs.js"] });
    expect(out).toMatch(/<\/nav><div id="main-header" class="main-header fa-site-bar fa-page-bar"><a class="fa-page-bar-home"[^>]*>folio-assistant<\/a><div class="search" role="search">/);
    expect(out).toContain('<script src="./assets/js/just-the-docs.js" defer></script>');
    const bare = withSiteBar(page, { toRoot: ".", title: "folio-assistant" });
    expect(bare).not.toContain('id="search-input"');
  });
  test("an IG page keeps its own bar", () => {
    const ig = `<html><head></head><body><div class="ig-topbar fa-page-bar">IG</div></body></html>`;
    expect(hasPageBar(ig)).toBe(true);
    expect(withSiteBar(ig, { toRoot: ".", title: "x" })).toBe(ig);
  });
});

describe("the rail pass with --theme-source: one rail on every page (option A)", () => {
  const source = mkdtempSync(join(tmpdir(), "theme-src-"));
  put(source, {
    "index.md": fm({ title: "Home", nav_order: 1 }),
    "guide/index.md": fm({ title: "Guide", nav_order: 2 }),
    "guide/install.md": fm({ title: "Install", parent: "Guide" }),
  });
  const site = mkdtempSync(join(tmpdir(), "theme-site-"));
  put(site, {
    "index.html": THEME_PAGE("Home"),
    "guide/index.html": THEME_PAGE("Guide"),
    "guide/install.html": THEME_PAGE("Install"),
    "replica/page.html": `<!doctype html><html><head><title>r</title></head><body><p>replica</p></body></html>`,
    "assets/js/vendor/lunr.min.js": "/* lunr */",
    "assets/js/just-the-docs.js": "/* jtd */",
  });
  const r = railStandalonePages(site, "cat-harness", "cat-harness", [], undefined, { themeSource: source });
  const drawn = (rel: string) =>
    expandRail(readFileSync(join(site, rel), "utf-8"), (n) => railDataJson(readFileSync(join(site, "assets", "navbar", `${n}.js`), "utf-8")));

  test("the theme pages are railed, their side bar replaced; the replica is railed as before", () => {
    expect(r.replacedThemeSidebar).toBe(3);
    expect(r.injected).toBe(4);
    for (const rel of ["index.html", "guide/install.html"]) {
      const html = readFileSync(join(site, rel), "utf-8");
      expect(hasThemeSidebar(html)).toBe(false);
      expect(html).toContain('<nav class="fa-nav"');
    }
  });
  test("every page's rail has the site's Pages, with the reader's page marked and its fold open", () => {
    const html = drawn("guide/install.html");
    const labels = [...html.matchAll(/<details class="fa-nav-group"[^>]*><summary>[\s\S]*?<span class="fa-nav-label">([^<]*)</g)].map((m) => m[1]);
    expect(labels).toContain(RAIL_SECTION_LABELS.pages);
    expect(labels[0]).toBe(RAIL_SECTION_LABELS.onThisPage);
    expect(html).toMatch(/aria-label="Hide Guide's 1 page"/);
    expect(html).toMatch(/<span class="fa-nav-dead"[^>]*>[\s\S]*?Install/);
    expect(drawn("replica/page.html")).toContain('href="../guide/install.html"');
  });
  test("every page has the same top bar, and the layout it is drawn by is shipped", () => {
    for (const rel of ["index.html", "guide/install.html", "replica/page.html"]) {
      const html = readFileSync(join(site, rel), "utf-8");
      expect(html).toContain('class="main-header fa-site-bar fa-page-bar"');
      expect(html.split('id="search-input"').length).toBe(2);
    }
    expect(existsSync(join(site, PAGE_LAYOUT_CSS_FILE))).toBe(true);
    expect(existsSync(join(site, PAGE_LAYOUT_JS_FILE))).toBe(true);
  });
  test("running it again changes nothing", () => {
    const before = readFileSync(join(site, "guide/install.html"), "utf-8");
    const again = railStandalonePages(site, "cat-harness", "cat-harness", [], undefined, { themeSource: source });
    expect(again.injected).toBe(0);
    expect(readFileSync(join(site, "guide/install.html"), "utf-8")).toBe(before);
  });
});

describe("the real <body>, never one a comment or a script names", () => {
  // Measured 2026-10-15: the theme's head_custom.html says `<body>` in an HTML
  // comment, and the first textual match put the whole rail inside it.
  const page = `<html><head><!-- hoists a stray <div> into <body> --><script>var s = "<body>";</script></head><body class="x"><p>hi</p></body></html>`;
  test("bodyTag skips both", () => {
    expect(bodyTag(page)?.[0]).toBe('<body class="x">');
  });
  test("the rail lands in the body", () => {
    const out = injectNavbar(page, { instance: "x" })!;
    expect(out.indexOf('<nav class="fa-nav"')).toBeGreaterThan(out.indexOf('<body class="x">'));
  });
});
