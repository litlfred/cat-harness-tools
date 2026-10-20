/**
 * The viewer's inline scripts parse, and its Lean badges read `lean.ref`.
 *
 * ## Why a parse test exists
 *
 * `viewer/index.html` carries the whole viewer as one inline module script.
 * On 2026-10-20 it did not parse: two block-index loops in `renderPaper` had
 * lost a closing brace and a sidebar helper had its callers pasted inside it,
 * so the browser stopped at "Unexpected end of input" and NONE of the module
 * ran. No test loaded the page under `bun test`, so nothing went red. This
 * test parses every inline script with TypeScript's parser, which is cheap
 * and needs no browser, and fails on the first syntax error with its line.
 *
 * ## Why the Lean helpers are pinned
 *
 * Manifests carry `lean.ref` (`"<package>:<Decl.Name>"`) since the lean.ref
 * migration, and the resolver passes it through. The viewer read only
 * `lean.file` / `lean.decl`, so a ref-only block showed "no lean" and printed
 * "undefined" (bean `cat-tools-og5t`). The helpers are evaluated from the page
 * itself, so the test is of the shipped code, not of a copy.
 *
 * @module scripts/tests/viewer-script
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { TOOLS_ROOT } from "../lib/roots.ts";

const PAGE = readFileSync(join(TOOLS_ROOT, "viewer", "index.html"), "utf-8");

/** Every inline `<script>` body, with the page line it starts on. */
function inlineScripts(html: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    out.push({ line: html.slice(0, m.index).split("\n").length, body: m[1]! });
  }
  return out;
}

describe("viewer/index.html", () => {
  const scripts = inlineScripts(PAGE);

  test("has inline scripts to check — finding none is not a pass", () => {
    expect(scripts.length).toBeGreaterThan(0);
    expect(Math.max(...scripts.map((s) => s.body.length))).toBeGreaterThan(100_000);
  });

  test("every inline script parses", () => {
    const errors: string[] = [];
    for (const s of scripts) {
      const out = ts.transpileModule(s.body, {
        reportDiagnostics: true,
        fileName: "inline.js",
        compilerOptions: { allowJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      for (const d of out.diagnostics ?? []) {
        const at = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line : 0;
        errors.push(`page line ${s.line + at}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
      }
    }
    expect(errors).toEqual([]);
  });
});

describe("the viewer's Lean helpers read both shapes", () => {
  // Evaluated from the page, so this tests what ships.
  const src = ["hasLean", "leanDeclName"].map((name) => {
    const m = PAGE.match(new RegExp(`function ${name}\\(l\\) \\{[\\s\\S]*?\\n    \\}|function ${name}\\(l\\) \\{[^\\n]*\\}`));
    if (!m) throw new Error(`viewer/index.html no longer defines ${name}(l)`);
    return m[0];
  });
  const { hasLean, leanDeclName } = new Function(`${src.join("\n")}; return { hasLean, leanDeclName };`)() as {
    hasLean: (l: unknown) => boolean;
    leanDeclName: (l: unknown) => string;
  };

  test("a ref-only block has Lean, named by its declaration without the package", () => {
    const l = { ref: "qou:QOU.ChiSymAlt.chiPairProductC_eq" };
    expect(hasLean(l)).toBe(true);
    expect(leanDeclName(l)).toBe("QOU.ChiSymAlt.chiPairProductC_eq");
  });

  test("the older `decl` / `file` shape still reads", () => {
    expect(leanDeclName({ decl: "Foo.bar", file: "Foo/Bar.lean" })).toBe("Foo.bar");
    expect(leanDeclName({ file: "Foo/Bar.lean" })).toBe("Foo/Bar.lean");
  });

  test("no ref, decl or file is no Lean, and names nothing rather than `undefined`", () => {
    expect(hasLean({ validation: "ok" })).toBe(false);
    expect(hasLean(undefined)).toBe(false);
    expect(leanDeclName(undefined)).toBe("");
  });
});
