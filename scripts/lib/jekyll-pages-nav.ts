/**
 * The rail's "Pages" section, built on the SERVER from a Jekyll site's source —
 * owner, 2026-10-15, "folio rail everywhere": ONE left-hand rail on every
 * site, including the just-the-docs ones, with a server-built Pages group.
 *
 * ## Why this exists
 *
 * On a just-the-docs site the page tree is the theme's `<nav id="site-nav">`,
 * built by Liquid from every page's front matter, and `docs-ui.js` folds it
 * under a "Pages" button in the browser (`mountNavPagesHeading`). The rail
 * (`nav.fa-nav`, `lib/navbar.ts`) had no such section, so a site could not
 * move to the rail without losing its pages. This reads the SAME front-matter
 * fields the theme reads and gives the rail the same tree as a
 * {@link NavItem} list, so the one rail can carry it.
 *
 * ## What it models, and what it refuses to guess
 *
 * just-the-docs' navigation rules, as far as a folio's site uses them:
 *
 * - a page is listed when it has a `title` and no `nav_exclude: true`;
 * - a page with no `parent` is top level; one with `parent: <title>` sits
 *   under the page of that title, and `grand_parent` disambiguates a parent
 *   title used twice;
 * - siblings sort by `nav_order` (numbers before strings, each ascending),
 *   then by title, case-insensitively — the theme's own order;
 * - the address is Jekyll's (`jekyll-permalink.ts`): front-matter
 *   `permalink`, else the `_config.yml` default, else the source path.
 *
 * A page whose `parent` names no listed page is kept at the top level and
 * REPORTED (`orphans`), never dropped: a page that vanishes from the
 * navigation reads as a page that does not exist.
 *
 * @module scripts/lib/jekyll-pages-nav
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { pagePermalink, permalinkDefaultsIn } from "./jekyll-permalink.ts";
import type { NavItem } from "./navbar.ts";

/** One page as the theme's navigation sees it. */
export interface JekyllNavPage {
  /** Site-relative source path, `/`-separated. */
  rel: string;
  title: string;
  /** Site-absolute URL, no `baseurl`: `/guides/`, `/about.html`. */
  url: string;
  parent?: string;
  grandParent?: string;
  navOrder?: number | string;
}

/** Directories Jekyll does not render as pages, or that are never navigation. */
const SKIP_DIR = /^(?:_|\.|assets$|vendor$|node_modules$)/;

function frontMatter(text: string): Record<string, unknown> | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return undefined;
  try {
    const v = parseYaml(m[1]!) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return undefined;
  }
}

/** The pages a just-the-docs site's navigation lists, read from its SOURCE directory. */
export function jekyllNavPages(siteDir: string): JekyllNavPage[] {
  const defaults = permalinkDefaultsIn(siteDir);
  const out: JekyllNavPage[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) walk(join(dir, e.name), `${prefix}${e.name}/`);
        continue;
      }
      if (!/\.(md|markdown|html)$/i.test(e.name)) continue;
      const rel = `${prefix}${e.name}`;
      const fm = frontMatter(readFileSync(join(dir, e.name), "utf-8"));
      if (!fm) continue; // no front matter: Jekyll copies it through, it is not a page
      const title = typeof fm.title === "string" ? fm.title.trim() : "";
      if (!title || fm.nav_exclude === true) continue;
      const url = pagePermalink(rel, fm, defaults).replace(/(^|\/)index\.html$/, "$1");
      out.push({
        rel,
        title,
        url: url === "" ? "/" : url,
        ...(typeof fm.parent === "string" && fm.parent.trim() ? { parent: fm.parent.trim() } : {}),
        ...(typeof fm.grand_parent === "string" && fm.grand_parent.trim() ? { grandParent: fm.grand_parent.trim() } : {}),
        ...(typeof fm.nav_order === "number" || typeof fm.nav_order === "string" ? { navOrder: fm.nav_order } : {}),
      });
    }
  };
  walk(siteDir, "");
  return out;
}

/** The theme's sibling order: numeric `nav_order` first, then string ones, then none; ties by title. */
function byNavOrder(a: JekyllNavPage, b: JekyllNavPage): number {
  const rank = (p: JekyllNavPage) => (typeof p.navOrder === "number" ? 0 : typeof p.navOrder === "string" ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0 && a.navOrder !== b.navOrder) return (a.navOrder as number) - (b.navOrder as number);
  if (ra === 1 && a.navOrder !== b.navOrder) return String(a.navOrder).localeCompare(String(b.navOrder));
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

/** The summary of a folded set of child pages — one wording. */
export function childPages(n: number): string {
  return n === 1 ? "1 page" : `${n} pages`;
}

/**
 * The page tree as rail rows. `prefix` is put before every site-absolute URL
 * (`..` for a page one level down; `""` for Liquid, whose `relative_url` adds
 * the base). `here` — the current page's URL — is drawn as "you are here".
 */
export function pagesNav(
  pages: readonly JekyllNavPage[],
  o: { prefix?: string; here?: string } = {},
): { items: NavItem[]; orphans: string[] } {
  const prefix = o.prefix ?? "";
  const listed = new Set(pages.map((p) => p.title));
  const orphans = pages.filter((p) => p.parent !== undefined && !listed.has(p.parent)).map((p) => p.rel);
  const kidsOf = (parent: JekyllNavPage | undefined, grand: JekyllNavPage | undefined): JekyllNavPage[] =>
    pages
      .filter((p) =>
        parent === undefined
          ? p.parent === undefined || !listed.has(p.parent)
          : p.parent === parent.title && (p.grandParent === undefined || p.grandParent === grand?.title) && p !== parent,
      )
      .sort(byNavOrder);
  const row = (p: JekyllNavPage, grand: JekyllNavPage | undefined, depth: number): NavItem => {
    // just-the-docs nests three levels; deeper is not navigation.
    const kids = depth < 2 ? kidsOf(p, grand).map((k) => row(k, p, depth + 1)) : [];
    const here = o.here !== undefined && o.here === p.url;
    return {
      label: p.title,
      // Indented one step per level, as the theme's nested lists are.
      ...(depth > 0 ? { depth } : {}),
      ...(here ? { current: true } : { href: `${prefix}${p.url}` }),
      ...(kids.length ? { children: kids, fold: childPages(kids.length) } : {}),
    };
  };
  return { items: kidsOf(undefined, undefined).map((p) => row(p, undefined, 0)), orphans };
}
