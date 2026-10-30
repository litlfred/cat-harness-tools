/**
 * The library's JSON-LD nodes are routed to the class they instantiate and
 * parsed by its schema. The block fixture is one aai-programme held for a day
 * with no `@type` (2026-10-21), and what regeneration made of it.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { familyBody, nodeFamilyTag, resolveNodeSchemas } from "../kg/kind-validator.ts";
import { LIBRARY_NODE_FAMILIES, LibraryBlockSchema, LibrarySectionSchema, LibrarySourceDocumentSchema, libraryNodeClass } from "./library-nodes.ts";

import { requireHarnessRoot } from "../harness-root.ts";
const HARNESS = requireHarnessRoot();
const ctx = ["https://example.org/ns/context/v1.jsonld", { "@base": "https://example.org/" }];
const doc = "https://example.org/library/d/manifest.jsonld";
const untyped = { "@context": ctx, "@id": "library/d/blocks/prose-s024", kind: "prose", title: "11. Automation", text: "../sections/s024.md", derivedFrom: doc, sourceDocument: doc, provenance: "ingested" };
const block = { ...untyped, "@type": ["folio-assistant-core:Prose", "doco:Section"] };
const section = { "@context": ctx, "@id": "library/d/sections/s024", "@type": ["doco:Section"], title: "11. Automation", contains: [block["@id"]], derivedFrom: doc, sourceDocument: doc, provenance: "ingested" };
const manifest = { "@context": ctx, "@id": doc, "@type": [LIBRARY_NODE_FAMILIES.sourceDocument], title: "A source", contains: [section["@id"]], provenance: "ingested", meta: { doc_id: "d" }, license: "CC-BY-4.0" };

describe("library JSON-LD node families", () => {
  test("each class resolves to a runnable schema", async () => {
    const fams = new Map((await resolveNodeSchemas("library", HARNESS)).map((f) => [f.tag, f.state]));
    for (const tag of Object.values(LIBRARY_NODE_FAMILIES)) expect(fams.get(tag)).toBe("resolved");
  });

  test("a node is routed by the class it instantiates: a prose block, which is also doco:Section, is a block", () => {
    expect(nodeFamilyTag(manifest)).toBe(LIBRARY_NODE_FAMILIES.sourceDocument);
    expect(nodeFamilyTag(section)).toBe(LIBRARY_NODE_FAMILIES.section);
    expect(nodeFamilyTag(block)).toBe(LIBRARY_NODE_FAMILIES.block);
    expect(nodeFamilyTag(untyped)).toBe(LIBRARY_NODE_FAMILIES.block);
    expect(libraryNodeClass({ kind: "prose" })).toBeUndefined(); // not JSON-LD
    expect(nodeFamilyTag({ $schema: "a/v1", "@context": ctx, kind: "x" })).toBe("a/v1");
  });

  test("each parses what the generator writes", () => {
    expect(LibrarySourceDocumentSchema.safeParse(familyBody(manifest)).success).toBe(true);
    expect(LibrarySectionSchema.safeParse(familyBody(section)).success).toBe(true);
    expect(LibraryBlockSchema.safeParse(familyBody(block)).success).toBe(true);
  });

  test("a block with no @type, or a key nobody declared, is invalid", () => {
    expect(LibraryBlockSchema.safeParse(familyBody(untyped)).success).toBe(false);
    expect(LibraryBlockSchema.safeParse({ ...block, extra: 1 }).success).toBe(false);
    expect(LibrarySectionSchema.safeParse({ ...section, "@type": ["doco:Section", "x:Y"] }).success).toBe(false);
    expect(LibrarySourceDocumentSchema.safeParse({ ...manifest, "@type": ["doco:Section"] }).success).toBe(false);
  });
});
