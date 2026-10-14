#!/usr/bin/env python3
"""Run one layer's gates in a mounted index and record each exit code.

Usage: run-gates.py <index-root> <instance> <out.json>

Generalised from folio-assistant-core's `.github/scripts/run-gates.py`
(14ed7ad) for `layer-pr-checks.yml`, the reusable workflow every harnessed
layer calls (owner, 2026-10-14: "1" -- one reusable workflow, not a copy per
layer). Two sets, both DERIVED rather than listed per layer, so a gate added
to either source is run with no edit here:

- **graph**: the harness's consistency checks, run over THIS instance. They
  come from cat-harness-tools; each one names the instance the way its own
  flag asks for it (`GRAPH_GATES` below is the only list, and it is a list of
  harness commands, not of any layer's gates).
- **own**: the instance's own QA, every script in its `package.json` --
  `checkoutScripts` and `scripts` alike, since layers declare their checks in
  either -- whose name starts `check:` or ends `:check`.

Each gate's exit code, the tail of its output, and its command are written to
<out.json>. This script exits 0 whatever the gates did: the compare step
judges head against base, so a gate already red on main does not fail a PR
that did not break it.
"""
import json
import os
import shlex
import subprocess
import sys

# The harness's graph checks, scoped to the instance where the check takes a
# scope (kg-audit, kg-export, import-direction). check-tools and
# declaration-resolution read the whole checkout; the base/head comparison is
# what attributes a change in them to this PR.
GRAPH_GATES = {
    "kg-audit": "bun cat-harness-tools/scripts/kg-audit.ts --instance ./{instance}",
    "check-tools": "bun cat-harness-tools/scripts/check-tools.ts",
    "kg-export": "bun cat-harness-tools/scripts/kg-export.ts --instance ./{instance} --out {tmp}/{instance}.jsonld",
    "import-direction": "bun cat-harness-tools/scripts/check-import-direction.ts --gate {instance}",
    "declaration-resolution": "bun cat-harness-tools/scripts/check-declaration-resolution.ts",
}


def own_gates(root, instance):
    try:
        with open(os.path.join(root, instance, "package.json")) as f:
            pkg = json.load(f)
    except FileNotFoundError:
        return {}
    scripts = {**pkg.get("scripts", {}), **pkg.get("checkoutScripts", {})}
    out = {}
    for name, command in sorted(scripts.items()):
        if name.startswith("check:") or name.endswith(":check"):
            # Run through the index's own runner, as the index's CI does: it
            # resolves the name against every instance's declared scripts, so
            # a path written from the index root and a `bun run cat ...`
            # chain both work.
            out[name] = f"bun run cat {name}"
    return out


def main():
    root, instance, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    tmp = os.environ.get("RUNNER_TEMP", "/tmp")
    gates = {f"graph:{k}": v.format(tmp=tmp, instance=instance) for k, v in GRAPH_GATES.items()}
    gates.update({f"own:{k}": v for k, v in own_gates(root, instance).items()})
    results = {}
    for name, command in gates.items():
        print(f"::group::{name}: {command}", flush=True)
        try:
            p = subprocess.run(shlex.split(command), cwd=root, capture_output=True, text=True, timeout=1200)
            code, text = p.returncode, (p.stdout + p.stderr).strip()
        except subprocess.TimeoutExpired:
            # Harness convention: exit 2 is "could not determine", never a pass.
            code, text = 2, "timed out after 1200 s"
        print(text[-4000:], flush=True)
        print("::endgroup::", flush=True)
        results[name] = {"command": command, "exit": code, "tail": text[-1500:]}
        print(f"{name}: exit {code}", flush=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=1)


if __name__ == "__main__":
    main()
