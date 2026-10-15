/**
 * `site-coverage.ts`: a built site carries every declared visualiser page of
 * its checkout (owner, 2026-10-15: smart-ra was published without
 * `en/cat-harness/library/`, and nothing noticed).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expectedPages, legacyOnlyPages, missingPages, subjectInstances, type ExpectedPage } from "../site-coverage.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";
import { repoRootFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";

const page = (route: string, legacyRoute: string): ExpectedPage => ({ route, legacyRoute, harness: "h", visualiser: "v" });

describe("missingPages", () => {
  const expected = [page("en/h/v/", "h/v/"), page("en/h/w/", "h/w/"), page("en/h/x/", "h/x/")];
  const site = new Set(["en/h/v/index.html", "h/w/index.md"]);
  const has = (p: string): boolean => site.has(p);

  test("a page at its localised route, or a Jekyll source there, is present", () => {
    expect(missingPages([page("en/h/v/", "h/v/")], has)).toEqual([]);
  });

  test("a page only at its old address is not missing, and is counted as legacy", () => {
    expect(missingPages([expected[1]!], has)).toEqual([]);
    expect(legacyOnlyPages(expected, has).map((p) => p.legacyRoute)).toEqual(["h/w/"]);
  });

  test("a page at neither address is missing", () => {
    expect(missingPages(expected, has).map((p) => p.route)).toEqual(["en/h/x/"]);
  });
  test("on the instance's own site, its page at the site's own root is present (who-iris catalogue, 2026-10-15)", () => {
    const own: ExpectedPage = { ...page("en/h/x/", "h/x/"), ownSiteRoute: "x/" };
    expect(missingPages([own], (p) => p === "x/index.html")).toEqual([]);
    // ...and only there: another harness's page at the root does not count.
    expect(missingPages([page("en/h/x/", "h/x/")], (p) => p === "x/index.html")).toHaveLength(1);
  });
});

describe("expectedPages over this checkout", () => {
  const root = repoRootFor(HARNESS_ROOT);
  const pages = expectedPages(root);

  test("expects the library index and a page per instance whose library has entries", () => {
    const library = pages.filter((p) => p.visualiser === "library");
    expect(library.some((p) => p.instance === undefined && p.route.endsWith("/library/"))).toBe(true);
    for (const p of library.filter((x) => x.instance !== undefined)) expect(p.route).toMatch(new RegExp(`/library/${p.instance}/$`));
  });

  test("a staging-only visualiser is expected in a preview, never on a root publish", () => {
    const staging = expectedPages(root, { staging: true });
    const onlyInPreview = staging.filter((s) => !pages.some((p) => p.route === s.route));
    expect(onlyInPreview.every((p) => p.harness !== undefined)).toBe(true);
    expect(staging.length).toBeGreaterThanOrEqual(pages.length);
  });
});

describe("subjectInstances: the guard asks the writer's own reader which instances have a page", () => {
  // smart-immunizations, 2026-10-15: smart-base's `tools` declaration reached
  // the IG's own `tools/` folder (FHIR scripts, sub-directories and all) as a
  // member. The tools writer draws a page per instance with Tool NODES, so it
  // drew none there, and the guard, counting folders, failed the build.
  const at = mkdtempSync(join(tmpdir(), "site-coverage-"));
  const igTools = join(at, "smart-immunizations", "tools");
  const harnessTools = join(at, "cat-harness", "tools");
  mkdirSync(join(igTools, "node"), { recursive: true });
  mkdirSync(join(harnessTools, "gates"), { recursive: true });
  const dirs = [
    { instance: "cat-harness", absPath: harnessTools },
    { instance: "smart-immunizations", absPath: igTools },
  ];

  test("a writer with a reader of its own decides: a folder of scripts is not a Tool", () => {
    const readers = { "tools-viewer": () => ["cat-harness", "smart-base", "cat-harness"] };
    expect(subjectInstances({ renderedBy: "tools-viewer" }, at, dirs, readers)).toEqual(["cat-harness", "smart-base"]);
  });

  test("a writer with none keeps the sub-directory test", () => {
    expect(subjectInstances({ renderedBy: "library-viewer" }, at, dirs, {})).toEqual(["cat-harness", "smart-immunizations"]);
  });

  test("a reader that throws falls back to the sub-directory test rather than expecting nothing", () => {
    const readers = { "tools-viewer": (): string[] => { throw new Error("a declared tools graph did not load"); } };
    expect(subjectInstances({ renderedBy: "tools-viewer" }, at, dirs, readers)).toEqual(["cat-harness", "smart-immunizations"]);
    rmSync(at, { recursive: true, force: true });
  });
});

describe("expectedPages over this checkout: tools", () => {
  test("expects a tools sub-graph page exactly for the instances the tools writer draws", async () => {
    const { toolSubjects } = await import("../gen-tools-viz.ts");
    const root = repoRootFor(HARNESS_ROOT);
    let drawn: string[];
    try {
      drawn = toolSubjects(root).subjects.map((s) => s.name).sort();
    } catch {
      return; // a sibling's tools graph does not load in this checkout: the fallback is pinned above
    }
    const expected = expectedPages(root).filter((p) => p.visualiser === "tools" && p.instance !== undefined).map((p) => p.instance!).sort();
    expect(expected).toEqual(drawn);
  });
});
