#!/usr/bin/env python3
"""
extract-candidates — Stage B of the ingestion pipeline.

Reads a Stage-A artefact (`structure.json` + `sections/*.md` from
pdf-structure.py) and proposes what the document *offers*, writing
`candidates.json` next to it.

    uploads/<doc-id>/candidates.json     ingest-candidates/v1

**These are proposals, never content.** A theorem extracted from someone
else's paper is a claim attributed to a source, not a folio claim — it
reaches `content/` only when an agent or the author promotes it, per
`document-intake.md §Stage 4`. Nothing here writes to `content/`, and
nothing here creates Lean. See docs/proposals/rag-document-ingestion.md
§7-bis for why that boundary is load-bearing.

Which candidates a document offers depends on its class, and each class's
extractor lives in the layer that owns that kind of document, under its
`scripts/extractors/` (the contract is above `layer_roots` below). This
file is what every class shares: reading the sections, choosing a class,
counting, writing. Class is auto-detected — each extractor may claim a
document, and one may be the fallback — unless forced with `--class`;
`--list-classes` prints what the mounted layers provide. A class whose
extractor declares `VALIDATED = False` has not been run against a real
document of its kind and says so in its output.

Usage:
    extract-candidates.py uploads/<doc-id>/ [...]
    extract-candidates.py --corpus uploads/ --class <class>
    extract-candidates.py --list-classes
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
from typing import Any

SCHEMA = "ingest-candidates/v1"

# ---------------------------------------------------------------- extractors
#
# What a document OFFERS depends on what kind of document it is, and that
# knowledge belongs to the layer that owns the kind — not here. This file is
# the machinery every class shares (read the sections, pick a class, count,
# write `candidates.json`); the per-class extractors live in the mounted
# layers, one file each, at
#
#     <instance root>/scripts/extractors/*.py
#
# A file there is an extractor when it defines:
#
#     CLASS: str                         the class name `--class` takes
#     extract(sections, meta) -> list    the candidates, as dicts with at
#                                        least `kind` and
#                                        `formalization_candidate`
#
# and optionally:
#
#     detect(meta, sections) -> bool     claims a document during
#                                        auto-detection
#     PRIORITY: int = 100                detectors are asked lowest first
#     FALLBACK: bool = False             the class taken when no detector
#                                        claims the document (one at most)
#     VALIDATED: bool = True             False while the class has not been
#                                        run against a real document of its
#                                        kind; reported as `"validated"`
#
# A class claimed by two layers is an error, never first-found-wins: which
# extractor runs must not depend on the order the layers are mounted in. A
# class no mounted layer provides is an error that says so, never an empty
# `candidates.json` — an absent extractor must not read as a document that
# offers nothing.

EXTRACTORS_DIR = os.path.join("scripts", "extractors")
TOOLS_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SKIP_DIRS = {"node_modules", ".git", "_build", "dist", "build"}


class ExtractorError(Exception):
    """A missing, duplicated or malformed extractor."""


def _is_instance_root(d: str) -> bool:
    """A directory holding `<name>.json` whose `name` is `<name>`."""
    try:
        entries = os.listdir(d)
    except OSError:
        return False
    for fn in entries:
        if not fn.endswith(".json") or fn.startswith("index."):
            continue
        try:
            with open(os.path.join(d, fn), encoding="utf-8") as fh:
                if json.load(fh).get("name") == fn[: -len(".json")]:
                    return True
        except (OSError, ValueError, AttributeError):
            continue
    return False


def _children(d: str) -> list[str]:
    try:
        return sorted(
            os.path.join(d, e) for e in os.listdir(d)
            if not e.startswith(".") and e not in _SKIP_DIRS
            and os.path.isdir(os.path.join(d, e))
        )
    except OSError:
        return []


def _locked_paths(scope: str) -> list[str]:
    """Instance paths an `index.lock.json` in `scope` records (a mount an override moved deeper)."""
    try:
        with open(os.path.join(scope, "index.lock.json"), encoding="utf-8") as fh:
            lock = json.load(fh)
    except (OSError, ValueError):
        return []
    out = []
    for inst in lock.get("instances", []) if isinstance(lock, dict) else []:
        if isinstance(inst, dict) and isinstance(inst.get("path"), str) and not inst.get("hydrated"):
            out.append(os.path.join(scope, inst["path"]))
    return out


def layer_roots() -> list[str]:
    """Instance roots to look for extractors in.

    `$CAT_HARNESS_EXTRACTOR_ROOTS` (os.pathsep-separated) when set; otherwise
    the checkout this layer is mounted in: the directory above this layer,
    its children and grandchildren (a repository whose instance sits one
    level down), and whatever its `index.lock.json` mounted elsewhere.
    """
    env = os.environ.get("CAT_HARNESS_EXTRACTOR_ROOTS")
    if env is not None:
        cands = [p for p in env.split(os.pathsep) if p]
    else:
        scope = os.path.dirname(TOOLS_ROOT)
        cands = [scope]
        for c in _children(scope):
            cands.append(c)
            cands.extend(_children(c))
        cands.extend(_locked_paths(scope))
    seen: set[str] = set()
    out = []
    for c in cands:
        r = os.path.realpath(c)
        if r in seen:
            continue
        seen.add(r)
        if os.path.isdir(os.path.join(r, EXTRACTORS_DIR)) and _is_instance_root(r):
            out.append(r)
    return out


def _load(path: str):
    name = "cat_extractor_" + re.sub(r"\W", "_", os.path.relpath(path, "/"))
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ExtractorError(f"{path}: cannot be loaded as a Python module")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def discover_extractors(roots: list[str] | None = None) -> dict[str, Any]:
    """Every extractor the mounted layers provide, keyed by CLASS."""
    found: dict[str, Any] = {}
    origin: dict[str, str] = {}
    for root in layer_roots() if roots is None else roots:
        d = os.path.join(root, EXTRACTORS_DIR)
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".py") or fn.endswith(".test.py") or fn.startswith("_"):
                continue
            path = os.path.join(d, fn)
            mod = _load(path)
            cls = getattr(mod, "CLASS", None)
            if not isinstance(cls, str) or not callable(getattr(mod, "extract", None)):
                raise ExtractorError(f"{path}: an extractor defines CLASS (str) and extract(sections, meta)")
            if cls in found:
                raise ExtractorError(f'class "{cls}" is provided by both {origin[cls]} and {path}')
            found[cls] = mod
            origin[cls] = path
    fallbacks = [c for c, m in found.items() if getattr(m, "FALLBACK", False)]
    if len(fallbacks) > 1:
        raise ExtractorError(f"more than one FALLBACK class: {', '.join(sorted(fallbacks))}")
    return found


def require_extractor(extractors: dict[str, Any], cls: str):
    mod = extractors.get(cls)
    if mod is None:
        have = ", ".join(sorted(extractors)) or "none"
        raise ExtractorError(
            f'no mounted layer provides the extractor class "{cls}" (classes found: {have}). '
            f"Mount the layer whose {EXTRACTORS_DIR}/ defines it, or set CAT_HARNESS_EXTRACTOR_ROOTS."
        )
    return mod


def clean(s: str, limit: int = 600) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit]


def read_sections(docdir: str) -> list[tuple[str, dict[str, str], str]]:
    """Return (filename, front-matter, body) per section .md."""
    sdir = os.path.join(docdir, "sections")
    if not os.path.isdir(sdir):
        return []
    out = []
    for fn in sorted(os.listdir(sdir)):
        if not fn.endswith(".md"):
            continue
        raw = open(os.path.join(sdir, fn), encoding="utf-8", errors="replace").read()
        fm: dict[str, str] = {}
        body = raw
        if raw.startswith("---\n"):
            end = raw.find("\n---\n", 4)
            if end != -1:
                for line in raw[4:end].splitlines():
                    if ":" in line:
                        k, v = line.split(":", 1)
                        fm[k.strip()] = v.strip().strip('"')
                body = raw[end + 5:]
        out.append((fn, fm, body))
    return out


def detect_class(meta: dict[str, Any], sections, extractors: dict[str, Any]) -> str:
    """The first extractor, by PRIORITY, whose `detect` claims the document; else the FALLBACK."""
    ordered = sorted(extractors.items(), key=lambda kv: (getattr(kv[1], "PRIORITY", 100), kv[0]))
    for cls, mod in ordered:
        det = getattr(mod, "detect", None)
        if callable(det) and det(meta, sections):
            return cls
    for cls, mod in ordered:
        if getattr(mod, "FALLBACK", False):
            return cls
    have = ", ".join(sorted(extractors)) or "none"
    raise ExtractorError(f"no extractor claims this document and none is FALLBACK (classes found: {have}); pass --class")


def process(docdir: str, forced: str | None, extractors: dict[str, Any] | None = None) -> dict[str, Any] | None:
    spath = os.path.join(docdir, "structure.json")
    if not os.path.exists(spath):
        return None
    art = json.load(open(spath))
    meta = art.get("metadata", {})
    sections = read_sections(docdir)
    if extractors is None:
        extractors = discover_extractors()
    cls = forced or detect_class(meta, sections, extractors)
    mod = require_extractor(extractors, cls)
    cands = mod.extract(sections, meta)

    by_kind: dict[str, int] = {}
    for c in cands:
        by_kind[c["kind"]] = by_kind.get(c["kind"], 0) + 1

    return {
        "_schema": SCHEMA,
        "doc_id": art.get("doc_id"),
        "document_class": cls,
        "validated": bool(getattr(mod, "VALIDATED", True)),
        "source": {
            "structure_sha256": art.get("source", {}).get("sha256"),
            "file": art.get("source", {}).get("file"),
        },
        "provenance": {
            "title": meta.get("title"),
            "authors": meta.get("authors_raw"),
            "arxiv": meta.get("arxiv"),
            "doi": meta.get("doi"),
        },
        "disposition": "proposals only — promote via document-intake Stage 4; "
                       "nothing here is folio content and nothing here creates Lean",
        "summary": {
            "candidates": len(cands),
            "by_kind": by_kind,
            "formalization_candidates": sum(1 for c in cands if c["formalization_candidate"]),
        },
        "candidates": cands,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Stage B — propose content candidates from a Stage-A artefact")
    ap.add_argument("docdirs", nargs="*")
    ap.add_argument("--corpus", help="root containing <doc-id>/ directories")
    ap.add_argument("--class", dest="cls", help="force document class (one a mounted layer's extractor provides)")
    ap.add_argument("--json", action="store_true", help="print to stdout, write nothing")
    ap.add_argument("--list-classes", action="store_true", help="print the classes the mounted layers provide, and where")
    args = ap.parse_args()

    try:
        extractors = discover_extractors()
        if args.list_classes:
            for c, m in sorted(extractors.items()):
                print(f"{c:<16} {m.__file__}")
            return 0
        if args.cls:
            require_extractor(extractors, args.cls)
    except ExtractorError as e:
        print(f"extract-candidates: {e}", file=sys.stderr)
        return 2

    dirs = list(args.docdirs)
    if args.corpus:
        dirs += sorted(
            os.path.join(args.corpus, d) for d in os.listdir(args.corpus)
            if os.path.isdir(os.path.join(args.corpus, d))
            and os.path.exists(os.path.join(args.corpus, d, "structure.json"))
        )
    if not dirs:
        ap.error("no document directories given")

    tot = fml = docs = 0
    for d in dirs:
        try:
            res = process(d, args.cls, extractors)
        except ExtractorError as e:
            print(f"extract-candidates: {d}: {e}", file=sys.stderr)
            return 2
        if res is None:
            continue
        docs += 1
        tot += res["summary"]["candidates"]
        fml += res["summary"]["formalization_candidates"]
        if args.json:
            print(json.dumps(res, indent=2))
        else:
            with open(os.path.join(d, "candidates.json"), "w") as fh:
                json.dump(res, fh, indent=1)
            s = res["summary"]
            if s["candidates"]:
                kinds = " ".join(f"{k}={v}" for k, v in sorted(s["by_kind"].items()))
                print(f"{res['doc_id']:<34} {s['candidates']:>4}  {kinds}")

    if not args.json:
        print(f"\n{docs} documents, {tot} candidates, "
              f"{fml} flagged as formalization candidates", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
