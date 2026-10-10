/**
 * The review page (bean txut). Its behaviour was verified in Chromium against
 * a scaffolded folio's preview; these pin the properties a refactor could
 * silently lose.
 */
import { describe, expect, test } from "bun:test";

import { reviewPageHtml, reviewSiteRoot } from "../gen-review-page.js";

const html = reviewPageHtml();

describe("review page", () => {
  test("reads its data when opened, from the preview's own files", () => {
    // Built BEFORE the ChangeSet exists in folio-staging.yml, so it must fetch,
    // from the site root it finds on its own path (folio-assistant#2527).
    expect(html).toContain("var ROOT = reviewSiteRoot(location.pathname, LOCALES);");
    expect(html).toContain('var LOCALES = ["en"];');
    expect(html).not.toMatch(/get\("\.\.\//);
    expect(html).toContain('get(ROOT + "changeset.json")');
    expect(html).toContain('get(ROOT + "staging.json")');
  });

  test("never builds markup from folio content", () => {
    // A block label is folio content; innerHTML would let it become markup.
    expect(html).not.toContain("innerHTML");
    expect(html).toContain("textContent");
  });

  test("says each state in words: no ChangeSet, and no change", () => {
    expect(html).toContain("No ChangeSet on this build");
    expect(html).toContain("No block changed.");
  });

  test("says which published site is the before side, main's or a stacked PR's base (5uuf)", () => {
    expect(html).toContain("st.beforeRef");
    expect(html).toContain('" Before side: " + beforeName');
    expect(html).toContain('"view on " + beforeName');
    expect(html).not.toContain('"view on main"');
  });

  test("one key or one click: j/k and their visible button twins, and a live status", () => {
    expect(html).toContain('id="next"');
    expect(html).toContain('id="prev"');
    expect(html).toContain('e.key === "j"');
    expect(html).toContain('e.key === "k"');
    expect(html).toContain('aria-live="polite"');
  });

  test("change kinds are words, not colours", () => {
    for (const w of ["added", "removed", "reworded", "edited", "moved", "renamed"]) expect(html).toContain(`"${w}"`);
  });

  test("reads review comments, and says when there is no comment data rather than showing none", () => {
    expect(html).toContain('get(ROOT + "review-comments.json")');
    expect(html).toContain("No comment data on this build.");
  });

  test("keeps the three groups that would otherwise vanish, and the tag to start a comment with", () => {
    expect(html).toContain("Comments on blocks this pull request did not change");
    expect(html).toContain("Orphaned: the block these were made on is gone");
    expect(html).toContain("Comments whose tag could not be read");
    expect(html).toContain('"block: " + c.label');
  });

  test("embeds the tested renderers and the registry, not copies of them (d903)", () => {
    expect(html).toContain('get(ROOT + "changeset-text.json")');
    expect(html).toContain("var wordDiff = ");
    expect(html).toContain("var renderInline = ");
    for (const id of ["word", "inline", "side-by-side"]) expect(html).toContain(`"id":"${id}"`);
    expect(html).toContain('<select id="view">');
  });

  test("the viewer's choice is stored only through guarded calls", () => {
    // localStorage throws in a private window; every use sits in a try.
    const uses = html.match(/localStorage\.[a-zA-Z]+\(/g) ?? [];
    expect(uses.length).toBe(2);
    expect(html).toMatch(/try \{ return window\.localStorage\.getItem/);
    expect(html).toMatch(/try \{ window\.localStorage\.setItem/);
  });

  test("loads the rendered list when opened, and says when the build published none (bean bnjs)", () => {
    expect(html).toContain('get(ROOT + "rendered-impact.json")');
    expect(html).toContain("Rendered pages this change alters");
    expect(html).toContain("is not known (which is not the same as none)");
    expect(html).toContain("var renderedModel = ");
  });

  test("shows the build diff under the list, and says when there is none (bean ehh6)", () => {
    expect(html).toContain('get(ROOT + "rendered-measured.json")');
    expect(html).toContain("var measuredModel = ");
    expect(html).toContain("var renderMeasured = ");
    expect(html).toContain("Not measured: this build published no rendered-measured.json");
  });

  test("links documents, the outline and the list of documents from the site root it found (#2527)", () => {
    expect(html).toContain("href(ROOT, c.head, c.label)");
    expect(html).toContain("badgesOf, jumpSection, ROOT)");
    expect(html).toContain("window.location.href = ROOT + page");
    expect(html).toContain('allDocs.href = ROOT + "index.html"');
    // A document's page is the outline's, under the locale; <doc>/index.html only without one.
    expect(html).toContain("function docPage(doc)");
    expect(html).toContain("base + docPage(doc)");
  });
});

describe("reviewSiteRoot — the site root from the review page's own path (#2527)", () => {
  const L = ["en"];
  test("one level up from <root>/review/, the address before the locale", () => {
    expect(reviewSiteRoot("/preview/review/", L)).toBe("../");
    expect(reviewSiteRoot("/smart-ra/STAGING/my-branch/review/index.html", L)).toBe("../");
    expect(reviewSiteRoot("/review/", L)).toBe("../");
  });
  test("two levels up from <root>/<locale>/review/", () => {
    expect(reviewSiteRoot("/preview/en/review/", L)).toBe("../../");
    expect(reviewSiteRoot("/smart-ra/STAGING/my-branch/en/review/index.html", L)).toBe("../../");
    expect(reviewSiteRoot("/en/review/", L)).toBe("../../");
    expect(reviewSiteRoot("/tmp/site/en/review/index.html", L)).toBe("../../");
  });
  test("only a PUBLISHED locale counts: another segment there is the site's own path", () => {
    expect(reviewSiteRoot("/preview/fr/review/", L)).toBe("../");
    expect(reviewSiteRoot("/preview/fr/review/", ["en", "fr"])).toBe("../../");
  });
  test("runs in the page as embedded: no TypeScript survives toString()", () => {
    const fn = new Function(`return (${reviewSiteRoot.toString()});`)() as typeof reviewSiteRoot;
    expect(fn("/x/en/review/", L)).toBe("../../");
  });
});
