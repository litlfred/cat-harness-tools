import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { siteFileFor } from "../schemas/kg/cat-harness.ts";
import { HARNESS_ROOT } from "../scripts/lib/roots.ts";

/**
 * A block's translation, in its feedback panel (owner, 2026-11-14: "add to
 * the feedback controls (edit, suggest, etc) interface to fixing/adjudication
 * of translation via github issue workflow. should indicate translation status
 * of content block").
 *
 * On a translated page, each block's 📣 panel carries a 🌐 pane, drawn by
 * cat-harness `site-chrome/assets/js/translation-review.js` from the
 * `folio-translation-review/v1` projection (scripts/gen-translation-status.ts).
 * It says what state the block's catalogue is in, and files the same
 * `translation-adjudication/v1` issue the review page files: "translation OK"
 * as an acceptable verdict, "fix translation" as a mistranslation carrying the
 * strings of THIS block's source file only. The record in the issue must be
 * one `parseIssueBody` and `payloadProblems` accept.
 *
 * Fixtures are written here, never read off the corpus.
 */

const ROOT = join(HARNESS_ROOT);
const asset = (p: string) => readFileSync(join(ROOT, siteFileFor(ROOT, p)), "utf8");
const CSS = asset("assets/css/docs-ui.css");
const EDIT_LINKS = asset("assets/js/edit-links.js");
const REVIEW_JS = asset("assets/js/translation-review.js");

const REVIEW_URL = "/assets/translation-status/review.json";
const PO_URL = "https://raw.githubusercontent.com/o/r/main/translations/fr/docs/guide.po";

/** The catalogue behind the machine-translated block: two of its strings are the block's, one is another file's. */
const PO = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  "",
  "#: docs/guide.md:3",
  'msgid "Hello, reader."',
  'msgstr "Bonjour, lecteur."',
  "",
  "#: docs/guide.md:5",
  'msgctxt "button"',
  'msgid "Save"',
  'msgstr "Sauver"',
  "",
  "#: docs/other.md:1",
  'msgid "Elsewhere."',
  'msgstr "Ailleurs."',
  "",
].join("\n");
const HASH = createHash("sha256").update(PO, "utf-8").digest("hex").slice(0, 16);

const cell = (o: object) => ({ entries: 3, translated: 3, fuzzy: 0, hash: "0123456789abcdef", ...o });
const review = (maxUrl = 7500) => ({
  $schema: "folio-translation-review/v1",
  reviewPage: "en/cat-harness/translation-status/review.html",
  issue: { schema: "translation-adjudication/v1", label: "translation-adjudication", titlePrefix: "[translation review]", fence: "json translation-adjudication", maxUrl },
  layers: [
    {
      name: "demo",
      repository: "o/r",
      translations: "translations",
      locales: ["ar", "fr"],
      rows: [
        { catalogue: "docs/guide", sources: ["docs/guide.md", "docs/other.md"], cells: { fr: cell({ state: "machine", hash: HASH, generatedBy: "agent" }), ar: cell({ state: "empty", translated: 0 }) } },
        { catalogue: "docs/rev", sources: ["docs/rev.md"], cells: { fr: cell({ state: "reviewed", by: "alice", at: "2026-11-01T10:00:00Z" }) } },
        { catalogue: "docs/stale", sources: ["docs/stale.md"], cells: { fr: cell({ state: "stale", by: "bob", at: "2026-10-02T10:00:00Z" }) } },
        { catalogue: "docs/flag", sources: ["docs/flag.md"], cells: { fr: cell({ state: "flagged", flagReason: "mistranslation reported by carol" }) } },
        { catalogue: "docs/off", sources: ["docs/off.md"], cells: { fr: cell({ state: "official", by: "Dr. A", at: "2026-09-01" }) } },
      ],
    },
  ],
});

const META = {
  lang: "fr",
  translationStatus: "unverified",
  translationSource: "docs/guide",
  supportedLocales: ["ar", "en", "fr"],
  availableLocales: ["en", "fr"],
  statusSrc: "/assets/translation-status/index.json",
  reviewSrc: REVIEW_URL,
};

/** One block as the compact block actions draw it: an anchor, then its box with ✎ and 📣. */
const block = (id: string, src: string, text: string) =>
  `<p><a id="${id}"></a><span class="block-actions" data-block="${id}" data-src="${src}" data-repo="o/r">` +
  `<a class="ba-edit" data-fa-link="edit" tabindex="0">✎ edit</a><a class="ba-feedback" data-fa-link="feedback" tabindex="0">📣 feedback</a></span>${text}</p>`;
const BODY =
  block("b-guide", "docs/guide.md", "Bonjour, lecteur.") +
  block("b-rev", "docs/rev.md", "Revu.") +
  block("b-stale", "docs/stale.md", "Vieux.") +
  block("b-flag", "docs/flag.md", "Signalé.") +
  block("b-off", "docs/off.md", "Officiel.") +
  block("b-none", "docs/nothing.md", "Rien.");

function harness(meta: object, scheme: "light" | "dark"): string {
  return (
    `<!doctype html><html lang="${(meta as { lang: string }).lang}" data-fa-scheme="${scheme}"><head><meta charset="utf-8">` +
    `<style>body{background:${scheme === "light" ? "#fff" : "#27262b"};color:${scheme === "light" ? "#1b1b1b" : "#ecebe4"}}${CSS}</style>` +
    `<script type="application/json" id="fa-translation-meta">${JSON.stringify(meta)}<\/script>` +
    `<script type="application/json" id="fa-edit-cfg">${JSON.stringify({ repo: "o/r" })}<\/script>` +
    `</head><body><div class="main-content" id="main-content"><h1>Page</h1>${BODY}</div>` +
    `<script>${EDIT_LINKS}<\/script><script>${REVIEW_JS}<\/script></body></html>`
  );
}

async function serve(page: Page, opts: { scheme?: "light" | "dark"; meta?: object; review?: { code: number; body?: unknown } } = {}) {
  const rv = opts.review ?? { code: 200, body: review() };
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((u: string) => { (window as unknown as { __opened: string[] }).__opened.push(u); return null; }) as typeof window.open;
  });
  await page.route("https://tr.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/page.html")) return route.fulfill({ contentType: "text/html", body: harness(opts.meta ?? META, opts.scheme ?? "light") });
    if (url.endsWith(REVIEW_URL)) {
      return rv.code === 200
        ? route.fulfill({ contentType: "application/json", body: JSON.stringify(rv.body) })
        : route.fulfill({ status: rv.code, body: "" });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.route(PO_URL, (route) => route.fulfill({ contentType: "text/plain", body: PO, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("https://tr.test/fr/page.html");
}

const openPanel = async (page: Page, id: string) => {
  await page.locator(`.block-actions[data-block="${id}"] > .ba-trigger`).click();
  await expect(page.locator(".fa-block-panel.open")).toBeVisible();
  return page.locator(".fa-block-panel .fa-trf");
};

/** The record inside an issue URL's body, as `parseIssueBody` reads it. */
function recordOf(url: string) {
  const u = new URL(url);
  const body = u.searchParams.get("body")!;
  const fence = "```json translation-adjudication";
  const from = body.indexOf("\n", body.indexOf(fence)) + 1;
  return { u, body, record: JSON.parse(body.slice(from, body.indexOf("\n```", from))) };
}

for (const scheme of ["light", "dark"] as const) {
  test(`each block's panel says its translation state, in words (${scheme} scheme)`, async ({ page }) => {
    await serve(page, { scheme });
    const say = async (id: string, text: string) => {
      const pane = await openPanel(page, id);
      await expect(pane).toContainText(text);
      await page.keyboard.press("Escape");
      await expect(page.locator(".fa-block-panel.open")).toHaveCount(0);
      return pane;
    };
    await say("b-guide", "Machine translation, not reviewed by a person (made by agent)");
    await say("b-rev", "Reviewed by alice on 2026-11-01");
    await say("b-stale", "Reviewed by bob on 2026-10-02; changed since the review");
    await say("b-flag", "mistranslation reported by carol");
    await say("b-off", "Official translation, signed off by Dr. A on 2026-09-01");
    await say("b-none", "No translation catalogue names this block's source (docs/nothing.md)");

    const pane = await openPanel(page, "b-guide");
    await expect(pane.locator(".fa-trf-state")).toHaveAttribute("data-fa-tr-state", "machine");
    // The full review page, from the projection's own path.
    await expect(pane.locator("a.fa-trf-more")).toHaveAttribute("href", "/en/cat-harness/translation-status/review.html");
    // Large targets: every control is at least 44px tall.
    for (const b of await pane.locator(".fa-trf-btn").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Readable in this scheme: the pane's text is not its background's colour.
    const c = await pane.evaluate((n) => ({ fg: getComputedStyle(n).color, bg: getComputedStyle(n.closest(".fa-block-panel")!).backgroundColor }));
    expect(c.fg).not.toBe(c.bg);
  });
}

test("an official translation has nothing to adjudicate; a machine one has both controls", async ({ page }) => {
  await serve(page);
  let pane = await openPanel(page, "b-off");
  await expect(pane.locator(".fa-trf-ok, .fa-trf-fix")).toHaveCount(0);
  await page.keyboard.press("Escape");
  pane = await openPanel(page, "b-guide");
  await expect(pane.getByRole("button", { name: "✓ Translation OK" })).toBeVisible();
  await expect(pane.getByRole("button", { name: "✎ Fix translation" })).toBeVisible();
});

test("translation OK files an acceptable verdict for this catalogue and locale, pinned to its hash", async ({ page }) => {
  await serve(page);
  const pane = await openPanel(page, "b-guide");
  await pane.getByRole("button", { name: "✓ Translation OK" }).click();
  const link = pane.locator("a.fa-trf-open");
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([href]);
  const { u, body, record } = recordOf(href);
  expect(u.origin + u.pathname).toBe("https://github.com/o/r/issues/new");
  expect(u.searchParams.get("labels")).toBe("translation-adjudication");
  expect(u.searchParams.get("title")).toBe("[translation review] demo: 1 acceptable");
  expect(body).toContain("By filing this issue, I (its author) adjudicate");
  expect(record).toEqual({
    $schema: "translation-adjudication/v1",
    repository: "o/r",
    layer: "demo",
    translations: "translations",
    items: [{ catalogue: "docs/guide", locale: "fr", verdict: "acceptable", poHash: HASH }],
  });
});

test("fix translation lists only this block's strings, and files each typed one as a suggestion", async ({ page }) => {
  await serve(page);
  const pane = await openPanel(page, "b-guide");
  await pane.getByRole("button", { name: "✎ Fix translation" }).click();
  const dlg = page.locator("dialog.fa-trf-dialog");
  await expect(dlg).toBeVisible();
  const items = dlg.locator(".fa-trf-strings > li");
  await expect(items).toHaveCount(2);
  await expect(dlg).toContainText("Hello, reader.");
  await expect(dlg).toContainText("Save [button]");
  await expect(dlg).not.toContainText("Elsewhere.");
  // The catalogue fetched is the one the site was built from: no changed-since warning.
  await expect(dlg.locator(".fa-trf-warn")).toHaveCount(0);

  // Nothing typed: nothing filed.
  await dlg.getByRole("button", { name: "Make the GitHub issue" }).click();
  await expect(dlg).toContainText("Type at least one suggestion first.");

  await items.nth(1).getByLabel("Your suggestion").fill("Enregistrer");
  await dlg.getByLabel("Note (optional)").fill("a button label");
  await dlg.getByRole("button", { name: "Make the GitHub issue" }).click();
  const href = (await dlg.locator("a.fa-trf-open").getAttribute("href"))!;
  const { u, record } = recordOf(href);
  expect(u.searchParams.get("title")).toBe("[translation review] demo: 1 mistranslation");
  expect(record.items).toEqual([
    {
      catalogue: "docs/guide",
      locale: "fr",
      verdict: "mistranslation",
      poHash: HASH,
      suggestions: [{ msgid: "Save", msgctxt: "button", current: "Sauver", suggested: "Enregistrer" }],
      note: "a button label",
    },
  ]);
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toBeHidden();
});

test("past GitHub's URL limit the issue text is copied instead, and the link carries no body", async ({ page }) => {
  await serve(page, { review: { code: 200, body: review(200) } });
  const pane = await openPanel(page, "b-guide");
  await pane.getByRole("button", { name: "✓ Translation OK" }).click();
  await expect(pane.locator("a.fa-trf-open")).toHaveCount(0);
  await expect(pane.getByRole("button", { name: "1. Copy the issue text" })).toBeVisible();
  const short = new URL((await pane.getByRole("link", { name: "2. Open the issue and paste" }).getAttribute("href"))!);
  expect(short.searchParams.get("body")).toBeNull();
  expect(short.searchParams.get("labels")).toBe("translation-adjudication");
  expect(await pane.locator("textarea.fa-trf-body").inputValue()).toContain("```json translation-adjudication");
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([]);
});

test("a site that publishes no review says so; a source-language page has no translation pane", async ({ page }) => {
  await serve(page, { review: { code: 404 } });
  const pane = await openPanel(page, "b-guide");
  await expect(pane).toContainText("This site publishes no translation review.");
});

test("a source-language page shows no translation pane", async ({ page }) => {
  await serve(page, { meta: { ...META, lang: "en", translationSource: "" } });
  await openPanel(page, "b-guide");
  await expect(page.locator(".fa-block-panel .fa-trf")).toHaveCount(0);
  await expect(page.locator('.ba-ic[data-pane="translation"]')).toHaveCount(0);
});
