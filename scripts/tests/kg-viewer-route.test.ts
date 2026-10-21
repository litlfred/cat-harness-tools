import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { kgViewerRoute, upFrom, writeViewer } from "../kg-viewer.ts";

// Owner, 2026-10-20: "move graph viewer so aligns" — the viewer leaves
// `<stub>/` (the instance as itself) for a viewer's route.
describe("kg-viewer route", () => {
  test("the viewer is published at <locale>/<stub>/kg/", () => {
    expect(kgViewerRoute("cat-harness")).toBe("en/cat-harness/kg/");
    expect(upFrom("en/cat-harness/kg/")).toBe("../../../");
  });

  test("the page reads its graph from the site root, and the old address forwards", () => {
    const site = mkdtempSync(join(tmpdir(), "kg-viewer-"));
    const { page, forwarded } = writeViewer(site, "cat-harness", (up) => `doc=${up}cat-harness.jsonld`);
    expect(readFileSync(page, "utf-8")).toBe("doc=../../../cat-harness.jsonld");
    expect(readFileSync(forwarded!, "utf-8")).toContain(`location.replace("../en/cat-harness/kg/"`);
  });

  test("a page already at <stub>/ is the instance's, and is not replaced", () => {
    const site = mkdtempSync(join(tmpdir(), "kg-viewer-"));
    mkdirSync(join(site, "cat-harness"));
    writeFileSync(join(site, "cat-harness", "index.html"), "instance");
    const { forwarded } = writeViewer(site, "cat-harness", () => "viewer");
    expect(forwarded).toBeUndefined();
    expect(readFileSync(join(site, "cat-harness", "index.html"), "utf-8")).toBe("instance");
    expect(existsSync(join(site, "en", "cat-harness", "kg", "index.html"))).toBe(true);
  });
});
