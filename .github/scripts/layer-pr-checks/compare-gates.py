#!/usr/bin/env python3
"""Compare two run-gates.py reports and fail on a gate the PR newly breaks.

Usage: compare-gates.py <base.json> <head.json>

A gate fails the PR when it exits non-zero on head and exited 0 on base, or
when head has a gate base did not run and it fails. A gate red on both is
listed, not counted: it is main's to fix, and failing every PR on it would
teach `|| true`. Exit 2 from a gate is "could not determine" in this
harness's convention; it is reported, and it counts as a failure only when
base determined (0 or 1) and head did not. Writes a Markdown summary to
$GITHUB_STEP_SUMMARY when set.
"""
import json
import os
import sys


def main():
    base = json.load(open(sys.argv[1]))
    head = json.load(open(sys.argv[2]))
    rows, new = [], []
    for name in sorted(head):
        h = head[name]["exit"]
        b = base.get(name, {}).get("exit")
        if h == 0:
            verdict = "pass"
        elif b == 0 or b is None:
            verdict = "NEW FAILURE"
            new.append(name)
        elif h == 2 and b in (0, 1):
            verdict = "NEW: could not determine"
            new.append(name)
        else:
            verdict = "failing on main too"
        rows.append(f"| `{name}` | {b if b is not None else '—'} | {h} | {verdict} |")
    lines = ["## Gates: head against main", "", "| gate | main | PR | verdict |", "|---|---|---|---|", *rows, ""]
    if new:
        lines.append(f"**{len(new)} gate(s) newly failing.** Their output tails:")
        for name in new:
            lines += ["", f"### `{name}`", "", "```", head[name]["tail"], "```"]
    summary = "\n".join(lines)
    print(summary)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as f:
            f.write(summary + "\n")
    sys.exit(1 if new else 0)


if __name__ == "__main__":
    main()
