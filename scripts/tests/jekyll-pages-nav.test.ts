import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { jekyllNavPages, pagesNav } from "../lib/jekyll-pages-nav.ts";
import { expandRail, injectRail, railDataJson } from "../lib/harness-rail.ts";
import { RAIL_SECTION_LABELS } from "../lib/navbar.ts";

/**
 * The rail's server-built "Pages" section — owner, 2026-10-15, "folio rail
 * everywhere". It must list what the theme's `site-nav` lists, in the
 * theme's order, at the address Jekyll publishes each page.
 */
function site(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pages-nav-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}
const fm = (o: Record<string, string | number | boolean>) =>
  `---\n${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`).join("\n")}\n---\nbody\n`;

const SITE = {
  "index.md": fm({ title: "Home", nav_order: 1 }),
  "guide/index.md": fm({ title: "Guide", nav_order: 2 }),
  "guide/install.md": fm({ title: "Install", parent: "Guide", nav_order: 1 }),
  "guide/use.md": fm({ title: "Use", parent: "Guide", nav_order: 2 }),
  "guide/use-cli.md": fm({ title: "CLI", parent: "Use", grand_parent: "Guide" }),
  "about.md": fm({ title: "About" }),
  "Zebra.md": fm({ title: "zebra" }),
  "hidden.md": fm({ title: "Hidden", nav_exclude: true }),
  "custom.md": fm({ title: "Custom", permalink: "/elsewhere/", nav_order: 3 }),
  "stray.md": fm({ title: "Stray", parent: "Nobody" }),
  "untitled.md": fm({ layout: "default" }),
  "_includes/x.md": fm({ title: "Not a page" }),
  "assets/y.md": fm({ title: "Not navigation" }),
  "plain.html": "<p>no front matter: copied through</p>",
};

describe("jekyllNavPages — what the theme's navigation lists", () => {
  const pages = jekyllNavPages(site(SITE));
  const titles = pages.map((p) => p.title).sort();
  test("titled pages only; nav_exclude, untitled, underscore and asset paths, and front-matter-less files are out", () => {
    expect(titles).toEqual(["About", "CLI", "Custom", "Guide", "Home", "Install", "Stray", "Use", "zebra"]);
  });
  test("addresses are Jekyll's: permalink honoured, index pages as their directory", () => {
    const url = (t: string) => pages.find((p) => p.title === t)!.url;
    expect(url("Home")).toBe("/");
    expect(url("Guide")).toBe("/guide/");
    expect(url("Install")).toBe("/guide/install.html");
    expect(url("Custom")).toBe("/elsewhere/");
  });
});

describe("pagesNav — the theme's tree and order, as rail rows", () => {
  const { items, orphans } = pagesNav(jekyllNavPages(site(SITE)), { prefix: ".." });
  test("top level by nav_order, then title case-insensitively", () => {
    expect(items.map((i) => i.label)).toEqual(["Home", "Guide", "Custom", "About", "Stray", "zebra"]);
  });
  test("children and grandchildren nest, folded with a count", () => {
    const guide = items.find((i) => i.label === "Guide")!;
    expect(guide.children!.map((i) => i.label)).toEqual(["Install", "Use"]);
    expect(guide.fold).toBe("2 pages");
    expect(guide.children![1]!.children!.map((i) => i.label)).toEqual(["CLI"]);
    expect(guide.href).toBe("../guide/");
  });
  test("a page whose parent is not listed stays reachable, and is reported", () => {
    expect(items.some((i) => i.label === "Stray")).toBe(true);
    expect(orphans).toEqual(["stray.md"]);
  });
  test("the current page is drawn as 'you are here', not a link", () => {
    const here = pagesNav(jekyllNavPages(site(SITE)), { here: "/guide/install.html" }).items;
    const install = here.find((i) => i.label === "Guide")!.children![0]!;
    expect(install.current).toBe(true);
    expect(install.href).toBeUndefined();
  });
});

describe("the rail carries Pages, from shared data too", () => {
  const PAGE = `<!doctype html><html><head><title>t</title></head><body><h1>T</h1></body></html>`;
  const pages = pagesNav(jekyllNavPages(site(SITE)), { prefix: "@root@" }).items;
  test("server-rendered and browser-drawn rails both show Pages, between the page's section and Folders", () => {
    const files = new Map<string, string>();
    const opts = { instance: "x", toRoot: "..", links: [{ href: "../library/", label: "Library" }], pages: pages.map((p) => JSON.parse(JSON.stringify(p).split("@root@").join(".."))) };
    const server = injectRail(PAGE, opts)!;
    const shared = expandRail(injectRail(PAGE, { ...opts, emitRailData: (f, b) => void files.set(f, b) })!, (n) => railDataJson(files.get(`assets/navbar/${n}.js`)!));
    for (const html of [server, shared]) {
      const labels = [...html.matchAll(/<details class="fa-nav-group"[^>]*><summary>[\s\S]*?<span class="fa-nav-label">([^<]*)</g)].map((m) => m[1]);
      expect(labels).toEqual([RAIL_SECTION_LABELS.pages, RAIL_SECTION_LABELS.folders]);
      expect(html).toContain('href="../guide/install.html"');
    }
  });
});
