#!/usr/bin/env python3
"""An unharnessed base branch is an empty baseline, never a prepare-base error.

Usage:
  empty-baseline.py check <root> <out-dir> [<main-sha>]
  empty-baseline.py summary <from.json> <tier> <key>

cat-harness-tools#1139. On the first PR that adds the harness to a fresh fork
(dth-sc#1, dth-phc, dth-pc, dth-sfp), `main` holds only the upstream files:
no `index.lock.json` and no `index.config.json`. `prepare-base` used to fail
in "Mount every instance from the root's lock" with ENOENT on
`fa/index.lock.json`, skipping the PR-side shards and failing `compare` with a
missing `results-base-1` artefact.

When `<root>` is missing `index.lock.json` or `index.config.json`, `check`
writes an empty baseline (`junit.xml` with 0 tests, `gates.json` with `{}`,
and `from.json` with `"no_harness": true`) to `<out-dir>`, records
`empty=true` in `$GITHUB_OUTPUT`, and writes
"main has no harness: compared against an empty baseline" to
`$GITHUB_STEP_SUMMARY`. `prepare-base` then hands `<out-dir>` to `compare` as
`base-answer` and skips mounting and running the base side, while the PR
side's shards run and are judged against the empty baseline.
"""
from datetime import datetime, timezone
import json
import os
import sys

HARNESS_FILES = ("index.lock.json", "index.config.json")
EMPTY_JUNIT = '<?xml version="1.0" encoding="utf-8"?>\n<testsuites tests="0" failures="0"/>\n'
EMPTY_SUMMARY_LINE = "main has no harness: compared against an empty baseline"


def missing_harness_files(root):
    """Which of `index.lock.json` and `index.config.json` are absent under `root`."""
    return [name for name in HARNESS_FILES if not os.path.isfile(os.path.join(root, name))]


def has_harness(root):
    """True when `root` carries both `index.lock.json` and `index.config.json`."""
    return len(missing_harness_files(root)) == 0


def write_empty_baseline(out_dir, main_sha="", missing=()):
    """Write the empty junit.xml, gates.json, and from.json that stand for an unharnessed base."""
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "junit.xml"), "w", encoding="utf-8") as f:
        f.write(EMPTY_JUNIT)
    with open(os.path.join(out_dir, "gates.json"), "w", encoding="utf-8") as f:
        f.write("{}\n")
    meta = {"no_harness": True, "main": main_sha, "missing": list(missing)}
    with open(os.path.join(out_dir, "from.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
        f.write("\n")
    return meta


def check(root, out_dir, main_sha=""):
    """Check `root`; when unharnessed, write the empty baseline to `out_dir` and return True."""
    missing = missing_harness_files(root)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    gh_sum = os.environ.get("GITHUB_STEP_SUMMARY")
    if not missing:
        if gh_out:
            with open(gh_out, "a", encoding="utf-8") as f:
                f.write("empty=false\n")
        return False
    write_empty_baseline(out_dir, main_sha=main_sha, missing=missing)
    absent = ", ".join(f"`{m}`" for m in missing)
    msg = f"{EMPTY_SUMMARY_LINE} (absent on base: {absent})"
    print(msg)
    if gh_sum:
        with open(gh_sum, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write("empty=true\n")
    return True


def format_summary(from_path, tier, key, now=None):
    """Format the compare job's step-summary section describing the base answer."""
    try:
        with open(from_path, encoding="utf-8") as fp:
            f = json.load(fp)
    except (OSError, ValueError):
        f = {}
    if tier == "no-harness" or f.get("no_harness"):
        missing = f.get("missing") or list(HARNESS_FILES)
        absent = ", ".join(f"`{m}`" for m in missing)
        lines = [
            "### Main's side: empty baseline",
            "",
            f"{EMPTY_SUMMARY_LINE} (absent on base: {absent}; 0 tests and 0 gates on main, so every PR-side failure counts as new, and every PR-side pass counts as a pass).",
        ]
        if f.get("main"):
            lines += ["", f"- main: `{f['main']}`"]
        return "\n".join(lines)
    lines = ["### Main's side: stored, not recomputed", ""]
    if tier == "exact":
        lines.append("Main's answer for exactly these inputs was cached; the base side was not run again.")
    else:
        lines.append(
            f"Main's answer for these exact inputs was not cached, so this PR is judged against the answer stored for **{tier}**, and main was not recomputed."
        )
    if f:
        age = ""
        try:
            at = datetime.fromisoformat(f["pinned_at"].replace("Z", "+00:00"))
            ref_now = now if now is not None else datetime.now(timezone.utc)
            age = f", {int((ref_now - at).total_seconds() // 3600)} h ago"
        except (KeyError, ValueError):
            pass
        lines += [
            "",
            f"- main: `{f.get('main', '?')}`, pinned at {f.get('pinned_at', '?')}{age}",
            f"- index: `{f.get('index') or 'the caller'}`; run: {f.get('run', '?')}",
        ]
    else:
        lines += ["", f"- stored before its provenance was kept: `{key}`"]
    if tier != "exact":
        lines += [
            "",
            "It is the answer for this PR's own base commit; a failure that reached it after that run through the index, a lower layer or a branch-kept graph shows here as new. If a NEW failure below is not this PR's, re-run **all** jobs: a second attempt recomputes main exactly.",
        ]
    return "\n".join(lines)


def main():
    cmd = sys.argv[1]
    if cmd == "check":
        root, out_dir = sys.argv[2], sys.argv[3]
        main_sha = sys.argv[4] if len(sys.argv) > 4 else ""
        check(root, out_dir, main_sha)
    elif cmd == "summary":
        from_path, tier, key = sys.argv[2], sys.argv[3], sys.argv[4]
        text = format_summary(from_path, tier, key)
        print(text)
        gh_sum = os.environ.get("GITHUB_STEP_SUMMARY")
        if gh_sum:
            with open(gh_sum, "a", encoding="utf-8") as f:
                f.write(text + "\n")
    else:
        raise SystemExit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main()
