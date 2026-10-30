#!/usr/bin/env bun
/**
 * Generate cat-harness's JSON Schema, one document per graph typology (kind),
 * from the Zod in `cat-harness-tools/schemas/`.
 *
 * @module scripts/gen-kind-json-schemas
 * @covers schemas
 * @graphNode none — a generator over the harness's kind validators, not a schema itself
 *
 * ## Why the source and the output are in different instances
 *
 * Bean `8lcl` (stage 1b of the split, owner ruling `xsqm` 1): the Zod moved
 * here, and `cat-harness/schemas/` keeps GENERATED JSON Schema, one per kind,
 * `$id` under the harness's `iriBase`, "as bootstrap does". So this is
 * bootstrap-tools' `gen-bootstrap-schemas.ts` one layer up: the content layer
 * holds a file a reader opens with nothing installed, and does not know how it
 * got there.
 *
 * ## Which kinds, and what each document holds
 *
 * The kinds are the harness's own: every kind of {@link BASE_GRAPH_TYPOLOGIES}
 * and every kind cat-harness declares in its `typologies/` graph. A kind a
 * higher instance declares is that instance's to publish. What a kind's nodes
 * are checked against is what `check:kind-validators` resolves, read through the
 * same functions, so the two cannot disagree about which Zod is the kind's:
 *
 * | the kind declares | the document is |
 * |---|---|
 * | a kind-level validator only | that schema |
 * | `$schema` families | `anyOf` over them: a Zod family is a `$defs` entry keyed by its tag; an external family whose tag is a URL is a `$ref` to it |
 *
 * A family typed only as a TypeScript shape is not runnable, so it constrains
 * nothing here and the document's `$comment` names it. A Zod schema in another
 * repository (bootstrap-tools' `models`) is published by that repository. A kind
 * with nothing runnable gets NO file, and this says why, as
 * `check:kind-validators` does: a schema that accepts everything would read as
 * coverage.
 *
 * ## The `$id` is the file's path
 *
 * `<iriBase>v<major>/<path in cat-harness>`, minted by bootstrap-tools'
 * `releaseIri` from the declaration, never typed; it is the rule
 * bootstrap-tools' `check:node-iris` enforces over every Knowledge Graph with
 * an `iriBase` (owner, 2026-09-29).
 *
 * Usage:
 *   bun run cat kind:json-schemas          # write
 *   bun run cat kind:json-schemas:check    # fail if a kind lacks its file, a file is stale, or an `$id` is not its path
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { z } from "zod";

import { releaseIri, releaseIris } from "@litlfred/bootstrap-tools/schemas/release-iri.ts";

import { readDeclaration } from "../schemas/kg/cat-harness.js";
import {
  BASE_GRAPH_TYPOLOGIES,
  declaringInstanceOf,
  defaultGraphTypologies,
  kindTitle,
} from "../schemas/kg/graph-typology-registry.js";
import {
  moduleRootOf,
  resolveKindValidator,
  resolveNodeSchemas,
  type ValidatorRef,
} from "../schemas/kg/kind-validator.js";
import { HARNESS_NAME, HARNESS_ROOT, TOOLS_ROOT } from "./lib/roots.ts";

/** The declared directory entry the documents go under. */
export const SCHEMAS_ENTRY = "schemas";

/** The subdirectory of the harness's declared `schemas/` graph the documents live in. */
export const KINDS_SUBDIR = "kinds";

/** The JSON Schema dialect the converter emits, stated so a library change cannot move it. */
export const DIALECT = "https://json-schema.org/draft/2020-12/schema";

const WRITER = "scripts/gen-kind-json-schemas.ts";

/** One kind's document, or why it has none. */
export type KindDocument =
  | { kind: string; file: string; id: string; text: string }
  | { kind: string; none: string };

/** JSON Pointer escaping (RFC 6901), then the URI-fragment characters a tag can hold. */
export function pointerToken(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1").replace(/%/g, "%25").replace(/#/g, "%23").replace(/ /g, "%20");
}

/**
 * The harness's own `schemas/` graph, by its declared entry id. By id rather
 * than by graph typology: four of the harness's directories hold the `schemas`
 * graph (`ns/`, and the openapi and archimate schemas), and this one is the
 * harness's schema directory.
 */
export function declaredSchemasDir(root: string = HARNESS_ROOT): string {
  const entry = readDeclaration(root)?.directories?.find((d) => d.id === SCHEMAS_ENTRY);
  if (!entry) throw new Error(`${root} declares no \`${SCHEMAS_ENTRY}\` directory — nowhere to put the generated schemas`);
  return join(root, entry.path);
}

/** The harness's own kinds: the code list and its `typologies/` nodes, sorted. */
export function harnessKinds(): string[] {
  return defaultGraphTypologies
    .names()
    .filter((k) => k in BASE_GRAPH_TYPOLOGIES || declaringInstanceOf(defaultGraphTypologies.get(k))?.name === HARNESS_NAME)
    .sort();
}

function body(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { io: "input", reused: "inline" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

/** Is this validator code this layer holds — not a sibling repository's, not a higher instance's? */
function heldHere(ref: ValidatorRef): boolean {
  return moduleRootOf(ref, HARNESS_ROOT) === TOOLS_ROOT;
}

/** Render one kind's document, or say why it has none. */
export async function renderKind(kind: string, schemasDir: string): Promise<KindDocument> {
  const def = defaultGraphTypologies.get(kind);
  if (def?.validatorNotApplicable) return { kind, none: `no runtime validator applies: ${def.validatorNotApplicable}` };

  const kv = await resolveKindValidator(kind, HARNESS_ROOT);
  const families = await resolveNodeSchemas(kind, HARNESS_ROOT);

  const defs: [string, Record<string, unknown>][] = [];
  const external: string[] = [];
  const shapes: string[] = [];
  const elsewhere: string[] = [];
  const unresolvable: string[] = [];

  if (kv.state === "resolved") {
    if (heldHere(kv.ref)) defs.push([kind, body(kv.schema)]);
    else elsewhere.push(`${kv.ref.instance ? `${kv.ref.instance}:` : ""}${kv.ref.module}#${kv.ref.exportName}`);
  } else if (kv.state === "unresolvable") {
    unresolvable.push(`${kind}: ${kv.reason}`);
  }
  for (const f of families) {
    if (f.state === "resolved") {
      if (heldHere(f.ref)) defs.push([f.tag, body(f.schema)]);
      else elsewhere.push(`${f.tag} (${f.ref.instance ? `${f.ref.instance}:` : ""}${f.ref.module}#${f.ref.exportName})`);
    } else if (f.state === "external") {
      if (/^https?:\/\//.test(f.tag)) external.push(f.tag);
      else shapes.push(`${f.tag} (external: ${f.spec})`);
    } else if (f.state === "shape") {
      shapes.push(`${f.tag} (${f.ref.module}#${f.ref.exportName})`);
    } else {
      unresolvable.push(`${f.tag}: ${f.reason}`);
    }
  }
  // A validator that does not load is `check:kind-validators`' finding; here it
  // would silently shrink the published document, so it stops the run.
  if (unresolvable.length) throw new Error(`kind "${kind}": a declared validator does not resolve — ${unresolvable.join("; ")}`);

  if (defs.length === 0 && external.length === 0) {
    const why = [
      elsewhere.length ? `its validator is in another repository, which publishes it: ${elsewhere.join(", ")}` : "",
      shapes.length ? `its families are typed only as TypeScript shapes, which cannot be run: ${shapes.join(", ")}` : "",
    ].filter(Boolean);
    return { kind, none: why.length ? why.join("; ") : "it declares no validator and no `$schema` family" };
  }

  const file = join(schemasDir, KINDS_SUBDIR, `${kind}.schema.json`);
  const path = relative(HARNESS_ROOT, file).split("\\").join("/");
  const release = releaseIris(readDeclaration(HARNESS_ROOT));
  if (!release) throw new Error(`${HARNESS_ROOT}'s declaration has no iriBase, so no \`$id\` can be minted`);
  const id = releaseIri(release, path, "agent");

  const notes = [
    shapes.length ? `Not constrained here — typed only as TypeScript shapes: ${shapes.join(", ")}.` : "",
    elsewhere.length ? `Published by the repository that holds it: ${elsewhere.join(", ")}.` : "",
  ].filter(Boolean);

  const doc: Record<string, unknown> = {
    $schema: DIALECT,
    $id: id,
    _generated: `${WRITER} of cat-harness-tools — do not hand-edit; change the Zod and run \`bun run cat kind:json-schemas\``,
    title: kindTitle(kind),
    description: def?.summary ?? kind,
  };
  if (notes.length) doc.$comment = notes.join(" ");

  const single = families.length === 0 && defs.length === 1 && external.length === 0;
  if (single) {
    Object.assign(doc, defs[0]![1]);
  } else {
    doc.anyOf = [
      ...defs.map(([key]) => ({ $ref: `#/$defs/${pointerToken(key)}` })),
      ...external.map((url) => ({ $ref: url })),
    ];
    if (defs.length) doc.$defs = Object.fromEntries(defs.map(([key, b]) => [key, { title: key, ...b }]));
  }
  return { kind, file, id, text: `${JSON.stringify(doc, null, 2)}\n` };
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const schemasDir = declaredSchemasDir();
  const dir = join(schemasDir, KINDS_SUBDIR);

  const kinds = harnessKinds();
  const docs: KindDocument[] = [];
  for (const k of kinds) docs.push(await renderKind(k, schemasDir));
  const written = docs.filter((d): d is Extract<KindDocument, { file: string }> => "file" in d);

  // The vacuity guard: a run over no kinds, or one that renders nothing, has not passed.
  if (kinds.length === 0 || written.length === 0) {
    console.error(`✗ EXAMINED NOTHING — ${kinds.length} kind(s), ${written.length} document(s)`);
    process.exit(1);
  }

  let findings = 0;
  let wrote = 0;
  const expected = new Set(written.map((d) => `${d.kind}.schema.json`));
  for (const d of written) {
    const rel = relative(HARNESS_ROOT, d.file);
    const prev = existsSync(d.file) ? readFileSync(d.file, "utf8") : null;
    if (prev === d.text) {
      console.log(`  = ${rel}`);
      continue;
    }
    if (check) {
      if (prev === null) console.error(`  ✗ ${rel} is missing — kind "${d.kind}" has no JSON Schema`);
      else {
        let at: unknown;
        try {
          at = (JSON.parse(prev) as { $id?: unknown }).$id;
        } catch {
          at = "(unparseable)";
        }
        if (at !== d.id) console.error(`  ✗ ${rel}: $id ${JSON.stringify(at)} is not its path (${d.id})`);
        else console.error(`  ✗ ${rel} is stale`);
      }
      findings++;
      continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(d.file, d.text);
    console.log(`  ✓ ${rel}`);
    wrote++;
  }
  // A file no kind accounts for: a renamed or removed kind left it behind.
  for (const f of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (expected.has(f)) continue;
    const rel = relative(HARNESS_ROOT, join(dir, f));
    if (check) {
      console.error(`  ✗ ${rel} belongs to no harness kind`);
      findings++;
    } else {
      rmSync(join(dir, f));
      console.log(`  - ${rel}`);
    }
  }

  const none = docs.filter((d): d is Extract<KindDocument, { none: string }> => "none" in d);
  console.log(`\n${kinds.length} harness kind(s): ${written.length} with a generated JSON Schema, ${none.length} with none`);
  for (const n of none) console.log(`  · ${n.kind} — ${n.none}`);

  if (check && findings) {
    console.error(`\n✗ ${findings} kind JSON Schema finding(s) — run \`bun run cat kind:json-schemas\`.`);
    process.exit(1);
  }
  console.log(check ? "\nkind JSON Schemas are up to date" : `\n${wrote} written, ${written.length - wrote} unchanged`);
}
