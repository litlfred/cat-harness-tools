#!/usr/bin/env bun
/**
 * typecheck-instances.ts — `tsc --noEmit` against every instance in the
 * checkout that carries a `tsconfig.json`, with TypeScript 7.
 *
 * ## Why a script and not a loop in the workflow
 *
 * In the index checkout the root owns no code and has no `tsconfig.json`, so
 * the typecheck runs per instance: each against its own config, which is what
 * it is checked against standing alone. That was first written as a shell
 * `for cfg in <each instance>/tsconfig.json` loop in the workflow step. `bun run cat gates`
 * keeps only a step's `bun …` lines, so it read `tsc -p "$cfg"` with the loop
 * variable discarded, could not run it, and the typecheck silently stopped
 * being a local gate (`gates-workflows.test.ts`, folio-assistant#2518). One
 * command is what both CI and the local gate set can run.
 *
 * ## Why the launcher is named by path
 *
 * TypeScript 6 stays installed as `typescript` because typescript-eslint
 * requires its JS API, so `node_modules/.bin/tsc` is TS 6 and `bunx tsc`
 * would typecheck with the wrong compiler while reading green. The TS7
 * launcher at `node_modules/typescript7/bin/tsc` can only be TS 7.
 *
 * ## Exit codes
 *
 * 0 every instance typechecks · 1 any instance fails · 2 could not determine
 * (no instance carries a `tsconfig.json`, or the TS7 launcher is missing) —
 * never 0, because a typecheck over nothing is not a pass.
 *
 * @module scripts/typecheck-instances
 * @covers none — runs the compiler; judges no graph typology
 */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

import { instanceRootsIn, repoRootFor } from "@litlfred/cat-harness/schemas/cat-harness.js";

/** The instances under `repoRoot` that carry a `tsconfig.json`, as config paths. */
export function instanceConfigs(repoRoot: string): string[] {
  return instanceRootsIn(repoRoot)
    .map((r) => join(r, "tsconfig.json"))
    .filter((p) => existsSync(p))
    .sort();
}

if (import.meta.main) {
  const repoRoot = repoRootFor(join(import.meta.dir, ".."));
  const tsc = join(repoRoot, "node_modules", "typescript7", "bin", "tsc");
  if (!existsSync(tsc)) {
    console.error(`typecheck:instances: no TypeScript 7 launcher at ${relative(repoRoot, tsc)} — could not determine. NOT a pass.`);
    process.exit(2);
  }
  const configs = instanceConfigs(repoRoot);
  if (configs.length === 0) {
    console.error("typecheck:instances: no instance carries a tsconfig.json — nothing was typechecked. NOT a pass.");
    process.exit(2);
  }
  const failed: string[] = [];
  for (const cfg of configs) {
    const rel = relative(repoRoot, cfg);
    if (process.env.GITHUB_ACTIONS) console.log(`::group::tsc --noEmit -p ${rel}`);
    else console.log(`── tsc --noEmit -p ${rel}`);
    const r = spawnSync("bun", [tsc, "--noEmit", "-p", cfg], { cwd: repoRoot, stdio: "inherit" });
    if (process.env.GITHUB_ACTIONS) console.log("::endgroup::");
    if (r.status !== 0) failed.push(rel);
  }
  if (failed.length > 0) {
    console.error(`${failed.length} of ${configs.length} instance typecheck(s) failed: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`✓ ${configs.length} instance typecheck(s) passed`);
}
