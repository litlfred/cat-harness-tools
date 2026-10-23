/**
 * The cache scripts' BUILT-IN family names agree with each other.
 *
 * `special-branches.json` used to be the one place these names lived, with a
 * test that every copy agreed with it. The owner removed it on 2026-10-05
 * (*"dont use /get rid of"*): a family's name is now the declaring folio's
 * `storage.branchPrefix`, read first by every script, and each script keeps
 * the same built-in names only as a fallback when nothing is declared. So the
 * drift worth catching is between the scripts themselves — one script whose
 * fallback list lost a name, or reordered it, resolves a different branch from
 * the rest when no declaration is present.
 *
 * A cache family whose scripts live in a layer above is tested by that layer:
 * the Lean cache scripts and the folio template's restore action moved up
 * (folio-assistant#2598, move M11), and a test here naming their paths would be
 * this layer naming one above it.
 *
 * Each script names the names as whole tokens: `lake-cache` is a substring of
 * both newer names, so a bare `toContain` would pass a file that never names it.
 *
 * @module cat-harness-tools/scripts/tests/cache-family-fallbacks
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..", "..", "..");

/** Newest first: the name a script writes when nothing exists, then its legacy names in resolution order. */
const FAMILIES = {
  "fhir-ast": {
    names: ["cat/fhir-harness/fhir-ast", "cat-fhir-ast", "fhir-ast"],
    files: ["fhir-harness/scripts/ig-cache.sh"],
  },
} as const;

const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Index of the first whole-token occurrence of `name` in `text`, or -1. */
function tokenAt(text: string, name: string): number {
  const m = new RegExp(`(?<![\\w/-])${esc(name)}(?![\\w.-])`).exec(text);
  return m ? m.index : -1;
}

describe("cache scripts carry the same built-in fallback names, in the same order", () => {
  for (const [family, { names, files }] of Object.entries(FAMILIES)) {
    for (const file of files) {
      test(`${file}: every ${family} name, newest first`, () => {
        const text = readFileSync(resolve(REPO, file), "utf-8");
        const at = names.map((n) => tokenAt(text, n));
        for (const [i, n] of names.entries()) expect(at[i], `${file} names ${n}`).toBeGreaterThanOrEqual(0);
      });
    }
  }

  // The order matters where the list is written as one literal. Pinned on the
  // literal a reader would copy: ig-cache.sh's.
  test("ig-cache.sh's fallback list is newest first", () => {
    const text = readFileSync(resolve(REPO, "fhir-harness/scripts/ig-cache.sh"), "utf-8");
    expect(text).toContain('for p in "cat/fhir-harness/fhir-ast/" "cat-fhir-ast/" "fhir-ast/"; do');
  });
});
