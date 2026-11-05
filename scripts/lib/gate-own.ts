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
import { checkoutDirectories, corpusDirectoriesForGraph } from "../../schemas/kg/harness-config.js";

/** Comma-separated names of the instances whose files this run judges. */
export const GATE_OWN_ENV = "CAT_GATE_OWN_INSTANCES";

/** The caller's own instances, or `undefined` when the run names none (judge everything). */
// input-site: env CAT_GATE_OWN_INSTANCES #e41b5e4a — the instances whose files are judged; the value is the whole of what it contributes
export function gateOwnInstances(env: Readonly<Record<string, string | undefined>> = process.env): Set<string> | undefined {
  const raw = env[GATE_OWN_ENV];
  const names = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return names.length > 0 ? new Set(names) : undefined;
}

/** The corpus directories holding `kind` that `own`'s instances commit (an inherited member counts as its member's). */
export function ownDirectoriesForGraph(root: string, kind: string, own: ReadonlySet<string>): string[] {
  return checkoutDirectories(root, { stackedOn: root })
    .filter((d) => d.graphTypologies.includes(kind as never) && own.has(d.member ?? d.declaredBy))
    .map((d) => d.absPath);
}

/**
 * The directories holding `kind` whose files a gate JUDGES: the corpus
 * (`corpusDirectoriesForGraph`), or, when this run names its own instances,
 * only the ones they commit. `scoped` says which, so a check can tell "this
 * caller commits none" (nothing of its own to judge, a pass) from "the corpus
 * has none" (its own refusal, unchanged).
 *
 * For the SUBJECTS of a check only. A reference resolved against the corpus
 * (a citation into a lower layer's library, a link into its skills) keeps the
 * whole corpus: a caller may rely on what it mounts.
 */
export function gateDirectoriesForGraph(
  root: string,
  kind: string,
  // input-site: env CAT_GATE_OWN_INSTANCES #949cc29c — passed to gateOwnInstances; the value is the whole of what it contributes
  env: Readonly<Record<string, string | undefined>> = process.env,
): { dirs: string[]; scoped: ReadonlySet<string> | undefined } {
  const own = gateOwnInstances(env);
  if (!own) return { dirs: corpusDirectoriesForGraph(root, kind), scoped: undefined };
  return { dirs: ownDirectoriesForGraph(root, kind, own), scoped: own };
}

/** The line a scoped check prints when its caller commits nothing it judges. */
export function nothingOwnLine(check: string, what: string, own: ReadonlySet<string>): string {
  return `✓ ${check}: ${[...own].join(", ")} commits no ${what}; the mounted layers' are judged by their own CI.`;
}
