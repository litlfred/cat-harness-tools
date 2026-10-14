/**
 * The ✍ suggest editor, installed into a built site: Milkdown Crepe and KaTeX
 * bundled into ONE module and ONE stylesheet at `assets/vendor/crepe/`, where
 * the edit-links runtime looks for them (bean folio-assistant-4dx7).
 *
 *   bun run cat-harness-tools/scripts/suggest-editor.ts --site _site
 *
 * ## Why bundled here and not loaded from a CDN
 *
 * Owner, 2026-10-14, on the live dth-hrh site: the editor failed with
 * *"Adding different instances of a keyed plugin (plugin$)"*. jsDelivr's
 * `+esm` serves each package as its own module and resolves each one's
 * dependencies on its own, so two copies of `prosemirror-state` met in one
 * editor. Its theme CSS also `@import`s bare package paths a CDN cannot
 * resolve. One bundle, built from this package's pinned dependencies, has one
 * copy of each and its CSS inlined, and it is the bytes the tests run.
 *
 * ## Why installed at BUILD time and never committed
 *
 * As `pdf-viewer.ts` says of pdf.js: it costs the site and nothing else, and
 * the pin is this package's own `@milkdown/crepe` and `katex` versions.
 *
 * @covers none — a build step that installs third-party bytes, not an audit of a declared graph
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

/** Where the editor lands, relative to the SITE ROOT. The runtime derives the same path. */
export const SUGGEST_EDITOR_DIR = "assets/vendor/crepe";

const ENTRY = join(import.meta.dir, "suggest-editor");

/** Bundle `crepe.js` (exports `Crepe`, and KaTeX as the default) and `crepe.css` (with KaTeX's fonts) into `<siteDir>/assets/vendor/crepe/`. */
export async function installSuggestEditor(siteDir: string): Promise<{ dir: string; files: string[] }> {
  const dir = join(resolve(siteDir), ...SUGGEST_EDITOR_DIR.split("/"));
  const work = mkdtempSync(join(tmpdir(), "suggest-editor-"));
  try {
    const js = await Bun.build({ entrypoints: [join(ENTRY, "entry.ts")], target: "browser", format: "esm", minify: true });
    if (!js.success || js.outputs.length !== 1) throw new Error(`the editor did not bundle: ${js.logs.map(String).join("; ")}`);
    const css = await Bun.build({ entrypoints: [join(ENTRY, "entry.css")], outdir: work, minify: true, naming: { entry: "crepe.css", asset: "fonts/[name]-[hash].[ext]" } });
    if (!css.success) throw new Error(`the editor's stylesheet did not bundle: ${css.logs.map(String).join("; ")}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "crepe.js"), await js.outputs[0]!.text());
    cpSync(work, dir, { recursive: true });
    if (!existsSync(join(dir, "crepe.css"))) throw new Error("the editor's stylesheet was not written");
    const files = readdirSync(dir, { recursive: true }).map(String).sort();
    return { dir, files };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const site = argv[argv.indexOf("--site") + 1];
  if (!argv.includes("--site") || !site) {
    console.error("usage: suggest-editor.ts --site <built site dir>");
    process.exit(2);
  }
  installSuggestEditor(site)
    .then((r) => console.log(`suggest-editor: Crepe + KaTeX → ${r.dir} (${r.files.length} files)`))
    .catch((e) => {
      console.error(`✗ suggest-editor: ${(e as Error).message}`);
      process.exit(1);
    });
}
