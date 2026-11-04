"""The errors a gate printed, as keys that survive a re-run: one module for both runners.

`run-root-gates.py` (the index's own gates) and `run-gates.py` (every declared
gate) record `diagnostics` beside each gate's exit code, and
`compare-gates.py` fails a PR on a diagnostic head holds more times than base.
That is what lets a gate already red on main still judge a PR: without it a
gate red on both sides is "failing on main too" whatever the PR added
(folio-assistant-core#630 added a wrong-direction reference to
`check:reference-direction:check`, red on main, and passed).

Each key is `<file or heading>: <code, rule or finding>`, with line numbers,
columns and counts left out, so an error that only moved, or a count that
went down, is not new. Five shapes are read:

- `tsc`: `file(line,col): error TSnnnn: message`, and the file-less `error TSnnnn: message`;
- ESLint's stylish report: a file line, then `  line:col  error  message  rule`;
- the harness's qa-results baseline (`scripts/qa-results.ts`), printed by every
  `--against <ref>` gate: `new in <family>:` then `  + {json}` per new finding;
- a harness `✗ <finding>` line, unless it opens with a count (`✗ 6 finding(s):`);
- the indented items under such a counted `✗ N ...:` heading, keyed by the
  heading with its count dropped (`libraries:check`).

A gate that printed none of them is judged by its exit code alone, as before.
"""
import os
import re

# `path(line,col): error TS1234: message`, and tsc's file-less `error TS5083: ...`.
TSC = re.compile(r"^(?P<file>\S.*?)\((?P<line>\d+),(?P<col>\d+)\): error (?P<code>TS\d+): (?P<msg>.*)$")
TSC_GLOBAL = re.compile(r"^error (?P<code>TS\d+): (?P<msg>.*)$")
# ESLint stylish: a file line, then `  90:31  error  message  rule` under it. A
# parse error carries no rule.
ESLINT_FILE = re.compile(r"^(?P<file>/\S.*)$")
ESLINT_ERROR = re.compile(r"^\s+(?P<line>\d+):(?P<col>\d+)\s+error\s+(?P<msg>.+?)(?:\s{2,}(?P<rule>\S+))?\s*$")
# qa-results.ts: `    new in <family>:` then `      + {json}`.
QA_FAMILY = re.compile(r"^\s+new in (?P<family>.+):$")
QA_ADDED = re.compile(r"^\s+\+ (?P<entry>\{.*)$")
# A harness finding: `✗ <text>`. One that opens with a count is a heading.
CROSS = re.compile(r"^\s*✗ (?P<text>.+?)\s*$")
COUNTED = re.compile(r"^\d+\s")
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def rel(path, root):
    """`path` relative to `root` when it lies under it, so both sides' keys agree."""
    root = os.path.abspath(root)
    if os.path.isabs(path) and (path == root or path.startswith(root + os.sep)):
        return os.path.relpath(path, root)
    return path


# What differs between two runs of the same finding: a temporary directory's
# random name, and a duration.
TMP = re.compile(r"(/tmp|/var/folders)/[^/\s'\"]+")
DURATION = re.compile(r"\b\d+(?:\.\d+)?\s?(?:ms|s|min)\b")


def unroot(text, root):
    """`text` with the absolute root, temporary directories and durations made
    run-independent, so two checkouts' keys agree."""
    root = os.path.abspath(root)
    text = text.replace(root + os.sep, "").replace(root, ".")
    return DURATION.sub("<t>", TMP.sub(r"\1/<tmp>", text))


def diagnostics(text, root):
    """Every error `text` reports, as line-free keys, in the order printed (repeats kept)."""
    out = []
    eslint_file = family = heading = None
    for raw in text.splitlines():
        line = ANSI.sub("", raw).rstrip()
        if not line.strip():
            eslint_file = family = heading = None
            continue
        m = TSC.match(line)
        if m:
            out.append(f"{rel(m['file'], root)}: {m['code']}: {m['msg'].strip()}")
            continue
        m = TSC_GLOBAL.match(line)
        if m:
            out.append(f"-: {m['code']}: {m['msg'].strip()}")
            continue
        m = ESLINT_FILE.match(line)
        if m:
            eslint_file = rel(m["file"], root)
            continue
        m = ESLINT_ERROR.match(line)
        if m and eslint_file:
            out.append(f"{eslint_file}: {m['rule'] or 'parse'}: {m['msg'].strip()}")
            continue
        m = QA_FAMILY.match(line)
        if m:
            family = m["family"].strip()
            continue
        m = QA_ADDED.match(line)
        if m and family:
            out.append(f"new in {family}: {unroot(m['entry'], root)}")
            continue
        m = CROSS.match(line)
        if m:
            t = unroot(m["text"], root)
            if COUNTED.match(t):
                # `✗ 6 finding(s):` heads a list; its count is left out of the key.
                heading = COUNTED.sub("", t, count=1) if t.endswith(":") else None
            else:
                out.append(f"✗ {t}")
                heading = None
            continue
        if heading and line[:1].isspace():
            out.append(f"{heading} {unroot(line.strip(), root)}")
            continue
        heading = None
    return out
