/**
 * Where the cat-harness instance lives: the directory holding `cat-harness.json`.
 *
 * The schema modules were written inside cat-harness and found its data files
 * (`code-lists/`, `test/fixtures/`, the declaration) by walking up from their
 * own file. They now live in cat-harness-tools (bean `8lcl`), so that walk
 * would land in the tools repository instead. This is the one place that says
 * where the harness is.
 *
 * Tried in order:
 *
 * 1. `CAT_HARNESS_ROOT`, for a checkout laid out some other way.
 * 2. A `cat-harness/` directory beside this repository.
 * 3. The `@litlfred/cat-harness` package, as a composed index links it.
 *
 * The sibling comes before the package (bean `g7ls`). In a composed index
 * the two are the same directory. Where they differ, the package is the
 * wrong one: the standalone rehearsal (`probeStandalone`) lays the closure
 * out as siblings in a scratch directory and links the index's
 * `node_modules` beside them, so `@litlfred/cat-harness` resolved, through
 * that link, to the INDEX's cat-harness. The checkout was then the whole
 * index, the test preload saw every fixture instance "present" and did not
 * set `FOLIO_FIXTURE_CHECKOUT`, and `fhir-harness.json` (outside the
 * closure) was read against a registry that never scanned the core that
 * contributes its `glossary` kind: about 250 tests failed to load.
 *
 * Does not throw at import: a module that only needs the harness for one
 * function should still load where the harness is absent.
 *
 * @module schemas/harness-root
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined | null = null;

/** The cat-harness instance root, or `undefined` when none can be found. */
export function harnessRoot(): string | undefined {
  if (cached !== null) return cached;
  const env = process.env.CAT_HARNESS_ROOT;
  if (env && existsSync(join(env, "cat-harness.json"))) return (cached = resolve(env));
  const here = dirname(fileURLToPath(import.meta.url));
  const sibling = resolve(here, "..", "..", "cat-harness");
  if (existsSync(join(sibling, "cat-harness.json"))) return (cached = sibling);
  try {
    const p = createRequire(import.meta.url).resolve("@litlfred/cat-harness/cat-harness.json");
    return (cached = dirname(p));
  } catch {
    // not linked as a package
  }
  return (cached = undefined);
}

/** Like {@link harnessRoot}, but throws naming what was tried. */
export function requireHarnessRoot(): string {
  const r = harnessRoot();
  if (!r) {
    throw new Error(
      "cannot find the cat-harness instance: set CAT_HARNESS_ROOT, link @litlfred/cat-harness, or check it out beside cat-harness-tools",
    );
  }
  return r;
}
