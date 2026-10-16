#!/usr/bin/env python3
"""Compare two run-gates.py reports and fail on a gate the PR newly breaks.

Usage: compare-gates.py <base.json> <head.json>

A gate fails the PR when it exits non-zero on head and exited 0 on base, or
when head has a gate base did not run and it fails. A gate red on both is
listed, not counted: it is main's to fix, and failing every PR on it would
teach `|| true`. Exit 2 from a gate is "could not determine" in this
harness's convention; it is reported, and it counts as a failure only when
base determined (0 or 1) and head did not. A gate run-gates.py skipped
(a `skipped` reason, no `exit`) is listed as skipped and never counted; on
base it reads as not run. Writes a Markdown summary to
$GITHUB_STEP_SUMMARY when set.

A gate the CI cone skipped (`unchanged: <sha>` beside `skipped`,
cat-harness-tools#398, bean `4rbc`) was not run because every input that its
green traced run on main `<sha>` read is unchanged. It is listed as
"SKIPPED — inputs unchanged since <sha>", never as a pass. On head it is never
counted. On base it stands for that recorded green run: a head failure
against it is NEW, exactly as against a base that exited 0, because base's
inputs were that green run's.
"""
import json
import os
import sys


def side_cell(entry):
    """One side's cell in the table: its exit, `—` when absent, or the cone's skip."""
    if entry is None:
        return "—"
    if entry.get("unchanged"):
        return f"unchanged since {str(entry['unchanged'])[:12]}"
    return entry.get("exit") if entry.get("exit") is not None else "—"


def base_exit(entry):
    """Base's exit for judging head: a cone skip stands for its recorded green run, 0."""
    if entry is None:
        return None
    if entry.get("unchanged"):
        return 0
    return entry.get("exit")


def main():
    base = json.load(open(sys.argv[1]))
    head = json.load(open(sys.argv[2]))
    rows, new = [], []
    for name in sorted(head):
        if head[name].get("unchanged"):
            # Not run on head: its recorded read set is unchanged (the CI cone).
            rows.append(f"| `{name}` | {side_cell(base.get(name))} | {side_cell(head[name])} | SKIPPED — {head[name]['skipped']} |")
            continue
        if "skipped" in head[name]:
            # Not run on head: it could determine nothing here (run-gates.py).
            # Listed so it is not silently absent; never a verdict either way.
            rows.append(f"| `{name}` | {side_cell(base.get(name))} | — | skipped ({head[name]['skipped']}) |")
            continue
        h = head[name]["exit"]
        b = base_exit(base.get(name))
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
        rows.append(f"| `{name}` | {side_cell(base.get(name))} | {h} | {verdict} |")
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
