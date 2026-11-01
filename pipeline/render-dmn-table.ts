/**
 * Draw a DMN 1.3 decision table as an HTML table, for the document site.
 *
 * A decision-table block's rules live in its `.dmn` companion. Until this
 * module the site showed only the block's `.md`, so authors copied the rule
 * table into Markdown by hand, and nothing kept the copy in step with the
 * `.dmn` (issue #1323; one copy in dth-hrh#83 rendered as raw text because of
 * a broken separator). The owner chose to draw the table from the file, the
 * way a process is drawn from its `.bpmn` (Q-DMN-1 A, 2026-11-01).
 *
 * ## One reader
 *
 * The table is read by {@link loadDecisionTable}, the same reader the
 * evaluator and the DMN checks use, and every cell is put through
 * {@link unreadableExpressions}. A table that reader refuses, or a cell it
 * cannot read, is refused here too, naming why. A second, more lenient
 * reader for the page would show readers rules the engine does not run.
 *
 * ## Deterministic, and plain HTML
 *
 * The output depends only on the file's content: no dates, no random ids, the
 * cells in file order. It is one raw-HTML block with no blank line inside, so
 * CommonMark (remark) keeps it whole, and every text value is escaped.
 *
 * It sits in the shared `.fa-numbered` frame that `render-markdown.ts` gives
 * figures and tables, so it takes the site look from `docs-ui.css` with no new
 * CSS: the table centred, the title line centred at no more than 66% of the
 * column.
 *
 * @module pipeline/render-dmn-table
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
  listDecisions,
  loadDecisionTable,
  unreadableExpressions,
  type DecisionTable,
} from "../src/workflow/decision-table.ts";

/** Escape text for HTML element content and double-quoted attributes. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A cell as written in the file, in code type; `-` (any value) stays `-`. */
function cell(text: string): string {
  const t = text.trim();
  return t === "" ? "<code>-</code>" : `<code>${escapeHtml(t)}</code>`;
}

/** A column header: the label, then the expression or name it reads. */
function header(label: string | undefined, key: string, typeRef?: string): string {
  const type = typeRef ? ` <span class="fa-dmn-type">(${escapeHtml(typeRef)})</span>` : "";
  if (!label || label.trim() === key) return `<code>${escapeHtml(key)}</code>${type}`;
  return `${escapeHtml(label.trim())}<br><code>${escapeHtml(key)}</code>${type}`;
}

/**
 * The HTML for one decision table.
 *
 * Columns follow the DMN layout: the rule, the inputs, the outputs, then any
 * DMN 1.3 annotations. An annotation column appears only when some rule has
 * one, so a table without them is not padded with empty cells.
 *
 * A rule's `description` is prose, often a sentence or two. As a column it
 * squeezed every other column in a document's text width and made each row
 * many lines tall (the dth-hrh preview), so it sits in a full-width row under
 * its rule instead.
 */
export function decisionTableHtml(table: DecisionTable, opts: { source?: string } = {}): string {
  const hasDescription = table.rules.some((r) => r.description && r.description.trim() !== "");
  const annotationCount = Math.max(0, ...table.rules.map((r) => r.annotations?.length ?? 0));
  const source = opts.source ?? basename(table.source);

  const head: string[] = ['<th scope="col">Rule</th>'];
  table.inputs.forEach((i) =>
    head.push(`<th scope="col" class="fa-dmn-input">${header(i.label, i.expression, i.typeRef)}</th>`),
  );
  table.outputs.forEach((name, n) =>
    head.push(`<th scope="col" class="fa-dmn-output">${header(table.outputLabels?.[n], name)}</th>`),
  );
  for (let n = 0; n < annotationCount; n++) {
    head.push(`<th scope="col" class="fa-dmn-annotation">Annotation${annotationCount > 1 ? ` ${n + 1}` : ""}</th>`);
  }

  const rows = table.rules.map((r, n) => {
    const cells = [`<th scope="row"><span class="fa-dmn-rule-n">${n + 1}</span> <code>${escapeHtml(r.id)}</code></th>`];
    r.when.forEach((t) => cells.push(`<td class="fa-dmn-input">${cell(t)}</td>`));
    r.then.forEach((t) => cells.push(`<td class="fa-dmn-output">${cell(t)}</td>`));
    for (let a = 0; a < annotationCount; a++) {
      cells.push(`<td class="fa-dmn-annotation">${escapeHtml(r.annotations?.[a] ?? "")}</td>`);
    }
    const row = `<tr>${cells.join("")}</tr>`;
    const description = (r.description ?? "").trim();
    if (!hasDescription || description === "") return row;
    return `${row}\n<tr class="fa-dmn-description"><td></td><td colspan="${cells.length - 1}"><small><em>${escapeHtml(description)}</em></small></td></tr>`;
  });

  // `scope` and the label make the table readable to a screen reader; the
  // visible title line is the frame's centred `<p>`, as for every figure.
  // `table-wrapper` is the theme's own wrapper, so a wide table scrolls
  // sideways inside the column instead of widening the page.
  const title =
    `<p class="fa-dmn-title"><strong>${escapeHtml(table.name)}</strong><br>` +
    `Hit policy <code>${table.hitPolicy}</code> · ${table.rules.length} rule${table.rules.length === 1 ? "" : "s"} · ` +
    `from <code>${escapeHtml(source)}</code> (<code>${escapeHtml(table.id)}</code>)</p>`;
  return [
    `<div class="fa-numbered fa-numbered-decision-table" data-dmn-decision="${escapeHtml(table.id)}">`,
    title,
    `<div class="table-wrapper"><table class="fa-dmn-table" aria-label="${escapeHtml(`${table.name}, hit policy ${table.hitPolicy}`)}">`,
    `<thead><tr>${head.join("")}</tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody>`,
    `</table></div>`,
    `</div>`,
  ].join("\n");
}

/** What {@link renderDmnFile} returns: the HTML, or why there is none. */
export type DmnRender = { ok: true; html: string; decisionId: string } | { ok: false; reason: string };

/**
 * Read a `.dmn` file and draw one of its decision tables.
 *
 * `decisionId` picks the decision. Without one, a file declaring exactly one
 * decision draws it, and a file declaring several is refused rather than
 * guessed: the same rule {@link loadDecisionTable} keeps for gateways.
 */
export async function renderDmnFile(dmnPath: string, decisionId?: string): Promise<DmnRender> {
  if (!existsSync(dmnPath)) return { ok: false, reason: `${basename(dmnPath)} does not exist` };
  try {
    let id = decisionId;
    if (!id) {
      const all = await listDecisions(dmnPath);
      if (all.length !== 1) {
        return {
          ok: false,
          reason:
            `${basename(dmnPath)} declares ${all.length} decisions (${all.map((d) => d.id).join(", ") || "none"}); ` +
            `name one with the block's \`decisionId\``,
        };
      }
      id = all[0]!.id;
    }
    const table = await loadDecisionTable(dmnPath, id);
    const unreadable = unreadableExpressions(table);
    if (unreadable.length > 0) {
      const first = unreadable[0]!;
      return {
        ok: false,
        reason:
          `${id}: ${unreadable.length} cell(s) use FEEL the reader cannot read, first ` +
          `${first.rule} ${first.side} column ${first.column} \`${first.expression}\`: ${first.message}`,
      };
    }
    return { ok: true, html: decisionTableHtml(table), decisionId: id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Where a block's body asks for its table. A line holding only this comment
 * is replaced by the table; a body without it gets the table at its end.
 */
export const DMN_TABLE_MARKER = "<!-- dmn:table -->";

/**
 * Put a rendered table into a block's Markdown body: at the
 * {@link DMN_TABLE_MARKER} line if there is one, otherwise after the body.
 * Blank lines either side keep the HTML a block of its own.
 */
export function placeDmnTable(body: string, html: string): string {
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.trim() === DMN_TABLE_MARKER);
  if (at >= 0) {
    return [...lines.slice(0, at), "", html, "", ...lines.slice(at + 1)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return body.trim() ? `${body.trim()}\n\n${html}` : html;
}

/** The refusal shown in place of a table, so a page never silently drops one. */
export function dmnRefusalNote(reason: string): string {
  return `> **Decision table not drawn:** ${escapeHtml(reason)}`;
}
