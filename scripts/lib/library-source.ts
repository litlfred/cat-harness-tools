/**
 * Where a library entry's own files live upstream, and the links to them.
 *
 * Owner, 2026-10-15: the "source" link of a content instance's entry
 * (`9789241511766-eng`) opened
 * `github.com/litlfred/cat-harness/blob/main/<instance>/library/…`, a 404 —
 * the entry is that instance's, and it keeps its instance directory in its own
 * repository. The viewer built every link from the HANDLER's repository
 * (cat-harness's `livesAt`) plus the path in the composed checkout, which is
 * right only for an entry of the handler itself.
 * The owner also asked, the same day, for links to the source PDF and the
 * entry's KG JSON-LD on a library assets page, a PDF opening in the PDF
 * viewer the way the IRIS instance's pages already do.
 *
 * So an entry's repository and in-repository path are asked of
 * `forgeLocation` — the one answer to "which repository holds this checkout
 * path", read from the mount lock (`index.lock.json` `repository` +
 * `upstreamRoot`) — and never composed here.
 *
 * The source PDF is linked through the site's pdf.js viewer pointed at the
 * RAW URL of the file in that repository, as the IRIS instance's page
 * generator does (its `readHere`: the raw host serves the bytes with
 * `access-control-allow-origin: *`; the build's `pdf-viewer.ts --allow`
 * admits `https://raw.githubusercontent.com/<owner>/`). Nothing large is
 * copied into the site. A non-PDF source links to the raw file directly.
 *
 * @module scripts/lib/library-source
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { forgeLocation } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { repoOf } from "../../src/core/edit-links.ts";

/** The branch every repository link names — the same one the [source] and README links use. */
export const SOURCE_BRANCH = "main";

/** A checkout path's place on the forge: `owner/repo` and the path inside it. */
export interface ForgeAt {
  repo: string;
  path: string;
}

/**
 * The repository and in-repository path of `repoRel`, a path in the checkout
 * at `repoRoot`. A path under a remote mount resolves to the mounted
 * repository (lock `repository` + `upstreamRoot`); anything else is the
 * checkout's own, `checkoutRepo`. `undefined` when neither is a GitHub
 * repository, so no link is drawn rather than a wrong one.
 */
export function forgeAt(repoRoot: string, repoRel: string, checkoutRepo: string | undefined): ForgeAt | undefined {
  const at = forgeLocation(repoRel.replace(/\/+$/, ""), checkoutRepo ? `https://github.com/${checkoutRepo}` : "", repoRoot);
  const repo = repoOf(at.repoUrl, "");
  return repo ? { repo, path: at.path } : undefined;
}

const encPath = (p: string): string => p.split("/").map(encodeURIComponent).join("/");

/** The file as GitHub shows it. */
export const blobUrl = (f: ForgeAt, branch = SOURCE_BRANCH): string => `https://github.com/${f.repo}/blob/${branch}/${encPath(f.path)}`;
/** The directory as GitHub lists it. */
export const treeUrl = (f: ForgeAt, branch = SOURCE_BRANCH): string => `https://github.com/${f.repo}/tree/${branch}/${encPath(f.path)}`;
/** The bytes themselves — what the PDF viewer reads. */
export const rawUrl = (f: ForgeAt, branch = SOURCE_BRANCH): string => `https://raw.githubusercontent.com/${f.repo}/${branch}/${encPath(f.path)}`;

/** The pdf.js viewer at `viewerHref` (page-relative), opened on `src`. The viewer's shim reads `?src=`. */
export function pdfViewerHref(viewerHref: string, src: string): string {
  return `${viewerHref}?src=${encodeURIComponent(src)}`;
}

/** What `sourceFileOf` needs of an entry. */
export interface SourceEntry {
  id: string;
  dir: string;
  sourceFile: string;
  sourceSha256: string;
}

/** What `sourceFileOf` needs of the uploads the graph read. */
export interface SourceUpload {
  kind: "file" | "intake";
  path: string;
  ingestedBy: string;
  docId?: string;
}

/**
 * The checkout path of the file the entry was ingested from, or `undefined`
 * when no copy is held: beside the entry, loose in an uploads queue that
 * names it, or inside an intake for it (the file its `files[]` records with
 * the entry's sha256, else the one named like the source). Only a file that
 * is on disk is returned — a link to bytes nobody holds is a 404.
 */
export function sourceFileOf(repoRoot: string, e: SourceEntry, uploads: readonly SourceUpload[]): string | undefined {
  const onDisk = (rel: string): string | undefined => (existsSync(join(repoRoot, rel)) ? rel : undefined);
  if (e.sourceFile && !e.sourceFile.includes("/")) {
    const beside = onDisk(`${e.dir}/${e.sourceFile}`);
    if (beside) return beside;
  }
  for (const u of uploads) {
    if (u.ingestedBy !== e.id && u.docId !== e.id) continue;
    if (u.kind === "file") {
      const hit = onDisk(u.path);
      if (hit) return hit;
      continue;
    }
    let files: { path?: string; sha256?: string }[] = [];
    try {
      files = (JSON.parse(readFileSync(join(repoRoot, u.path, "intake.json"), "utf-8")) as { files?: typeof files }).files ?? [];
    } catch {
      continue;
    }
    const pick =
      files.find((f) => e.sourceSha256 && f.sha256 === e.sourceSha256) ??
      files.find((f) => f.path && e.sourceFile && basename(f.path) === e.sourceFile);
    const hit = pick?.path ? onDisk(`${u.path}/${pick.path}`) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** One link on an entry page's sources list. */
export interface RepoLink {
  label: string;
  href: string;
  what: string;
}

/**
 * The entry's source file and its KG files, in the repository that holds the
 * entry. A withheld entry gets none: its text is not published, and a link
 * to the PDF is the text.
 *
 * - the source: a PDF through the viewer (`viewerHref`, page-relative to the
 *   site's `assets/vendor/pdfjs/web/viewer.html`) and as the raw file; any
 *   other file raw;
 * - `structure.json`, and the `sections/` and `blocks/` JSON-LD directories,
 *   on GitHub. They are not copied into the site: an entry holds hundreds of
 *   them, and the manifest that names them is published already.
 */
export function entryRepoLinks(o: {
  repoRoot: string;
  /** The entry's directory in the checkout. */
  dir: string;
  /** The entry's source file in the checkout ({@link sourceFileOf}), when one is held. */
  source?: string;
  checkoutRepo: string | undefined;
  viewerHref: string;
  withheld?: boolean;
}): RepoLink[] {
  if (o.withheld) return [];
  const out: RepoLink[] = [];
  const src = o.source ? forgeAt(o.repoRoot, o.source, o.checkoutRepo) : undefined;
  if (src && o.source) {
    const name = basename(o.source);
    const raw = rawUrl(src);
    if (/\.pdf$/i.test(name)) {
      out.push({ label: name, href: pdfViewerHref(o.viewerHref, raw), what: `source PDF, in the PDF viewer (${src.repo})` });
      out.push({ label: `${name} (raw)`, href: raw, what: "source PDF, the file itself" });
    } else {
      out.push({ label: name, href: raw, what: `source file (${src.repo})` });
    }
  }
  const dir = forgeAt(o.repoRoot, o.dir, o.checkoutRepo);
  if (dir) {
    const at = (rel: string): ForgeAt => ({ repo: dir.repo, path: `${dir.path}/${rel}` });
    if (existsSync(join(o.repoRoot, o.dir, "structure.json")))
      out.push({ label: "structure.json", href: blobUrl(at("structure.json")), what: "ingestion structure (JSON), on GitHub" });
    if (existsSync(join(o.repoRoot, o.dir, "sections")))
      out.push({ label: "sections/", href: treeUrl(at("sections")), what: "section nodes (JSON-LD) and their text, on GitHub" });
    if (existsSync(join(o.repoRoot, o.dir, "blocks")))
      out.push({ label: "blocks/", href: treeUrl(at("blocks")), what: "block nodes (JSON-LD), on GitHub" });
  }
  return out;
}
