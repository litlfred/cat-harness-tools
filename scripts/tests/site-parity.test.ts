/**
 * The root publish's guard (owner, 2026-10-14: an IG main site published by
 * the one publish path loses nothing `folio-site.yml` gave it): a built site is
 * measured on its PAGES, and a candidate that lacks what the current root
 * carries is named, feature by feature.
 *
 * The fixtures are the three shapes measured on smart-trust that day: the root
 * `folio-site.yml` built (theme side bar and search, icon row, served
 * directories, stamp), the IG Publisher's bare preview, and a railed one.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { publishedRoot, recipeFromConfig, siteStepEnv } from "../build-instance-site.ts";
import { droppedByRuling, matchesDropped, parityShortfall, siteFeatures } from "../site-parity.ts";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const put = (root: string, rel: string, text = "x") => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const page = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
const THEMED = page(`<div class="side-bar"><nav id="site-nav"></nav><input id="search-input"></div><script type="application/json" id="fa-navbar-row">{}</script>`);
const RAILED = page(`<nav class="fa-nav"></nav><script type="application/json" id="fa-navbar-row">{}</script>`);

/** The root folio-site.yml built: two themed pages, served directories, a stamp, and previews under branches/. */
function folioSiteRoot(): string {
  const d = tmp("parity-root-");
  put(d, "index.html", THEMED);
  put(d, "artifact/StructureDefinition-HCert.html", THEMED);
  put(d, "openapi/index.html", RAILED);
  put(d, "fhir-artifact-index/index.json", "{}");
  put(d, "ast-data/resources/x.json", "{}");
  put(d, "folio-build.json", JSON.stringify({ $schema: "folio-site-build/v1", instance: "r" }));
  put(d, "branches/feature/index.html", page("bare preview"));
  return d;
}

describe("siteFeatures — measured on the pages", () => {
  test("counts each feature, lists top-level directories without the kept ones, reads the stamp", () => {
    const f = siteFeatures(folioSiteRoot(), ["branches"]);
    expect(f.pages).toBe(3);
    expect(f.counts).toEqual({ siteNav: 2, search: 2, navbarRow: 3, rail: 3 });
    expect(f.index).toEqual(["siteNav", "search", "navbarRow", "rail"]);
    expect(f.dirs).toEqual(["artifact", "ast-data", "fhir-artifact-index", "openapi"]);
    expect(f.stamp).toMatchObject({ instance: "r" });
  });

  test("a site that is not there measures as empty", () => {
    expect(siteFeatures(join(tmpdir(), "no-such-site-x"))).toMatchObject({ pages: 0, dirs: [] });
  });
});

describe("parityShortfall — what the candidate would lose", () => {
  const current = siteFeatures(folioSiteRoot(), ["branches"]);

  test("the IG Publisher's bare preview loses every feature, three directories and the stamp", () => {
    const bare = tmp("parity-bare-");
    put(bare, "index.html", page("<h1>IG home</h1>"));
    put(bare, "openapi/index.html", page("swagger"));
    const short = parityShortfall(current, siteFeatures(bare));
    expect(short).toHaveLength(6);
    expect(short.join("\n")).toMatch(/side bar \(#site-nav\): on 2 of the current root's 3 page\(s\), on none of the candidate's 2/);
    expect(short.join("\n")).toMatch(/artifact\/, ast-data\/, fhir-artifact-index\//);
    expect(short.join("\n")).toMatch(/folio-build\.json/);
  });

  test("a railed preview keeps the icon row and the rail, and loses the theme's side bar and search", () => {
    const railed = tmp("parity-railed-");
    put(railed, "index.html", RAILED);
    for (const d of ["artifact", "ast-data", "fhir-artifact-index", "openapi"]) put(railed, `${d}/x.html`, RAILED);
    put(railed, "folio-build.json", "{}");
    const short = parityShortfall(current, siteFeatures(railed));
    expect(short.map((s) => s.split(":")[0])).toEqual(["the theme's side bar (#site-nav)", "the theme's search box (#search-input)"]);
  });

  test("a feature on some pages but missing from the candidate's index.html is named too", () => {
    const c = siteFeatures(folioSiteRoot(), ["branches"]);
    const cand = { ...c, index: ["navbarRow" as const, "rail" as const] };
    expect(parityShortfall(c, cand)).toEqual([
      "the theme's side bar (#site-nav): on the current root's index.html, not on the candidate's",
      "the theme's search box (#search-input): on the current root's index.html, not on the candidate's",
    ]);
  });

  test("the same site loses nothing; extra pages and directories are not a shortfall", () => {
    const more = folioSiteRoot();
    put(more, "qa/index.html", THEMED);
    expect(parityShortfall(current, siteFeatures(more, ["branches"]))).toEqual([]);
  });
});

describe("the recipe an IG declares (site.build)", () => {
  const checkout = (build: unknown) => {
    const d = tmp("recipe-");
    writeFileSync(join(d, "r.config.json"), JSON.stringify({ site: { build } }));
    return d;
  };

  test("keep, profile and links are read and checked", () => {
    expect(recipeFromConfig(checkout({ pre: ["site:ast"], keep: ["branches"], profile: "ig-repo-site", links: "report" }), "r")).toEqual({
      pre: ["site:ast"], sourceSteps: [], siteSteps: [], keep: ["branches"], profile: "ig-repo-site", links: "report",
    });
    expect(() => recipeFromConfig(checkout({ keep: ["../x"] }), "r")).toThrow(/keep/);
    expect(() => recipeFromConfig(checkout({ keep: ["."] }), "r")).toThrow(/keep/);
    expect(() => recipeFromConfig(checkout({ profile: "ig" }), "r")).toThrow(/profile/);
    expect(() => recipeFromConfig(checkout({ links: "ignore" }), "r")).toThrow(/links/);
  });

  test("every step is told the build's own values in its environment", () => {
    expect(siteStepEnv({ instance: "r", title: "R", baseurl: "/r", url: "https://o.github.io", linkRoot: "L", work: "/w", source: "/w/s", site: "/w/_site", repository: "o/r", commit: "abc", ref: "main" })).toEqual({
      SITE_REPOSITORY: "o/r", SITE_COMMIT: "abc", SITE_REF: "main",
      SITE_INSTANCE: "r", SITE_TITLE: "R", SITE_BASEURL: "/r", SITE_URL: "https://o.github.io", SITE_LINK_ROOT: "L",
      SITE_WORK: "/w", SITE_SOURCE: "/w/s", SITE_DIR: "/w/_site",
    });
  });
});

describe("publishedRoot — the root a publish would replace, read without cloning into the checkout", () => {
  test("the branch's root is laid out without the kept entries; an absent branch is undefined", () => {
    const bare = tmp("published-bare-");
    execFileSync("git", ["init", "-q", "--bare", "-b", "gh-pages", bare]);
    const seed = folioSiteRoot();
    const g = (...a: string[]) => execFileSync("git", ["-C", seed, ...a], { stdio: "ignore" });
    g("init", "-q", "-b", "gh-pages");
    g("add", "-A");
    g("-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "-m", "folio-site");
    g("push", "-q", `file://${bare}`, "gh-pages");
    const root = publishedRoot(`file://${bare}`, "gh-pages", ["branches", "STAGING"])!;
    const f = siteFeatures(root);
    expect(f.dirs).toEqual(["artifact", "ast-data", "fhir-artifact-index", "openapi"]);
    expect(f.stamp).toBeDefined();
    expect(publishedRoot(`file://${bare}`, "no-such-branch", [])).toBeUndefined();
  });
});

describe("directories dropped by the owner's ruling", () => {
  const ruling = { dir: "comparison-v*", ruling: "owner, 2026-10-14, \"2a\"" };
  const withComparison = () => {
    const r = folioSiteRoot();
    put(r, "comparison-v1.0.0/index.html", page("<p>comparison</p>"));
    return r;
  };
  /** The root as rebuilt without `openapi/`: a loss no ruling excuses. */
  const withoutOpenapi = () => {
    const r = folioSiteRoot();
    rmSync(join(r, "openapi"), { recursive: true, force: true });
    return r;
  };

  test("the glob matches top-level directory names only", () => {
    expect(matchesDropped("comparison-v1.0.0", ruling)).toBe(true);
    expect(matchesDropped("comparison-v2", ruling)).toBe(true);
    expect(matchesDropped("comparison", ruling)).toBe(false);
    expect(matchesDropped("openapi", ruling)).toBe(false);
    expect(matchesDropped("x", { dir: "a/b", ruling: "r" })).toBe(false);
  });

  test("a dropped directory is not a shortfall, and is said with its ruling", () => {
    const current = siteFeatures(withComparison(), ["branches"]);
    const cand = siteFeatures(withoutOpenapi(), ["branches"]);
    expect(droppedByRuling(current, cand, [ruling])).toEqual([{ dir: "comparison-v1.0.0", ruling: ruling.ruling }]);
    const short = parityShortfall(current, cand, [ruling]);
    expect(short.join("\n")).not.toContain("comparison-v1.0.0");
    // It excuses nothing else: openapi/ is still a shortfall.
    expect(short.join("\n")).toContain("openapi/");
  });

  test("without the declaration the same drop is a shortfall", () => {
    const current = siteFeatures(withComparison(), ["branches"]);
    expect(parityShortfall(current, siteFeatures(folioSiteRoot(), ["branches"])).join("\n")).toContain("comparison-v1.0.0/");
  });
});
