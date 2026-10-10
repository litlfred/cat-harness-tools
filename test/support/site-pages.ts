/**
 * Where a declared visualiser's page is on disk, for a spec that reads the
 * COMMITTED generated page rather than building it.
 *
 * The site moved to a per-locale, per-instance layout — a page is at
 * `<site>/<locale>/<harness>/<visualiser>/…` while shared assets stay at
 * `<site>/assets/…` — and a spec that spelled `beans/index.html` under the
 * site root read a file that is no longer there. So a spec names the
 * visualiser it reads by its declared `id`, and the directory is the one the
 * generators write into: `visualiserPageDir` over `pageParts` from
 * `scripts/viewer-declarations.ts`, under `siteOwnerDir`. An id the harness
 * does not declare throws here, at load, rather than reading a stale path.
 *
 * @module test/support/site-pages
 */
import { join, relative, resolve, sep } from "node:path";

import { repoRootFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import type { VisualiserRouteParts } from "@litlfred/cat-harness/schemas/visualiser-route.ts";
import {
  declaredVisualisers,
  existingPageDir,
  pageParts,
  siteOwnerDir,
  visualiserPageDir,
} from "../../scripts/viewer-declarations.ts";

/**
 * The absolute directory of the visualiser `id` declared by the harness at
 * `harnessRoot`, under the page locale: `<site>/<locale>/<harness>/<id>/`,
 * or a sub-graph below it when `rest` names one. A page committed at its old,
 * unlocalised address whose writer has not run since is found there, as
 * `visualiserPageRef` finds it (`existingPageDir`).
 */
export function declaredPageDir(
  harnessRoot: string,
  id: string,
  rest: Pick<VisualiserRouteParts, "subgraph" | "locale"> = {},
): string {
  const repoRoot = repoRootFor(harnessRoot);
  const v = declaredVisualisers(repoRoot).find((d) => d.id === id && resolve(d.harnessRoot) === resolve(harnessRoot));
  if (v === undefined) {
    throw new Error(`${harnessRoot}: declares no visualiser \`${id}\` (its \`visualisers\` in the instance declaration)`);
  }
  return pageDirOf(repoRoot, v.harness, v.id, rest);
}

/**
 * {@link declaredPageDir} for a visualiser of ANOTHER harness in the checkout,
 * named by its declared `name` — who-iris's `catalogue`, say — rather than by
 * a root the spec would have to spell.
 */
export function declaredPageDirIn(
  repoRoot: string,
  harness: string,
  id: string,
  rest: Pick<VisualiserRouteParts, "subgraph" | "locale"> = {},
): string {
  const v = declaredVisualisers(repoRoot).find((d) => d.id === id && d.harness === harness);
  if (v === undefined) {
    throw new Error(`${repoRoot}: no instance named \`${harness}\` declares a visualiser \`${id}\``);
  }
  return pageDirOf(repoRoot, v.harness, v.id, rest);
}

function pageDirOf(repoRoot: string, harness: string, id: string, rest: Pick<VisualiserRouteParts, "subgraph" | "locale">): string {
  const site = siteOwnerDir(repoRoot);
  const parts = { harness, visualiser: id, ...rest };
  return existingPageDir(site, parts) ?? visualiserPageDir(site, pageParts(parts));
}

/** The URL path `test-server.mjs` serves an absolute directory under the repository root at, with a trailing slash. */
export function servedUrl(repoRoot: string, absDir: string): string {
  return `/${relative(repoRoot, absDir).split(sep).join("/")}/`;
}

/** The absolute path of `file` (default `index.html`) in {@link declaredPageDir}. */
export function declaredPagePath(harnessRoot: string, id: string, file = "index.html", rest: Pick<VisualiserRouteParts, "subgraph" | "locale"> = {}): string {
  return join(declaredPageDir(harnessRoot, id, rest), file);
}

/**
 * The same directory as the URL path `test-server.mjs` serves it at — it
 * serves the REPOSITORY root, so this is `/` plus the directory's path from
 * there, with a trailing slash: `/cat-harness/docs/en/cat-harness/library/`.
 */
export function declaredPageUrl(harnessRoot: string, id: string, rest: Pick<VisualiserRouteParts, "subgraph" | "locale"> = {}): string {
  return servedUrl(repoRootFor(harnessRoot), declaredPageDir(harnessRoot, id, rest));
}
