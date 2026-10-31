/**
 * The inline diff marks a link that was added around words already there
 * (owner, 2026-10-31: "no green on first, but is on second"). The text diff
 * cannot see it, so the renderer compares the links themselves. Runs
 * renderInline in a real browser, as the review page does.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";

import { renderInline } from "../review-renderers.ts";

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });

async function inline(base: string, head: string): Promise<string> {
  const page = await browser.newPage();
  const html = await page.evaluate(
    ({ fn, base, head }) => {
      const render = new Function(`return (${fn})`)();
      const diff = (a: string, b: string) => {
        // Enough for these cases: a common prefix and suffix around one change.
        let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
        let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
        return [{ op: "same", text: a.slice(0, i) }, { op: "del", text: a.slice(i, a.length - j) }, { op: "ins", text: b.slice(i, b.length - j) }, { op: "same", text: a.slice(a.length - j) }].filter((o) => o.text);
      };
      const clean = (d: Document, h: string) => { const e = d.createElement("div"); e.innerHTML = h; return e; };
      return render(document, base, head, diff, clean).innerHTML;
    },
    { fn: renderInline.toString(), base, head },
  );
  await page.close();
  return html;
}

test("a link added around unchanged words is marked as added", async () => {
  const out = await inline("<p>data and digital infrastructure and more</p>", '<p>data and <a href="g#di">digital infrastructure</a> and more</p>');
  expect(out).toContain('<a href="g#di"><ins class="diff-link-added" title="link added">digital infrastructure</ins></a>');
});

test("a link that was already there is not marked", async () => {
  const same = '<p>see <a href="g#di">digital infrastructure</a> here</p>';
  expect(await inline(same, same)).not.toContain("<ins");
});

test("a link whose target changed is marked", async () => {
  const out = await inline('<p>see <a href="old">term</a></p>', '<p>see <a href="new">term</a></p>');
  expect(out).toContain('<ins class="diff-link-added"');
});

test("the review brief draws a link inside bold text (a comment number linked to its row)", async () => {
  const { briefInline } = await import("../review-brief.ts");
  const page = await browser.newPage();
  const html = await page.evaluate(({ fn, text }) => {
    const f = new Function(`${fn}; return briefInline;`)();
    const p = document.createElement("p");
    f(document, p, text);
    return p.innerHTML;
  }, { fn: briefInline.toString(), text: "**No. [136](https://x.io/pc/#PC-0137):** Accepted." });
  await page.close();
  expect(html).toBe('<strong>No. <a href="https://x.io/pc/#PC-0137" rel="noopener">136</a>:</strong> Accepted.');
});
