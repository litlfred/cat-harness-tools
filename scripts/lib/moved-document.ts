/**
 * A document that MOVED, served at the address it moved from for one release.
 *
 * @module scripts/lib/moved-document
 *
 * litlfred/cat-harness-tools#603 decision 1b (owner, 2026-10-23): the host is
 * no longer special. Its documents left the site root for `<site>/<name>/`,
 * like every other layer's, so each old address gets a tombstone: the old
 * document names itself `deprecated`, `isReplacedBy` and `sameAs` the new
 * one, and its `@graph` holds one tombstone per old `@id` it carried. GitHub
 * Pages cannot redirect a `.jsonld`, so the forwarding has to be IN the file
 * a consumer holding the old address fetches. ONE RELEASE ONLY, with the
 * other #603 tombstones (decision 5a: one per old address).
 *
 * `kg-export` writes its own (`writeLegacyDocuments`, which also forwards the
 * Tools); `glossary-export` writes the glossary's and the code lists' with
 * these.
 */

const OWL = "http://www.w3.org/2002/07/owl#";
const DCTERMS = "http://purl.org/dc/terms/";
const XSD = "http://www.w3.org/2001/XMLSchema#";

/** The three tombstone terms, for a document whose own context lacks them. */
export const TOMBSTONE_CONTEXT = {
  deprecated: { "@id": `${OWL}deprecated`, "@type": `${XSD}boolean` },
  isReplacedBy: { "@id": `${DCTERMS}isReplacedBy`, "@type": "@id" },
  sameAs: { "@id": `${OWL}sameAs`, "@type": "@id" },
} as const;

/** One tombstone node: the old `@id`, forwarded to the new one. */
export function tombstone(oldIri: string, newIri: string): Record<string, unknown> {
  return { "@id": oldIri, deprecated: true, isReplacedBy: newIri, sameAs: newIri };
}

/**
 * The site root `out` implies, when it ends in `path` (site-relative,
 * forward slashes); `undefined` when it does not, because a root that is a
 * guess puts the tombstone where no consumer looks.
 */
export function siteRootOf(out: string, path: string): string | undefined {
  const norm = out.replace(/\\/g, "/");
  if (norm !== path && !norm.endsWith(`/${path}`)) return undefined;
  return out.slice(0, out.length - path.length);
}

/**
 * The tombstone document for `newDoc` at `oldIri`: the document itself
 * forwarded, and each `[old, new]` pair as a node of its `@graph`.
 * `context` is the new document's own, extended with the three terms.
 */
export function movedDocument(
  context: unknown,
  oldIri: string,
  newIri: string,
  moved: ReadonlyArray<readonly [string, string]>,
  stamp: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    "@context": context === undefined ? TOMBSTONE_CONTEXT : [context, TOMBSTONE_CONTEXT].flat(),
    ...tombstone(oldIri, newIri),
    ...stamp,
    "@graph": moved.map(([o, n]) => tombstone(o, n)),
  };
}
