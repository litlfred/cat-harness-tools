#!/usr/bin/env python3
"""Main's own verdict, from the answer a push to main computed (post-merge QA).

Usage: main-verdict.py <answer-dir>

<answer-dir> holds `gates.json` (run-gates.py's report, the shards joined) and
`junit.xml` (`bun test --reporter=junit`): main's side as a push to the
caller's main ran it, or as it was kept for exactly these inputs. Nothing is
compared and nothing is run here: a PR is judged against main by
compare-gates.py and compare-test-failures.py; this says whether main ITSELF
is green, for `layer-main-qa.yml` (owner, 2026-10-30, "Both").

A gate is red when it ran and exited anything but 0 or 78 (78 is "not
applicable in this root", `scripts/lib/not-applicable.ts`); 2, "could not
determine", is red too: main's gate set did not determine. A gate that was
skipped, or that the CI cone did not run, is not red. A test is red when its
testcase has a <failure> or <error>.

Writes `verdict=green|red|unknown` and `failures=<one-line JSON>` to
$GITHUB_OUTPUT, and a Markdown summary to $GITHUB_STEP_SUMMARY, when set.
Missing or unreadable reports are `unknown`, never green. Exits 0.
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

CAP = 100  # names listed per kind; the counts are always whole


def red_gates(path):
    gates = json.load(open(path))
    out = []
    for name in sorted(gates):
        e = gates[name]
        if not isinstance(e, dict) or "skipped" in e or e.get("unchanged"):
            continue
        code = e.get("exit")
        if code not in (0, 78):
            out.append({"name": name, "exit": code})
    return out


def red_tests(path):
    root = ET.parse(path).getroot()
    out = []

    def walk(node, trail):
        for child in node:
            if child.tag == "testsuite":
                walk(child, trail + [child.get("name", "")])
            elif child.tag == "testcase" and (child.find("failure") is not None or child.find("error") is not None):
                out.append(" > ".join(trail + [child.get("name", "")]))

    walk(root, [])
    return sorted(out)


def main():
    d = sys.argv[1]
    try:
        gates = red_gates(os.path.join(d, "gates.json"))
        tests = red_tests(os.path.join(d, "junit.xml"))
    except (OSError, ValueError, ET.ParseError) as err:
        verdict, failures = "unknown", {"error": f"main's answer could not be read: {err}"}
        lines = [f"### Main's own verdict: unknown", "", failures["error"]]
    else:
        verdict = "red" if gates or tests else "green"
        failures = {
            "gates": gates[:CAP], "gate_count": len(gates),
            "tests": tests[:CAP], "test_count": len(tests),
        }
        lines = [f"### Main's own verdict: {verdict}", "",
                 f"{len(gates)} gate(s) and {len(tests)} test(s) failing on main."]
        lines += [f"- gate `{g['name']}` (exit {g['exit']})" for g in gates[:CAP]]
        lines += [f"- test `{t}`" for t in tests[:CAP]]
    report = "\n".join(lines)
    print(report)
    for var, text in (("GITHUB_STEP_SUMMARY", report + "\n"),
                      ("GITHUB_OUTPUT", f"verdict={verdict}\nfailures={json.dumps(failures, separators=(',', ':'))}\n")):
        if os.environ.get(var):
            with open(os.environ[var], "a", encoding="utf-8") as f:
                f.write(text)


if __name__ == "__main__":
    main()
