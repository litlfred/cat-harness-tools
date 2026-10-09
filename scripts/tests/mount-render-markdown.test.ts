/**
 * A mount renders the markdown pages it publishes — bean `mw5z`.
 *
 * Measured on who-iris's published site before this: `style-guide.md` served
 * as raw markdown and `style-guide.html` a 404, because a mounted directory is
 * copied after Jekyll and nothing rendered it.
 *
 * @module scripts/tests/mount-render-markdown.test
 */
import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { renderMountedMarkdown } from "../mount-instance-docs.ts";
import { siteDir } from "@litlfred/cat-harness/schemas/cat-harness.ts";

function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mount-md-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

describe("renderMountedMarkdown", () => {
  it("renders a hand-written page beside its source, tables and links included", async () => {
    const dir = site({
      "style-guide.md": "# The WHO style guide\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nSee [the agents page](style-guide-agents.md#rules).\n",
      "style-guide-agents.md": "# Working on a voice\n",
    });
    try {
      const { rendered } = await renderMountedMarkdown(dir);
      expect(rendered).toEqual(["style-guide-agents.html", "style-guide.html"]);
      const html = readFileSync(join(dir, "style-guide.html"), "utf-8");
      expect(html).toContain("<title>The WHO style guide</title>");
      expect(html).toContain("<table>");
      expect(html).toContain('href="style-guide-agents.html#rules"');
      expect(existsSync(join(dir, "style-guide.md"))).toBe(true); // the source stays reachable
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never overwrites a generated page, and leaves a Jekyll page (front matter) alone", async () => {
    const dir = site({
      "index.html": "<html><body>generated</body></html>",
      "kg-to-portal.md": "# source of a generated page\n",
      "kg-to-portal.html": "<html><body>generated</body></html>",
      "site-home.md": "---\nlayout: default\npermalink: /\n---\n\n{% include landing.html %}\n",
      "README.md": "# Docs\n",
    });
    try {
      const { rendered } = await renderMountedMarkdown(dir);
      expect(rendered).toEqual(["README.html"]);
      expect(readFileSync(join(dir, "kg-to-portal.html"), "utf-8")).toContain("generated");
      expect(readFileSync(join(dir, "index.html"), "utf-8")).toContain("generated");
      expect(existsSync(join(dir, "site-home.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a README becomes the directory's index when it has none, in subdirectories too", async () => {
    const dir = site({ "sub/README.md": "# Sub\n" });
    try {
      expect((await renderMountedMarkdown(dir)).rendered).toEqual(["sub/README.html", "sub/index.html"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a link leaving the mount becomes a repository URL; one leaving the instance is unresolved", async () => {
    const instance = mkdtempSync(join(tmpdir(), "mount-md-inst-"));
    const dest = mkdtempSync(join(tmpdir(), "mount-md-site-"));
    try {
      const text = "# Agents\n\n[library](../library/) [agents](../AGENTS.md#top) [sibling](style-guide.md) [root](../../AGENTS.md) [web](https://example.org/x.md) [assets](assets/) [guide](guide/)\n";
      // The instance's site directory, composed in one place (`site-dir-single-answer`).
      const docs = join(instance, siteDir({ name: "who-iris" }));
      mkdirSync(join(docs, "assets"), { recursive: true });
      mkdirSync(join(docs, "guide"), { recursive: true });
      writeFileSync(join(docs, "guide", "README.md"), "# Guide\n");
      writeFileSync(join(docs, "a.md"), text);
      writeFileSync(join(dest, "a.md"), text);
      const { rendered, unresolved } = await renderMountedMarkdown(dest, {
        dir: docs,
        instanceDir: instance,
        repository: "example/who-iris",
      });
      expect(rendered).toEqual(["a.html"]);
      const html = readFileSync(join(dest, "a.html"), "utf-8");
      expect(html).toContain('href="https://github.com/example/who-iris/tree/HEAD/library/"');
      expect(html).toContain('href="https://github.com/example/who-iris/blob/HEAD/AGENTS.md#top"');
      expect(html).toContain('href="style-guide.html"');
      expect(html).toContain('href="https://example.org/x.md"');
      // A directory with no page of its own is cited by repository; one with a README renders as a page.
      expect(html).toContain('href="https://github.com/example/who-iris/tree/HEAD/docs/assets/"');
      expect(html).toContain('href="guide/"');
      expect(unresolved).toEqual(['a.md: "../../AGENTS.md" climbs out of the instance']);
    } finally {
      rmSync(instance, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
