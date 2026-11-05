/**
 * Which instances' files a gate run is the judge of: the caller's OWN
 * instances, as the layer PR-check runner names them.
 *
 * @module scripts/lib/gate-own
 * @graphNode none — an environment contract and its reader
 *
 * Owner ruling, 2026-11-05 ("Move the checks"): a check of a layer's own
 * committed files runs only in the repository that commits those files, so
 * other layers stop seeing false new failures. `check:schema-nodes` walks
 * every declared `schemas/` directory in the checkout, the mounted lower
 * layers' included, so a defect committed to cat-harness-tools main
 * (cat-harness-tools#1478) failed the gate in every root that mounts it, and
 * smart-ra#228's re-pin listed it as a newly failing gate.
 *
 * `run-gates.py` (`.github/scripts/layer-pr-checks/`) sets
 * {@link GATE_OWN_ENV} to the caller's own instances, comma-separated. A
 * check that honours it judges only the directories those instances
 * declare; the mounted layers' files are judged by their own CI. Unset (a
 * local run, the index's own gates workflow), the check judges the whole
 * checkout, as before.
 */

/** Comma-separated names of the instances whose files this run judges. */
export const GATE_OWN_ENV = "CAT_GATE_OWN_INSTANCES";

/** The caller's own instances, or `undefined` when the run names none (judge everything). */
// input-site: env CAT_GATE_OWN_INSTANCES #e41b5e4a — the instances whose files are judged; the value is the whole of what it contributes
export function gateOwnInstances(env: Readonly<Record<string, string | undefined>> = process.env): Set<string> | undefined {
  const raw = env[GATE_OWN_ENV];
  const names = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return names.length > 0 ? new Set(names) : undefined;
}
