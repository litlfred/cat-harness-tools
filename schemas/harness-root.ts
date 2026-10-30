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
 * 2. The `@litlfred/cat-harness` package, as a composed index links it.
 * 3. A `cat-harness/` directory beside this repository.
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
  try {
    const p = createRequire(import.meta.url).resolve("@litlfred/cat-harness/cat-harness.json");
    return (cached = dirname(p));
  } catch {
    // not linked as a package
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const sibling = resolve(here, "..", "..", "cat-harness");
  if (existsSync(join(sibling, "cat-harness.json"))) return (cached = sibling);
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
