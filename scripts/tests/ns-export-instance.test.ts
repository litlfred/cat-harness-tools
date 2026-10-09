/**
 * Instance namespace document generation and block-kind classes — bean folio-assistant-2osx.
 *
 * @module scripts/tests/ns-export-instance
 * @graphNode none — a test
 */
import { describe, expect, test } from "bun:test";

import {
  buildVocabulary,
  conceptSchemeIriFor,
  instancesPublishingNs,
  namespaceForPrefixOrLayer,
} from "../ns-export.ts";

type Node = Record<string, unknown>;
interface Doc {
  "@context": Record<string, unknown>;
  "@id": string;
  "@type": string | string[];
  "@graph": Node[];
}

const typesOf = (n: Node | Doc): string[] => {
  const t = (n as Node)["@type"];
  return Array.isArray(t) ? (t as string[]) : typeof t === "string" ? [t] : [];
};

describe("instancesPublishingNs", () => {
  test("returns cat-harness, folio-assistant-core, folio-assistant-sci, smart-base", () => {
    const list = instancesPublishingNs();
    expect(list).toEqual([
      "cat-harness",
      "folio-assistant-core",
      "folio-assistant-sci",
      "smart-base",
    ]);
  });
});

describe("each instance publishes its own ns document for its block-kind classes", () => {
  test("folio-assistant-core ns document contains its block kinds with SKOS and RDFS fields", () => {
    const { doc } = buildVocabulary(undefined, "folio-assistant-core", true) as { doc: Doc };
    expect(typesOf(doc)).toContain("skos:ConceptScheme");
    expect(typesOf(doc)).toContain("owl:Ontology");
    expect(doc["@id"]).toBe(conceptSchemeIriFor("folio-assistant-core"));

    const coreKinds = [
      "folio-assistant-core:Algorithm",
      "folio-assistant-core:Diagram",
      "folio-assistant-core:Equation",
      "folio-assistant-core:Example",
      "folio-assistant-core:Figure",
      "folio-assistant-core:Prose",
      "folio-assistant-core:Remark",
      "folio-assistant-core:Simulator",
      "folio-assistant-core:Table",
    ];

    const graph = doc["@graph"];
    for (const kindId of coreKinds) {
      const node = graph.find((n) => n["@id"] === kindId);
      expect(node).toBeDefined();
      expect(typesOf(node!)).toContain("rdfs:Class");
      expect(typesOf(node!)).toContain("skos:Concept");
      expect(node!.label).toBeDefined();
      expect(node!.comment).toBeDefined();
      expect(node!.prefLabel).toBe(node!.label);
      expect(node!.definition).toBe(node!.comment);
      expect(node!.notation).toBe(kindId);
      expect(node!.inScheme).toBe(conceptSchemeIriFor("folio-assistant-core"));
      expect(node!.isDefinedBy).toBe(conceptSchemeIriFor("folio-assistant-core"));
      expect(node!.layer).toBe("core");
    }

    // Prose heading fallback: heading is "" so label falls back to className "Prose" and definition to rationale
    const prose = graph.find((n) => n["@id"] === "folio-assistant-core:Prose");
    expect(prose!.label).toBe("Prose");
    expect(String(prose!.definition)).toContain("Shown with no heading");

    // Other instances' block kinds must NOT be in folio-assistant-core's exact document
    const foreign = graph.filter(
      (n) =>
        String(n["@id"]).startsWith("folio-assistant-sci:") ||
        String(n["@id"]).startsWith("smart-base:"),
    );
    expect(foreign).toHaveLength(0);
  });

  test("folio-assistant-sci ns document contains sci block kinds", () => {
    const { doc } = buildVocabulary(undefined, "folio-assistant-sci", true) as { doc: Doc };
    expect(typesOf(doc)).toContain("skos:ConceptScheme");
    expect(doc["@id"]).toBe(conceptSchemeIriFor("folio-assistant-sci"));

    const sciKinds = [
      "folio-assistant-sci:Conjecture",
      "folio-assistant-sci:Corollary",
      "folio-assistant-sci:Definition",
      "folio-assistant-sci:Lemma",
      "folio-assistant-sci:Proof",
      "folio-assistant-sci:Proposition",
      "folio-assistant-sci:Theorem",
    ];

    const graph = doc["@graph"];
    for (const kindId of sciKinds) {
      const node = graph.find((n) => n["@id"] === kindId);
      expect(node).toBeDefined();
      expect(typesOf(node!)).toContain("rdfs:Class");
      expect(typesOf(node!)).toContain("skos:Concept");
      expect(node!.inScheme).toBe(conceptSchemeIriFor("folio-assistant-sci"));
      expect(node!.isDefinedBy).toBe(conceptSchemeIriFor("folio-assistant-sci"));
      expect(node!.notation).toBe(kindId);
    }

    const theorem = graph.find((n) => n["@id"] === "folio-assistant-sci:Theorem");
    expect(theorem!.label).toBe("Theorem");
    expect(theorem!.definition).toBe("Theorem");

    // Must not contain core or smart-base kinds
    const foreign = graph.filter(
      (n) =>
        String(n["@id"]).startsWith("folio-assistant-core:") ||
        String(n["@id"]).startsWith("smart-base:"),
    );
    expect(foreign).toHaveLength(0);
  });

  test("smart-base ns document contains smart-base block kinds", () => {
    const { doc } = buildVocabulary(undefined, "smart-base", true) as { doc: Doc };
    expect(typesOf(doc)).toContain("skos:ConceptScheme");
    expect(doc["@id"]).toBe(conceptSchemeIriFor("smart-base"));

    const graph = doc["@graph"];
    const smartKinds = graph.filter((n) => String(n["@id"]).startsWith("smart-base:"));
    expect(smartKinds.length).toBe(21);

    const persona = graph.find((n) => n["@id"] === "smart-base:Persona");
    expect(persona).toBeDefined();
    expect(typesOf(persona!)).toContain("rdfs:Class");
    expect(typesOf(persona!)).toContain("skos:Concept");
    expect(persona!.inScheme).toBe(conceptSchemeIriFor("smart-base"));
  });

  test("cat-harness exact ns document contains harness terms and no block kinds", () => {
    const { doc } = buildVocabulary(undefined, "cat-harness", true) as { doc: Doc };
    expect(typesOf(doc)).toContain("skos:ConceptScheme");
    expect(doc["@id"]).toBe(conceptSchemeIriFor("cat-harness"));

    const graph = doc["@graph"];
    const blockKinds = graph.filter(
      (n) =>
        String(n["@id"]).startsWith("folio-assistant-core:") ||
        String(n["@id"]).startsWith("folio-assistant-sci:") ||
        String(n["@id"]).startsWith("smart-base:"),
    );
    expect(blockKinds).toHaveLength(0);
  });

  test("@context binds all publishing instance prefixes", () => {
    const { doc } = buildVocabulary() as { doc: Doc };
    const ctx = doc["@context"];
    expect(ctx["cat-harness"]).toBe(namespaceForPrefixOrLayer("cat-harness"));
    expect(ctx["folio-assistant-core"]).toBe(namespaceForPrefixOrLayer("folio-assistant-core"));
    expect(ctx["folio-assistant-sci"]).toBe(namespaceForPrefixOrLayer("folio-assistant-sci"));
    expect(ctx["smart-base"]).toBe(namespaceForPrefixOrLayer("smart-base"));
  });
});

describe("ns:check fails on a folioType whose owner does not publish an ns definition", () => {
  test("undefined block kind folioType is flagged in undefinedTerms", () => {
    const { report } = buildVocabulary();
    // In our clean monorepo, all folioTypes belong to publishing instances
    const unpublishingKinds = report.undefinedTerms.filter((t) => t.includes(":"));
    expect(unpublishingKinds).toHaveLength(0);
  });

  test("flags block kind whose owner does not publish an ns definition", async () => {
    const { mock } = await import("bun:test");
    const origKindsModule = await import("@litlfred/cat-harness/schemas/block-kinds.js");
    const origKinds = origKindsModule.discoverBlockKinds();
    mock.module("@litlfred/cat-harness/schemas/block-kinds.js", () => ({
      ...origKindsModule,
      discoverBlockKinds: () => [
        ...origKinds,
        {
          kind: "weird",
          folioType: "unpublishing-owner:WeirdKind",
          adapter: "paper",
          labelPrefix: "wrd",
        },
      ],
    }));

    // Re-import to use mocked module
    const { buildVocabulary: buildWithMock } = await import("../ns-export.ts");
    const { report } = buildWithMock();
    expect(report.undefinedTerms).toContain("unpublishing-owner:WeirdKind");
  });
});
