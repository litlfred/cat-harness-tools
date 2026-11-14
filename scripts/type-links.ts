/**
 * Where a field's TYPE is defined, as a link — so every type name in a class
 * diagram goes back to its definition, whatever source drew it.
 *
 * @module scripts/type-links
 * @graphNode none — a lookup over published specifications, not a schema
 *
 * A type that is a declaration of the schema graph links to that declaration
 * (the viewer does that from the edge). This is the rest: the built-in types
 * each source language names without declaring, linked to the specification
 * that defines them. One table, read by the schemas viewer and by the skill and
 * Tool pages, so a `string` links to the same place on all of them.
 *
 * Not knowing a type is an answer: {@link typeLink} returns `undefined`, and the
 * name is shown unlinked rather than linked somewhere plausible.
 */

/** The source a declaration was read from, as the diagram labels it. */
export type ClassSource = "zod" | "typescript" | "json-schema" | "fhir" | "skill";

const FHIR_DATATYPES = "https://hl7.org/fhir/datatypes.html";
const FHIR_CORE_SD = "http://hl7.org/fhir/StructureDefinition/";
const JSON_SCHEMA_TYPE = "https://json-schema.org/understanding-json-schema/reference/";
const XSD = "https://www.w3.org/TR/xmlschema-2/";

/** JSON Schema's own types, each to its page of the reference. */
const JSON_TYPES: Record<string, string> = {
  string: `${JSON_SCHEMA_TYPE}string`,
  number: `${JSON_SCHEMA_TYPE}numeric`,
  integer: `${JSON_SCHEMA_TYPE}numeric#integer`,
  boolean: `${JSON_SCHEMA_TYPE}boolean`,
  null: `${JSON_SCHEMA_TYPE}null`,
  array: `${JSON_SCHEMA_TYPE}array`,
  object: `${JSON_SCHEMA_TYPE}object`,
  // `format` values a field type may carry, to the XML Schema type they mean.
  date: `${XSD}#date`,
  "date-time": `${XSD}#dateTime`,
  datetime: `${XSD}#dateTime`,
  time: `${XSD}#time`,
  duration: `${XSD}#duration`,
  uri: `${XSD}#anyURI`,
};

/** Zod's built-ins, to the Zod API reference. */
const ZOD_API = "https://zod.dev/api";
const ZOD_TYPES: Record<string, string> = {
  string: `${ZOD_API}#strings`,
  number: `${ZOD_API}#numbers`,
  bigint: `${ZOD_API}#bigints`,
  boolean: `${ZOD_API}#booleans`,
  date: `${ZOD_API}#dates`,
  enum: `${ZOD_API}#enums`,
  literal: `${ZOD_API}#literals`,
  array: `${ZOD_API}#arrays`,
  record: `${ZOD_API}#records`,
  union: `${ZOD_API}#unions`,
  object: `${ZOD_API}#objects`,
  unknown: `${ZOD_API}#unknown`,
  any: `${ZOD_API}#any`,
  datetime: `${ZOD_API}#iso-datetimes`,
  url: `${ZOD_API}#urls`,
  email: `${ZOD_API}#emails`,
  uuid: `${ZOD_API}#uuids`,
};

/**
 * The definition of the type `name` as written by `source`, or `undefined`.
 *
 * FHIR: a primitive (a lower-case code — `string`, `dateTime`, `code`) is on
 * the datatypes page at its anchor; anything else is its canonical
 * StructureDefinition URL, which resolves to its page on hl7.org. Pass the
 * reader's own `typeLinks` first: it knows the canonical a type was written as.
 */
export function typeLink(source: ClassSource, name: string, known?: Readonly<Record<string, string>>): string | undefined {
  const bare = name.replace(/\[\]$/, "").replace(/^z\./, "").replace(/\(.*$/, "");
  if (known?.[bare]) return fhirPage(known[bare]!);
  switch (source) {
    case "fhir":
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(bare)) return undefined;
      return /^[a-z]/.test(bare) ? `${FHIR_DATATYPES}#${bare}` : `${FHIR_CORE_SD}${bare}`;
    case "json-schema":
      return JSON_TYPES[bare];
    case "zod":
    case "typescript": {
      const head = /^([a-z]+)/.exec(bare)?.[1];
      return head ? ZOD_TYPES[head] : undefined;
    }
    default:
      return undefined;
  }
}

/** A FHIR core primitive's canonical goes to its datatypes anchor; anything else is linked as given. */
function fhirPage(url: string): string {
  if (url.startsWith(FHIR_CORE_SD)) {
    const code = url.slice(FHIR_CORE_SD.length);
    if (/^[a-z]/.test(code)) return `${FHIR_DATATYPES}#${code}`;
  }
  return url;
}

/** The source label a declaration kind is drawn with, upper right of its box. */
export function sourceOfKind(kind: string): ClassSource {
  if (kind === "json-schema") return "json-schema";
  if (kind === "fhir-logical") return "fhir";
  if (kind === "interface" || kind === "type-alias") return "typescript";
  return "zod";
}
