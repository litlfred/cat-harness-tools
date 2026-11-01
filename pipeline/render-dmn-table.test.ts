/**
 * Decision tables are drawn from their `.dmn` file (issue #1323, owner Q-DMN-1 A).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DMN_TABLE_MARKER, placeDmnTable, renderDmnFile } from "./render-dmn-table";
import { renderBlockMarkdown } from "./render-markdown";
import type { Block } from "../schemas/types.ts";

const dir = mkdtempSync(join(tmpdir(), "dmn-render-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const dmn = (rules: string, extra = "") => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="Defs" name="T" namespace="urn:t">
  <decision id="Decision_T" name="Pick a <colour> &amp; size">
    <decisionTable id="DT" hitPolicy="FIRST">
      <input id="I1" label="Light"><inputExpression id="IE1" typeRef="string"><text>light</text></inputExpression></input>
      <input id="I2"><inputExpression id="IE2" typeRef="number"><text>count</text></inputExpression></input>
      <output id="O1" name="action" label="Action to take" typeRef="string"/>
      ${rules}
    </decisionTable>
  </decision>${extra}
</definitions>`;

const RULES = `
      <rule id="R1"><description>Stop on red.</description>
        <inputEntry id="a"><text>"red"</text></inputEntry><inputEntry id="b"><text>&gt; 0</text></inputEntry>
        <outputEntry id="c"><text>"stop"</text></outputEntry></rule>
      <rule id="R2">
        <inputEntry id="d"><text>-</text></inputEntry><inputEntry id="e"><text>-</text></inputEntry>
        <outputEntry id="f"><text>"go"</text></outputEntry></rule>`;

function file(name: string, xml: string): string {
  const p = join(dir, name);
  writeFileSync(p, xml);
  return p;
}

describe("renderDmnFile", () => {
  test("draws inputs, outputs, hit policy and one row per rule, escaped", async () => {
    const r = await renderDmnFile(file("ok.dmn", dmn(RULES)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.html;
    expect(h).toContain('<div class="fa-numbered fa-numbered-decision-table" data-dmn-decision="Decision_T">');
    expect(h).toContain("<strong>Pick a &lt;colour&gt; &amp; size</strong>");
    expect(h).toContain("Hit policy <code>FIRST</code> · 2 rules");
    expect(h).toContain("Light<br><code>light</code>");
    expect(h).toContain("Action to take<br><code>action</code>");
    expect(h).toContain("<code>&quot;red&quot;</code>");
    expect(h).toContain("<code>&gt; 0</code>");
    expect(h).toContain('<tr class="fa-dmn-description"><td></td><td colspan="3"><small><em>Stop on red.</em></small></td></tr>');
    expect((h.match(/<tr>/g) ?? []).length).toBe(3);
    // One raw-HTML block for CommonMark: no blank line inside it.
    expect(h).not.toMatch(/\n\s*\n/);
  });

  test("is deterministic", async () => {
    const p = file("same.dmn", dmn(RULES));
    const a = await renderDmnFile(p);
    const b = await renderDmnFile(p);
    expect(a).toEqual(b);
  });

  test("refuses FEEL the reader cannot read, naming the cell", async () => {
    const bad = RULES.replace("&gt; 0", "[1..5]");
    const r = await renderDmnFile(file("range.dmn", dmn(bad)));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("R1 input column 2");
  });

  test("refuses a hit policy the reader does not implement", async () => {
    const r = await renderDmnFile(file("collect.dmn", dmn(RULES).replace('hitPolicy="FIRST"', 'hitPolicy="COLLECT"')));
    expect(r.ok).toBe(false);
  });

  test("a file with two decisions needs the block to name one", async () => {
    const two = dmn(RULES, `
  <decision id="Decision_U" name="U"><decisionTable id="DT2"><input id="X"><inputExpression id="XE"><text>x</text></inputExpression></input><output id="XO" name="y"/><rule id="U1"><inputEntry id="u"><text>-</text></inputEntry><outputEntry id="v"><text>1</text></outputEntry></rule></decisionTable></decision>`);
    const p = file("two.dmn", two);
    expect((await renderDmnFile(p)).ok).toBe(false);
    const named = await renderDmnFile(p, "Decision_U");
    expect(named.ok && named.decisionId).toBe("Decision_U");
  });
});

describe("placing the table in the block", () => {
  test("at the marker line, else after the body", () => {
    expect(placeDmnTable(`Before.\n\n${DMN_TABLE_MARKER}\n\nAfter.`, "<div>T</div>")).toBe("Before.\n\n<div>T</div>\n\nAfter.");
    expect(placeDmnTable("Only prose.", "<div>T</div>")).toBe("Only prose.\n\n<div>T</div>");
  });

  test("renderBlockMarkdown puts it in the block body", () => {
    const md = renderBlockMarkdown({
      block: { kind: "decision-table", label: "dt:x", title: "X" } as unknown as Block,
      mdContent: `**Purpose.** Decide.\n\n${DMN_TABLE_MARKER}\n\n*Notes.*`,
      dmnTable: "<div>T</div>",
    });
    expect(md).toContain("**Purpose.** Decide.\n\n<div>T</div>\n\n*Notes.*");
    expect(md).not.toContain(DMN_TABLE_MARKER);
  });
});
