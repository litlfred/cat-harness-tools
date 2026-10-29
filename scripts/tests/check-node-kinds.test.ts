/**
 * `node-kinds` and `node-kinds:check` on THIS checkout, since the owner's
 * ruling of 2026-10-15: each instance's unkinded families are held to that
 * instance's own baseline, and the cross-layer table is built at publish.
 *
 * The rules themselves (ownership, the ratchet, the baseline file) are pinned
 * on fixtures in cat-harness's `schemas/node-kind-index.test.ts`; this file
 * asks the real corpus what a migration has to keep true.
 *
 * Real-corpus tests: building the index imports every validator module every
 * instance names, which can pass 5 s on a cold CI runner, so each carries an explicit
 * 60 s timeout.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultGraphTypologies, readDeclaration } from "@litlfred/cat-harness/schemas/kg/cat-harness.ts";
import { ignoreLineFor } from "@litlfred/cat-harness/schemas/built-at-publish.ts";
import { NodeKindIndexFileKind, nodeKindIndex, ratchet, typologyOwner, unkindedKey, type NodeKindIndex } from "@litlfred/cat-harness/schemas/node-kind-index.ts";
import { INDEX_PATH, readBaselines, render, tableBuiltAtPublish } from "../check-node-kinds.ts";
import { HARNESS_ROOT, REPO_ROOT } from "../lib/roots.ts";

const repoRoot = REPO_ROOT ?? join(HARNESS_ROOT, "..");
const SLOW = 60_000;

let built: NodeKindIndex | undefined;
const index = async () => (built ??= await nodeKindIndex(defaultGraphTypologies, HARNESS_ROOT, repoRoot));
const owner = (t: string) => typologyOwner(defaultGraphTypologies, t);
const baselines = () => new Map(readBaselines(repoRoot).map((d) => [d.instance, d.entries ?? (d.path ? [] : undefined)] as const));

describe("the table is built at publish", () => {
  test("cat-harness declares docs/_data/node-kinds.json builtAtPublish, written by node-kinds, and ignores it", () => {
    expect(tableBuiltAtPublish()).toBe(true);
    const entry = (readDeclaration(HARNESS_ROOT)?.builtAtPublish ?? []).find((e) => join(HARNESS_ROOT, e.path) === INDEX_PATH);
    expect(entry?.writer).toEqual(["node-kinds"]);
    expect(entry?.reads).toEqual(["typologies", "validators"]);
    const ignore = readFileSync(join(HARNESS_ROOT, ".gitignore"), "utf-8").split("\n");
    expect(ignore).toContain(ignoreLineFor(entry!));
  });

  test("the node-kind pages that render it are declared after it, so derive:publish writes it first", () => {
    const list = readDeclaration(HARNESS_ROOT)?.builtAtPublish ?? [];
    const table = list.findIndex((e) => e.writer.includes("node-kinds"));
    const pages = list.findIndex((e) => e.writer.includes("node-kind:pages"));
    expect(table).toBeGreaterThanOrEqual(0);
    expect(pages).toBeGreaterThan(table);
    expect(list.some((e) => e.path === "docs/en/cat-harness/node-kind-index/" && e.writer.includes("node-kind:pages"))).toBe(true);
  });

  test("the combined build is a node-kind-index whose unkinded families are exactly the instances' baselines", async () => {
    const file = JSON.parse(render(await index()));
    expect(NodeKindIndexFileKind.schema.safeParse(file).success).toBe(true);
    const held = [...baselines().values()].flatMap((b) => b ?? []).map(unkindedKey).sort();
    expect((file.unkinded as { typology: string; family?: string }[]).map(unkindedKey).sort()).toEqual(held);
  }, SLOW);
});

describe("each instance's baseline, on this checkout", () => {
  test("every declared baseline parses, and every one names only its own instance's families", () => {
    const declared = readBaselines(repoRoot);
    expect(declared.filter((d) => d.error).map((d) => `${d.instance}: ${d.error}`)).toEqual([]);
    for (const d of declared) for (const e of d.entries ?? []) expect(`${owner(e.typology)} ${unkindedKey(e)}`).toBe(`${d.instance} ${unkindedKey(e)}`);
  });

  test("DAY ONE: the gate passes exactly as the shared baseline did — nothing new, gone, foreign or unattributed", async () => {
    const { layers, unattributed } = ratchet(await index(), owner, baselines());
    expect(unattributed.map(unkindedKey)).toEqual([]);
    expect(layers.flatMap((l) => [...l.fresh, ...l.gone, ...l.foreign].map((k) => `${l.instance} ${k}`))).toEqual([]);
  }, SLOW);

  test("a NEW unkinded family fails in the layer that declares its typology, and nowhere else", async () => {
    const real = await index();
    const victim = real.unkinded.find((u) => owner(u.typology) !== undefined && owner(u.typology) !== readDeclaration(HARNESS_ROOT)?.name) ?? real.unkinded[0]!;
    const added = { typology: victim.typology, family: "a-family-nobody-baselined/v1", reason: "zod-schema" as const };
    const { layers } = ratchet({ unkinded: [...real.unkinded, added] }, owner, baselines());
    const failing = layers.filter((l) => l.fresh.length > 0).map((l) => [l.instance, l.fresh]);
    expect(failing).toEqual([[owner(victim.typology)!, [unkindedKey(added)]]]);
  }, SLOW);
});
