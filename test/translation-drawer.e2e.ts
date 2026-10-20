import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { siteFileFor } from "@litlfred/cat-harness/schemas/cat-harness.ts";
import { HARNESS_ROOT } from "../scripts/lib/roots.ts";

/**
 * The translation drawer — bean `cat-tools-bbnd` (owner, 2026-10-10; built
 * 2026-10-20 on the owner's "do translation drawer").
 *
 * One control beside the coverage badge opens a `fa-qa-panel` drawer with two
 * scopes: THIS PAGE, from the inline `fa-translation-meta`, and THIS SITE, from
 * the instance's `folio-translation-status/v1` projection fetched on open.
 * Officiality is the projection's, computed by the officiality gate's reader,
 * so a disagreement between the PO headers and `status.json` is shown as one.
 *
 * Fixtures are written here, never read off the corpus.
 */

const ROOT = join(HARNESS_ROOT);
const CSS = readFileSync(join(ROOT, siteFileFor(ROOT, "assets/css/docs-ui.css")), "utf8");
const JS = readFileSync(join(ROOT, siteFileFor(ROOT, "assets/js/docs-ui.js")), "utf8");

const STATUS_URL = "/assets/translation-status/index.json";

const STATUS = {
  $schema: "folio-translation-status/v1",
  changedAt: "2026-10-20",
  scope: "cat-harness/translations",
  page: "en/cat-harness/translation-status/",
  locales: [
    {
      locale: "fr", templates: 4, catalogues: 4, entries: 200, translated: 150, fuzzy: 10, untranslated: 40, unreadable: [],
      officiality: { state: "official", signedOffBy: "Dr. A", signedOffAt: "2026-10-01", officialCatalogues: 4, findings: 0 },
    },
    {
      locale: "ar", templates: 4, catalogues: 2, entries: 100, translated: 20, fuzzy: 0, untranslated: 80, unreadable: [],
      officiality: { state: "disagree", officialCatalogues: 1, findings: 1 },
    },
    {
      locale: "zh", templates: 4, catalogues: 1, entries: 50, translated: 0, fuzzy: 0, untranslated: 50, unreadable: [],
      officiality: { state: "unofficial", officialCatalogues: 0, findings: 0 },
    },
  ],
};

const META = {
  lang: "fr",
  translationStatus: "unverified",
  translationSource: "guides/agent-onboarding",
  supportedLocales: ["ar", "zh", "en", "fr", "ru", "es"],
  availableLocales: ["en", "fr"],
  sweep: { run: false },
  statusSrc: STATUS_URL,
};

function harness(meta: object, scheme: "light" | "dark"): string {
  return (
    `<!doctype html><html lang="fr" data-fa-scheme="${scheme}"><head><meta charset="utf-8">` +
    `<style>body{background:${scheme === "light" ? "#fff" : "#27262b"}}${CSS}</style>` +
    `<script type="application/json" id="fa-translation-meta">${JSON.stringify(meta)}<\/script>` +
    `</head><body><div class="main-content" id="main-content"><h1>Page</h1><p>Body.</p></div>` +
    `<script>${JS}<\/script></body></html>`
  );
}

async function serve(page: Page, scheme: "light" | "dark", status: { code: number; body?: unknown }, meta: object = META) {
  await page.route("http://tr.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/page.html")) return route.fulfill({ contentType: "text/html", body: harness(meta, scheme) });
    if (url.endsWith(STATUS_URL)) {
      return status.code === 200
        ? route.fulfill({ contentType: "application/json", body: JSON.stringify(status.body) })
        : route.fulfill({ status: status.code, body: "" });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://tr.test/page.html");
}

const toggle = (p: Page) => p.locator(".fa-translation-badges .fa-tr-drawer-toggle");
const drawer = (p: Page) => p.locator(".fa-tr-drawer");

for (const scheme of ["dark", "light"] as const) {
  test.describe(`the translation drawer (${scheme} scheme)`, () => {
    test("one control opens a drawer with this page's facts and this site's per-locale officiality", async ({ page }) => {
      await serve(page, scheme, { code: 200, body: STATUS });
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(drawer(page)).toBeVisible();
      await expect(drawer(page)).toHaveClass(/fa-qa-panel/);

      const facts = drawer(page).locator(".fa-tr-drawer__facts");
      await expect(facts).toContainText("Translation of");
      await expect(facts).toContainText("guides/agent-onboarding");
      await expect(facts).toContainText("not reviewed by a subject-matter expert");
      await expect(facts).toContainText("Not yet in");

      const row = (l: string) => drawer(page).locator(`tr[data-fa-tr-locale="${l}"]`);
      await expect(row("fr")).toContainText("official, signed off by Dr. A on 2026-10-01");
      await expect(row("fr")).toContainText("150 / 200 (75%)");
      // A disagreement between the two records is shown AS one, never as either side.
      await expect(row("ar").locator("td").last()).toHaveAttribute("data-fa-tr-officiality", "disagree");
      await expect(row("ar")).toContainText("records disagree");
      await expect(row("zh")).toContainText("not signed off");

      await expect(drawer(page).locator(".fa-tr-drawer__more a")).toHaveAttribute("href", "/en/cat-harness/translation-status/");

      // The drawer's text is readable in this scheme: not the colour of its own background.
      const contrast = await drawer(page).evaluate((n) => {
        const cs = getComputedStyle(n);
        return { fg: cs.color, bg: getComputedStyle(document.body).backgroundColor };
      });
      expect(contrast.fg).not.toBe(contrast.bg);
    });

    test("the inverse is reachable: Close, and the control again, both close it", async ({ page }) => {
      await serve(page, scheme, { code: 200, body: STATUS });
      await toggle(page).click();
      await drawer(page).locator(".fa-qa-close").click();
      await expect(drawer(page)).toHaveCount(0);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await toggle(page).click();
      await expect(drawer(page)).toHaveCount(1);
      await toggle(page).click();
      await expect(drawer(page)).toHaveCount(0);
    });

    test("a site that publishes no status says so; a failed load says could-not-determine", async ({ page }) => {
      await serve(page, scheme, { code: 404 });
      await toggle(page).click();
      await expect(drawer(page)).toContainText("This site publishes no translation status.");
      // The page half still answers: absence of the site half does not empty the drawer.
      await expect(drawer(page).locator(".fa-tr-drawer__facts")).toContainText("Language");
    });

    test("the unverified-translation warning opens the same drawer", async ({ page }) => {
      await serve(page, scheme, { code: 200, body: STATUS });
      await page.locator(".fa-translation-warning summary").click();
      await page.locator(".fa-translation-warning__details").click();
      await expect(drawer(page)).toHaveCount(1);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      // Pressed again, it does not open a second drawer.
      await page.locator(".fa-translation-warning__details").click();
      await expect(drawer(page)).toHaveCount(1);
    });

    test("a server error is NOT reported as 'publishes none'", async ({ page }) => {
      await serve(page, scheme, { code: 500 });
      await toggle(page).click();
      await expect(drawer(page)).toContainText("Could not load the translation status (HTTP 500)");
    });
  });
}
