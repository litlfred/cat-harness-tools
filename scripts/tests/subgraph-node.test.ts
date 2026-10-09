/**
 * THE GATE for the subgraph-node pattern (bean `l4ay`, follow-up `r5wu`):
 * a generator that publishes the contents of a declared subgraph uses the
 * DECLARED Subgraph node as its container, and every member says it is part of it.
 *
 * `PUBLISHED` lists the documents / publishers that have adopted the pattern.
 *
 * Pattern taxonomy:
 * - "container": published as a standalone named graph whose container is the declared Subgraph node (`@type: Subgraph`, `hasPart`, `contentSource`) with member `inSubgraph` edges (`todos`, `fsh-guts`).
 * - "scheme": published as a domain document (SKOS ConceptScheme) linked to the declared Subgraph via `dcterms:isPartOf` (`swimlane-glossary`).
 * - "members": published as individual document nodes whose manifest / root carries `inSubgraph` pointing to the declared Subgraph (`library`, `docs`).
 *
 * Internal authoring stores and plain JSON indexes that are NOT standalone published subgraph documents:
 * - `scenarios/roles.json` (`roles`): An internal authoring registry for BPMN swimlanes, projected directly into the instance KG export (`kg-export.ts`) rather than published as an independent JSON-LD document.
 * - `beans` (`beans/`): The work-plan items are maintained as an internal store and exposed via CLI (`beans prime`/`list`) and plain JSON indexes, not published as a standalone JSON-LD graph.
 * - `qa` (`test/results/`): QA witness files and attestations are machine sidecars and branch-store records (on `qa-reports`), not published standalone Subgraph documents.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { declaredSubgraphNode, makeIri } from "../kg-export.ts";
import { memberOf, subgraphContainer, subgraphIri, subgraphPublicationFindings } from "../subgraph-node.ts";
import { buildFshGutsExport } from "../fsh-guts-export.ts";
import { todoGraphDocument } from "../todo-graph.ts";
import { buildGlossary } from "../glossary-export.ts";
import { buildDocumentNodes } from "../../content/pipeline/gen-library-jsonld.ts";
import { readRoleGraph } from "@litlfred/cat-harness/schemas/role-graph.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

const ROOT = resolve(HARNESS_ROOT);

export const PUBLISHED = [
  { subgraph: "todos", publisher: "scripts/todo-graph.ts", pattern: "container" },
  { subgraph: "fsh-guts", publisher: "scripts/fsh-guts-export.ts", pattern: "container" },
  { subgraph: "swimlane-glossary", publisher: "scripts/glossary-export.ts", pattern: "scheme" },
  { subgraph: "library", publisher: "content/pipeline/gen-library-jsonld.ts", pattern: "members" },
  { subgraph: "docs", publisher: "content/pipeline/gen-site-jsonld.ts", pattern: "members" },
] as const;

describe("the IRI is the one kg-export mints the node under", () => {
  for (const id of ["todos", "beans", "a b", "x#y", "p/q"]) {
    test(JSON.stringify(id), () => {
      expect(subgraphIri("https://e.org/i.jsonld", id)).toBe(makeIri("https://e.org/i.jsonld", "directory", id));
    });
  }
});

describe("the check catches each way of getting it wrong", () => {
  const IRI = "https://e.org/i.jsonld#directory/todos";
  const ctx = { Subgraph: "x", hasPart: "x", inSubgraph: "x", contentSource: "x" };
  const good = () => ({
    "@context": { ...ctx },
    ...subgraphContainer({ iri: IRI, members: ["m1", "m2"] }),
    "@graph": [
      { "@id": "m1", ...memberOf(IRI) },
      { "@id": "m2", ...memberOf(IRI) },
    ],
  });
  test("the good shape is clean", () => {
    expect(subgraphPublicationFindings(good(), { iri: IRI })).toEqual([]);
  });
  test("a parallel collection container", () => {
    const d = { ...good(), "@id": "https://e.org/todos.jsonld", "@type": "TodoGraph" };
    const f = subgraphPublicationFindings(d, { iri: IRI });
    expect(f.some((x) => /not the declared Subgraph/.test(x))).toBe(true);
    expect(f.some((x) => /parallel collection/.test(x))).toBe(true);
  });
  test("a member without inSubgraph", () => {
    const d = good();
    delete (d["@graph"][1] as Record<string, unknown>)["inSubgraph"];
    expect(subgraphPublicationFindings(d, { iri: IRI })).toEqual([`member m2 has no inSubgraph → ${IRI}`]);
  });
  test("hasPart that misses a member", () => {
    const d = { ...good(), hasPart: ["m1"] };
    expect(subgraphPublicationFindings(d, { iri: IRI }).some((x) => /hasPart/.test(x))).toBe(true);
  });
  test("a context that does not define the terms", () => {
    const d = { ...good(), "@context": {} };
    expect(subgraphPublicationFindings(d, { iri: IRI }).length).toBe(4);
  });
});

describe("converted publishers follow the declared subgraph pattern", () => {
  test("container publisher: fsh-guts satisfies subgraphPublicationFindings", () => {
    const sub = declaredSubgraphNode(ROOT, "fsh-guts");
    expect(sub).toBeDefined();
    const doc = buildFshGutsExport(ROOT);
    expect(subgraphPublicationFindings(doc, { iri: sub!.iri })).toEqual([]);
  });

  test("container publisher: todos satisfies subgraphPublicationFindings", () => {
    const sub = declaredSubgraphNode(ROOT, "todos");
    expect(sub).toBeDefined();
    const sampleItem = {
      id: "todo-sample",
      summary: "Sample todo",
      comment: "",
      status: "open" as const,
      priority: "normal" as const,
      createdAt: "2026-10-09",
      tags: { roles: [], processes: [], tasks: [], identities: [], references: [], artefacts: [] },
      relations: [],
    };
    const doc = todoGraphDocument([sampleItem], sub);
    expect(subgraphPublicationFindings(doc, { iri: sub!.iri })).toEqual([]);
  });

  test("scheme publisher: swimlane-glossary links to declared Subgraph via dcterms:isPartOf", () => {
    const sub = declaredSubgraphNode(ROOT, "swimlane-glossary");
    expect(sub).toBeDefined();
    const { doc } = buildGlossary({ instanceRoot: ROOT, today: () => "2026-09-21" });
    expect(doc["@type"]).toBe("skos:ConceptScheme");
    expect(doc["isPartOf"]).toBe(sub!.iri);
  });

  test("members publisher: library manifest carries inSubgraph pointing to declared Subgraph", () => {
    const sub = declaredSubgraphNode(ROOT, "library");
    expect(sub).toBeDefined();
    const nodes = buildDocumentNodes("doc-sample", { doc_id: "doc-sample", sections: [] }, undefined, () => false);
    const manifestFile = nodes.find((n) => n.path === "manifest.jsonld");
    expect(manifestFile).toBeDefined();
    const manifest = JSON.parse(manifestFile!.content) as Record<string, unknown>;
    expect(manifest["inSubgraph"]).toBe(sub!.iri);
  });

  test("members publisher: docs site pages carry inSubgraph pointing to declared Subgraph", () => {
    const sub = declaredSubgraphNode(ROOT, "docs");
    expect(sub).toBeDefined();
    const pagePath = [
      join(ROOT, "docs/source/guides-writing-a-paper/guides-writing-a-paper.jsonld"),
      join(ROOT, "content/docs/guides-writing-a-paper/guides-writing-a-paper.jsonld"),
    ].find(existsSync);
    expect(pagePath).toBeDefined();
    const page = JSON.parse(readFileSync(pagePath!, "utf-8")) as Record<string, unknown>;
    expect(page["inSubgraph"]).toBe(sub!.iri);
  });

  test("authoring registries: roles.json is an authoring registry projected into KG export, not a standalone published subgraph document", () => {
    const rolesPath = join(ROOT, "scenarios/roles.json");
    expect(existsSync(rolesPath)).toBe(true);
    const g = readRoleGraph(join(ROOT, "scenarios"));
    expect(g).toBeDefined();
    expect(g!.roles.length).toBeGreaterThan(0);
  });
});
