/**
 * Every library page links, visibly, the published files it renders — owner,
 * 2026-10-15: *"graphs and subgrpahs (e.g. library) should also link to their
 * source jslon(ld)'s as well as assets"*.
 *
 * These pin the parts that need no checkout: that each href, resolved from the
 * page, lands on the path the writer publishes to (`libraryAssetSitePath`,
 * `entryGraphSitePath`, `entryDataFiles`, `avatarCopies`), and that the pages
 * draw the list. The same over the real checkout, including every instance's
 * library on the whole-library page and a `--site` run, is
 * `test/coordinator/library-source-links-checkout.test.ts`.
 *
 * @module scripts/tests/library-source-links
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  avatarCopies,
  composedInstanceRoots,
  entryDataFiles,
  entryPageHtml,
  entrySources,
  inComposition,
  instanceSources,
  sourcesHtml,
  viewerHtml,
} from "../gen-library-viz.ts";
import { entryGraphSitePath } from "../lib/library-entry-graphs.ts";
import { libraryAssetSitePath } from "@litlfred/cat-harness/schemas/library-iri.ts";
import type { LibraryGraph } from "../library-graph.ts";

const SITE = "/site";
const DATA = join(SITE, "assets", "library");
const SHELL = join(SITE, "en", "h", "library", "inst", "e1");

describe("an entry page's sources are the files the writer publishes", () => {
  const avatar = { href: "/assets/library/avatars/inst/e1.png", src: "inst/library/e1/cover.png", source: "cover" as const };
  const links = entrySources({
    site: SITE,
    dataDir: DATA,
    shellDir: SHELL,
    instance: "inst",
    entry: { id: "e1", avatar },
    manifest: true,
    files: [{ kind: "l1-extraction", abs: "/src/l1.json", rel: "l1-extraction/l1.json", jsonld: true }],
  });
  const at = (label: string): string => resolve(SHELL, links.find((l) => l.label === label)!.href);

  test("manifest, sub-graph file, both projections and the avatar, each at its published path", () => {
    expect(at("manifest.jsonld")).toBe(join(SITE, libraryAssetSitePath("inst", "e1")));
    expect(at("l1-extraction/l1.json")).toBe(join(SITE, entryGraphSitePath("inst", "e1", "l1-extraction/l1.json")));
    expect(at("e1.doc.json")).toBe(entryDataFiles(DATA, "e1").doc);
    expect(at("e1.json")).toBe(entryDataFiles(DATA, "e1").blocks);
    const g = { entries: [{ id: "e1", instance: "inst", dir: "inst/library/e1", avatar }] } as unknown as LibraryGraph;
    expect([...avatarCopies(g, SITE, "/repo").keys()]).toEqual([at("e1.png")]);
  });

  test("a file that is not published is not linked", () => {
    const bare = entrySources({ site: SITE, dataDir: DATA, shellDir: SHELL, instance: "inst", entry: { id: "e1" }, manifest: false, files: [] });
    expect(bare.map((l) => l.label)).toEqual(["e1.doc.json", "e1.json"]);
  });

  test("the entry page draws them where a reader sees them, not only in <noscript>", () => {
    const html = entryPageHtml("../../../../assets/library/index.json", "inst", "../../", { id: "e1", sources: links });
    const visible = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    expect(visible).toContain('id="lib-sources"');
    for (const l of links) expect(visible).toContain(`href="${l.href}"`);
  });
});

describe("an instance page and the whole-library page", () => {
  test("the instance page links the projection, its subgraph and each entry's JSON-LD", () => {
    const pageDir = join(SITE, "en", "h", "library", "inst");
    const manifest = join(SITE, libraryAssetSitePath("inst", "e1"));
    const sub = join(SITE, "subgraph", "inst", "index.jsonld");
    const links = instanceSources({ pageDir, dataFile: join(DATA, "index.json"), subgraph: sub, manifests: [{ id: "e1", abs: manifest }] });
    expect(links.map((l) => resolve(pageDir, l.href))).toEqual([join(DATA, "index.json"), sub, manifest]);
    expect(instanceSources({ pageDir, dataFile: join(DATA, "index.json"), manifests: [] })).toHaveLength(1);
  });

  test("the whole-library page tabulates every instance's library, and says when its JSON-LD is not published", () => {
    const html = viewerHtml("../../assets/library/index.json", "", "./", {
      libraries: [
        { instance: "a", entries: 2, page: "a/", jsonld: "../../subgraph/a/index.jsonld" },
        { instance: "b", entries: 0 },
      ],
    });
    expect(html).toContain('id="lib-subgraphs"');
    expect(html).toContain('href="a/"');
    expect(html).toContain('href="../../subgraph/a/index.jsonld"');
    expect(html).toMatch(/<td>b<\/td><td>0<\/td><td>—<\/td><td>not published<\/td>/);
  });

  test("a page with nothing to link draws no empty section", () => {
    expect(sourcesHtml([])).toBe("");
    expect(viewerHtml("x.json", "s", "../")).not.toContain("lib-sources");
  });
});

/** A checkout of declarations only: `{dir: {name, needs}}`, `""` being the root. */
function checkout(decls: Record<string, { name: string; needs?: string[] }>): string {
  const root = mkdtempSync(join(tmpdir(), "lib-compose-"));
  for (const [dir, d] of Object.entries(decls)) {
    mkdirSync(join(root, dir, "library"), { recursive: true });
    writeFileSync(join(root, dir, `${d.name}.json`), JSON.stringify({ ...d, directories: [] }));
  }
  return root;
}

describe("which instances a site composes (owner, 2026-10-15)", () => {
  // "a harness should combine it libray/ (or whatever) sites of it and all its depndencies"
  test("a root that declares an instance composes it and its transitive needs, not every mount", () => {
    const repo = checkout({ "": { name: "folio", needs: ["mid"] }, mid: { name: "mid", needs: ["low"] }, low: { name: "low" }, other: { name: "other" } });
    const scope = composedInstanceRoots(repo)!;
    expect([...scope].sort()).toEqual([repo, join(repo, "low"), join(repo, "mid")].map((p) => resolve(p)).sort());
    expect(inComposition(scope, repo, "library/x")).toBe(true);
    expect(inComposition(scope, repo, "low/library/x")).toBe(true);
    expect(inComposition(scope, repo, "other/library/x")).toBe(false);
  });

  test("a hub root that declares nothing composes every instance", () => {
    const repo = checkout({ a: { name: "a" }, b: { name: "b" } });
    expect(composedInstanceRoots(repo)).toBeUndefined();
    expect(inComposition(undefined, repo, "b/library/x")).toBe(true);
  });
});
