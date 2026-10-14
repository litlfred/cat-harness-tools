/**
 * `scripts/gen-instance-contexts.ts` over a small fixture tree: two instances,
 * one needing the other, each with a few documents (bean folio-assistant-63q4).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findings, generateInstanceContexts, INSTANCE_CONTEXT_PATH, render } from "../gen-instance-contexts.ts";

const root = mkdtempSync(join(tmpdir(), "gen-instance-contexts-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const put = (rel: string, value: unknown): void => {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value));
};

put("base/base.json", { name: "base", needs: [], jsonldPrefixes: { dcterms: "http://purl.org/dc/terms/", skos: "http://www.w3.org/2004/02/skos/core#" } });
put("top/top.json", { name: "top", needs: ["base"], jsonldPrefixes: { bibo: "http://purl.org/ontology/bibo/", fabio: "http://purl.org/spar/fabio/" } });
put("empty/empty.json", { name: "empty", needs: ["base"] });

// base: speaks skos (inside an array) and dcterms only inside its own context file, which must not count.
put("base/nodes/a.jsonld", { "@id": "a", "@type": ["skos:Concept"] });
put("base/ns/content/v1.jsonld", { "@context": { title: "dcterms:title", dcterms: "http://purl.org/dc/terms/" } });
// top: dcterms (via needs) and bibo; a SMART-style local fhir binding; a Lean ref literal.
put("top/refs/r.jsonld", { "@context": { fhir: "https://smart.who.int/base/DataTypes.jsonld#" }, "@type": "bibo:Article", "dcterms:title": "x", "fhir:code": "y", leanRef: "qou:QOU.x" });
put("top/bad.jsonld", "{ not json");
put("orphan.jsonld", { "@type": "skos:Concept" });

const opts = { ownNamespaceOf: () => undefined, remoteContexts: new Map(), bindingContexts: new Map() };

describe("gen-instance-contexts over a fixture tree", () => {
  const result = generateInstanceContexts(root, opts);
  const by = (n: string) => result.reports.find((r) => r.instance === n)!;

  test("instances are reported dependency-first", () => {
    expect(result.reports.map((r) => r.instance)[0]).toBe("base");
    expect(by("top").flattenedFrom).toEqual(["base", "top"]);
  });

  test("each context binds only its documents' prefixes, flattened over needs", () => {
    expect(by("base").expected).toBe(render({ "@version": 1.1, "@protected": true, skos: "http://www.w3.org/2004/02/skos/core#" }));
    expect(by("top").expected).toBe(render({ "@version": 1.1, "@protected": true, bibo: "http://purl.org/ontology/bibo/", dcterms: "http://purl.org/dc/terms/" }));
  });

  test("a context document under ns/ is not a corpus document", () => {
    expect(by("base").documents).toBe(1);
  });

  test("the document's own fhir binding resolves it; the Lean ref is literal-only; nothing is unresolved", () => {
    expect(by("top").unresolved).toEqual([]);
    expect(by("top").literalOnly.map((l) => l.prefix)).toEqual(["qou"]);
  });

  test("unparseable and unowned documents are counted, not dropped", () => {
    expect(by("top").unparseable).toEqual(["top/bad.jsonld"]);
    expect(result.unowned).toEqual(["orphan.jsonld"]);
  });

  test("an instance with no documents gets no context", () => {
    expect(by("empty").documents).toBe(0);
    expect(by("empty").expected).toBeUndefined();
  });

  test("--check reports missing files as drift, then passes once written", () => {
    expect(findings(result).drift.length).toBe(2);
    for (const r of result.reports) if (r.expected !== undefined) put(r.path, r.expected);
    const again = generateInstanceContexts(root, opts);
    expect(findings(again)).toEqual({ drift: [], problems: [] });
    // and the written context is not itself read back as a document
    expect(again.reports.find((r) => r.instance === "top")!.documents).toBe(1);
  });

  test("an unresolved IRI-position prefix and a conflict are problems, naming file and prefix", () => {
    put("top/refs/s.jsonld", { "@type": "oa:Annotation" });
    put("top/top.json", { name: "top", needs: ["base"], jsonldPrefixes: { bibo: "http://purl.org/ontology/bibo/", dcterms: "http://example.org/other/" } });
    const { problems } = findings(generateInstanceContexts(root, opts));
    expect(problems.some((l) => l.startsWith("top/refs/s.jsonld: prefix `oa`"))).toBe(true);
    expect(problems.some((l) => l.includes("prefix `dcterms` is bound differently"))).toBe(true);
  });

  test(`the path is instance-relative: ${INSTANCE_CONTEXT_PATH}`, () => {
    expect(by("top").path).toBe(`top/${INSTANCE_CONTEXT_PATH}`);
  });
});
