/**
 * A knowledge-graph SUBJECT's IRI: `<doc dir>/<kind>/<id>`, a path rather
 * than a `#fragment` of the instance document.
 *
 * @module scripts/lib/subject-iri
 *
 * The rule is owned by cat-harness `skills/kg/kg-core/kg-export.md`
 * §"Subject IRIs — a path, not a `#fragment`" (owner, 2026-10-23: *"hashes
 * not so good... why not `<instance doc>/<kind>/<id>`?"*). Migration:
 * litlfred/cat-harness-tools#603. This module is the ONE place the form is
 * written; `kg-export`'s `makeIri` and `subgraph-node`'s `subgraphIri` both
 * call it, so no generator can mint a subject IRI of its own spelling.
 *
 * | part | IRI |
 * |---|---|
 * | a subject | `<doc dir>/<kind>/<id>` |
 * | a process step | `<doc dir>/process/P/node/T` |
 * | a lane | `<doc dir>/process/P/lane/L` |
 * | a sequence flow | `<doc dir>/process/P#flow/F` — a fragment of its process's page |
 *
 * `<doc dir>` is the directory the instance document is served from, the same
 * base a Tool's `<doc dir>/tools/<id>.jsonld` uses (bean `tdir`). A flow is
 * the one `#` allowed for instance data: nothing cites an arrow on its own,
 * so it stays a place on its process's page (owner, 2026-10-23T14:56Z).
 *
 * Every subject IRI must load, so `kg-export` writes `<kind>/<id>.jsonld`
 * and `<kind>/<id>.html` beside the instance document for each one
 * (`writeSubjectDocuments`). GitHub Pages serves `<id>.html` at the
 * extensionless path, which is what makes the bare IRI dereference.
 */

/**
 * Every kind a subject IRI may carry. {@link subjectIri} refuses any other.
 *
 * Closed on purpose: {@link subjectPathOf} tells this document's subjects from
 * an IRI that only shares its directory — the host's document sits at the
 * site root, so another instance's `…/folio-assistant-core/skill/x` and the
 * host's `…/tools/x.jsonld` start with the same base — by the first segment
 * after it. An open set could not tell `folio-assistant-core/…` from a kind.
 */
export const SUBJECT_KINDS: readonly string[] = [
  "actor",
  "asset",
  "capability",
  "convention",
  "decision",
  "directory",
  "externalSchema",
  "globalTask",
  "glossary-usage",
  "package",
  "process",
  "requirement",
  "role",
  "schema",
  "skill",
];

const KINDS = new Set(SUBJECT_KINDS);

/** The segment of a process id that names a sequence flow: `P/flow/F`. */
export const FLOW_SEGMENT = "flow";

/**
 * The directory a document is served from, with its trailing `/`.
 *
 * `""` for a document-relative export (an `@id` with no `/`), whose subjects
 * are then relative too (`skill/x`), as its fragments were (`<stub>.jsonld#skill/x`).
 */
export function subjectBase(docIri: string): string {
  const i = docIri.lastIndexOf("/");
  return i === -1 ? "" : docIri.slice(0, i + 1);
}

/**
 * Escape what would end or re-delimit a path segment. `/` is NOT escaped:
 * it is the separator the nested form uses (`process/P/node/T`), and
 * `encodeURIComponent` would make every step `process%2FP%2Fnode%2FT`.
 */
function escapeId(id: string): string {
  return id.replace(/[%#?\s]/g, (c) => encodeURIComponent(c));
}

/**
 * The IRI of subject `<kind>/<id>` in the document `docIri` names.
 *
 * A process flow (`kind` `process`, `id` `P/flow/F`) is the fragment
 * `<doc dir>/process/P#flow/F`; every other id is a path.
 *
 * @throws when `kind` is not in {@link SUBJECT_KINDS}
 */
export function subjectIri(docIri: string, kind: string, id: string): string {
  if (!KINDS.has(kind)) {
    throw new Error(`subjectIri: "${kind}" is not a subject kind — add it to SUBJECT_KINDS (scripts/lib/subject-iri.ts)`);
  }
  const base = subjectBase(docIri);
  if (kind === "process") {
    const at = id.indexOf(`/${FLOW_SEGMENT}/`);
    if (at !== -1) {
      const process = id.slice(0, at);
      const flow = id.slice(at + FLOW_SEGMENT.length + 2);
      return `${base}process/${escapeId(process)}#${FLOW_SEGMENT}/${escapeId(flow)}`;
    }
  }
  return `${base}${kind}/${escapeId(id)}`;
}

/**
 * The `<kind>/<id>` (with a flow's `#flow/F`) an IRI names in the document
 * `docIri` names, or `undefined` when it is not one of that document's
 * subjects — the inverse of {@link subjectIri}, still escaped.
 */
export function subjectPathOf(iri: string, docIri: string): string | undefined {
  const base = subjectBase(docIri);
  if (!iri.startsWith(base) || iri === docIri) return undefined;
  const rest = iri.slice(base.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || !KINDS.has(rest.slice(0, slash))) return undefined;
  return rest;
}

/**
 * The `#fragment` IRI this subject had before #603:
 * `<doc dir>/<stub>.jsonld#<kind>/<id>`, a flow's `#flow/` folded back to `/flow/`.
 * What a one-release tombstone is named by. `undefined` when `iri` is not a
 * subject of `docIri`'s document.
 */
export function legacyFragmentIri(iri: string, docIri: string): string | undefined {
  const path = subjectPathOf(iri, docIri);
  if (path === undefined) return undefined;
  return `${docIri}#${path.replace(`#${FLOW_SEGMENT}/`, `/${FLOW_SEGMENT}/`)}`;
}

/**
 * Where a subject's own files go, relative to the instance document's
 * directory, without extension and unescaped: `process/P/node/T`. A flow has
 * none: it is a fragment of its process's page, so `undefined`.
 */
export function subjectFileStem(iri: string, docIri: string): string | undefined {
  const path = subjectPathOf(iri, docIri);
  if (path === undefined || path.includes("#")) return undefined;
  const segments = path.split("/").map((s) => decodeURIComponent(s));
  // A segment that would leave the directory, or name none, is not a file of this document.
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\\"))) return undefined;
  return segments.join("/");
}
