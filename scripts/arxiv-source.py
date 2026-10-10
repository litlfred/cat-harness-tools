#!/usr/bin/env python3
"""arxiv-source.py — fetch an arXiv paper's LaTeX source into its library entry.

The source is what `latex-math-overlay.py` reads. It is fetched once and kept
at `<entry>/source/e-print` with a `source.json` beside it recording the URL,
sha256, byte count and fetch time, so a re-ingest reads the same bytes and
never re-asks arXiv.

The arXiv id is read from the entry's directory name (`arxiv-<id>v<n>`), the
convention `ingest-document.ts`'s slug uses. An entry that does not carry one
is skipped and says so; a title search is `find-arxiv-mirrors.py`'s job, and a
fuzzy match is not a source.

Network: outbound HTTPS to arxiv.org. A sandbox that denies it gets an
`unreachable` line per entry and exit 2, never a partial file.

arXiv asks automated clients for no more than one request every three
seconds; `--delay` defaults to that.

Usage:
  python3 scripts/arxiv-source.py library/arxiv-0705.1468v1
  python3 scripts/arxiv-source.py library/arxiv-* --delay 3
  python3 scripts/arxiv-source.py library/arxiv-0705.1468v1 --refetch

Exit: 0 fetched or already present, 1 an entry failed, 2 arXiv unreachable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SOURCE_DIRNAME = "source"
EPRINT = "https://arxiv.org/e-print/{id}"
UA = "cat-harness-tools-arxiv-source/1.0 (+https://github.com/litlfred/cat-harness-tools)"
_ID = re.compile(r"^arxiv-(?:(\d{4}\.\d{4,5}(?:v\d+)?)|([a-z][a-z\-]*?(?:\.[A-Za-z]{2})?)-(\d{7}(?:v\d+)?))$")


def arxiv_id(entry: str) -> str | None:
    """`arxiv-0705.1468v1` → `0705.1468v1`; an old-style `arxiv-hep-th-9901001v2`
    → `hep-th/9901001v2` (the LAST hyphen before the seven digits is the slash,
    since categories carry hyphens of their own); anything else `None`."""
    m = _ID.match(os.path.basename(entry.rstrip("/")))
    if not m:
        return None
    return m.group(1) or f"{m.group(2)}/{m.group(3)}"


def fetch(entry: str, refetch: bool) -> tuple[str, str]:
    ident = arxiv_id(entry)
    if ident is None:
        return "skipped", "directory name carries no arXiv id"
    sdir = os.path.join(entry, SOURCE_DIRNAME)
    target = os.path.join(sdir, "e-print")
    if os.path.exists(target) and not refetch:
        return "present", target
    url = EPRINT.format(id=ident)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
            ctype = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return "failed", f"{url}: HTTP {e.code}"
    except (urllib.error.URLError, OSError) as e:
        return "unreachable", f"{url}: {e}"
    # arXiv answers a PDF-only submission (no source deposited) with the PDF.
    if body[:5] == b"%PDF-":
        return "skipped", "arXiv holds no LaTeX source for this paper (PDF-only submission)"
    os.makedirs(sdir, exist_ok=True)
    tmp = target + ".part"
    with open(tmp, "wb") as fh:
        fh.write(body)
    os.replace(tmp, target)
    with open(os.path.join(sdir, "source.json"), "w") as fh:
        json.dump({
            "url": url,
            "content_type": ctype,
            "sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
            "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }, fh, indent=1)
    return "fetched", f"{len(body)} bytes"


def main() -> int:
    ap = argparse.ArgumentParser(description="fetch arXiv LaTeX source into library entries")
    ap.add_argument("entries", nargs="+")
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests (arXiv asks for 3)")
    ap.add_argument("--refetch", action="store_true")
    args = ap.parse_args()
    worst = 0
    asked = False
    for e in args.entries:
        if asked:
            time.sleep(args.delay)
        status, detail = fetch(e, args.refetch)
        asked = status in ("fetched", "failed", "unreachable") or (status == "skipped" and "PDF-only" in detail)
        print(f"{status:<11} {os.path.basename(e.rstrip('/')):<34} {detail}")
        if status == "unreachable":
            return 2
        if status == "failed":
            worst = 1
    return worst


if __name__ == "__main__":
    sys.exit(main())
