/**
 * A kind's `description` writes its relative links against the skill that
 * documents kinds (`skills/kg/kg-core/`), and the kind table renders it onto
 * `docs/cat-harness/kind-table.md`, two levels shallower. Rendered verbatim,
 * every such link pointed one `../` too high, which `check-subgraphs`
 * `overDeepLinks` counts (subgraphs.test.ts, "the real corpus carries none";
 * folio-assistant#3022/#3023). `rebaseLinks` moves each onto the page.
 *
 * @module scripts/tests/kg/kind-table-links.test
 */
import { describe, expect, test } from "bun:test";
import { DESCRIPTION_LINK_BASE, KIND_TABLE_DOC, rebaseLinks, renderKindTable } from "../../kind-table.ts";

const PAGE_DIR = "docs/cat-harness";

describe("rebaseLinks", () => {
  test("a link written for the skill's base resolves to the same file from the page", () => {
    // declared-path-literal: test vectors for the rebase arithmetic; the skill paths are what the descriptions name.
    expect(rebaseLinks("[q](../../../sdlc/skills/sdlc-core/qa-witness.md)", DESCRIPTION_LINK_BASE, PAGE_DIR)).toBe(
      "[q](../../sdlc/skills/sdlc-core/qa-witness.md)",
    );
    expect(rebaseLinks("[v](../kg-core/vocabulary-authority.md)", DESCRIPTION_LINK_BASE, PAGE_DIR)).toBe(
      "[v](../../skills/kg/kg-core/vocabulary-authority.md)",
    );
    expect(rebaseLinks("[s](../../process/workflow/session-context.md)", DESCRIPTION_LINK_BASE, PAGE_DIR)).toBe(
      "[s](../../skills/process/workflow/session-context.md)",
    );
  });

  test("a fragment or query rides along", () => {
    expect(rebaseLinks("[a](../kg-core/x.md#y)", DESCRIPTION_LINK_BASE, PAGE_DIR)).toBe("[a](../../skills/kg/kg-core/x.md#y)");
    expect(rebaseLinks("[a](x.md?z=1)", DESCRIPTION_LINK_BASE, PAGE_DIR)).toBe("[a](../../skills/kg/kg-core/x.md?z=1)");
  });

  test("absolute, site-absolute, fragment-only and mailto targets are left alone", () => {
    const keep = "[a](https://x.org/y) [b](/cat-harness/kind-table/) [c](#here) [d](mailto:a@b.c)";
    expect(rebaseLinks(keep, DESCRIPTION_LINK_BASE, PAGE_DIR)).toBe(keep);
  });

  test("the same base and target directory change nothing", () => {
    expect(rebaseLinks("[a](../x.md)", "a/b", "a/b")).toBe("[a](../x.md)");
  });
});

describe("the rendered kind table", () => {
  test("renders onto the page's directory", () => {
    expect(KIND_TABLE_DOC.startsWith(`${PAGE_DIR}/`)).toBe(true);
  });

  test("no relative link in it climbs above the instance root", () => {
    // From docs/cat-harness/, two `../` reach the instance root; a third is
    // the over-deep signature. Every rebased link stays within the root.
    const table = renderKindTable();
    const relative = [...table.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((t) => t.startsWith("../"));
    expect(relative.length).toBeGreaterThan(0);
    expect(relative.filter((t) => t.startsWith("../../../"))).toEqual([]);
  });
});
