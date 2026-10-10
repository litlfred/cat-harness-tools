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
import { join, resolve } from "node:path";

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
  const site = siteOwnerDir(repoRoot);
  const parts = { harness: v.harness, visualiser: v.id, ...rest };
  return existingPageDir(site, parts) ?? visualiserPageDir(site, pageParts(parts));
}

/** The absolute path of `file` (default `index.html`) in {@link declaredPageDir}. */
export function declaredPagePath(harnessRoot: string, id: string, file = "index.html", rest: Pick<VisualiserRouteParts, "subgraph" | "locale"> = {}): string {
  return join(declaredPageDir(harnessRoot, id, rest), file);
}
