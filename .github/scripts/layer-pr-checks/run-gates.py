#!/usr/bin/env python3
"""Run a harnessed repository's gates in a mounted index and record each exit code.

Usage: run-gates.py <index-root> <out.json> [--instance <name>]... [--record <file.json>]...

Generalised from folio-assistant-core's `.github/scripts/run-gates.py`
(14ed7ad) for `layer-pr-checks.yml`, the reusable workflow every harnessed
repository calls (owner, 2026-10-14: "1" -- one reusable workflow, not a copy
per repository). The gate set is DERIVED, never listed per repository, so a
gate added anywhere is run with no edit here. Owner, 2026-10-14: "A harnessed
repo should run not just core but all of the checks in the dependency
harness":

- **graph**: the harness's consistency checks, run over each OWN instance
  (`GRAPH_GATES` below is the only list, and it is a list of harness
  commands, not of any repository's gates).
- **declared**: for every instance in the own instances' transitive `needs`
  (from their declarations), and the own instances themselves, every script
  of its `package.json` -- `scripts` and `checkoutScripts` alike -- whose
  name starts `check:` or ends `:check`, named `<owning-instance>:<script>`.
- **checkout scripts**: the few declared scripts that judge the root's own
  files (`CHECKOUT_SCRIPTS` below), run for every caller under the same name,
  whether or not its dependency harness includes the declaring instance.

The OWN instances are the `--instance` arguments; with none, the instance the
repository declares at its root (a folio or an index with a declaration of
its own), or else every instance its `index.config.json` mounts (an IG
repository that is an index over smart-base and declares nothing itself).

Each gate's exit code, the tail of its output, and its command are written to
<out.json>. This script exits 0 whatever the gates did: the compare step
judges head against base, so a gate already red on main does not fail a PR
that did not break it. `GATE_JOBS` (default 1) runs that many at once.

`--record <file.json>` merges results a workflow step already produced, in the
same shape (`{name: {command, exit, tail}}`, or `{name: {command, skipped}}`),
into <out.json>: the `derive:publish` build that runs before the gates is
judged by the compare job like one of them, so a build the PR breaks is a NEW
failure rather than a line in a log. A missing or unreadable file records the
step as `exit 2` ("could not determine"), never as nothing.

A declared gate that cannot determine anything here is not run, and is
written with a `skipped` reason in place of `exit` (owner, 2026-10-15, "b1"):
one that judges the remote's live state (`LIVE_STATE_SCRIPTS`), one that needs
an argument or artefact this runner never supplies (`NEEDS_INPUT_SCRIPTS`),
and one whose prerequisite file is absent at the root (`PREREQUISITE_FILES`).
"""
import json
import os
import shlex
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

# Scoped to the instance where the check takes a scope (kg-audit, kg-export,
# import-direction). check-tools and declaration-resolution read the whole
# checkout; the base/head comparison is what attributes a change in them to
# this PR.
GRAPH_GATES = {
    "kg-audit": "bun cat-harness-tools/scripts/kg-audit.ts --instance {path}",
    "kg-export": "bun cat-harness-tools/scripts/kg-export.ts --instance {path} --out {tmp}/{instance}.jsonld",
    "import-direction": "bun cat-harness-tools/scripts/check-import-direction.ts --gate {instance}",
}
CHECKOUT_GATES = {
    "check-tools": "bun cat-harness-tools/scripts/check-tools.ts",
    "declaration-resolution": "bun cat-harness-tools/scripts/check-declaration-resolution.ts",
}
# Declared scripts that judge the ROOT's own files, run for EVERY caller, not
# only for one whose dependency harness happens to include the declaring
# instance. Script name -> the instance that declares it; the gate keeps the
# name the derived set gives it (`<instance>:<script>`), and is run once.
#   - index-config:inline:check (cat-harness-tools#222, bean `ymvt`): red
#     while index.config.json still imports a legacy `<name>.config.json`.
#     cat-harness, bootstrap and bootstrap-tools do not need cat-harness-tools,
#     so the derived set never reached them (owner, 2026-10-15: every
#     harnessed repository's PR checks run it).
CHECKOUT_SCRIPTS = {
    "index-config:inline:check": "cat-harness-tools",
}
TIMEOUT_S = 1200
# Gates that judge the REMOTE's live state, not the checkout: which workflows
# are red on the default branch, whether a commit has a run, which advisories
# the registry knows today. Base and head run minutes apart, so one can flip
# between them with no change in the PR (fhir-harness#67: check:ci-health went
# red on head because a workflow on main failed in between). The compare job
# would charge that to the PR; these are reported by the session-start sweep
# and their own workflows instead.
LIVE_STATE_SCRIPTS = {"check:ci-health", "check:head-has-run", "check:dependency-advisories"}
# Gates that judge an INPUT this runner never supplies: run bare, each prints
# its usage and exits 2 ("could not determine") on base and head alike, so it
# judges nothing about the PR -- and where base exits 1 for another reason,
# compare-gates.py rightly counts 1 -> 2 as NEW (smart-immunizations#35). Each
# entry was confirmed by reading the script and running it with no argument;
# the workflow that does supply the input runs it there.
NEEDS_INPUT_SCRIPTS = {
    "check:corpus-gate": "needs --staged or --since <ref>; bare, it prints its usage and exits 2",
    "check:test-budgets": "needs a junit report path; bare, 'no junit report given' and exit 2",
    "check:duplicate-ids": "needs a built site directory; bare, it prints its usage and exits 2",
    "check:escaped-markup": "needs a built site directory (or --source <dir>); bare, it prints its usage and exits 2",
    "check:maintained-artefacts": "needs a built site directory; bare, it prints its usage and exits 2",
    "wireframe:check": "needs --use, --topic and --surface; bare, a usage error and exit 2",
}
# Gates that read something only a root with a given file can build: skipped
# where that file is absent, run wherever it is present, so the rule follows
# the root rather than naming any repository. The QA working copy that
# uml:overview and readme:subgraphs read is built by `qa:refresh`, whose
# writers are this harness's own CI recipe and read the gates workflow
# (`gates.ts` GATES_WORKFLOW, via audit:coverage); in an IG index root or a
# layer repository there is no such workflow, the build fails, and the gate
# exits 2 on both sides (smart-immunizations#35).
GATES_WORKFLOW = ".github/workflows/code-quality-gates.yml"
QA_WORKING_COPY = "reads the QA working copy, which qa:refresh cannot build without it"
PREREQUISITE_FILES = {
    "uml:overview:check": (GATES_WORKFLOW, QA_WORKING_COPY),
    "readme:subgraphs:check": (GATES_WORKFLOW, QA_WORKING_COPY),
}


def skip_reason(root, script):
    """Why a declared gate cannot determine anything in this run, or None to run it."""
    if script in LIVE_STATE_SCRIPTS:
        return "judges the remote's live state, not the checkout"
    if script in NEEDS_INPUT_SCRIPTS:
        return NEEDS_INPUT_SCRIPTS[script]
    if script in PREREQUISITE_FILES:
        path, why = PREREQUISITE_FILES[script]
        if not os.path.exists(os.path.join(root, path)):
            return f"{path} is absent at the root; it {why}"
    return None


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def is_declaration(d, name):
    """A `<name>.json` that declares the instance: the harness's schema, or --
    bootstrap's own layers, which declare `name` and `needs` with no
    `$schema` -- a bare `name` matching the file."""
    if not isinstance(d, dict):
        return False
    schema = d.get("$schema")
    if schema is None:
        return d.get("name") == name
    return str(schema).startswith("cat-harness-declaration") and d.get("name", name) == name


def instances_in(root):
    """name -> directory (relative to root, '.' for the root), from declarations on disk."""
    found = {}
    for entry in sorted(os.listdir(root)):
        if entry.endswith(".json") and is_declaration(read_json(os.path.join(root, entry)), entry[:-5]):
            found[entry[:-5]] = "."
    for entry in sorted(os.listdir(root)):
        d = os.path.join(root, entry)
        if os.path.isdir(d) and not entry.startswith(".") and is_declaration(read_json(os.path.join(d, f"{entry}.json")), entry):
            found.setdefault(entry, entry)
    return found


def own_instances(root, given, known):
    if given:
        return given
    at_root = [n for n, p in known.items() if p == "."]
    if at_root:
        return at_root
    config = read_json(os.path.join(root, "index.config.json")) or {}
    return [i["name"] for i in config.get("instances", []) if i.get("name") in known]


def closure(own, known, root):
    seen, todo = [], list(own)
    while todo:
        n = todo.pop(0)
        if n in seen or n not in known:
            continue
        seen.append(n)
        decl = read_json(os.path.join(root, known[n], f"{n}.json")) or {}
        todo.extend(decl.get("needs", []) or [])
    return seen


def script_runner(root):
    """The command that resolves a script name against every instance's
    declared scripts: the root's own `cat` script where it has one (the
    folio-assistant index), else the harness runner it would call. A root with
    no `cat` script (smart-ra) turned `bun run cat X` into /usr/bin/cat X, so
    every declared gate "failed" on both sides and was judged on nothing."""
    pkg = read_json(os.path.join(root, "package.json")) or {}
    if "cat" in (pkg.get("scripts") or {}):
        return "bun run cat"
    return "bun cat-harness-tools/scripts/run-script.ts"


def declared_gates(root, name, path, runner):
    """(gate name -> command, gate name -> (command, skip reason))."""
    pkg = read_json(os.path.join(root, path, "package.json")) or {}
    scripts = {**pkg.get("scripts", {}), **pkg.get("checkoutScripts", {})}
    # Through the index's own runner, as the index's CI runs them: it resolves
    # a name against every instance's declared scripts.
    run, skipped = {}, {}
    for s in sorted(scripts):
        if not (s.startswith("check:") or s.endswith(":check")):
            continue
        command, why = f"{runner} {s}", skip_reason(root, s)
        if why:
            skipped[f"{name}:{s}"] = (command, why)
        else:
            run[f"{name}:{s}"] = command
    return run, skipped


def run(root, name, command):
    try:
        p = subprocess.run(shlex.split(command), cwd=root, capture_output=True, text=True, timeout=TIMEOUT_S)
        code, text = p.returncode, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        # Harness convention: exit 2 is "could not determine", never a pass.
        code, text = 2, f"timed out after {TIMEOUT_S} s"
    return name, command, code, text


def main():
    args = sys.argv[1:]
    root, out_path = args[0], args[1]
    given = [args[i + 1] for i, a in enumerate(args) if a == "--instance" and i + 1 < len(args)]
    records = [args[i + 1] for i, a in enumerate(args) if a == "--record" and i + 1 < len(args)]
    tmp = os.environ.get("RUNNER_TEMP", "/tmp")
    known = instances_in(root)
    own = own_instances(root, given, known)
    if not own:
        print("::error::no own instance: pass --instance, declare one at the root, or mount one from index.config.json")
        sys.exit(2)
    harness = closure(own, known, root)
    print(f"own: {', '.join(own)}; dependency harness: {', '.join(harness)}", flush=True)

    gates = {}
    for n in own:
        path = "./" if known.get(n, n) == "." else f"./{known.get(n, n)}"
        for k, v in GRAPH_GATES.items():
            gates[f"graph:{n}:{k}"] = v.format(tmp=tmp, instance=n, path=path)
    gates.update({f"graph:{k}": v for k, v in CHECKOUT_GATES.items()})
    seen_scripts = set()
    runner = script_runner(root)
    print(f"script runner: {runner}", flush=True)
    for script, owner in CHECKOUT_SCRIPTS.items():
        command = f"{runner} {script}"
        seen_scripts.add(command)
        gates[f"{owner}:{script}"] = command
    skipped = {}
    for n in harness:
        run_these, skip_these = declared_gates(root, n, known[n], runner)
        for gname, command in run_these.items():
            if command in seen_scripts:
                continue  # one script, run once, named by the first instance that declares it
            seen_scripts.add(command)
            gates[gname] = command
        for gname, (command, why) in skip_these.items():
            if command in seen_scripts:
                continue
            seen_scripts.add(command)
            skipped[gname] = {"command": command, "skipped": why}

    jobs = max(1, int(os.environ.get("GATE_JOBS", "1")))
    results = {}
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for name, command, code, text in pool.map(lambda kv: run(root, kv[0], kv[1]), gates.items()):
            print(f"::group::{name}: exit {code} — {command}", flush=True)
            print(text[-4000:], flush=True)
            print("::endgroup::", flush=True)
            results[name] = {"command": command, "exit": code, "tail": text[-1500:]}
    for name, entry in skipped.items():
        print(f"{name}: skipped ({entry['skipped']}) — {entry['command']}", flush=True)
    for path in records:
        got = read_json(path)
        if not isinstance(got, dict) or not got:
            got = {f"record:{os.path.basename(path)}": {"command": path, "exit": 2, "tail": f"{path} is missing or unreadable: the step that writes it did not record a result"}}
        for name, entry in got.items():
            print(f"{name}: recorded ({entry.get('skipped') or 'exit %s' % entry.get('exit')}) — {entry.get('command')}", flush=True)
            (skipped if "skipped" in entry else results)[name] = entry
    green = sum(1 for r in results.values() if r["exit"] == 0)
    results.update(skipped)  # no `exit`: compare-gates.py reports these as skipped, never as a verdict
    with open(out_path, "w") as f:
        json.dump(results, f, indent=1)
    print(f"{len(results) - len(skipped)} gate(s) run: {green} green; {len(skipped)} skipped", flush=True)


if __name__ == "__main__":
    main()
