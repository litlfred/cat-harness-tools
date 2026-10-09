/**
 * Tests for the schemas visualiser HTML generator (scripts/gen-schema-viz.ts).
 *
 * Verifies the 5 wireframe findings addressed for bean `folio-assistant-nnpk`:
 * 1. On phone, selecting a declaration smooth-scrolls and focuses into #detail.
 * 2. Responsive CSS rule on small viewports (max-width: 640px) constrains #items max-height to avoid scroll trapping.
 * 3. Diagram instruction points to the filter below and empty #ov-svg is hidden.
 * 4. Field table prevents mid-token wrapping on identifiers and code tokens.
 * 5. UML box uses wider truncation limits on desktop so field types are not cut short.
 *
 * @module scripts/tests/gen-schema-viz.test
 */
import { describe, expect, it } from "bun:test";
import { viewerHtml } from "../gen-schema-viz.ts";

describe("schemas visualiser wireframe fixes (folio-assistant-nnpk)", () => {
  const html = viewerHtml("assets/schemas/index.json", "cat-harness", [], "../../");

  it("Finding 1: smooth-scrolls and focuses into #detail when selecting on small viewports", () => {
    // #detail has tabindex="-1" so it can receive programmatic focus
    expect(html).toContain('<section id="detail" tabindex="-1"');
    // select function checks for small viewport or off-screen position and scrolls/focuses
    expect(html).toContain('dt.scrollIntoView({ behavior: "smooth", block: "start" })');
    expect(html).toContain("dt.focus()");
    expect(html).toContain("window.innerWidth <= 640");
  });

  it("Finding 2: sets compact #items max-height on small viewports to prevent nested scroll trapping", () => {
    expect(html).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{\s*#items\s*\{\s*max-height:\s*35vh;\s*\}\s*\}/);
  });

  it("Finding 3: points to filter below and collapses empty #ov-svg", () => {
    // Instruction points to filter below
    expect(html).toContain("Pick a <b>module</b> in the filter below and the diagram for it appears here.");
    expect(html).not.toContain("Pick a <b>module</b> in the filter above");
    // Empty SVG is hidden to prevent default 150-200px empty height
    expect(html).toContain("#ov-svg:empty { display: none; }");
  });

  it("Finding 4: field table prevents mid-token identifier breakage", () => {
    // Table td code has word-break: normal and overflow-wrap: anywhere
    expect(html).toContain("td code { font-family: ui-monospace, Menlo, monospace; font-size: .82rem; word-break: normal; overflow-wrap: anywhere; }");
    expect(html).toContain("#detail table td code { word-break: normal; overflow-wrap: anywhere; }");
    // Field name identifiers in first column stay on one line
    expect(html).toContain("#detail table td:first-child code { white-space: nowrap; }");
  });

  it("Finding 5: UML box adjusts field type truncation width for desktop viewports", () => {
    // uml function defines responsive/desktop truncation limits
    expect(html).toContain("maxChars = (typeof window !== \"undefined\" && window.innerWidth < 640) ? 42 : 76;");
    expect(html).toContain("maxTypeChars = (typeof window !== \"undefined\" && window.innerWidth < 640) ? 28 : 64;");
    // box width and text slicing use maxChars and maxTypeChars
    expect(html).toContain("Math.min(w, maxChars) * CH + PAD * 2");
    expect(html).toContain("f.type.replace(/^z\\./, \"\").slice(0, maxTypeChars)");
  });
});
