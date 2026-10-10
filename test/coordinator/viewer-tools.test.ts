/**
 * The viewer Tools' `renders` declarations, grounded against the HARNESS
 * declarations (owner, 2026-10-09: *"Need harness to declare visualizer is
 * renderedBy"*).
 *
 * A Tool's `renders` is what it CAN draw; a harness's `visualisers` say what
 * it DOES, each `renderedBy` one Tool. So the two are checked against each
 * other: every visualiser names a Tool that exists, every Tool a visualiser
 * names renders something, and every rendered kind is declared somewhere.
 * `check:visualiser-routes` is the gate over the same facts; this pins them in
 * the test set the checkout runs.
 *
 * Moved here from `cat-harness/scripts/tests/viewer-tools.test.ts` to the
 * checkout's own test home `test/` (bean `7zz1`): it reads every instance's
 * declaration, which only the whole checkout holds.
 */
import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { instanceRootsIn, instanceDirectories, isPublishedGraphTypology } from "@litlfred/cat-harness/schemas/cat-harness.ts";
// Every instance's Tools: a viewer Tool may live in a dependency's `tools`
// graph (fhir-harness's `ig-pages`).
import { tools } from "../../tools/discover.js";
import { declaredVisualisers } from "../../scripts/viewer-declarations.js";

/** The directory this test was written in (`cat-harness/scripts/tests/`). */
const ORIGIN_DIR = join(import.meta.dir, "../../../cat-harness/scripts/tests");

const REPO = resolve(ORIGIN_DIR, "..", "..", "..");

interface Dir { id: string; graphTypologies?: string[] }

const dirs: { instance: string; dir: Dir }[] = [];
// Own entries AND those declared from within (bean `cmsl`).
for (const root of instanceRootsIn(REPO)) {
  for (const dir of instanceDirectories(root)) dirs.push({ instance: root, dir });
}

const all = tools();
const renderers = all.filter((t) => (t.renders ?? []).length > 0);
const rendered = new Set(renderers.flatMap((t) => t.renders ?? []));
const visualisers = declaredVisualisers(REPO);

describe("viewer Tools declare what they render", () => {
  it("there are viewer Tools, and declared visualisers, at all", () => {
    expect(renderers.length).toBeGreaterThan(0);
    expect(visualisers.length).toBeGreaterThan(0);
  });

  it("every declared visualiser is renderedBy a Tool that exists", () => {
    const ids = new Set(all.map((t) => t.id));
    expect(visualisers.filter((v) => !ids.has(v.renderedBy)).map((v) => `${v.harness}/${v.id} → ${v.renderedBy}`)).toEqual([]);
  });

  it("every rendered kind is declared by some directory", () => {
    const declared = new Set(dirs.flatMap(({ dir }) => dir.graphTypologies ?? []));
    expect([...rendered].filter((k) => !declared.has(k))).toEqual([]);
  });

  it("no Tool renders an unpublished kind — the Tool graph is published", () => {
    expect([...rendered].filter((k) => !isPublishedGraphTypology(k))).toEqual([]);
  });
});
