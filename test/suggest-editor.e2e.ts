/**
 * The ✍ suggest editor, driven in Chromium: the dialog the owner chose
 * (cat-harness `docs/wireframes/suggest-editor`, candidate A) over the site's
 * own Crepe bundle (`scripts/suggest-editor.ts`).
 *
 * ## Why this exists
 *
 * Owner, 2026-10-14, after the first build failed on the live site with
 * "Adding different instances of a keyed plugin": *"why didnt you test out the
 * workflow first? you have playwright?"* The first test had driven a page of
 * its own over a hand-made bundle, which could not meet the failure the live
 * site met. This spec drives the RUNTIME the platform publishes
 * (`EDIT_LINKS_RUNTIME`) over the BUNDLE the site build installs, on a page
 * that loads its assets the way a built page does, so the editor is found
 * where a site finds it (`assets/vendor/crepe/`).
 *
 * Self-contained: no network, no built site. Every request goes to
 * `http://suggest.test/`, answered by `page.route`, and the block's source is
 * served for `raw.githubusercontent.com` as the runtime asks for it.
 *
 * @covers none — a browser test of one runtime, not an audit of a declared graph
 */
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EDIT_LINKS_RUNTIME } from "../src/core/edit-links.ts";
import { SUGGEST_EDITOR_DIR } from "../scripts/suggest-editor.ts";

const ORIGIN = "http://suggest.test";
const BLOCK = "Each chapter gives objectives and key messages.\n\nSee the repository README for how change sets work.\n";
const CFG = { repo: "o/r", branch: "main" };
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Block</title>
<link rel="stylesheet" href="/assets/css/site.css"></head><body>
<div data-src="folio/doc/ch1/p-about.md" data-block="prose:about"><a data-fa-link="edit" href="#">✎ edit</a><p>${BLOCK}</p></div>
<script type="application/json" id="fa-edit-cfg">${JSON.stringify(CFG)}</script>
<script>${EDIT_LINKS_RUNTIME}</script></body></html>`;

let site: string;
// The bundle is built by Bun (Bun.build), as the site build builds it; the spec runs under Node.
test.beforeAll(() => {
  site = mkdtempSync(join(tmpdir(), "suggest-e2e-"));
  execFileSync("bun", ["run", join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "suggest-editor.ts"), "--site", site], { stdio: "inherit" });
});
test.afterAll(() => rmSync(site, { recursive: true, force: true }));

/** The page, its assets, the editor bundle and the block's source, all local; window.open recorded. */
async function open(page: Page): Promise<{ opened: () => string; errors: string[] }> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(`${ORIGIN}/**`, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/") return r.fulfill({ contentType: "text/html", body: PAGE });
    if (path === "/assets/css/site.css") return r.fulfill({ contentType: "text/css", body: "" });
    const prefix = `/${SUGGEST_EDITOR_DIR}/`;
    if (path.startsWith(prefix)) {
      const f = join(site, SUGGEST_EDITOR_DIR, path.slice(prefix.length));
      return r.fulfill({ contentType: f.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(f) });
    }
    return r.fulfill({ status: 404, body: "" });
  });
  await page.route(/raw\.githubusercontent\.com/, (r) =>
    r.request().url().endsWith(".jsonld")
      ? r.fulfill({ contentType: "application/json", body: JSON.stringify({ kind: "prose", text: "p-about.md" }) })
      : r.fulfill({ contentType: "text/plain", body: BLOCK }),
  );
  let url = "";
  await page.exposeFunction("__opened", (u: string) => { url = u; });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => {
    (window as unknown as { open: (u: string) => null }).open = (u: string) => { (window as unknown as { __opened: (u: string) => void }).__opened(u); return null; };
  });
  await page.locator('a[data-fa-link="suggest"]').click();
  await page.locator("dialog.fa-suggest .ProseMirror").waitFor({ timeout: 30_000 });
  return { opened: () => url, errors };
}

/** Select `text` inside the editor, as a reader dragging over it would. */
async function select(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const root = document.querySelector("dialog.fa-suggest .ProseMirror")!;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.textContent!.indexOf(t);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + t.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      return;
    }
    throw new Error(`no "${t}" in the editor`);
  }, text);
}

const D = "dialog.fa-suggest";

test.describe("✍ suggest editor (wireframe candidate A)", () => {
  test("opens Crepe from the site's bundle, titled by the block's label, with the toolbar shown", async ({ page }) => {
    const { errors } = await open(page);
    await expect(page.locator(`${D} h2`)).toHaveText("Suggest a change: prose:about");
    const tools = await page.locator(`${D} .fa-sg-tb button`).evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
    expect(tools).toEqual(["Bold", "Italic", "Strikethrough", "Heading", "Bulleted list", "Numbered list", "Link", "Code", "Undo", "Redo", "Edit visually", "Edit the raw Markdown"]);
    // Underline is left out on purpose, and the toolbar says why.
    await expect(page.locator(`${D} .fa-sg-tb`)).toContainText("underlined text means added");
    expect(errors).toEqual([]);
  });

  test("marks a replacement as one change: removed text struck through in red, new text underlined in green", async ({ page }) => {
    await open(page);
    await select(page, "repository README");
    await page.keyboard.type("contributor guide");
    await expect(page.locator(`${D} .ProseMirror del.fa-sg-del`)).toHaveText(/repository README/);
    await expect(page.locator(`${D} .ProseMirror ins.fa-sg-ins`)).toHaveText(/contributor guide/);
    await expect(page.locator(`${D} .fa-suggest-vars`)).toContainText("1 change");
    const ins = await page.locator(`${D} .ProseMirror ins.fa-sg-ins`).evaluate((e) => getComputedStyle(e));
    const del = await page.locator(`${D} .ProseMirror del.fa-sg-del`).evaluate((e) => getComputedStyle(e));
    expect([ins.color, ins.textDecorationLine]).toEqual(["rgb(11, 107, 42)", "underline"]);
    expect([del.color, del.textDecorationLine]).toEqual(["rgb(179, 38, 30)", "line-through"]);
  });

  test("the toolbar formats through Milkdown's own commands", async ({ page }) => {
    await open(page);
    await select(page, "objectives");
    await page.locator(`${D} .fa-sg-tb button[aria-label="Bold"]`).click();
    await expect(page.locator(`${D} .ProseMirror strong`)).toHaveText("objectives");
  });

  test("the Why field becomes the issue's reason, beside the diff", async ({ page }) => {
    const { opened, errors } = await open(page);
    await select(page, "repository README");
    await page.keyboard.type("contributor guide");
    await page.locator(`${D} .fa-sg-why textarea`).fill("The README does not explain change sets.");
    await page.locator(`${D} button`, { hasText: "Submit as an issue" }).click();
    await expect.poll(opened).not.toBe("");
    const u = new URL(opened());
    expect(u.pathname).toBe("/o/r/issues/new");
    expect(u.searchParams.get("title")).toBe("Suggested edit: prose:about");
    const body = u.searchParams.get("body")!;
    expect(body).toContain("+See the contributor guide for how change sets work.");
    expect(body).toContain("**Why:**\nThe README does not explain change sets.");
    await expect(page.locator(D)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Larger and Full screen resize it, and Esc closes it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await open(page);
    const size = async () => (await page.locator(D).boundingBox())!;
    const normal = await size();
    await page.locator(`${D} button[aria-label="Make the editor larger"]`).click();
    const larger = await size();
    await page.locator(`${D} button[aria-label="Fill the screen"]`).click();
    const full = await size();
    expect(larger.width).toBeGreaterThan(normal.width);
    expect(full.width).toBeGreaterThanOrEqual(1280);
    await page.keyboard.press("Escape");
    await expect(page.locator(D)).toHaveCount(0);
  });

  test("on a phone: full screen, nothing scrolls sideways, every control at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const box = (await page.locator(D).boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([390, 844]);
    const tb = await page.locator(`${D} .fa-sg-tb`).evaluate((e) => e.scrollWidth <= e.clientWidth);
    expect(tb).toBe(true);
    const small = await page.locator(`${D} button`).evaluateAll((bs) =>
      bs.filter((b) => (b as HTMLElement).offsetParent && (b.getBoundingClientRect().width < 44 || b.getBoundingClientRect().height < 44)).map((b) => b.getAttribute("aria-label")),
    );
    expect(small).toEqual([]);
  });
});
