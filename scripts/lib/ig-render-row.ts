/**
 * The `[fhir]` row of the rail's Harnesses list: a link to the index page of
 * an instance's FHIR IG, rendered through just-the-docs on this site.
 *
 * Owner, 2026-10-31: *"if harnessed FHIR IG, then I want LHS navbar should
 * have [fhir] harness that will go to index.html of FHIR justthedocs
 * render"*.
 *
 * The row is decided from the FINISHED site, not from a declaration: the
 * render sits at `<instance>/ig/` beside an instance's own pages, at
 * `<instance>/` when it is the instance's whole site, and at the root (or
 * `ig/`) of an IG repository's own site. Whichever it is, the render writes
 * the IG's table of contents (`toc.html`) beside its `index.html`, and no
 * other page kind on these sites does. So a directory holding both is the
 * render, and an IG that is declared but not rendered gets no row: a link
 * to a page the site does not hold would be a 404 behind the row.
 *
 * @module scripts/lib/ig-render-row
 */

import { existsSync } from "fs";
import { join } from "path";

import type { NavItem } from "./navbar.js";

/** The row's label, as the owner wrote it. */
export const IG_RENDER_LABEL = "[fhir]";

/** Is `dir` (relative to the site root, `""` for the root) an IG render? */
export function isIgRender(siteAbs: string, dir: string): boolean {
  const at = dir === "" ? siteAbs : join(siteAbs, dir);
  return existsSync(join(at, "index.html")) && existsSync(join(at, "toc.html"));
}

/**
 * Where the IG render of a page's owning instance sits on this site, as a
 * directory relative to the site root (`""` is the root, otherwise it ends in
 * `/`), or `undefined` when the site holds none.
 *
 * `atRoot` says the site IS the instance's (an IG repository's own site, or
 * the folio whose checkout this is): its render is then looked for at `ig/`
 * and at the root. Otherwise it is looked for at `<owner>/ig/` and
 * `<owner>/`. `ig/` comes first both times, because when an instance has
 * pages of its own the root of its directory is those pages, not the IG.
 */
export function igRenderDir(siteAbs: string, owner: string, atRoot: boolean): string | undefined {
  const candidates = atRoot ? ["ig/", ""] : [`${owner}/ig/`, `${owner}/`];
  return candidates.find((d) => isIgRender(siteAbs, d.replace(/\/$/, "")));
}

/**
 * The harness rows with the `[fhir]` row added right after the owning
 * instance's row (found by its label), or first when the list has no row of
 * that label. Unchanged when the site holds no render for the owner, or when
 * the list already carries the row.
 */
export function withIgRenderRow(
  rows: readonly NavItem[] | undefined,
  o: { siteAbs: string; owner: string; ownerLabel?: string; atRoot: boolean; toRoot: string },
): NavItem[] | undefined {
  const dir = igRenderDir(o.siteAbs, o.owner, o.atRoot);
  if (dir === undefined) return rows === undefined ? undefined : [...rows];
  const list = [...(rows ?? [])];
  if (list.some((r) => r.label === IG_RENDER_LABEL)) return list;
  const row: NavItem = { label: IG_RENDER_LABEL, href: `${o.toRoot}/${dir}index.html` };
  const at = o.ownerLabel === undefined ? -1 : list.findIndex((r) => r.label === o.ownerLabel);
  list.splice(at + 1, 0, row);
  return list;
}
