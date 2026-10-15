/**
 * `site-coverage.ts`: a built site carries every declared visualiser page of
 * its checkout (owner, 2026-10-15: smart-ra was published without
 * `en/cat-harness/library/`, and nothing noticed).
 */
import { describe, expect, test } from "bun:test";

import { expectedPages, legacyOnlyPages, missingPages, type ExpectedPage } from "../site-coverage.ts";
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
