/**
 * Figure and table headings carry their source number and a link icon.
 *
 * Owner, 2026-10-31, on the dth-pc preview: "are the tables and figures
 * numbered in source content? why not in rendered?" The ingested captions kept
 * "Fig. 1. ...", but the heading printed a bare "Figure." with no link icon.
 */
import { describe, expect, test } from "bun:test";

import { captionNumber, renderBlockMarkdown } from "./render-markdown";
import type { Block } from "../schemas/types.ts";

const fig = (caption: string, label = "fig:1") =>
  ({ block: { kind: "figure", label, caption, file: "media/x.png" } as unknown as Block, mdContent: "![alt](media/x.png)" });

describe("captionNumber", () => {
  test("reads the source's own number in its common forms", () => {
    expect(captionNumber("Fig. 1. Product master data")).toEqual({ number: "1", rest: "Product master data" });
    expect(captionNumber("Fig 6. WHO SMART Guidelines approach")).toEqual({ number: "6", rest: "WHO SMART Guidelines approach" });
    expect(captionNumber("Figure 2.13: m4RH monitoring data")).toEqual({ number: "2.13", rest: "m4RH monitoring data" });
    expect(captionNumber("Table 3. Roles")).toEqual({ number: "3", rest: "Roles" });
  });
  test("a caption naming two figures keeps its text and gives a range", () => {
    const r = captionNumber("Fig. 26. Current state in Ethiopia; Fig. 27. Future state in Ethiopia");
    expect(r!.number).toBe("26–27");
    expect(r!.rest).toContain("Fig. 27.");
  });
  test("invents nothing when the source has no number", () => {
    expect(captionNumber("Target users of this handbook across Chapters 1–7")).toBeNull();
  });
});

describe("renderBlockMarkdown headings", () => {
  test("a numbered figure: number in the heading, a link icon, no duplicate number", () => {
    const md = renderBlockMarkdown(fig("Fig. 1. Product master data"));
    expect(md).toContain('<a id="fig:1"></a>');
    expect(md).toContain("**Figure 1.**");
    expect(md).toContain('href="#fig:1" class="block-anchor"');
    expect(md).toContain("*Product master data*");
    expect(md).not.toContain("*Fig. 1. Product master data*");
  });
  test("a numbered figure says its caption once, on the heading line", () => {
    const md = renderBlockMarkdown(fig("Fig. 5. WHO SMART Guidelines Approach", "fig:5"));
    expect(md).toContain("**Figure 5.** *WHO SMART Guidelines Approach*");
    expect(md.split("WHO SMART Guidelines Approach").length - 1).toBe(1);
  });
  test("an unnumbered table keeps its plain heading and still gets the link icon", () => {
    const md = renderBlockMarkdown({
      block: { kind: "table", label: "tbl:target-users", caption: "Target users" } as unknown as Block,
      mdContent: "| a |\n|---|\n| b |",
    });
    expect(md).toContain("**Table.**");
    expect(md).toContain('href="#tbl:target-users"');
    expect(md).toContain("*Target users*");
  });
  test("no anchors means no link icon", () => {
    expect(renderBlockMarkdown(fig("Fig. 2. X", "fig:2"), { anchors: false })).not.toContain("block-anchor");
  });
});

describe("the numbered-block frame", () => {
  test("a figure, diagram or table sits in one frame, Markdown kept inside", () => {
    const md = renderBlockMarkdown(fig("Fig. 1. Product master data"));
    expect(md.startsWith('<div class="fa-numbered fa-numbered-figure" markdown="1">\n\n')).toBe(true);
    expect(md.endsWith("\n\n</div>")).toBe(true);
    const t = renderBlockMarkdown({ block: { kind: "table", label: "tbl:x", caption: "X" } as unknown as Block, mdContent: "| a |\n|---|\n| b |" });
    expect(t).toContain('class="fa-numbered fa-numbered-table"');
  });
  test("prose has no frame", () => {
    const md = renderBlockMarkdown({ block: { kind: "prose", label: "prose:x" } as unknown as Block, mdContent: "Text." });
    expect(md).not.toContain("fa-numbered");
  });
});
