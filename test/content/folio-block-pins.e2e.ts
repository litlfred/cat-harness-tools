import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { siteFileFor } from "../../schemas/kg/cat-harness.ts";
import { resolveChromium } from "../../scripts/playwright-chromium";
import { HARNESS_ROOT } from "../../scripts/lib/roots.ts";

/**
 * PIN ANY BLOCK, OF ANY GRAPH KIND, TO THE FOLIO — litlfred/cat-harness#982.
 * Owner, 2026-11-02 (verbatim):
 *
 * > in lhs grill of document display, add a bookmark icon which will add a
 * > bookmark kind to the folio which is a link to the document at that point.
 * > user should also be able to add content blocks in general to folio so
 * > they can reutrn to then
 * > any graph kind really....  (so should be core infra of the viewer/graph kind)
 *
 * Q-BMK-1 = C: a LINK CARD now (live windows per kind later), so the glass
 * loads no visualizer for a pinned item.
 *
 * The contract is attributes on the block (`data-fa-pin*`) and a
 * `[data-fa-pin-control]` inside it; `docs-ui.js` does the rest. These specs
 * hold the four things that make it one mechanism rather than a feature per
 * kind: the toggle and its pressed state come from the folio store, a
 * bookmark and a block of a graph kind are the same path with different
 * kinds, the card opens where the block said, and a hostile href is refused.
 */
test.use({
  launchOptions: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: resolveChromium(process.env as Record<string, string | undefined>).path,
  },
});

const ROOT = join(HARNESS_ROOT);
const CSS = readFileSync(join(ROOT, siteFileFor(ROOT, "assets/css/docs-ui.css")), "utf8");
const JS = readFileSync(join(ROOT, siteFileFor(ROOT, "assets/js/docs-ui.js")), "utf8");

const BOOKMARK_AT = "http://replica.test/dth-hrh/registry.html#par-3-2-1";
const TERM = "https://iri.example/glossary/health-worker";

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Doc</title>
<style>${CSS}</style></head><body><main><div class="main-content">
<p id="par-3-2-1" data-fa-pin="${BOOKMARK_AT}" data-fa-pin-kind="bookmark"
   data-fa-pin-title="3.2 Health workforce registry" data-fa-pin-href="${BOOKMARK_AT}"
   data-fa-pin-avatar="/cover.png" data-fa-pin-source="DTH-HRH">A registry holds one record per worker.
   <button type="button" data-fa-pin-control id="bm">\u{1F516}</button></p>
<div data-fa-pin="${TERM}" data-fa-pin-node-kind="glossary" data-fa-pin-title="Health worker"
     data-fa-pin-href="/glossary/health-worker/" data-fa-pin-source="NHWA glossary">Health worker
   <button type="button" data-fa-pin-control id="term">\u{1F4CC}</button></div>
<div data-fa-pin="evil" data-fa-pin-href="javascript:alert(1)">x
   <button type="button" data-fa-pin-control id="evil">\u{1F4CC}</button></div>
</div></main><script>${JS}</script></body></html>`;

async function serve(page: Page): Promise<string[]> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    try { localStorage.setItem("fa-glass-strip-hidden", "0"); } catch { /* fails visibly below */ }
  });
  const opened: string[] = [];
  const asked: string[] = [];
  await page.route("http://replica.test/**", (route) => {
    const url = new URL(route.request().url());
    asked.push(url.pathname);
    const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/dth-hrh/registry.html") return route.fulfill({ contentType: "text/html", body: PAGE });
    if (url.pathname === "/assets/semantic-zoom.json") return json({ belowPx: 120 });
    if (url.pathname === "/assets/todos/index.json") return json({ items: [] });
    if (route.request().isNavigationRequest()) {
      opened.push(url.pathname + url.hash);
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Opened</title><p>opened</p>" });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://replica.test/dth-hrh/registry.html");
  await page.waitForSelector(".fa-glass-handle", { state: "attached" });
  (page as unknown as { __asked: string[] }).__asked = asked;
  return opened;
}

const store = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("fa-folio-assets") || "{}") as Record<string, Record<string, unknown>>);

test.describe("one contract for every block kind", () => {
  test("a bookmark toggles on the glass, and its pressed state is the store's", async ({ page }) => {
    await serve(page);
    await expect(page.locator("#bm")).toHaveAttribute("aria-pressed", "false");
    await page.click("#bm");
    await expect(page.locator("#bm")).toHaveAttribute("aria-pressed", "true");
    const s = await store(page);
    expect(s[`bookmark:${BOOKMARK_AT}`]).toMatchObject({
      shown: true, kind: "bookmark", href: BOOKMARK_AT, avatar: "/cover.png", source: "DTH-HRH",
    });
    // Off again is SHELVING, never forgetting: the three-state rule (`board-windows`).
    await page.click("#bm");
    await expect(page.locator("#bm")).toHaveAttribute("aria-pressed", "false");
    expect((await store(page))[`bookmark:${BOOKMARK_AT}`]).toMatchObject({ shown: false });
  });

  test("a block of a graph kind is the same path, and draws its kind's avatar with a pin", async ({ page }) => {
    await serve(page);
    await page.click("#term");
    const card = page.locator(`.fa-glass-asset[data-fa-asset="pin:${TERM}"]`);
    await expect(card).toHaveAttribute("data-fa-asset-kind", "pin");
    await expect(card).toHaveAttribute("data-fa-node-kind", "glossary");
    await expect(card.locator('.fa-glass-kind-avatar[data-fa-kind="glossary"]')).toHaveCount(1);
    await expect(card.locator('.fa-glass-badge[data-fa-badge="pin"]')).toHaveCount(1);
  });

  test("the card is a link card: it opens where the block said, and loads no viewer", async ({ page }) => {
    const opened = await serve(page);
    await page.click("#term");
    await page.click(".fa-glass-handle");
    const card = page.locator(`.fa-glass-asset[data-fa-asset="pin:${TERM}"]`);
    await expect(card).toHaveAttribute("data-fa-opens", "/glossary/health-worker/");
    const asked = (page as unknown as { __asked: string[] }).__asked;
    expect(asked.filter((p) => p.startsWith("/glossary/"))).toEqual([]);
    await card.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => opened).toEqual(["/glossary/health-worker/"]);
  });

  test("a javascript: href is refused: the item is kept, with no link", async ({ page }) => {
    await serve(page);
    await page.click("#evil");
    expect((await store(page))["pin:evil"]).toMatchObject({ shown: true, href: "" });
    await expect(page.locator('.fa-glass-asset[data-fa-asset="pin:evil"]')).not.toHaveAttribute("data-fa-opens", /./);
  });

  test("a viewer that builds its controls in script uses window.faFolio, the same store", async ({ page }) => {
    await serve(page);
    const state = await page.evaluate((k) => {
      const f = (window as unknown as { faFolio: { pin: (k: string, m: object) => string } }).faFolio;
      return f.pin(k, { kind: "pin", title: "Registry update", nodeKind: "bpmn", href: "/processes/registry-update/" });
    }, "https://iri.example/process/registry-update");
    expect(state).toBe("glass");
    await expect(page.locator('.fa-glass-asset[data-fa-node-kind="bpmn"]')).toHaveCount(1);
  });
});
