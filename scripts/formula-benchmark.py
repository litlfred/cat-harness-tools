#!/usr/bin/env python3
"""formula-benchmark.py — how much of a paper's mathematics its ingested text holds.

An arXiv entry with its LaTeX source fetched (`arxiv-source.py`) has the
author's own formulas as an answer key, the way a PDF outline is the answer key
for `toc-benchmark.py`. This scores each ingested section's text against the
formulas of the `\\section` it pairs with.

Pairing uses the overlay's title gate (`latex-math-overlay.py`): exact
normalised title, else a close match at `TITLE_RATIO`. Never by position.

## Matching — the two-stage check of Horn & Keuper (arXiv:2512.09874)

Each formula is canonicalised, then looked for in the canonicalised section:

1. **exact** — the canonical formula is a substring of the canonical text;
2. **fuzzy** — otherwise, the best approximate-substring Levenshtein distance
   (Sellers' algorithm: free start and end in the text), divided by the
   formula's length. Below `--threshold` it counts as found.

The paper does not publish its threshold; 0.2 is ours and is a flag. Their
third stage, an LLM judge of semantic equivalence, is not run here: it needs a
model at run time, and the two string stages are what it was checking anyway.

Canonical form: a small table maps common commands to the characters a PDF
text layer prints (`\\phi` → φ, `\\to` → →, `\\mathbb{R}` → R), then
backslashes, `^ _ { }`, `$` and whitespace go. So a text layer that reads
`φ: R3 → S2` is credited for `\\phi:\\mathbb{R}^3\\to S^2`. A command not in
the table survives as its bare name, which a text layer will rarely match:
the score is a lower bound on what the text holds, not an upper one.

## Third state

A section the overlay already replaced (`text_source: latex`) is the LaTeX
itself, so scoring it against the LaTeX measures nothing. It is reported as
`overlaid` and left out of the averages, as are sections whose title matches no
`\\section` and sections with no formulas. An entry with no source is
`skipped` with the reason, never `recall: 0`.

Metrics per section and per entry (micro over formulas):
  recall_exact   share of formulas found by stage 1
  recall         share found by stage 1 or 2
  mean_distance  mean normalised distance over all formulas (0 for exact)

Output is a report, not KG content: it is written to
`build/benchmarks/formula-benchmark.json` unless `--json` says otherwise, and a
path inside a declared graph directory is refused (`_benchmark_guard.py`).

Usage:
  python3 scripts/formula-benchmark.py library/arxiv-0705.1468v1
  python3 scripts/formula-benchmark.py library/arxiv-* --json build/benchmarks/formula.json
  python3 scripts/formula-benchmark.py ENTRY --source e-print.tgz --threshold 0.15

Exit: 0 every entry scored or skipped with a reason, 1 an entry failed.
"""

from __future__ import annotations

import argparse
import difflib
import importlib.util
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _benchmark_guard import assert_not_declared_graph_path  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "latex_math_overlay", os.path.join(os.path.dirname(os.path.abspath(__file__)), "latex-math-overlay.py"))
ovl = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules["latex_math_overlay"] = ovl  # its dataclasses look themselves up here
_spec.loader.exec_module(ovl)

SCHEMA = "formula-benchmark/v1"
THRESHOLD = 0.2
MIN_LEN = 2  # a canonical formula shorter than this ("x") is found anywhere

_FORMULA = re.compile(
    r"\$\$(.+?)\$\$|\\\[(.+?)\\\]|\\\((.+?)\\\)|(?<![\\$])\$(?!\$)(.+?)(?<!\\)\$"
    r"|\\begin\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}(.*?)\\end\{\5\*?\}",
    re.S,
)

_GREEK = ("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau "
          "upsilon phi chi psi omega").split()
_GLYPH = dict(zip(_GREEK, "αβγδεζηθικλμνξπρστυφχψω"))
_GLYPH.update(zip((g.capitalize() for g in _GREEK), "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΠΡΣΤΥΦΧΨΩ"))
_GLYPH.update({
    "varepsilon": "ε", "varphi": "φ", "vartheta": "θ", "varrho": "ρ", "varsigma": "ς", "ell": "ℓ",
    "to": "→", "rightarrow": "→", "mapsto": "↦", "leftarrow": "←", "Rightarrow": "⇒", "iff": "⇔",
    "leq": "≤", "le": "≤", "geq": "≥", "ge": "≥", "neq": "≠", "ne": "≠", "approx": "≈", "equiv": "≡",
    "sim": "∼", "simeq": "≃", "cong": "≅", "times": "×", "cdot": "·", "otimes": "⊗", "oplus": "⊕",
    "circ": "∘", "pm": "±", "mp": "∓", "infty": "∞", "partial": "∂", "nabla": "∇", "sum": "∑",
    "prod": "∏", "int": "∫", "oint": "∮", "in": "∈", "notin": "∉", "subset": "⊂", "subseteq": "⊆",
    "supset": "⊃", "cup": "∪", "cap": "∩", "emptyset": "∅", "forall": "∀", "exists": "∃",
    "langle": "⟨", "rangle": "⟩", "ldots": "...", "cdots": "···", "dots": "...", "hbar": "ℏ",
    "wedge": "∧", "vee": "∨", "neg": "¬", "setminus": "∖", "mid": "|", "prime": "′",
})
# Commands that only style their argument: the text layer prints the argument.
_STYLE = re.compile(r"\\(?:math(?:bb|bf|rm|cal|frak|sf|it|scr)|bm|boldsymbol|operatorname|text(?:rm|bf|it)?|mbox|hat|bar|tilde|widetilde|overline|vec|dot)\b\s*")
_SPACING = re.compile(r"\\(?:left|right|big|Big|bigg|Bigg)[lr]?\b|\\[,;:! ]|\\(?:quad|qquad|displaystyle|nonumber|label\{[^}]*\})")
_CMD = re.compile(r"\\([A-Za-z]+)")


def canon(s: str) -> str:
    """The canonical form both sides are compared in."""
    s = ovl._unligature(s)
    s = _SPACING.sub(" ", s)
    s = _STYLE.sub("", s)
    s = _CMD.sub(lambda m: _GLYPH.get(m.group(1), m.group(1)), s)
    s = s.replace("−", "-").replace("&", "")
    return re.sub(r"[\s\\^_{}$]+", "", s)


def formulas(tex: str) -> list[str]:
    """Every formula in a LaTeX section, in order, without its delimiters."""
    tex = ovl.strip_comments(tex)
    out = []
    for m in _FORMULA.finditer(tex):
        body = next(g for g in (m.group(1), m.group(2), m.group(3), m.group(4), m.group(6)) if g is not None)
        if body.strip():
            out.append(body.strip())
    return out


def substring_distance(needle: str, hay: str) -> int:
    """Least edit distance between `needle` and any substring of `hay` (Sellers)."""
    prev = list(range(len(needle) + 1))
    best = prev[-1]
    for ch in hay:
        cur = [0]
        for i, nc in enumerate(needle, 1):
            cur.append(min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (nc != ch)))
        best = min(best, cur[-1])
        prev = cur
        if best == 0:
            break
    return best


def score(formula: str, text_canon: str, threshold: float) -> dict:
    c = canon(formula)
    if len(c) < MIN_LEN:
        return {"formula": formula, "stage": "too-short"}
    if c in text_canon:
        return {"formula": formula, "stage": "exact", "distance": 0.0}
    d = substring_distance(c, text_canon) / len(c)
    return {"formula": formula, "stage": "fuzzy" if d <= threshold else "missed", "distance": round(d, 3)}


def summarise(rows: list[dict]) -> dict:
    scored = [r for r in rows if r["stage"] != "too-short"]
    if not scored:
        return {"formulas": 0}
    n = len(scored)
    return {
        "formulas": n,
        "recall_exact": round(sum(r["stage"] == "exact" for r in scored) / n, 3),
        "recall": round(sum(r["stage"] in ("exact", "fuzzy") for r in scored) / n, 3),
        "mean_distance": round(sum(r["distance"] for r in scored) / n, 3),
    }


def bench_entry(entry: str, source: str | None, threshold: float, library: str | None = None) -> dict:
    rep: dict = {"entry": entry, "status": "skipped", "reason": "", "sections": []}
    spath = os.path.join(entry, "structure.json")
    if not os.path.exists(spath):
        rep["reason"] = "no structure.json — run a PDF rung first"
        return rep
    with open(spath) as fh:
        structure = json.load(fh)
    if structure.get("granularity") == "page":
        rep["reason"] = "page granularity — no titled sections to pair a \\section with"
        return rep
    src = source or os.path.join(entry, ovl.SOURCE_DIRNAME)
    if source is None and not os.path.exists(src) and library:
        src = os.path.join(library, os.path.basename(entry), ovl.SOURCE_DIRNAME)
    if not os.path.exists(src):
        rep["reason"] = "no LaTeX source — fetch it with arxiv-source.py"
        return rep
    files = ovl.read_source(src)
    main = ovl.main_tex(files)
    if main is None:
        rep["reason"] = f"source holds {len(files)} .tex file(s), none with \\documentclass and \\begin{{document}}"
        return rep
    _, secs = ovl.tex_sections(ovl.inline_inputs(main, files))
    by_title = {ovl.norm_title(t.title): t for t in secs}

    every: list[dict] = []
    for s in structure.get("sections", []):
        row: dict = {"id": s["id"], "title": s.get("title", "")}
        rep["sections"].append(row)
        want = ovl.norm_title(s.get("title", ""))
        tex = by_title.get(want)
        if tex is None and want:
            close = difflib.get_close_matches(want, list(by_title), n=1, cutoff=ovl.TITLE_RATIO)
            tex = by_title[close[0]] if close else None
        if tex is None:
            row["result"] = "no matching \\section"
            continue
        mdpath = os.path.join(entry, "sections", f"{s['id']}.md")
        if not os.path.exists(mdpath):
            row["result"] = "section file missing"
            continue
        with open(mdpath, encoding="utf-8") as fh:
            fm, text = ovl.split_frontmatter(fh.read())
        if re.search(r"^text_source:\s*latex\s*$", fm, re.M):
            row["result"] = "overlaid — the text is the LaTeX, not a measurement"
            continue
        fs = formulas(tex.body)
        if not fs:
            row["result"] = "no formulas"
            continue
        text_canon = canon(text)
        rows = [score(f, text_canon, threshold) for f in fs]
        row.update({"result": "scored", **summarise(rows), "matches": rows})
        every += rows

    rep["status"] = "scored"
    rep.update(summarise(every))
    rep["reason"] = f"{sum(r.get('result') == 'scored' for r in rep['sections'])} of {len(rep['sections'])} sections scored"
    return rep


def main() -> int:
    ap = argparse.ArgumentParser(description="score ingested section text against the paper's LaTeX formulas")
    ap.add_argument("entries", nargs="+", help="library/<bib-slug>/ directories")
    ap.add_argument("--source", help="the LaTeX source (one entry only); default <entry>/source/")
    ap.add_argument("--library", help="library root holding <slug>/source/ for a staged entry")
    ap.add_argument("--threshold", type=float, default=THRESHOLD, help="normalised distance counted as found (default 0.2)")
    ap.add_argument("--json", default="build/benchmarks/formula-benchmark.json",
                    help="write the full report here (default: build/benchmarks/formula-benchmark.json; never a graph directory)")
    ap.add_argument("--stdout-json", action="store_true", help="print the report as JSON instead of a table")
    args = ap.parse_args()
    if args.source and len(args.entries) > 1:
        ap.error("--source names one entry's source; give one entry")
    if args.json:
        assert_not_declared_graph_path(args.json, os.getcwd())

    reports = []
    for e in args.entries:
        try:
            reports.append(bench_entry(e.rstrip("/"), args.source, args.threshold, args.library))
        except Exception as exc:  # one bad bundle must not stop a library run
            reports.append({"entry": e, "status": "failed", "reason": f"{type(exc).__name__}: {exc}", "sections": []})

    scored = [r for r in reports if r["status"] == "scored" and r.get("formulas")]
    n = sum(r["formulas"] for r in scored)
    overall = {
        "_schema": SCHEMA, "threshold": args.threshold, "entries": len(reports), "entries_scored": len(scored),
        "formulas": n,
        "recall_exact": round(sum(r["recall_exact"] * r["formulas"] for r in scored) / n, 3) if n else None,
        "recall": round(sum(r["recall"] * r["formulas"] for r in scored) / n, 3) if n else None,
        "mean_distance": round(sum(r["mean_distance"] * r["formulas"] for r in scored) / n, 3) if n else None,
    }
    out = {**overall, "reports": reports}
    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, "w") as fh:
            json.dump(out, fh, indent=1)
    if args.stdout_json:
        print(json.dumps(out, indent=1))
    else:
        for r in reports:
            m = f"recall {r['recall']:.2f} (exact {r['recall_exact']:.2f}) over {r['formulas']}" if r.get("formulas") else ""
            print(f"{r['status']:<8} {os.path.basename(r['entry']):<34} {m}  {r['reason']}")
        if n:
            print(f"\n{n} formulas in {len(scored)} entries: recall {overall['recall']}, "
                  f"exact {overall['recall_exact']}, mean distance {overall['mean_distance']}", file=sys.stderr)
    return 1 if any(r["status"] == "failed" for r in reports) else 0


if __name__ == "__main__":
    sys.exit(main())
