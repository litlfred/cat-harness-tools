/**
 * `kind:json-schemas` — one generated JSON Schema per harness kind, `$id` its
 * path (bean `8lcl`, box 1).
 */
import { describe, expect, test } from "bun:test";
import { relative } from "node:path";

import { defaultGraphTypologies } from "../../schemas/kg/graph-typology-registry.js";
import { declaredSchemasDir, harnessKinds, KINDS_SUBDIR, pointerToken, renderKind } from "../gen-kind-json-schemas.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

describe("pointerToken", () => {
  test("escapes what a JSON Pointer and a URI fragment cannot carry", () => {
    expect(pointerToken("folio-voice/v1")).toBe("folio-voice~1v1");
    expect(pointerToken("a~b")).toBe("a~0b");
    expect(pointerToken("x#y z%")).toBe("x%23y%20z%25");
  });
});

describe("renderKind", () => {
  const dir = declaredSchemasDir();

  test("the harness has kinds to render", () => {
    expect(harnessKinds().length).toBeGreaterThan(0);
  });

  test("a kind with a validator gets a file whose $id ends in its path", async () => {
    const d = await renderKind("tools", dir);
    if (!("file" in d)) throw new Error(`tools rendered no file: ${d.none}`);
    const path = relative(HARNESS_ROOT, d.file).split("\\").join("/");
    expect(path).toBe(`${relative(HARNESS_ROOT, dir).split("\\").join("/")}/${KINDS_SUBDIR}/tools.schema.json`);
    expect(d.id.endsWith(`/${path}`)).toBe(true);
    expect(JSON.parse(d.text).$id).toBe(d.id);
  });

  test("a kind with families is anyOf over them, each $ref resolving to a $defs entry", async () => {
    const d = await renderKind("skills", dir);
    if (!("file" in d)) throw new Error(`skills rendered no file: ${d.none}`);
    const doc = JSON.parse(d.text) as { anyOf: { $ref: string }[]; $defs: Record<string, unknown> };
    const keys = Object.keys(doc.$defs).map(pointerToken);
    for (const { $ref } of doc.anyOf) if ($ref.startsWith("#/$defs/")) expect(keys).toContain($ref.slice("#/$defs/".length));
    expect(doc.anyOf.length).toBeGreaterThan(0);
  });

  test("a kind where no validator applies gets no file, and says why", async () => {
    const na = harnessKinds().find((k) => defaultGraphTypologies.get(k)?.validatorNotApplicable);
    if (!na) throw new Error("no kind declares validatorNotApplicable");
    const d = await renderKind(na, dir);
    expect("none" in d).toBe(true);
  });
});
