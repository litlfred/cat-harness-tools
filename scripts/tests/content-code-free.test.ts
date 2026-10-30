/**
 * `check:content-code-free` (bean `y9r6`): a code file under cat-harness/ that
 * the list does not allow is red; a listed file that is gone is not.
 */
import { describe, expect, test } from "bun:test";
import { isCode, judge, readBaseline } from "../check-content-code-free.ts";

describe("check:content-code-free", () => {
  test("code is decided by extension", () => {
    for (const f of ["a.ts", "b/c.mjs", "d.py", "e.sh", "lib/f.rb", "g.js"]) expect(isCode(f)).toBe(true);
    for (const f of ["a.json", "b.md", "c.html", "d.css", "e.yml", "f.ts.md"]) expect(isCode(f)).toBe(false);
  });

  test("shipped browser assets are not code", () => {
    for (const f of ["site-chrome/assets/js/navbar.js", "site-chrome/_includes/mermaid_config.js", "docs/assets/js/vendor/sqlite-wasm/index.mjs"]) expect(isCode(f)).toBe(false);
    for (const f of ["docs/assets/x.ts", "tools/x.js"]) expect(isCode(f)).toBe(true);
  });

  test("the folio file-list renderer and the Jekyll plugins are kept by rule", () => {
    for (const f of ["folio-render/file-list.ts", "folio-render/file-list.test.ts", "site-chrome/_plugins/fa-root-relative.rb", "docs/_plugins/liquid-undefined-warn.rb"]) expect(isCode(f)).toBe(false);
    for (const f of ["_plugins/x.ts", "site-chrome/_plugins/sub/x.ts", "render/file-list.ts"]) expect(isCode(f)).toBe(true);
  });

  test("an unlisted file is added; a listed file that is gone is only reported", () => {
    const j = judge(["schemas/a.ts", "tools/new.ts"], ["schemas/a.ts", "skills/old.ts"]);
    expect(j.added).toEqual(["tools/new.ts"]);
    expect(j.gone).toEqual(["skills/old.ts"]);
  });

  test("the committed list is sorted and has no duplicates", () => {
    const files = readBaseline();
    expect(files.length).toBeGreaterThan(0);
    expect([...files].sort()).toEqual(files);
    expect(new Set(files).size).toBe(files.length);
  });
});
