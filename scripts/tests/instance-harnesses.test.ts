/**
 * An instance's OWN site lists the instance and what it is built on — never
 * the platform's other harnesses (bean `mftp`, owner 2026-10-05: "harnesses
 * in bottom LHS navbar link back to folio-assist, not smart-immz").
 */
import { describe, expect, test } from "bun:test";
import { dirname, join, resolve } from "node:path";
import { readDeclaration } from "@litlfred/cat-harness/schemas/kg/cat-harness.ts";
import { instanceHarnesses } from "../mount-instance-docs.ts";
import { HARNESS_ROOT } from "../lib/roots.ts";

const REPO = resolve(dirname(HARNESS_ROOT));

describe("instanceHarnesses", () => {
  const rows = instanceHarnesses("cat-harness", "smart-immunizations", "https://example.org/fa", ".")!;
  test("the instance comes first and links to its own site's root", () => {
    // Labelled as every row is (label, else title, else name): the restored
    // declaration (2026-10-15) carries a title, so that is its label.
    const decl = readDeclaration(join(REPO, "smart-immunizations"));
    expect(rows[0]!.label).toBe(decl?.title ?? "smart-immunizations");
    expect(rows[0]!.href).toBe(".");
  });
  test("it lists the harnesses the instance is built on, re-based on the platform", () => {
    const smartBase = rows.find((r) => r.label === "SMART Base");
    expect(smartBase?.href).toBe("https://example.org/fa/smart-base/");
  });
  test("it lists nothing the instance is not built on", () => {
    const labels = rows.map((r) => r.label);
    for (const other of ["smart-trust", "WHO IRIS", "Folio Assistant"]) expect(labels).not.toContain(other);
  });
});
