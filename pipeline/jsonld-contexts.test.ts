/**
 * `pipeline/jsonld-contexts.ts` — what counts as a used prefix, and how an
 * instance context is built from them (bean folio-assistant-63q4).
 */
import { describe, expect, test } from "bun:test";

import { buildInstanceContext, curiePrefix, isContextDocument, ownBindings, usedPrefixes, type UsedPrefixes } from "./jsonld-contexts.ts";

const CONTENT_URL = "https://example.org/ns/content/v1.jsonld";
const remote = new Map<string, Record<string, unknown>>([
  [CONTENT_URL, { dcterms: "http://purl.org/dc/terms/", title: "dcterms:title", cites: { "@id": "cito:cites", "@type": "@id" }, meta: { "@id": "x:meta", "@type": "@json" } }],
]);
const keys = (u: UsedPrefixes) => [...u.keys()].sort();

describe("curiePrefix", () => {
  test("a CURIE has a prefix", () => {
    expect(curiePrefix("doco:Section")).toBe("doco");
    expect(curiePrefix("folio-assistant-core:Definition")).toBe("folio-assistant-core");
  });
  test("an IRI, a blank node, a keyword, a scheme or prose is not a CURIE", () => {
    for (const s of ["http://x.org/a", "https://x.org/a", "urn:isbn:123", "_:b0", "@id", "mailto:a@b.org", "data:text/plain,x", "ftp://x", "Note: something", "no colon", "x://y"]) {
      expect(curiePrefix(s)).toBeUndefined();
    }
  });
});

describe("usedPrefixes", () => {
  test("strings inside ARRAYS count — the case check-context-emission's walk missed", () => {
    const u = usedPrefixes({ "@type": ["doco:Section", "deo:Introduction"], tags: ["skos:x"] });
    expect(keys(u)).toEqual(["deo", "doco", "skos"]);
    expect([...u.get("doco")!]).toEqual(["iri"]);
    expect([...u.get("skos")!]).toEqual(["literal"]);
  });

  test("every @context subtree is skipped: a binding is not a use", () => {
    const u = usedPrefixes({ "@context": { oa: "http://www.w3.org/ns/oa#", label: "rdfs:label" }, "@graph": [{ "@context": { x: "fhir:y" }, "prov:wasDerivedFrom": "a" }] });
    expect(keys(u)).toEqual(["prov"]);
  });

  test("absolute IRIs and schemes are not CURIEs, in any position", () => {
    const u = usedPrefixes({ "@id": "https://x.org/a", "@type": "http://purl.org/spar/doco/Section", see: ["urn:x:y", "mailto:a@b"], "_:b": 1 });
    expect(keys(u)).toEqual([]);
  });

  test("keys and @type are IRI positions; plain values are literals", () => {
    const u = usedPrefixes({ "cito:cites": "qou:QOU.Torsion.x", label: "def:foo" });
    expect([...u.get("cito")!]).toEqual(["iri"]);
    expect([...u.get("qou")!]).toEqual(["literal"]);
    expect([...u.get("def")!]).toEqual(["literal"]);
  });

  test("a remote context's aliases count when the document names it", () => {
    const u = usedPrefixes({ "@context": [CONTENT_URL, { "@base": "https://b/" }], title: "T", cites: ["skos:z"] }, { remoteContexts: remote });
    expect(keys(u)).toEqual(["cito", "dcterms", "skos"]);
    // `cites` is @id-typed, so its value is an IRI position.
    expect([...u.get("skos")!]).toEqual(["iri"]);
  });

  test("an alias does NOT count when the document does not name that context", () => {
    expect(keys(usedPrefixes({ title: "T" }, { remoteContexts: remote }))).toEqual([]);
  });

  test("a @json value is data: its keys and strings are literals", () => {
    const u = usedPrefixes({ "@context": CONTENT_URL, meta: { "fhir:x": "oa:y" } }, { remoteContexts: remote });
    expect([...u.get("fhir")!]).toEqual(["literal"]);
    expect([...u.get("oa")!]).toEqual(["literal"]);
  });

  test("a full-IRI term counts the prefix whose namespace it is in, when given the namespaces", () => {
    const r = new Map([["u", { alternateOf: { "@id": "http://www.w3.org/ns/prov#alternateOf", "@type": "@id" } }]]);
    const ns = new Map([["http://www.w3.org/ns/prov#", "prov"]]);
    expect(keys(usedPrefixes({ "@context": "u", alternateOf: "x" }, { remoteContexts: r, namespacePrefixes: ns }))).toEqual(["prov"]);
    expect(keys(usedPrefixes({ "@context": "u", alternateOf: "x" }, { remoteContexts: r }))).toEqual([]);
  });
});

describe("ownBindings / isContextDocument", () => {
  test("a document's inline context binds a prefix; a CURIE-valued term does not", () => {
    const b = ownBindings({ "@context": [CONTENT_URL, { fhir: "https://smart.who.int/base/DataTypes.jsonld#", name: "rdfs:label" }] });
    expect([...b.keys()]).toEqual(["fhir"]);
  });
  test("a context-only file is a context document; a node is not", () => {
    expect(isContextDocument({ "@context": { a: "http://a/" } })).toBe(true);
    expect(isContextDocument({ "@context": "x", "@id": "y" })).toBe(false);
  });
});

describe("buildInstanceContext", () => {
  const doc = (used: Record<string, ("iri" | "literal")[]>, own: Record<string, string> = {}) => ({
    used: new Map(Object.entries(used).map(([p, pos]) => [p, new Set(pos)])),
    own: new Map(Object.entries(own)),
  });
  const base = { instance: "base", prefixes: { dcterms: "http://purl.org/dc/terms/", skos: "http://www.w3.org/2004/02/skos/core#" } };
  const top = { instance: "top", prefixes: { bibo: "http://purl.org/ontology/bibo/", fabio: "http://purl.org/spar/fabio/" } };

  test("flattens over needs, and binds ONLY what is used", () => {
    const r = buildInstanceContext({ instance: "top", tables: [base, top], documents: new Map([["a.jsonld", doc({ dcterms: ["iri"], bibo: ["iri"] })], ["b.jsonld", doc({ dcterms: ["literal"] })]]) });
    expect(r.context).toEqual({ "@version": 1.1, "@protected": true, bibo: "http://purl.org/ontology/bibo/", dcterms: "http://purl.org/dc/terms/" });
    expect(r.bound.find((b) => b.prefix === "dcterms")!.documents).toBe(2);
    expect(r.unresolved).toEqual([]);
    expect(r.conflicts).toEqual([]);
    // skos and fabio are declared and unused: absent, with nothing to excuse.
    expect("skos" in r.context || "fabio" in r.context).toBe(false);
  });

  test("an unresolved prefix is reported, never dropped silently; a literal-only one is reported apart", () => {
    const r = buildInstanceContext({ instance: "top", tables: [base, top], documents: new Map([["a.jsonld", doc({ oa: ["iri"], qou: ["literal"] })], ["b.jsonld", doc({ oa: ["literal"] })]]) });
    expect(r.unresolved).toEqual([{ prefix: "oa", positions: ["iri", "literal"], documents: ["a.jsonld", "b.jsonld"] }]);
    expect(r.literalOnly).toEqual([{ prefix: "qou", positions: ["literal"], documents: ["a.jsonld"] }]);
    expect(Object.keys(r.context)).toEqual(["@version", "@protected"]);
  });

  test("a prefix the document binds itself is resolved and not put in the instance context", () => {
    const r = buildInstanceContext({ instance: "top", tables: [base], documents: new Map([["ig.jsonld", doc({ fhir: ["iri"] }, { fhir: "https://smart.who.int/base/DataTypes.jsonld#" })]]) });
    expect(r.unresolved).toEqual([]);
    expect("fhir" in r.context).toBe(false);
  });

  test("a conflict is reported and the prefix is left OUT, not resolved by order", () => {
    const clash = { instance: "top", prefixes: { dcterms: "http://example.org/not-dcterms/" } };
    const r = buildInstanceContext({ instance: "top", tables: [base, clash], documents: new Map([["a.jsonld", doc({ dcterms: ["iri"] })]]) });
    expect(r.conflicts.map((c) => c.prefix)).toEqual(["dcterms"]);
    expect("dcterms" in r.context).toBe(false);
  });
});

describe("usedPrefixes — inline full-IRI terms", () => {
  test("an INLINE full-IRI term speaks no prefix (a SMART IG's generatedAt)", () => {
    const ns = new Map([["http://www.w3.org/ns/prov#", "prov"]]);
    const doc = { "@context": { generatedAt: { "@id": "http://www.w3.org/ns/prov#generatedAtTime" } }, generatedAt: "2026-01-01" };
    expect([...usedPrefixes(doc, { namespacePrefixes: ns }).keys()]).toEqual([]);
  });
});
