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
Each gate's wall time is recorded as `seconds`.

`GATE_SHARD=i/N` (bean `lpcs`, step 3) runs only shard `i` of `N`: the gates
whose position in the SORTED derived set is `i-1` modulo `N`. The slice is a
function of the gate names alone, so the N shards of one side are disjoint and
their union is the whole set; unset, or `1/1`, is the whole set, as before.
The workflow gives each shard its own machine and checkout, so shards never
race; within a shard, `GATE_JOBS` > 1 runs gates side by side, and a gate whose
script runs `publish-check.ts` (it hashes the whole tree around its writer) runs
alone after the pool drains, so a neighbour's write is never blamed on it. The skipped gates and the
`--record`ed results go in shard 1 only, so a merged side holds each once.
Beside <out.json> the run writes `gates-shard.json` -- the shard, `N`, the size
of the whole set, and the names it ran -- from which the compare job proves
every shard is present and that together they cover the set
(`merge-shards.py`). A malformed `GATE_SHARD` exits 2: guessing a slice could
silently drop gates. `--list` honours it too, and adds a `shard` field.

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

A gate whose input this runner DOES have is given it instead
(`SUPPLIED_INPUTS`): `check:corpus-gate` gets `--since $GATE_DIFF_BASE`, the
PR's diff base, and `check:test-budgets` the junit report at `$GATE_JUNIT`
that the tests step wrote. Either is skipped, with its reason, only on a side
that holds no such input.
"""
import json
import os
import re
import shlex
import subprocess
import sys
import time
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
# and their own workflows instead. check:merged belongs here too: it fetches
# the remote's CURRENT base, merges it in a worktree and reruns every gate --
# the pre-merge check an agent runs, which this job already does on the PR's
# merge commit. On a runner it has no git identity, and in an index root it
# merges an unrelated base, so it exits 2 (smart-immunizations#35).
# post-merge:regen:check belongs here for the same reason (gates.ts
# OWN_SCRIPT_EXEMPTIONS, bean ey1c): checkPostMergeRegen reads loadGates and
# runs the :check half of every repairable writer/check pair in the gate set,
# so running it inside run-gates.py runs the gates inside the gates until the
# 1200 s timeout kills it (measured on smart-immunizations run 38819372825:
# 1200.0 s in shard 1/4, bean lpcs). Its subject is main after a merge, run by
# layer-post-merge-regen.yml.
# check:prs-have-runs lists the index's OPEN pull requests and asks whether
# each has a CI run: a fact about other PRs at the moment the job runs, so it
# moved between base and head on fhir-harness#83 (an unrelated folio-assistant
# PR was "too-new" on base and "no-run" on head).
LIVE_STATE_SCRIPTS = {
    "check:ci-health",
    "check:head-has-run",
    "check:dependency-advisories",
    "check:merged",
    "check:prs-have-runs",
    "post-merge:regen:check",
}
# Gates that judge an INPUT this runner never supplies: run bare, each prints
# its usage and exits 2 ("could not determine") on base and head alike, so it
# judges nothing about the PR -- and where base exits 1 for another reason,
# compare-gates.py rightly counts 1 -> 2 as NEW (smart-immunizations#35). Each
# entry was confirmed by reading the script and running it with no argument;
# the workflow that does supply the input runs it there.
NEEDS_INPUT_SCRIPTS = {
    "check:duplicate-ids": "needs a built site directory; bare, it prints its usage and exits 2",
    "check:escaped-markup": "needs a built site directory (or --source <dir>); bare, it prints its usage and exits 2",
    "check:maintained-artefacts": "needs a built site directory; bare, it prints its usage and exits 2",
    "wireframe:check": "needs --use, --topic and --surface; bare, a usage error and exit 2",
}
# Gates that read something only a root with a given file can build: skipped
# where that file is absent, run wherever it is present, so the rule follows
# the root rather than naming any repository. uml:overview and readme:subgraphs
# read the QA working copy that `qa:refresh` builds, and a root without the
# harness's gates workflow is a CONTENT root.
#
# Since cat-harness-tools#281 ("hold smart-ra to its own gate set") a content
# root is no longer measured against that workflow: `audit:coverage` reads the
# gate set `derive` below gives it, and `qa:refresh` reports the writers that
# do not apply there (an undeclared script, unmounted state branches) as not
# applicable. So the workflow's absence no longer makes the copy unbuildable by
# itself. The skip stays because qa:refresh in a content root still ends
# INCOMPLETE on the root's own content gaps, and the gate would exit 2 on both
# sides: measured in smart-ra on 2026-10-15, `check:l1-complete` (L1 entries
# with no manifest.jsonld / images.json) and `check:wireframes` (two surfaces
# with no wireframe, a catalogue naming an undeclared instance) fail. Those are
# the root's to fix; when its qa:refresh is COMPLETE this skip is what to drop.
GATES_WORKFLOW = ".github/workflows/code-quality-gates.yml"
QA_WORKING_COPY = ("marks a content root, where the QA working copy these read is built by qa:refresh "
                   "against the root's own gate set and stays INCOMPLETE while the root has content gaps "
                   "of its own (failed writers such as check:l1-complete, check:wireframes), so the gate "
                   "could only report UNKNOWN (cat-harness-tools#281)")
PREREQUISITE_FILES = {
    "uml:overview:check": (GATES_WORKFLOW, QA_WORKING_COPY),
    "readme:subgraphs:check": (GATES_WORKFLOW, QA_WORKING_COPY),
}


# Gates whose input this runner DOES have, given it when it has it: the
# workflow passes the PR's diff base (`GATE_DIFF_BASE`) and the junit report
# its tests step wrote (`GATE_JUNIT`). Run bare they printed their usage and
# exited 2 (smart-ra#65, run 38640286019). Each returns (extra arguments, None)
# to run, or (None, reason) when this side holds no such input; a reason is a
# skip, reported, never a pass.
def corpus_gate_input(env):
    base = env.get("GATE_DIFF_BASE", "").strip()
    if not base:
        return None, ("needs --since <ref>, and this run has no PR diff in the root's own history "
                      "(layer mode swaps the caller in without its .git; GATE_DIFF_BASE is unset)")
    return ["--since", base], None


def junit_cases(path):
    """The number of <testcase> elements in a junit report, or None when it will not read."""
    import xml.etree.ElementTree as ET
    try:
        return sum(1 for _ in ET.parse(path).getroot().iter("testcase"))
    except (OSError, ET.ParseError):
        return None


def test_budgets_input(env):
    path = env.get("GATE_JUNIT", "").strip()
    if not path:
        return None, "needs a junit report path, and GATE_JUNIT is unset"
    cases = junit_cases(path)
    if cases is None:
        return None, f"needs a junit report, and {path} is absent or will not parse"
    if cases == 0:
        # check-test-budgets.ts exits 2 on a report of no cases (bean 6tkl):
        # index mode runs no tests unless test-path is given.
        return None, "the tests step ran no test cases on this side, so there is nothing to budget"
    return [path], None


SUPPLIED_INPUTS = {
    "check:corpus-gate": corpus_gate_input,
    "check:test-budgets": test_budgets_input,
}


def gate_args(script, env=None):
    """(extra arguments, skip reason) for a declared gate: ([], None) for one that needs none."""
    fn = SUPPLIED_INPUTS.get(script)
    return fn(os.environ if env is None else env) if fn else ([], None)


def skip_reason(root, script):
    """(kind, why) a declared gate cannot determine anything in this run, or (None, None) to run it."""
    if script in LIVE_STATE_SCRIPTS:
        return "live-state", "judges the remote's live state, not the checkout"
    if script in NEEDS_INPUT_SCRIPTS:
        return "needs-input", NEEDS_INPUT_SCRIPTS[script]
    if script in PREREQUISITE_FILES:
        path, why = PREREQUISITE_FILES[script]
        if not os.path.exists(os.path.join(root, path)):
            return "prerequisite", f"{path} is absent at the root; it {why}"
    return None, None


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


def declared_gates(root, name, path, runner, env=None):
    """(gate name -> command, gate name -> (command, skip reason, skip kind))."""
    pkg = read_json(os.path.join(root, path, "package.json")) or {}
    scripts = {**pkg.get("scripts", {}), **pkg.get("checkoutScripts", {})}
    # Through the index's own runner, as the index's CI runs them: it resolves
    # a name against every instance's declared scripts.
    run, skipped = {}, {}
    for s in sorted(scripts):
        if not (s.startswith("check:") or s.endswith(":check")):
            continue
        extra, why = gate_args(s, env)
        command = " ".join([runner, s, *(shlex.quote(a) for a in extra or [])])
        kind = "input-absent" if why else None
        if not why:
            kind, why = skip_reason(root, s)
        if why:
            skipped[f"{name}:{s}"] = (command, why, kind)
        else:
            run[f"{name}:{s}"] = command
    return run, skipped


def parse_shard(value):
    """(i, n) from a `GATE_SHARD` of the form `i/N`, 1 <= i <= N; (1, 1) when unset or empty.
    Raises ValueError on anything else."""
    v = (value or "").strip()
    if not v:
        return 1, 1
    m = re.fullmatch(r"([0-9]+)/([0-9]+)", v)
    if not m:
        raise ValueError(f"GATE_SHARD={v!r} is not of the form i/N")
    i, n = int(m.group(1)), int(m.group(2))
    if n < 1 or not 1 <= i <= n:
        raise ValueError(f"GATE_SHARD={v!r}: need 1 <= i <= N")
    return i, n


def shard_names(names, i, n):
    """The names shard i of n runs: those whose index in sorted(names) is i-1 mod n.
    Returned in the order `names` gives them, so n == 1 runs exactly today's order."""
    mine = {x for k, x in enumerate(sorted(names)) if k % n == i - 1}
    return [x for x in names if x in mine]


def tree_snapshotting(root):
    """Gate names whose script runs `publish-check.ts`, which hashes every file
    of every instance before and after its writer and calls any committed file
    that moved stale. Under `GATE_JOBS` > 1 a neighbour gate that writes a
    committed file inside that window (`check:avatar-coverage` rewrites
    `avatar-coverage.qa-results.json`) is blamed on the writer, so the verdict
    depends on scheduling (smart-immunizations#61, run 38824729436: head red,
    base green, same pins). These run alone, after the pool drains."""
    out = set()
    for n, p in instances_in(root).items():
        pkg = read_json(os.path.join(root, p, "package.json")) or {}
        for s, body in {**pkg.get("scripts", {}), **pkg.get("checkoutScripts", {})}.items():
            if "publish-check" in str(body):
                out.add(f"{n}:{s}")
    return out


def run(root, name, command):
    start = time.monotonic()
    try:
        p = subprocess.run(shlex.split(command), cwd=root, capture_output=True, text=True, timeout=TIMEOUT_S)
        code, text = p.returncode, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        # Harness convention: exit 2 is "could not determine", never a pass.
        code, text = 2, f"timed out after {TIMEOUT_S} s"
    return name, command, code, text, round(time.monotonic() - start, 1)


def derive(root, given, tmp, env=None):
    """The gate set a root's CI runs, without running it -- the ONE definition.

    Returns (own, harness, runner, gates, skipped): gate name -> command for
    the gates this runner runs, and gate name -> {command, skipped, kind} for
    the declared ones it does not. `kind` says why: `live-state`,
    `needs-input`, `prerequisite`, or `input-absent` (a SUPPLIED_INPUTS gate
    on a side that holds no such input -- CI runs it where the input exists).

    `--list` prints this as JSON, and it is what `gates.ts` `loadGates` reads
    for a root that is not a harness (no `code-quality-gates.yml`), so
    `audit:coverage` and `qa:refresh` measure such a root against the gates
    its own CI runs (owner, cat-harness-tools#281: "hold smart-ra to its own
    gate set"). A rule added here reaches both with no second list.
    """
    env = os.environ if env is None else env
    known = instances_in(root)
    own = own_instances(root, given, known)
    if not own:
        return own, [], None, {}, {}
    harness = closure(own, known, root)
    gates = {}
    for n in own:
        path = "./" if known.get(n, n) == "." else f"./{known.get(n, n)}"
        for k, v in GRAPH_GATES.items():
            gates[f"graph:{n}:{k}"] = v.format(tmp=tmp, instance=n, path=path)
    gates.update({f"graph:{k}": v for k, v in CHECKOUT_GATES.items()})
    seen_scripts = set()
    runner = script_runner(root)
    for script, owner in CHECKOUT_SCRIPTS.items():
        command = f"{runner} {script}"
        seen_scripts.add(command)
        gates[f"{owner}:{script}"] = command
    skipped = {}
    for n in harness:
        run_these, skip_these = declared_gates(root, n, known[n], runner, env)
        for gname, command in run_these.items():
            if command in seen_scripts:
                continue  # one script, run once, named by the first instance that declares it
            seen_scripts.add(command)
            gates[gname] = command
        for gname, (command, why, kind) in skip_these.items():
            if command in seen_scripts:
                continue
            seen_scripts.add(command)
            skipped[gname] = {"command": command, "skipped": why, "kind": kind}
    return own, harness, runner, gates, skipped


def main():
    args = sys.argv[1:]
    given = [args[i + 1] for i, a in enumerate(args) if a == "--instance" and i + 1 < len(args)]
    tmp = os.environ.get("RUNNER_TEMP", "/tmp")
    try:
        shard, shards = parse_shard(os.environ.get("GATE_SHARD"))
    except ValueError as e:
        print(f"::error::{e}; a guessed slice could drop gates, so nothing is run", file=sys.stderr)
        sys.exit(2)
    if len(args) >= 2 and args[1] == "--list":
        # `run-gates.py <root> --list [--instance <name>]...`: the derived set
        # as JSON on stdout, nothing run. Exit 2 when there is no own instance:
        # no gate set is "could not determine", never an empty pass.
        own, harness, runner, gates, skipped = derive(args[0], given, tmp)
        listed = {"own": own, "harness": harness, "runner": runner, "gates": gates, "skipped": skipped}
        if os.environ.get("GATE_SHARD", "").strip():
            listed["gates"] = {k: gates[k] for k in shard_names(list(gates), shard, shards)}
            listed["skipped"] = skipped if shard == 1 else {}
            listed["shard"] = {"shard": shard, "of": shards, "total": len(gates)}
        json.dump(listed, sys.stdout, indent=1)
        sys.exit(0 if own else 2)
    root, out_path = args[0], args[1]
    records = [args[i + 1] for i, a in enumerate(args) if a == "--record" and i + 1 < len(args)]
    own, harness, runner, gates, skipped = derive(root, given, tmp)
    if not own:
        print("::error::no own instance: pass --instance, declare one at the root, or mount one from index.config.json")
        sys.exit(2)
    print(f"own: {', '.join(own)}; dependency harness: {', '.join(harness)}", flush=True)
    print(f"script runner: {runner}", flush=True)
    skipped = {k: {"command": v["command"], "skipped": v["skipped"]} for k, v in skipped.items()}
    total = len(gates)
    gates = {k: gates[k] for k in shard_names(list(gates), shard, shards)}
    if shard != 1:
        skipped, records = {}, []  # shard 1 carries them, so a merged side holds each once
    print(f"shard {shard}/{shards}: {len(gates)} of {total} gate(s)", flush=True)

    jobs = max(1, int(os.environ.get("GATE_JOBS", "1")))
    results = {}
    alone = tree_snapshotting(root)
    pooled = [kv for kv in gates.items() if kv[0] not in alone]
    serial = [kv for kv in gates.items() if kv[0] in alone]
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        outcomes = list(pool.map(lambda kv: run(root, kv[0], kv[1]), pooled))
    outcomes += [run(root, k, v) for k, v in serial]
    for name, command, code, text, seconds in outcomes:
        print(f"::group::{name}: exit {code} in {seconds} s — {command}", flush=True)
        print(text[-4000:], flush=True)
        print("::endgroup::", flush=True)
        results[name] = {"command": command, "exit": code, "tail": text[-1500:], "seconds": seconds}
    ran = list(results)
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
    with open(os.path.join(os.path.dirname(os.path.abspath(out_path)), "gates-shard.json"), "w") as f:
        json.dump({"shard": shard, "of": shards, "total": total, "ran": ran}, f, indent=1)
    print(f"{len(results) - len(skipped)} gate(s) run: {green} green; {len(skipped)} skipped", flush=True)


if __name__ == "__main__":
    main()
