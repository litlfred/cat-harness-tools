/**
 * TRANSITIONAL: where a piece of cat-harness's development material is, in
 * whichever layout the harness checkout has.
 *
 * @module scripts/lib/harness-layout
 *
 * cat-harness#991 step 23.2 (cat-harness#1014) moves the development material
 * into two opt-in named sub-graphs: `processes/sdlc/` → `sdlc/processes/`,
 * `skills/sdlc/` → `sdlc/skills/`, eight sdlc-core skills →
 * `work-plan/skills/work-plan/`, eleven Tool nodes `tools/<id>/` →
 * `work-plan/tools/<id>/`. The two repositories pin each other at `main`, so
 * until that PR merges this layer has to read BOTH layouts: written in the new
 * spelling, answered with whichever exists under the harness root.
 *
 * **Remove after cat-harness#1014 merges** (cat-harness#991 step 23): inline
 * the new paths, or better, read the declared `sdlc-processes`,
 * `sdlc-skills`, `work-plan-skills` and `work-plan-tools` entries.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { HARNESS_ROOT } from "./roots.ts";

const WORK_PLAN_SKILLS = [
  "bean-blocking",
  "bean-coordination",
  "bean-drain",
  "idle-backlog",
  "todo-manager",
  "work-plan-restructure",
  "work-plan-store",
  "work-plan-store-git-branch",
];
const WORK_PLAN_TOOLS = [
  "beans-cli",
  "beans-manual",
  "bean-query",
  "bean-claim-check",
  "work-plan-prime",
  "workflow-start",
  "workflow-next",
  "workflow-complete",
  "workflow-gate",
  "workflow-list",
  "drain-queue",
];

/** New-layout prefix ↔ legacy prefix, most specific first. */
// declared-path-literal: the two layouts of one move, spelled once so every reader can be told which exists (transitional, cat-harness#991 step 23).
const PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ...WORK_PLAN_SKILLS.map((s) => [`work-plan/skills/work-plan/${s}.md`, `skills/sdlc/sdlc-core/${s}.md`] as const),
  ...WORK_PLAN_TOOLS.map((t) => [`work-plan/tools/${t}/`, `tools/${t}/`] as const),
  ["sdlc/processes/", "processes/sdlc/"],
  ["sdlc/skills/", "skills/sdlc/"],
];

function swap(rel: string, from: 0 | 1): string {
  const to = from === 0 ? 1 : 0;
  const withSlash = rel.endsWith("/") ? rel : `${rel}/`;
  for (const p of PREFIXES) {
    if (rel.startsWith(p[from])) return p[to] + rel.slice(p[from].length);
    // The directory itself, written without its trailing slash.
    if (p[from].endsWith("/") && withSlash === p[from]) return p[to].slice(0, -1);
  }
  return rel;
}

/** A new-layout path, in the legacy spelling (unchanged when it did not move). */
export function legacyHarnessPath(rel: string): string {
  return swap(rel, 0);
}

/** A legacy path, in the new spelling (unchanged when it did not move). */
export function subgraphHarnessPath(rel: string): string {
  return swap(rel, 1);
}

/** Which layout the harness at `root` has: the named sub-graph folders, or the legacy groups. */
export function harnessLayout(root: string = HARNESS_ROOT): "subgraphs" | "legacy" {
  // declared-path-literal: the marker of the new layout, `sdlc/graph.json` (transitional).
  return existsSync(join(root, "sdlc", "graph.json")) ? "subgraphs" : "legacy";
}

/**
 * `rel`, written in the NEW layout, as the harness at `root` spells it: the
 * new path where the sub-graphs exist, the legacy one otherwise.
 */
export function harnessRel(rel: string, root: string = HARNESS_ROOT): string {
  return harnessLayout(root) === "subgraphs" ? rel : legacyHarnessPath(rel);
}

/** {@link harnessRel}, absolute under `root`. */
export function harnessPath(rel: string, root: string = HARNESS_ROOT): string {
  return join(root, harnessRel(rel, root));
}

/**
 * `text` with every new-layout path in it respelled for the harness at
 * `root`: unchanged where the sub-graphs exist, legacy otherwise. For a
 * fixture written in the new layout that names harness files.
 */
export function harnessLayoutText(text: string, root: string = HARNESS_ROOT): string {
  if (harnessLayout(root) === "subgraphs") return text;
  let out = text;
  for (const [now, before] of PREFIXES) out = out.split(now).join(before);
  return out;
}
