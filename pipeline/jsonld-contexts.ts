/**
 * Per-instance JSON-LD contexts, GENERATED from what documents use — the pure half.
 *
 * Bean `folio-assistant-63q4`, owner 2026-10-14: no "forward-declared" prefix
 * anywhere. Each instance declares the external namespaces it speaks
 * (`jsonldPrefixes`, cat-harness `schemas/jsonld-prefixes.ts`), and its
 * published context binds ONLY the prefixes its documents actually use,
 * resolved through its table flattened with the tables of the instances it
 * `needs`. A bound-but-unused prefix cannot exist, so nothing needs excusing.
 *
 * This module reads no files. `scripts/gen-instance-contexts.ts` walks the
 * checkout, reads each declaration as data, and calls these.
 *
 * ## What counts as "used", and why two answers are kept
 *
 * {@link usedPrefixes} walks EVERY string — object keys, values, and strings
 * inside arrays (`"@type": ["doco:Section"]`, which `check-context-emission`'s
 * walk never reached) — and skips every `@context` subtree, since a context
 * BINDING a prefix is not a document SPEAKING it. That is the set the
 * generated context is built from.
 *
 * It also records WHERE each prefix was met, because the two kinds of place
 * mean different things to a reader:
 *
 * - **iri** — a key, an `@type`/`@id` value, or the value of a term the
 *   document's contexts coerce to `@id`/`@vocab`. A processor EXPANDS these;
 *   an unbound prefix here becomes an IRI in a URI scheme called `<prefix>`
 *   (bean `zaqn`). An unresolved prefix in this position is a finding.
 * - **literal** — any other string value. `leanRef: "qou:QOU.Torsion.x"` and
 *   `label: "def:foo"` are authored strings that merely LOOK like CURIEs
 *   (the hazard `schemas/jsonld.ts` opens with). A processor never expands
 *   them, so an unresolved prefix here is reported, never failed on: failing
 *   would condemn every Lean reference in the corpus, and a gate that cries
 *   wolf is switched off.
 *
 * A literal occurrence of a prefix the flattened table DOES bind still puts it
 * in the context — the owner's rule is "every string", and binding a declared
 * vocabulary a document names is never wrong. Only resolution is position-aware.
 *
 * @module pipeline/jsonld-contexts
 * @covers schemas
 */
import { mergePrefixTables, type DeclaredPrefixes, type PrefixConflict } from "@litlfred/cat-harness/schemas/jsonld-prefixes.js";

/** Where a prefix was met. See the module note. */
export type PrefixPosition = "iri" | "literal";

/**
 * URI schemes and pseudo-prefixes a string may start with that are never a
 * CURIE prefix. `JsonldPrefixSchema` refuses the same set as a declared prefix,
 * so the two cannot disagree; the rest are schemes seen in IRIs.
 */
export const NON_CURIE_SCHEMES: ReadonlySet<string> = new Set([
  "_",
  "http",
  "https",
  "urn",
  "mailto",
  "file",
  "data",
  "tag",
  "ftp",
  "doi",
  "isbn",
  "info",
  "ws",
  "wss",
]);

/**
 * The prefix of a CURIE, or `undefined` for anything that is not one: an
 * absolute IRI (`//` after the colon), a blank node, a keyword, a URI scheme,
 * a string with whitespace (prose that happens to contain a colon), or a
 * string with no colon.
 */
export function curiePrefix(s: string): string | undefined {
  if (s.startsWith("@") || s.startsWith("_:")) return undefined;
  const m = /^([A-Za-z_][A-Za-z0-9._-]*):(\S*)$/.exec(s);
  if (!m) return undefined;
  if (m[2]!.startsWith("//")) return undefined;
  if (NON_CURIE_SCHEMES.has(m[1]!.toLowerCase())) return undefined;
  return m[1];
}

/** A term definition, reduced to what this module reads. */
interface TermDef {
  /** The prefix the term's IRI is written with, when it is a CURIE. */
  prefix?: string;
  /** The term coerces its values to IRIs (`@type: @id` or `@vocab`). */
  idValued: boolean;
  /** The term's value is a JSON LITERAL (`@type: @json`): its keys are data, not properties. */
  json: boolean;
}

/** The result of {@link usedPrefixes}: every prefix met, with the positions it was met in. */
export type UsedPrefixes = Map<string, Set<PrefixPosition>>;

export interface UsedPrefixesOptions {
  /**
   * Remote contexts this walk can read, by URL. A document naming one gets its
   * TERMS as aliases: `title` under the content context is `dcterms:title`,
   * so a node carrying `title` speaks `dcterms` with no `dcterms:` in the file.
   * The writer passes `CONTENT_CONTEXT` under `CONTENT_CONTEXT_URL`.
   */
  remoteContexts?: ReadonlyMap<string, Record<string, unknown>>;
  /**
   * Namespace IRI → prefix, for REMOTE-context term definitions written as
   * FULL IRIs (`alternateOf` → `http://www.w3.org/ns/prov#alternateOf`). Such
   * a term speaks the prefix whose namespace its IRI starts with. Inline
   * full-IRI terms never count (see `addContext`). The writer passes
   * the instance's flattened table, inverted; without it only CURIE-valued
   * terms count as aliases.
   */
  namespacePrefixes?: ReadonlyMap<string, string>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The prefix whose namespace a full IRI sits in — the longest match, so a nested namespace wins. */
function namespacePrefixOf(iri: string, namespaces: ReadonlyMap<string, string>): string | undefined {
  let best: string | undefined;
  let len = 0;
  for (const [ns, prefix] of namespaces) {
    if (iri.length > ns.length && iri.startsWith(ns) && ns.length > len) {
      best = prefix;
      len = ns.length;
    }
  }
  return best;
}

/** Fold a `@context` value's term definitions into `terms` (a copy the caller owns). */
function addContext(
  c: unknown,
  terms: Map<string, TermDef>,
  remote: ReadonlyMap<string, Record<string, unknown>>,
  namespaces: ReadonlyMap<string, string>,
  fromRemote = false,
): void {
  if (Array.isArray(c)) return void c.forEach((x) => addContext(x, terms, remote, namespaces, fromRemote));
  if (typeof c === "string") {
    const r = remote.get(c);
    if (r !== undefined) addContext(r, terms, remote, namespaces, true);
    return;
  }
  if (!isRecord(c)) return;
  for (const [k, v] of Object.entries(c)) {
    if (k.startsWith("@")) continue;
    const id = typeof v === "string" ? v : isRecord(v) && typeof v["@id"] === "string" ? v["@id"] : undefined;
    const type = isRecord(v) ? v["@type"] : undefined;
    // A full-IRI term counts its namespace's prefix only when it comes from a
    // REMOTE context: an inline full-IRI term (a SMART IG's `generatedAt` →
    // `prov#generatedAtTime`) is complete as written and needs no prefix bound
    // anywhere, so counting it would put `prov` in a context nobody needs it in.
    const prefix = id === undefined ? undefined : (curiePrefix(id) ?? (fromRemote ? namespacePrefixOf(id, namespaces) : undefined));
    terms.set(k, { ...(prefix !== undefined ? { prefix } : {}), idValued: type === "@id" || type === "@vocab", json: type === "@json" });
  }
}

/**
 * Every prefix a document uses, with where. See the module note for what is
 * walked, what is skipped, and what the two positions mean.
 */
export function usedPrefixes(doc: unknown, options: UsedPrefixesOptions = {}): UsedPrefixes {
  const remote = options.remoteContexts ?? new Map<string, Record<string, unknown>>();
  const namespaces = options.namespacePrefixes ?? new Map<string, string>();
  const out: UsedPrefixes = new Map();
  const note = (p: string | undefined, pos: PrefixPosition): void => {
    if (p === undefined) return;
    const s = out.get(p) ?? new Set<PrefixPosition>();
    s.add(pos);
    out.set(p, s);
  };
  /** A string in a position: a CURIE, or a term whose definition is one. */
  const str = (s: string, pos: PrefixPosition, terms: ReadonlyMap<string, TermDef>, aliasable: boolean): void => {
    const p = curiePrefix(s);
    if (p !== undefined) return note(p, pos);
    if (aliasable) note(terms.get(s)?.prefix, pos);
  };

  /** Inside a `@json` literal: every key and value is data, so every string is a literal. */
  const literal = (o: unknown): void => {
    if (typeof o === "string") return note(curiePrefix(o), "literal");
    if (Array.isArray(o)) return void o.forEach(literal);
    if (!isRecord(o)) return;
    for (const [k, v] of Object.entries(o)) {
      note(curiePrefix(k), "literal");
      literal(v);
    }
  };

  const walk = (o: unknown, terms: Map<string, TermDef>, valuePos: PrefixPosition): void => {
    if (typeof o === "string") return str(o, valuePos, terms, false);
    if (Array.isArray(o)) return void o.forEach((x) => walk(x, terms, valuePos));
    if (!isRecord(o)) return;
    let scope = terms;
    if ("@context" in o) {
      scope = new Map(terms);
      addContext(o["@context"], scope, remote, namespaces);
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === "@context") continue; // a binding, not a use
      // The KEY: a CURIE, or a term whose IRI is one (an alias).
      if (!k.startsWith("@")) str(k, "iri", scope, true);
      if (k === "@type" || k === "type") {
        // A type value may itself be a term (`"@type": "Section"` with `Section`
        // aliased), so it is aliasable as well as a CURIE.
        for (const t of Array.isArray(v) ? v : [v]) {
          if (typeof t === "string") str(t, "iri", scope, true);
          else walk(t, scope, "literal");
        }
        continue;
      }
      if (k === "@id" || k === "@vocab") {
        walk(v, scope, "iri");
        continue;
      }
      const def = scope.get(k);
      if (def?.json) literal(v);
      else walk(v, scope, def?.idValued ? "iri" : "literal");
    }
  };

  walk(doc, new Map(), "literal");
  return out;
}

/**
 * The prefixes a document binds ITSELF — in an inline `@context` object
 * anywhere in it, or in a remote context it names that the caller can read
 * (`options.remoteContexts`). A prefix bound here needs nothing from the
 * instance context: a SMART IG's local `fhir` binding is its own.
 *
 * A term counts as a binding when its value is an absolute IRI ending in `/`
 * or `#` — what makes `term:local` expand — which is exactly a prefix.
 */
export function ownBindings(doc: unknown, options: UsedPrefixesOptions = {}): Map<string, string> {
  const remote = options.remoteContexts ?? new Map<string, Record<string, unknown>>();
  const out = new Map<string, string>();
  const fromContext = (c: unknown): void => {
    if (Array.isArray(c)) return void c.forEach(fromContext);
    if (typeof c === "string") {
      const r = remote.get(c);
      if (r !== undefined) fromContext(r);
      return;
    }
    if (!isRecord(c)) return;
    for (const [k, v] of Object.entries(c)) {
      if (k.startsWith("@")) continue;
      const id = typeof v === "string" ? v : isRecord(v) && typeof v["@id"] === "string" ? v["@id"] : undefined;
      if (id !== undefined && /^[A-Za-z][\w+.-]*:/.test(id) && curiePrefix(id) === undefined && /[/#]$/.test(id)) out.set(k, id);
    }
  };
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return void o.forEach(walk);
    if (!isRecord(o)) return;
    for (const [k, v] of Object.entries(o)) {
      if (k === "@context") fromContext(v);
      else walk(v);
    }
  };
  walk(doc);
  return out;
}

/** A JSON-LD document that is only a context — what `ns/<what>/v1.jsonld` holds. Never a corpus document. */
export function isContextDocument(doc: unknown): boolean {
  return isRecord(doc) && "@context" in doc && Object.keys(doc).every((k) => k === "@context");
}

/** One prefix use the instance context cannot resolve. */
export interface UnresolvedPrefix {
  prefix: string;
  /** Positions it was met in; only `iri` ones are a finding (see the module note). */
  positions: PrefixPosition[];
  /** Documents (as the caller names them) it was met in, sorted; the first is the example. */
  documents: string[];
}

export interface InstanceContextInput {
  /** The instance this context is for. */
  instance: string;
  /**
   * Its declared table, then its dependencies', in DEPENDENCY ORDER — `needs`
   * first, the instance itself LAST, which is the order `mergePrefixTables`
   * takes.
   */
  tables: readonly DeclaredPrefixes[];
  /**
   * Every prefix the instance's documents use, per document: the prefix map
   * from {@link usedPrefixes} and the bindings from {@link ownBindings}.
   */
  documents: ReadonlyMap<string, { used: UsedPrefixes; own: ReadonlyMap<string, string> }>;
}

export interface InstanceContext {
  /** The `@context` object to publish: `@version`, `@protected`, and only used, resolved, unconflicted prefixes. */
  context: Record<string, unknown>;
  /** Each prefix in {@link context}, with how many documents use it. */
  bound: { prefix: string; iri: string; documents: number }[];
  /** Used in an IRI position and bound by neither the flattened table nor the document itself — a FINDING. */
  unresolved: UnresolvedPrefix[];
  /** Met only as a literal string and not bound — reported, never failed on. */
  literalOnly: UnresolvedPrefix[];
  /** Prefixes two instances in the flattened table bind differently — a FINDING; never resolved by order. */
  conflicts: PrefixConflict[];
}

/**
 * Build one instance's context from its flattened table and its documents' uses.
 *
 * Nothing is silently dropped or overridden: a used prefix is either bound
 * (resolved through the table, unconflicted), or the document binds it itself,
 * or it is reported in {@link InstanceContext.unresolved} /
 * {@link InstanceContext.literalOnly}; a conflicting prefix is left OUT of the
 * context and reported in `conflicts`, since `@protected` terms are exactly
 * what a higher layer must not quietly redefine.
 */
export function buildInstanceContext(input: InstanceContextInput): InstanceContext {
  const { prefixes: table, conflicts } = mergePrefixTables(input.tables);
  const conflicted = new Set(conflicts.map((c) => c.prefix));

  const users = new Map<string, number>();
  const missing = new Map<string, { positions: Set<PrefixPosition>; documents: Set<string> }>();
  for (const [where, { used, own }] of input.documents) {
    for (const [prefix, positions] of used) {
      if (prefix in table) {
        users.set(prefix, (users.get(prefix) ?? 0) + 1);
        continue;
      }
      if (own.has(prefix)) continue;
      const m = missing.get(prefix) ?? { positions: new Set<PrefixPosition>(), documents: new Set<string>() };
      for (const p of positions) m.positions.add(p);
      m.documents.add(where);
      missing.set(prefix, m);
    }
  }

  const bound = [...users]
    .filter(([p]) => !conflicted.has(p))
    .map(([prefix, documents]) => ({ prefix, iri: table[prefix]!, documents }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
  const context: Record<string, unknown> = { "@version": 1.1, "@protected": true };
  for (const b of bound) context[b.prefix] = b.iri;

  const toList = (want: (pos: Set<PrefixPosition>) => boolean): UnresolvedPrefix[] =>
    [...missing]
      .filter(([, m]) => want(m.positions))
      .map(([prefix, m]) => ({ prefix, positions: [...m.positions].sort(), documents: [...m.documents].sort() }))
      .sort((a, b) => b.documents.length - a.documents.length || a.prefix.localeCompare(b.prefix));

  return {
    context,
    bound,
    unresolved: toList((pos) => pos.has("iri")),
    literalOnly: toList((pos) => !pos.has("iri")),
    conflicts,
  };
}
