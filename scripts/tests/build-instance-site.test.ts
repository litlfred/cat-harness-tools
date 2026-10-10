import { describe, expect, test } from "bun:test";

import { SCRIPT_NAME, siteFields, buildConfig, overrideConfig, ownerRepo, pageUrls, stagingDir, targetOf } from "../build-instance-site.ts";

describe("build-instance-site — the agent-run site recipe (bean n3h9)", () => {
  test("a preview lands under one STAGING/ segment, whatever the branch is called", () => {
    expect(stagingDir("claude/exciting-hawking")).toBe("STAGING/claude-exciting-hawking");
    expect(stagingDir("fix/a b")).toBe("STAGING/fix-a-b");
    expect(() => stagingDir("..")).toThrow();
    expect(() => stagingDir("///")).toThrow();
  });

  test("the base path is read from the remote, https or ssh", () => {
    expect(ownerRepo("https://github.com/litlfred/who-iris")).toEqual({ owner: "litlfred", repo: "who-iris" });
    expect(ownerRepo("git@github.com:litlfred/smart-ra.git")).toEqual({ owner: "litlfred", repo: "smart-ra" });
    expect(ownerRepo("http://local_proxy@127.0.0.1:1/git/litlfred/x")).toBeUndefined();
  });

  test("the build config drops the remote theme it cannot fetch, and nothing else", () => {
    const c = "title: X\nremote_theme: just-the-docs/just-the-docs\nplugins:\n  - jekyll-remote-theme\n  - jekyll-feed\n";
    expect(buildConfig(c)).toBe("title: X\nplugins:\n  - jekyll-seo-tag\n  - jekyll-feed\n");
  });

  test("the override says what the declaration and the remote say, first description line only", () => {
    const o = overrideConfig({ title: 'WHO "IRIS"', description: "Line one\nline two", baseurl: "/who-iris", url: "https://litlfred.github.io" });
    expect(o).toContain('title: "WHO \\"IRIS\\""');
    expect(o).toContain('description: "Line one"');
    expect(o).not.toContain("line two");
    expect(o).toContain('baseurl: "/who-iris"');
  });

  test("a link resolves relative to its page, a base-rooted one against the base, an outside one is a miss", () => {
    expect(targetOf("../a/b.html#x", "docs/p/index.html", "/r/")).toBe("docs/a/b.html");
    expect(targetOf("/r/catalogue/", "index.html", "/r/")).toBe("catalogue/");
    expect(targetOf("/concepts/x.html", "index.html", "/r/")).toBe("outside-base");
    expect(targetOf("https://example.org/", "index.html", "/r/")).toBeUndefined();
    expect(targetOf("mailto:a@b", "index.html", "/r/")).toBeUndefined();
    expect(targetOf("#top", "index.html", "/r/")).toBeUndefined();
    expect(targetOf("//cdn.example/x.js", "index.html", "/r/")).toBeUndefined();
  });

  test("urls are read by an HTML parser: a quote-concatenated string in a script is not a link", async () => {
    const html = `<a href="a.html">x</a><img src="i.png"><form action="f/"></form><script>var u = "<a href='" + base + "x.html'>";</script>`;
    expect(await pageUrls(html)).toEqual(["a.html", "i.png", "f/"]);
  });

  test("--pre and --source-step take package script names, never commands", () => {
    for (const ok of ["check:catalogue", "site:catalogue", "iris.pages-check_2"]) expect(SCRIPT_NAME.test(ok)).toBe(true);
    for (const bad of ["bun run x", "a;rm -rf /", "$(id)", "a && b", "-x", ""]) expect(SCRIPT_NAME.test(bad)).toBe(false);
  });

  test("the declaration is read for name, title and description only, whatever kinds it names (bean qump)", () => {
    const text = JSON.stringify({ name: "x", title: "X", description: "d", directories: [{ id: "c", path: "c/", graphTypologies: ["not-registered-here"] }] });
    expect(siteFields(text, "x.json")).toEqual({ name: "x", title: "X", description: "d" });
    expect(() => siteFields("{", "x.json")).toThrow(/not valid JSON/);
    expect(() => siteFields("{}", "x.json")).toThrow(/declares no name/);
  });
});
