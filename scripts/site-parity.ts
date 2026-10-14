#!/usr/bin/env bun
/**
 * What a built site WEARS, measured on its pages, and what a candidate lacks
 * that the site it would replace has.
 *
 * @module scripts/site-parity
 * @covers none — a publish guard: it compares two built sites and judges no graph
 *
 * Owner, 2026-10-14 ("1 but I want things fixed first"): the one agent publish
 * path must publish an IG repository's main site with everything the older
 * `folio-site.yml` gave it, and until it does no IG main site is published
 * with it. So before a root publish the candidate is measured against the
 * root it would replace, on the PAGES, never on the exit codes of the steps
 * that made them:
 *
 * - the theme's side bar (`#site-nav`) and its search box (`#search-input`),
 *   which only a page Jekyll laid out with just-the-docs carries;
 * - the harness icon row (`#fa-navbar-row`) and the rail (`nav.fa-nav`, or the
 *   theme's `#site-nav`, which is where the rail sits on a laid-out page);
 * - every top-level directory (`openapi/`, `fhir-artifact-index/`, `ast-data/`,
 *   …): `folio-site.yml`'s `publish-served` step and its copies;
 * - the build stamp `folio-build.json` (`site-build-stamp.ts stamp`).
 *
 * A feature the current root carries on at least one page and the candidate
 * carries on none, or carries on its `index.html` and the candidate's
 * `index.html` does not, is a SHORTFALL; so is a directory or the stamp that
 * the current root has and the candidate lacks. Directories the publish keeps
 * (previews under `branches/`, `STAGING/`) are not the candidate's to carry
 * and are left out of both sides.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The page features compared, each with the test that finds it in a page's HTML. */
export const PAGE_FEATURES = {
  siteNav: /id="site-nav"/,
  search: /id="search-input"/,
  navbarRow: /id="fa-navbar-row"/,
  rail: /<nav class="fa-nav"|id="site-nav"/,
} as const;
export type PageFeature = keyof typeof PAGE_FEATURES;

/** Words for each feature, as a refusal says them. */
const FEATURE_WORDS: Record<PageFeature, string> = {
  siteNav: "the theme's side bar (#site-nav)",
  search: "the theme's search box (#search-input)",
  navbarRow: "the harness icon row (#fa-navbar-row)",
  rail: "the rail (nav.fa-nav or #site-nav)",
};

export interface SiteFeatures {
  pages: number;
  /** How many pages carry each feature. */
  counts: Record<PageFeature, number>;
  /** The features `index.html` carries; undefined when there is no `index.html`. */
  index?: PageFeature[];
  /** Top-level directories, sorted, the excluded ones left out. */
  dirs: string[];
  /** The `folio-build.json` stamp, parsed, or undefined when absent. */
  stamp?: Record<string, unknown>;
}

/** Measure a built site. `exclude` names top-level entries left out (kept by the publish, not built). */
export function siteFeatures(site: string, exclude: readonly string[] = []): SiteFeatures {
  const counts = Object.fromEntries(Object.keys(PAGE_FEATURES).map((k) => [k, 0])) as Record<PageFeature, number>;
  const f: SiteFeatures = { pages: 0, counts, dirs: [] };
  if (!existsSync(site)) return f;
  const walk = (d: string, top: boolean): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (top && exclude.includes(e.name)) continue;
      if (e.name.startsWith(".")) continue;
      const abs = join(d, e.name);
      if (e.isDirectory()) {
        if (top) f.dirs.push(e.name);
        walk(abs, false);
        continue;
      }
      if (!e.name.endsWith(".html")) continue;
      const html = readFileSync(abs, "utf-8");
      f.pages++;
      const has = (Object.keys(PAGE_FEATURES) as PageFeature[]).filter((k) => PAGE_FEATURES[k].test(html));
      for (const k of has) counts[k]++;
      if (top && e.name === "index.html") f.index = has;
    }
  };
  walk(site, true);
  f.dirs.sort();
  const stamp = join(site, "folio-build.json");
  if (existsSync(stamp)) {
    try {
      f.stamp = JSON.parse(readFileSync(stamp, "utf-8")) as Record<string, unknown>;
    } catch {
      f.stamp = { unreadable: true };
    }
  }
  return f;
}

/** Everything `current` has that `candidate` lacks, in words; empty when the candidate loses nothing. Pure. */
export function parityShortfall(current: SiteFeatures, candidate: SiteFeatures): string[] {
  const out: string[] = [];
  for (const k of Object.keys(PAGE_FEATURES) as PageFeature[]) {
    if (current.counts[k] > 0 && candidate.counts[k] === 0) {
      out.push(`${FEATURE_WORDS[k]}: on ${current.counts[k]} of the current root's ${current.pages} page(s), on none of the candidate's ${candidate.pages}`);
    } else if (current.index?.includes(k) && candidate.index !== undefined && !candidate.index.includes(k)) {
      out.push(`${FEATURE_WORDS[k]}: on the current root's index.html, not on the candidate's`);
    }
  }
  if (current.index !== undefined && candidate.index === undefined) out.push("index.html: the current root has one, the candidate has none");
  const missing = current.dirs.filter((d) => !candidate.dirs.includes(d));
  if (missing.length) out.push(`directories the current root serves and the candidate does not: ${missing.map((d) => `${d}/`).join(", ")}`);
  if (current.stamp && !candidate.stamp) out.push("the build stamp folio-build.json: the current root has it, the candidate does not");
  return out;
}

/** One line per measure, for a log or a report. */
export function describeFeatures(label: string, f: SiteFeatures): string {
  const c = f.counts;
  return `${label}: ${f.pages} page(s); #site-nav ${c.siteNav}, search ${c.search}, #fa-navbar-row ${c.navbarRow}, rail ${c.rail}; dirs ${f.dirs.join(" ") || "(none)"}; stamp ${f.stamp ? "yes" : "no"}`;
}

if (import.meta.main) {
  const a = process.argv.slice(2);
  const one = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const current = one("--current");
  const candidate = one("--candidate");
  const exclude = (one("--exclude") ?? "branches,STAGING,_render-log").split(",").filter(Boolean);
  if (!current || !candidate) {
    console.error("usage: site-parity.ts --current <built site> --candidate <built site> [--exclude a,b]");
    process.exit(2);
  }
  const cur = siteFeatures(current, exclude);
  const cand = siteFeatures(candidate, exclude);
  console.log(describeFeatures("current  ", cur));
  console.log(describeFeatures("candidate", cand));
  const short = parityShortfall(cur, cand);
  for (const s of short) console.log(`✗ ${s}`);
  if (!short.length) console.log("✓ the candidate carries everything the current root does");
  process.exit(short.length ? 1 : 0);
}
