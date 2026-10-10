/**
 * The formula benchmark — `formula-benchmark.py`.
 *
 * Each claim is made against an entry and a LaTeX source this file builds, so
 * the expected recall is known before the script runs.
 *
 * @module scripts/tests/formula-benchmark
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPTS = new URL("..", import.meta.url).pathname;
const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Fixture {
  root: string;
  entry: string;
  tgz: string;
}

/** An entry whose sections hold `text`, and a source whose sections hold `tex`. */
function fixture(text: Record<string, string>, tex: Record<string, string>, fm: string[] = []): Fixture {
  const root = mkdtempSync(join(tmpdir(), "fbench-"));
  made.push(root);
  const entry = join(root, "library", "arxiv-0705.1468v1");
  mkdirSync(join(entry, "sections"), { recursive: true });
  const sections = Object.keys(text).map((title, i) => ({ id: `sec-00${i}`, title, level: 1 }));
  writeFileSync(join(entry, "structure.json"), JSON.stringify({ _schema: "pdf-structure/v1", sections }));
  for (const [i, t] of Object.values(text).entries()) {
    writeFileSync(join(entry, "sections", `sec-00${i}.md`), `---\nsection_id: sec-00${i}\n${fm.join("\n")}${fm.length ? "\n" : ""}---\n${t}\n`);
  }
  const src = join(root, "src");
  mkdirSync(src);
  const body = Object.entries(tex)
    .map(([title, t]) => `\\section{${title}}\n${t}\n`)
    .join("");
  writeFileSync(join(src, "main.tex"), `\\documentclass{article}\n\\begin{document}\n${body}\\end{document}\n`);
  if (Bun.spawnSync(["sh", "-c", "tar czf ../e-print.tgz ."], { cwd: src }).exitCode !== 0) throw new Error("tar failed");
  return { root, entry, tgz: join(root, "e-print.tgz") };
}

// biome-ignore lint/suspicious/noExplicitAny: a JSON report
function bench(f: Fixture, ...args: string[]): { code: number; out: any; err: string } {
  const r = Bun.spawnSync(["python3", join(SCRIPTS, "formula-benchmark.py"), f.entry, "--source", f.tgz, "--stdout-json", ...args], {
    cwd: f.root,
  });
  const out = new TextDecoder().decode(r.stdout);
  return { code: r.exitCode, out: out ? JSON.parse(out) : null, err: new TextDecoder().decode(r.stderr) };
}

const INTRO = "Introduction";
const LATEX = "We study $\\phi:\\mathbb{R}^3\\to S^2$ and $x^2+y^2=z^2$ and also $\\int_0^1 f(t)\\,dt = \\frac{\\pi}{4}$.";

describe("formula-benchmark", () => {
  test("a text layer is scored formula by formula: exact, fuzzy and missed", () => {
    // The first two survive the text layer exactly (up to the glyph table);
    // the third loses its limits and fraction, so it is at best a near miss.
    const f = fixture({ [INTRO]: "We study φ: R3 → S2 and x2 + y 2 = z2 and also ∫ f (t)dt = π/4." }, { [INTRO]: LATEX });
    const { code, out } = bench(f);
    expect(code).toBe(0);
    const sec = out.reports[0].sections[0];
    expect(sec.result).toBe("scored");
    expect(sec.formulas).toBe(3);
    expect(sec.matches.map((m: { stage: string }) => m.stage).slice(0, 2)).toEqual(["exact", "exact"]);
    expect(sec.matches[2].stage).not.toBe("exact");
    expect(sec.recall_exact).toBeCloseTo(2 / 3, 2);
    expect(out.formulas).toBe(3);
  });

  test("the threshold decides fuzzy against missed", () => {
    const f = fixture({ [INTRO]: "and x2 + y2 = z3 there" }, { [INTRO]: "and $x^2+y^2=z^2$ there" });
    expect(bench(f, "--threshold", "0.2").out.reports[0].sections[0].matches[0].stage).toBe("fuzzy");
    expect(bench(f, "--threshold", "0.05").out.reports[0].sections[0].matches[0].stage).toBe("missed");
  });

  test("an overlaid section is not scored against itself", () => {
    const f = fixture({ [INTRO]: LATEX }, { [INTRO]: LATEX }, ["text_source: latex"]);
    const { out } = bench(f);
    expect(out.reports[0].sections[0].result).toMatch(/^overlaid/);
    expect(out.formulas).toBe(0);
    expect(out.recall).toBeNull();
  });

  test("sections are paired by title, never by position", () => {
    const f = fixture({ "Rational maps": "x2 + y2 = z2" }, { "Something else entirely": "$x^2+y^2=z^2$" });
    const { out } = bench(f);
    expect(out.reports[0].sections[0].result).toBe("no matching \\section");
    expect(out.formulas).toBe(0);
  });

  test("an entry with no source is skipped with a reason, not scored zero", () => {
    const f = fixture({ [INTRO]: "x" }, { [INTRO]: "$x$" });
    const r = Bun.spawnSync(["python3", join(SCRIPTS, "formula-benchmark.py"), f.entry, "--stdout-json"], { cwd: f.root });
    const out = JSON.parse(new TextDecoder().decode(r.stdout));
    expect(r.exitCode).toBe(0);
    expect(out.reports[0].status).toBe("skipped");
    expect(out.reports[0].reason).toContain("arxiv-source.py");
    expect(out.reports[0].recall).toBeUndefined();
  });

  test("the report is refused inside a graph directory", () => {
    const f = fixture({ [INTRO]: "x2" }, { [INTRO]: "$x^2$" });
    const { code, err } = bench(f, "--json", "library/formula.json");
    expect(code).not.toBe(0);
    expect(err).toContain("declared graph directory");
  });
});
