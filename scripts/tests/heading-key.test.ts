/**
 * `split_sections` finds an outline heading on its page by comparing
 * `_match_key`s, so a spacing accent in the text layer ("L¨ubeck") must
 * not hide a heading the outline spells "Lübeck".
 *
 * @module scripts/tests/heading-key
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPTS = new URL("..", import.meta.url).pathname;

function py(code: string): unknown {
  const r = Bun.spawnSync(["python3", "-c",
    `import sys, json, importlib.util\nsys.path.insert(0, ${JSON.stringify(SCRIPTS)})\n` +
    `spec = importlib.util.spec_from_file_location("ps", ${JSON.stringify(join(SCRIPTS, "pdf-structure.py"))})\n` +
    `ps = importlib.util.module_from_spec(spec); sys.modules['ps'] = ps; spec.loader.exec_module(ps)\n${code}`]);
  if (r.exitCode !== 0) throw new Error(new TextDecoder().decode(r.stderr));
  return JSON.parse(new TextDecoder().decode(r.stdout));
}

describe("matching outline headings to page lines", () => {
  test("spacing and combining accents compare equal to the composed letter", () => {
    expect(py(`print(json.dumps([ps._match_key(s) for s in ["L\\u00a8ubeck", "L\\u00fcbeck", "Lu\\u0308beck", "  Erd\\u02ddos  "]]))`))
      .toEqual(["lubeck", "lubeck", "lubeck", "erdos"]);
  });

  test("a heading printed with a spacing accent still opens its section", () => {
    const got = py(
      "pages = ['1. Intro\\nbody', '2. Application I\\nmore', '3. Application II: L\\u00a8ubeck formula\\ntext', '4. End\\nfin']\n" +
      "toc = [ps.TocEntry(1, t, p, 'outline', n) for n, t, p in [('1','Intro',1),('2','Application I',2),('3','Application II: L\\u00fcbeck formula',3),('4','End',4)]]\n" +
      "print(json.dumps([[s.title, s.page_start, s.page_end] for s in ps.split_sections(pages, toc)]))",
    );
    expect(got).toEqual([
      ["Intro", 1, 2],
      ["Application I", 2, 3],
      ["Application II: Lübeck formula", 3, 4],
      ["End", 4, 4],
    ]);
  });

  test("an appendix letter on its own line still opens its section", () => {
    const got = py(
      "pages = ['1 Intro\\nbody', 'A\\nProperties of analytic functions\\ntext\\nB.1\\nPolarization\\nmore']\n" +
      "toc = [ps.TocEntry(1, t, p, 'outline', None) for t, p in [('1 Intro',1),('A Properties of analytic functions',2),('B.1 Polarization',2)]]\n" +
      "print(json.dumps([[s.title, s.page_start] for s in ps.split_sections(pages, toc)]))",
    );
    expect(got).toEqual([["1 Intro", 1], ["A Properties of analytic functions", 2], ["B.1 Polarization", 2]]);
  });
});
