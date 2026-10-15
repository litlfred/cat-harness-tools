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
import { join, relative, resolve } from "node:path";

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
import { entryRepoLinks, forgeAt, sourceFileOf } from "../lib/library-source.ts";
import { readEntryDocument } from "../lib/library-document.ts";
import { VIEWER_PATH } from "../pdf-viewer.ts";

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

/**
 * A page-granularity `structure.json` of the shape smart-base's
 * `9789241511766-eng` carries: no `source.pages`, no `pages[]`, one section per page.
 */
function pageGranular(id: string, n: number): Record<string, unknown> {
  return {
    _schema: "pdf-structure/v1",
    doc_id: id,
    source: { file: `${id}.pdf`, sha256: "0".repeat(64), bytes: 1, mtime: null, mimetype_sniffed: "application/pdf", mimetype_source: "magic-bytes", text_source: "embedded" },
    toc_source: "none",
    granularity: "page",
    metadata: { title: null, docinfo: {} },
    sections: Array.from({ length: n }, (_, k) => ({ id: `page-${k + 1}`, number: null, title: `Page ${k + 1}`, level: 1, page_start: k + 1, page_end: k + 1, n_chars: 1, n_words: 1 })),
  };
}

/**
 * Owner, 2026-10-15: the [source] link of smart-base's `9789241511766-eng`
 * opened `github.com/litlfred/cat-harness/blob/main/smart-base/library/…` — a
 * 404, because it was built from the HANDLER's repository. An entry's links
 * name the repository that HOLDS it, from the mount lock; and the entry page
 * links its source PDF (through the PDF viewer) and its KG files there.
 */
describe("an entry's repository links name the repository that holds it", () => {
  const sha = "a".repeat(40);
  const repo = mkdtempSync(join(tmpdir(), "lib-forge-"));
  // A remote mount whose instance sits at `smart-base/` in its own repository (upstreamRoot).
  writeFileSync(
    join(repo, "index.lock.json"),
    JSON.stringify({
      $schema: "cat-harness-mount-lock/v1",
      mounts: [{ harness: "smart-base", repository: "o/smart-base", ref: sha }],
      instances: [{
        instance: "smart-base", repository: "o/smart-base", sha, upstreamRoot: "smart-base", path: "smart-base", via: "smart-base",
        pinnedBy: "declared", declaration: { file: "smart-base.json", sha256: "0".repeat(64) },
        directories: [{ id: "library", path: "smart-base/library", upstreamPath: "smart-base/library", treeDigest: "0".repeat(64), files: 1 }],
      }],
    }),
  );
  const dir = "smart-base/library/e1";
  mkdirSync(join(repo, dir, "sections"), { recursive: true });
  mkdirSync(join(repo, dir, "blocks"), { recursive: true });
  writeFileSync(join(repo, dir, "structure.json"), "{}");
  // The source, held in the checkout's own uploads queue as an intake.
  mkdirSync(join(repo, "uploads", "e1"), { recursive: true });
  writeFileSync(join(repo, "uploads", "e1", "e 1.pdf"), "%PDF");
  writeFileSync(join(repo, "uploads", "e1", "intake.json"), JSON.stringify({ doc_id: "e1", files: [{ path: "meta.pdf", sha256: "1".repeat(64) }, { path: "e 1.pdf", sha256: "f".repeat(64) }] }));
  const entry = { id: "e1", dir, sourceFile: "e 1.pdf", sourceSha256: "f".repeat(64) };
  const uploads = [{ kind: "intake" as const, path: "uploads/e1", ingestedBy: "e1", docId: "e1" }];

  test("a mounted entry is in the mounted repository, under its upstream root — not the handler's", () => {
    expect(forgeAt(repo, dir, "o/cat-harness")).toEqual({ repo: "o/smart-base", path: "smart-base/library/e1" });
    // A path no mount covers is the checkout's own.
    expect(forgeAt(repo, "uploads/e1", "o/host")).toEqual({ repo: "o/host", path: "uploads/e1" });
    expect(forgeAt(repo, "uploads/e1", undefined)).toBeUndefined();
  });

  test("the Document panel's [source] and [feedback] are built in that repository", () => {
    writeFileSync(join(repo, dir, "structure.json"), JSON.stringify(pageGranular("e1", 1)));
    const at = forgeAt(repo, dir, "o/cat-harness")!;
    const d = readEntryDocument(join(repo, dir), "e1", { links: { repo: at.repo, dir: at.path } });
    expect(d?.links).toEqual({ repo: "o/smart-base", branch: "main", dir: "smart-base/library/e1" });
  });

  test("the source file is found in the intake by its sha256", () => {
    expect(sourceFileOf(repo, entry, uploads)).toBe("uploads/e1/e 1.pdf");
    expect(sourceFileOf(repo, { ...entry, sourceSha256: "" }, uploads)).toBe("uploads/e1/e 1.pdf");
    expect(sourceFileOf(repo, entry, [])).toBeUndefined();
  });

  const viewerHref = relative(SHELL, join(SITE, VIEWER_PATH));
  const links = entryRepoLinks({ repoRoot: repo, dir, source: sourceFileOf(repo, entry, uploads), checkoutRepo: "o/host", viewerHref });
  const by = (label: string): string => links.find((l) => l.label === label)!.href;

  test("a PDF opens in the site's PDF viewer, pointed at the raw file in its repository", () => {
    const raw = "https://raw.githubusercontent.com/o/host/main/uploads/e1/e%201.pdf";
    expect(by("e 1.pdf")).toBe(`${viewerHref}?src=${encodeURIComponent(raw)}`);
    expect(resolve(SHELL, by("e 1.pdf").split("?")[0]!)).toBe(join(SITE, VIEWER_PATH));
    expect(by("e 1.pdf (raw)")).toBe(raw);
  });

  test("a non-PDF source links to the file directly", () => {
    writeFileSync(join(repo, dir, "notes.docx"), "x");
    const l = entryRepoLinks({ repoRoot: repo, dir, source: `${dir}/notes.docx`, checkoutRepo: "o/host", viewerHref });
    expect(l[0]).toMatchObject({ label: "notes.docx", href: "https://raw.githubusercontent.com/o/smart-base/main/smart-base/library/e1/notes.docx" });
    expect(l.some((x) => x.href.includes("viewer.html"))).toBe(false);
  });

  test("the KG files link into the entry's own repository", () => {
    expect(by("structure.json")).toBe("https://github.com/o/smart-base/blob/main/smart-base/library/e1/structure.json");
    expect(by("sections/")).toBe("https://github.com/o/smart-base/tree/main/smart-base/library/e1/sections");
    expect(by("blocks/")).toBe("https://github.com/o/smart-base/tree/main/smart-base/library/e1/blocks");
  });

  test("the entry page draws them beside the published manifest", () => {
    const all = entrySources({ site: SITE, dataDir: DATA, shellDir: SHELL, instance: "smart-base", entry: { id: "e1" }, manifest: true, files: [], repo: links });
    expect(all.map((l) => l.label)).toEqual(["manifest.jsonld", "e 1.pdf", "e 1.pdf (raw)", "structure.json", "sections/", "blocks/", "e1.doc.json", "e1.json"]);
  });

  test("a withheld entry links none of it", () => {
    expect(entryRepoLinks({ repoRoot: repo, dir, source: "uploads/e1/e 1.pdf", checkoutRepo: "o/host", viewerHref, withheld: true })).toEqual([]);
  });
});

describe("an unknown page count is not zero (owner, 2026-10-15: \"(0 pages)\")", () => {
  test("a page-granularity ingestion with no source.pages reads null, and says how far its sections reach", () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-pages-"));
    writeFileSync(join(dir, "structure.json"), JSON.stringify(pageGranular("x", 3)));
    const d = readEntryDocument(dir, "x")!;
    expect(d.pages).toBeNull();
    expect(d.pagesCovered).toBe(3);
  });
});
