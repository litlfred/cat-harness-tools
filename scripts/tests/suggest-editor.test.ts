/**
 * The ✍ suggest editor's site bundle: one module and one stylesheet, nothing
 * left for a CDN to resolve (owner, 2026-10-14: the CDN's split modules
 * loaded two copies of ProseMirror on the live site).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { installSuggestEditor, SUGGEST_EDITOR_DIR } from "../suggest-editor";

const site = mkdtempSync(join(tmpdir(), "suggest-editor-"));
afterAll(() => rmSync(site, { recursive: true, force: true }));

describe("suggest-editor", () => {
  test("Crepe and KaTeX in one module, their CSS in one stylesheet, no import left unresolved", async () => {
    const r = await installSuggestEditor(site);
    expect(r.dir).toBe(join(site, ...SUGGEST_EDITOR_DIR.split("/")));
    expect(r.files).toContain("crepe.js");
    expect(r.files).toContain("crepe.css");
    const js = readFileSync(join(r.dir, "crepe.js"), "utf-8");
    // Self-contained: no static import of a package or a CDN URL.
    expect(js).not.toMatch(/(?:^|[;\n])\s*import\s*[{*\w][^;]*?from\s*["']/);
    expect(js).not.toContain("cdn.jsdelivr.net");
    const css = readFileSync(join(r.dir, "crepe.css"), "utf-8");
    expect(css).not.toContain("@import");
    expect(css).toContain(".katex");
    expect(css).toContain(".milkdown");
  }, 120000);
});
