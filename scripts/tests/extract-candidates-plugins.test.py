#!/usr/bin/env python3
"""
Pin the generic half of `scripts/extract-candidates.py`: finding the mounted
layers' extractors by CLASS, choosing a class, and the two errors that keep
an absent or doubled extractor from reading as a document that offers
nothing.

The per-class extractors are not tested here — they live, with their own
tests, in the layers that own those kinds of document (bean saqd, row 6).
This builds two throwaway layers in a temp directory, each with a
declaration and a `scripts/extractors/` file, and points the CLI at them
with `$CAT_HARNESS_EXTRACTOR_ROOTS`.

Run: python3 scripts/tests/extract-candidates-plugins.test.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
EXTRACT = os.path.join(HERE, "..", "extract-candidates.py")

ALPHA = '''
CLASS = "alpha"
PRIORITY = 10
FALLBACK = True
def detect(meta, sections):
    return bool(meta.get("arxiv"))
def extract(sections, meta):
    return [{"kind": "theorem", "formalization_candidate": True, "from": fn}
            for fn, fm, body in sections if "ALPHA" in body]
'''
BETA = '''
CLASS = "beta"
PRIORITY = 50
VALIDATED = False
def detect(meta, sections):
    return "beta" in (meta.get("title") or "")
def extract(sections, meta):
    return [{"kind": "remark", "formalization_candidate": False,
             "title": fm.get("section_title")} for fn, fm, body in sections]
'''


def layer(tmp: str, name: str, files: dict[str, str]) -> str:
    root = os.path.join(tmp, name)
    os.makedirs(os.path.join(root, "scripts", "extractors"))
    with open(os.path.join(root, f"{name}.json"), "w") as fh:
        json.dump({"name": name}, fh)
    for fn, src in files.items():
        with open(os.path.join(root, "scripts", "extractors", fn), "w") as fh:
            fh.write(src)
    return root


def doc(tmp: str, doc_id: str, meta: dict, body: str) -> str:
    d = os.path.join(tmp, "corpus", doc_id)
    os.makedirs(os.path.join(d, "sections"))
    with open(os.path.join(d, "structure.json"), "w") as fh:
        json.dump({"doc_id": doc_id, "source": {"file": "x.pdf", "sha256": "0"}, "metadata": meta}, fh)
    with open(os.path.join(d, "sections", "s1.md"), "w") as fh:
        fh.write('---\nsection_title: "1 Intro"\n---\n' + body)
    return d


def run(roots: list[str], *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, CAT_HARNESS_EXTRACTOR_ROOTS=os.pathsep.join(roots))
    return subprocess.run([sys.executable, EXTRACT, *args], capture_output=True, text=True, env=env)


def main() -> int:
    failures: list[str] = []

    def expect(label: str, cond: bool, detail: str = "") -> None:
        if not cond:
            failures.append(f"{label} {detail}".rstrip())

    with tempfile.TemporaryDirectory() as tmp:
        a = layer(tmp, "layer-a", {"alpha.py": ALPHA, "alpha.test.py": "raise SystemExit('a test is not an extractor')"})
        b = layer(tmp, "layer-b", {"beta.py": BETA})
        paper = doc(tmp, "paper", {"arxiv": "1"}, "ALPHA here\n")
        guide = doc(tmp, "guide", {"title": "a beta doc"}, "ALPHA here too\n")
        other = doc(tmp, "other", {"title": "neither"}, "ALPHA\n")

        r = run([a, b], "--list-classes")
        expect("--list-classes names both", r.returncode == 0 and "alpha" in r.stdout and "beta" in r.stdout, r.stderr)

        r = run([a, b], paper, guide, other, "--json")
        expect("auto-detect run exits 0", r.returncode == 0, r.stderr)
        if r.returncode == 0:
            dec = json.JSONDecoder()
            out, i = [], 0
            while i < len(r.stdout):
                if r.stdout[i].isspace():
                    i += 1
                    continue
                obj, i = dec.raw_decode(r.stdout, i)
                out.append(obj)
            classes = [o["document_class"] for o in out]
            expect("detector by PRIORITY, then FALLBACK", classes == ["alpha", "beta", "alpha"], str(classes))
            expect("VALIDATED is reported", [o["validated"] for o in out] == [True, False, True])
            expect("the extractor's candidates are written",
                   out[0]["summary"] == {"candidates": 1, "by_kind": {"theorem": 1}, "formalization_candidates": 1},
                   str(out[0]["summary"]))

        r = run([a], guide, "--class", "beta", "--json")
        expect("a class no layer provides fails", r.returncode == 2 and '"beta"' in r.stderr, r.stderr)

        r = run([b], other, "--json")
        expect("no claimant and no FALLBACK fails", r.returncode == 2 and "FALLBACK" in r.stderr, r.stderr)

        dup = layer(tmp, "layer-dup", {"alpha.py": ALPHA})
        r = run([a, dup], paper, "--json")
        expect("a class two layers claim fails", r.returncode == 2 and "both" in r.stderr, r.stderr)

        undeclared = os.path.join(tmp, "not-a-layer")
        os.makedirs(os.path.join(undeclared, "scripts", "extractors"))
        with open(os.path.join(undeclared, "scripts", "extractors", "beta.py"), "w") as fh:
            fh.write(BETA)
        r = run([a, undeclared], "--list-classes")
        expect("a directory with no declaration is not a layer", "beta" not in r.stdout, r.stdout)

    if failures:
        print("FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("ok — extractor discovery, detection, VALIDATED and the three refusals")
    return 0


if __name__ == "__main__":
    sys.exit(main())
