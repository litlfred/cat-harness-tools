import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ONE ANSWER PER QUESTION, in a browser — owner, 2026-11-17, on a workshop's
 * policy track: an answer typed under a walkthrough step's "Policy
 * questions for the table" did not show in the Discussion view's lab (#lab-who-decides,
 * #lab-map), which still offered the empty "Our answer…" box.
 *
 * The workshop is drawn by `workshop-answers-fixture.build.ts` with the REAL
 * journeys viewer; the shipped `present.js` keeps the answers.
 */

let SITE = "";
let PATHS: { walkthrough: string; discuss: string; sheets: string; map: string } = { walkthrough: "", discuss: "", sheets: "", map: "" };
test.beforeAll(() => {
  const out = mkdtempSync(join(tmpdir(), "workshop-answers-"));
  execFileSync("bun", ["run", fileURLToPath(new URL("./workshop-answers-fixture.build.ts", import.meta.url)), out], { stdio: "pipe" });
  SITE = join(out, "site");
  PATHS = JSON.parse(readFileSync(join(SITE, "paths.json"), "utf8"));
});

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

async function serve(context: BrowserContext): Promise<void> {
  await context.route("http://site.test/**", (route) => {
    let p = join(SITE, decodeURIComponent(new URL(route.request().url()).pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: TYPES[extname(p)] ?? "application/octet-stream", body: readFileSync(p) });
  });
}

const QUESTION = "What legal basis lets a record held at home be opened by a clinician abroad, on the family’s consent?";
// Every box for the question, shown or not: the lab shows one step at a time, so its other step's box is hidden.
const box = (page: Page) => page.locator(`textarea[aria-label="Our answer: ${QUESTION}"]`);

test.describe("a question's answer is one answer, on the walkthrough and in the lab", () => {
  test.beforeEach(async ({ context }) => serve(context));

  test("typed on the walkthrough step, it shows in every lab step that lists the question", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.walkthrough}`);
    await box(page).fill("adasdasd");
    await page.goto(`http://site.test/${PATHS.discuss}#lab-who-decides`);
    // Once under "Who decides", once under "Map": both show it.
    await expect(box(page)).toHaveCount(2);
    for (const b of await box(page).all()) await expect(b).toHaveValue("adasdasd");
  });

  test("typed in the lab, it shows on the walkthrough step, and in the lab's other step at once", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.discuss}#lab-map`);
    await expect(box(page)).toHaveCount(2);
    await box(page).filter({ visible: true }).fill("Article 9 consent");
    for (const b of await box(page).all()) await expect(b).toHaveValue("Article 9 consent");
    await page.goto(`http://site.test/${PATHS.walkthrough}`);
    await expect(box(page)).toHaveValue("Article 9 consent");
  });

  test("a Discussion view open in another tab follows what the walkthrough types", async ({ context }) => {
    const discuss = await context.newPage();
    await discuss.goto(`http://site.test/${PATHS.discuss}#lab-who-decides`);
    const walk = await context.newPage();
    await walk.goto(`http://site.test/${PATHS.walkthrough}`);
    await box(walk).fill("typed elsewhere");
    for (const b of await box(discuss).all()) await expect(b).toHaveValue("typed elsewhere");
  });

  test("an answer kept under the old key (step and position) is moved to the question's own key, not lost", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.walkthrough}`);
    const name = await box(page).getAttribute("name");
    const was = await box(page).getAttribute("data-jv-was");
    expect(was).toBe("track:q:J4.0b:0");
    expect(name).not.toBe(was);
    await page.evaluate((k) => localStorage.setItem(`jv:${k}`, "kept from before"), was);
    await page.goto(`http://site.test/${PATHS.discuss}#lab-who-decides`);
    for (const b of await box(page).all()) await expect(b).toHaveValue("kept from before");
    expect(await page.evaluate(([n, w]) => [localStorage.getItem(`jv:${n}`), localStorage.getItem(`jv:${w}`)], [name, was])).toEqual(["kept from before", null]);
  });
});

/**
 * THE JOURNEY MAP IS FOLDED INTO HOW IT WORKS — owner, 2026-11-17: map/ and
 * its tab are gone; the old address lands on how/.
 */
test.describe("the journey map, folded into How it works", () => {
  test.beforeEach(async ({ context }) => serve(context));

  test("the old map/ address lands on How it works, and no page offers a Journey map", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.map}`);
    await expect(page).toHaveURL(/\/workshops\/track\/how\/$/);
    await expect(page.locator(".jp-tab.is-on")).toContainText("How it works");
    await expect(page.locator(".jp-tab", { hasText: "Journey map" })).toHaveCount(0);
    await page.goto(`http://site.test/${PATHS.walkthrough}`);
    await expect(page.locator(".jp-tab", { hasText: "Journey map" })).toHaveCount(0);
  });
});

/**
 * THE TABLE SHEETS ARE A PANEL OF THE DISCUSSION — owner, 2026-11-17: the
 * sheets/ page and its tab are gone, folded into the lab's summary step as an
 * expanding panel; the old address lands on it, open.
 */
test.describe("the Table sheets, folded into the discussion", () => {
  test.beforeEach(async ({ context }) => serve(context));

  test("the old sheets/ address lands on the summary step with the panel open", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.sheets}`);
    await expect(page).toHaveURL(/\/workshops\/track\/discuss\/#sheets$/);
    const panel = page.locator("details[data-jp-sheets]");
    await expect(panel).toHaveJSProperty("open", true);
    await expect(page.locator('[data-jp-lab-step="summary"]')).toBeVisible();
    await expect(page.locator('[data-jp-lab-step="who-decides"]')).toBeHidden();
    await expect(panel.locator("#sheet-s1")).toBeVisible();
  });

  test("an old anchor to one sheet opens the panel on that sheet", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.sheets}#sheet-s1`);
    await expect(page).toHaveURL(/discuss\/#sheet-s1$/);
    await expect(page.locator("details[data-jp-sheets]")).toHaveJSProperty("open", true);
    await expect(page.locator("#sheet-s1")).toBeInViewport();
  });

  test("on the summary step the panel starts folded, opens on a click, and there is no Table sheets tab", async ({ page }) => {
    await page.goto(`http://site.test/${PATHS.discuss}#lab-summary`);
    const panel = page.locator("details[data-jp-sheets]");
    await expect(panel).toHaveJSProperty("open", false);
    await expect(panel.locator("#sheet-s1")).toBeHidden();
    await panel.locator("summary").click();
    await expect(panel.locator("#sheet-s1")).toBeVisible();
    await expect(page.locator(".jp-tab", { hasText: "Table sheets" })).toHaveCount(0);
  });
});
