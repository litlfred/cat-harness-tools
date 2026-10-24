/**
 * `folio-create.ts` — a reader's document goes into the folio, of any kind a
 * loaded knowledge graph declares (bean `95sk`, R28).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDocument, documentPage, resolveKind, sectionsOf } from "../folio-create.ts";
import type { KindEntry } from "../gen-document-kinds-viz.ts";

const kind = (instance: string, id: string, sections: [string, boolean][], ext?: string): KindEntry => ({
  instance,
  file: `${instance}/document-kinds/${id}.json`,
  coverage: [],
  kind: {
    $schema: "document-kind/1.0.0",
    id,
    title: `${id} title`,
    description: "d",
    structure: "semi-fixed",
    ...(ext ? { extends: ext } : {}),
    sections: sections.map(([sid, required]) => ({ id: sid, title: `${sid} heading`, required, description: `about ${sid}` })),
    sources: [{ ref: "x" }],
  } as KindEntry["kind"],
});

const l1 = kind("smart-base", "l1", [["introduction", true], ["annexes", false]]);
const guideline = kind("smart-base", "l1-guideline", [["recommendations", true], ["introduction", true]], "l1");
const otherL1 = kind("other", "l1", [["x", true]]);

describe("resolveKind", () => {
  test("an id one instance declares resolves", () => {
    expect(resolveKind([l1, guideline], "l1")).toBe(l1);
  });
  test("an id two instances declare is refused, naming both", () => {
    const r = resolveKind([l1, otherL1], "l1");
    expect("error" in r && r.error).toContain("smart-base:l1 and other:l1");
    expect(resolveKind([l1, otherL1], "other:l1")).toBe(otherL1);
  });
  test("an unknown kind lists the known ones", () => {
    const r = resolveKind([l1], "dak");
    expect("error" in r && r.error).toContain("smart-base:l1");
  });
});

describe("the page", () => {
  test("a sub-kind carries its parent's sections first, each once", () => {
    expect(sectionsOf(guideline, [l1, guideline]).map((s) => s.id)).toEqual(["introduction", "annexes", "recommendations"]);
  });
  test("front matter names the kind, and every section is a heading marked required or optional", () => {
    const page = documentPage(guideline, [l1, guideline], "My guideline");
    expect(page).toContain('documentKind: "smart-base:l1-guideline"');
    expect(page).toContain("## recommendations heading\n\n<!-- Required. about recommendations -->");
    expect(page).toContain("<!-- Optional. about annexes -->");
  });
});

describe("createDocument", () => {
  test("writes <folio>/<slug>/index.md and refuses to overwrite it", () => {
    const root = mkdtempSync(join(tmpdir(), "folio-create-"));
    const r = createDocument({ root, kinds: [l1], kind: "l1", slug: "my-doc", title: "My doc" });
    expect(r).toEqual({ path: join(root, "folio", "my-doc", "index.md") });
    expect(readFileSync(join(root, "folio", "my-doc", "index.md"), "utf-8")).toContain("# My doc");
    const again = createDocument({ root, kinds: [l1], kind: "l1", slug: "my-doc", title: "Again" });
    expect("error" in again && again.error).toContain("already exists");
    expect(readFileSync(join(root, "folio", "my-doc", "index.md"), "utf-8")).toContain("# My doc");
  });
  test("a bad slug or an unknown kind writes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "folio-create-"));
    expect("error" in createDocument({ root, kinds: [l1], kind: "l1", slug: "Bad Slug", title: "t" })).toBe(true);
    expect("error" in createDocument({ root, kinds: [l1], kind: "nope", slug: "ok", title: "t" })).toBe(true);
  });
});
