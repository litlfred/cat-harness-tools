#!/usr/bin/env python3
"""Compare two `bun test --reporter=junit` reports and fail on new failures.

Usage: compare-test-failures.py <base.xml> <head.xml>

A test is identified by file + describe path + name. It exits 1 when a test
fails on head but did not fail on base (including a test head added that fails),
and exits 0 otherwise. Every head failure is listed either way, so existing
failures stay visible. Writes a Markdown summary to $GITHUB_STEP_SUMMARY when set.
"""
import os
import sys
import xml.etree.ElementTree as ET


def failures(path):
    root = ET.parse(path).getroot()
    out = set()

    def walk(node, trail):
        for child in node:
            if child.tag == "testsuite":
                walk(child, trail + [child.get("name", "")])
            elif child.tag == "testcase":
                if child.find("failure") is not None or child.find("error") is not None:
                    out.add(" > ".join(trail + [child.get("name", "")]))

    walk(root, [])
    total = int(root.get("tests", 0))
    return out, total


base, base_total = failures(sys.argv[1])
head, head_total = failures(sys.argv[2])
new = sorted(head - base)
fixed = sorted(base - head)
still = sorted(head & base)

lines = [
    "## cat-harness-tools tests: PR vs main",
    "",
    f"| | tests | failing |",
    f"|---|---|---|",
    f"| main | {base_total} | {len(base)} |",
    f"| this PR | {head_total} | {len(head)} |",
    "",
    f"**New failures: {len(new)}** · fixed by this PR: {len(fixed)} · failing on both: {len(still)}",
    "",
]
for title, items in (("New failures (fail this check)", new),
                     ("Fixed by this PR", fixed),
                     ("Failing on main too (not caused by this PR)", still)):
    if items:
        lines += [f"<details{' open' if items is new else ''}><summary>{title}: {len(items)}</summary>", ""]
        lines += [f"- `{t}`" for t in items]
        lines += ["", "</details>", ""]

report = "\n".join(lines)
print(report)
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a", encoding="utf-8") as f:
        f.write(report + "\n")
sys.exit(1 if new else 0)
