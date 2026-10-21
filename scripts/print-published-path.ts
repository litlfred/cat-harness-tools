#!/usr/bin/env bun
/**
 * Print where an instance's published files go, for a workflow to capture
 * (bean `cat-tools-sthf`, the index half).
 *
 * @module scripts/print-published-path
 *
 * The URL-space ruling (owner, 2026-09-20, recorded on `sthf`) puts an
 * instance presented as itself at `<base>/<instance>/`, the segment being its
 * NAME, and cat-harness's `publishedPath` is the one resolver that composes it.
 * A workflow cannot call a TypeScript function, and an inline `bun -e` is the
 * place a missing import hides (see `print-stub.ts`), so this is a script.
 *
 *   DIR=$(bun run cat-harness-tools/scripts/print-published-path.ts ./bootstrap)
 *   FILE=$(bun run cat-harness-tools/scripts/print-published-path.ts ./bootstrap <path-in-instance>)
 *
 * Prints the site-relative path with no leading slash (`bootstrap/`, or
 * `bootstrap/` followed by the path given) and nothing else, so `$(…)` captures it
 * cleanly; a directory keeps its trailing slash, as `publishedPath` returns it.
 *
 * Exit 0 printed; 1 no declaration; 3 the instance declares `"enabled": false`
 * and is not published, which a workflow reads as "skip", never as an error.
 */
import { readDeclaration } from "@litlfred/cat-harness/schemas/cat-harness.js";
import { isPublished, publishedPath } from "@litlfred/cat-harness/schemas/url-space.js";

/** The exit status that means "declared not published". */
export const NOT_PUBLISHED = 3;

export function sitePathOf(decl: { name: string; enabled?: boolean }, path = ""): string | undefined {
  if (!isPublished(decl)) return undefined;
  return publishedPath({ case: "instance", instance: decl.name, path }).replace(/^\//, "");
}

if (import.meta.main) {
  const root = process.argv[2] ?? "./cat-harness";
  const decl = readDeclaration(root);
  if (!decl) {
    console.error(`print-published-path: no declaration at ${root}`);
    process.exit(1);
  }
  const at = sitePathOf(decl, process.argv[3] ?? "");
  if (at === undefined) {
    console.error(`print-published-path: ${decl.name} declares "enabled": false, so it is not published`);
    process.exit(NOT_PUBLISHED);
  }
  console.log(at);
}
