/**
 * The ✍ suggest editor's profiles: found through the declaration, bundled
 * under the runtime's roles, and refused when a code ref leaves its instance
 * (bean folio-assistant-4dx7).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeDeclaration } from "../test/support/instance-fixture";
import { bundleEditorProfiles, editorProfiles, profileEntrySource, resolveCodeRef } from "./editor-profiles";

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "editor-profiles-"));
  const sci = join(repo, "sci");
  mkdirSync(join(sci, "editor-checkers"), { recursive: true });
  mkdirSync(join(sci, "suggest"), { recursive: true });
  writeDeclaration(sci, { name: "sci", directories: [{ id: "sci-editor-checkers", path: "editor-checkers/", graphTypologies: ["editor-checkers"] }] });
  writeFileSync(
    join(sci, "suggest", "check.ts"),
    [
      "const arity = (tex: string) => Math.max(0, ...Array.from(tex.matchAll(/#([1-9])/g), (m) => Number(m[1])));",
      "export function checkIt(before: string, after: string) { return after.includes('{') && !after.includes('}') ? [{ severity: 'error', message: 'unbalanced' }] : []; }",
      "export function tableOf(k: Record<string, string>) { return Object.fromEntries(Object.entries(k).map(([n, t]) => [n.slice(1), arity(t)])); }",
      "export function inline(katex: unknown, macros: unknown) { return { katex, macros }; }",
      "",
    ].join("\n"),
  );
  const node = (id: string, contentType: string, extra: object = {}) =>
    JSON.stringify({ $schema: "folio-editor-checker/v1", id, contentType, check: "suggest/check.ts#checkIt", ...extra });
  writeFileSync(join(sci, "editor-checkers", "paper-latex.json"), node("paper-latex", "paper", { macros: "suggest/check.ts#tableOf", crepe: { nodeViews: { math_inline: "suggest/check.ts#inline" } }, rawLatexFirstFor: ["proof"] }));
  writeFileSync(join(sci, "editor-checkers", "doc.json"), node("doc", "document"));
  writeFileSync(join(sci, "editor-checkers", "other.json"), JSON.stringify({ $schema: "something-else/v1", id: "x", contentType: "paper" }));
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("editor profiles", () => {
  test("found through the declaration, by content type", () => {
    expect(editorProfiles(repo, "paper").map((p) => p.node.id)).toEqual(["paper-latex"]);
    expect(editorProfiles(repo, "document").map((p) => p.node.id)).toEqual(["doc"]);
    expect(editorProfiles(repo, "fhir")).toEqual([]);
  });

  test("the bundle re-exports each code ref under its role", () => {
    const src = profileEntrySource(editorProfiles(repo, "paper")[0]!);
    expect(src).toContain("checkIt as check");
    expect(src).toContain("tableOf as macros");
    expect(src).toContain('export const nodeViews = { "math_inline": nodeView0 }');
  });

  test("a code ref outside its instance, or to no file, is refused", () => {
    expect(() => resolveCodeRef(join(repo, "sci"), "../x.ts#y")).toThrow("outside its instance");
    expect(() => resolveCodeRef(join(repo, "sci"), "suggest/none.ts#y")).toThrow("does not exist");
    expect(() => resolveCodeRef(join(repo, "sci"), "suggest/check.ts")).toThrow("not a code ref");
  });

  test("bundled into one browser module that runs on its own", async () => {
    const out = join(repo, "site", "assets", "suggest");
    const profiles = await bundleEditorProfiles(repo, "paper", out, "../../assets/suggest/");
    expect(profiles).toEqual([{ id: "paper-latex", module: "../../assets/suggest/paper-latex.js", rawLatexFirstFor: ["proof"] }]);
    const js = readFileSync(join(out, "paper-latex.js"), "utf-8");
    expect(js).not.toMatch(/\bimport\b[^(]/);
    const mod = await import(join(out, "paper-latex.js"));
    expect(mod.check("a", "a {")).toEqual([{ severity: "error", message: "unbalanced" }]);
    expect(mod.macros({ "\\pair": "#1,#2" })).toEqual({ pair: 2 });
    expect(Object.keys(mod.nodeViews)).toEqual(["math_inline"]);
    expect(await bundleEditorProfiles(repo, "fhir", join(repo, "none"), "")).toEqual([]);
  });
});
