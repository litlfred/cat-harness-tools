/**
 * `check:content-code-free` (bean `y9r6`): a code file under cat-harness/ that
 * the list does not allow is red; a listed file that is gone is not.
 */
import { describe, expect, test } from "bun:test";
import { isCode, judge, readBaseline } from "../check-content-code-free.ts";

describe("check:content-code-free", () => {
  test("code is decided by extension", () => {
    for (const f of ["a.ts", "b/c.mjs", "d.py", "e.sh", "_plugins/f.rb", "g.js"]) expect(isCode(f)).toBe(true);
    for (const f of ["a.json", "b.md", "c.html", "d.css", "e.yml", "f.ts.md"]) expect(isCode(f)).toBe(false);
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
