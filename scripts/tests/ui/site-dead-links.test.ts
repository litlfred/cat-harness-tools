/**
 * The built-site link check, and the two repointings `--fix` makes
 * (litlfred/folio-assistant#2741).
 *
 * Calibrated: removing the locale fallback from `repointFor` fails "a missing
 * translation falls back"; making `sourceFor` take the first of several hits
 * fails "an ambiguous source is left dead".
 */
import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { blobUrl, checkSite, isInternal, sourceFor, tailIndex, targetOf, withoutLocale } from "../../site-dead-links.ts";

function site(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "site-dead-links-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

describe("which links are checked", () => {
  it("skips external, anchor, Liquid and script-template values", () => {
    for (const v of ["https://x.org/a", "mailto:a@b", "#top", "//cdn/x.js", "{{ '/a' | relative_url }}", "viewer/${a.url}"]) {
      expect(isInternal(v)).toBe(false);
    }
    expect(isInternal("../a/b.html")).toBe(true);
  });

  it("resolves relative and base-path-absolute links to site paths", () => {
    expect(targetOf("docs/x/page.html", "../y/z.md#s", "")).toBe("docs/y/z.md");
    expect(targetOf("a.html", "/folio-assistant/b/c.svg", "/folio-assistant")).toBe("b/c.svg");
    expect(targetOf("a.html", "../../out.html", "")).toBeUndefined();
  });

  it("drops only translated-locale segments", () => {
    expect(withoutLocale("es/assets/img/x.svg")).toBe("assets/img/x.svg");
    expect(withoutLocale("docs/process/fr/p.html")).toBe("docs/process/p.html");
    expect(withoutLocale("en/cat-harness/x/")).toBeUndefined();
  });
});

describe("--fix repoints what has one answer and reports the rest", () => {
  it("a missing translation falls back to the untranslated target", () => {
    const root = site({
      "assets/img/x.svg": "<svg/>",
      "core/es/page.html": '<img src="../../es/assets/img/x.svg"><a href="../../nowhere.html">x</a>',
    });
    const r = checkSite({ site: root, basePath: "", fix: true, resolveSource: () => undefined });
    expect(r.repointed.map((x) => x.why)).toEqual(["locale"]);
    expect(readFileSync(join(root, "core/es/page.html"), "utf-8")).toContain('src="../../assets/img/x.svg"');
    expect(r.dead.map((d) => d.target)).toEqual(["nowhere.html"]);
  });

  it("a source file goes to GitHub at the pinned commit", () => {
    const idx = tailIndex(["cat-harness/skills/sdlc/crdm/crdm-detect.md", "cat-harness/AGENTS.md", "smart-base/AGENTS.md"]);
    const file = sourceFor("docs/skills/sdlc/crdm/crdm-detect.md", idx)!;
    expect(file).toBe("cat-harness/skills/sdlc/crdm/crdm-detect.md");
    const origins = [{ path: "cat-harness", repository: "litlfred/cat-harness", ref: "abc", upstreamRoot: "" }];
    expect(blobUrl(file, origins)).toBe("https://github.com/litlfred/cat-harness/blob/abc/skills/sdlc/crdm/crdm-detect.md");
  });

  it("an ambiguous source is left dead", () => {
    const idx = tailIndex(["cat-harness/docs/AGENTS.md", "smart-base/docs/AGENTS.md"]);
    expect(sourceFor("docs/AGENTS.md", idx)).toBeUndefined();
  });

  it("without --fix nothing is rewritten", () => {
    const root = site({ "assets/x.svg": "", "es/p.html": '<img src="../es/assets/x.svg">' });
    const r = checkSite({ site: root, basePath: "", fix: false, resolveSource: () => undefined });
    expect(r.repointed).toEqual([]);
    expect(r.dead).toHaveLength(1);
  });
});
