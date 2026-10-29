#!/usr/bin/env bun
/**
 * Render stage 3 (`kg-dynamic`): publish the running workflows' state as
 * JSON-LD at `<site>/<harness>/state.jsonld` (bean 6h47 / cat-tools-1as6).
 *
 * Owner, 2026-09-20: *"dynamic content then gets json/jsonld export available
 * under cat-harness/state.jsonld or so (whatever matches the dynamic state
 * visualisers)"*. Settled 2026-10-29 (Lane B card Q1, option A): the workflow
 * pages are that visualiser, and they read this file when they load.
 *
 * It is a different document from the stage-1 graph export: a different
 * name, `type: cat-harness:DynamicState` and `$schema:
 * cat-harness-dynamic-state/v1`, holding only instances, positions and stuck
 * states. Built by the same readers the workflow pages use
 * (`dynamicStateInputs`), so the two never disagree about which instances
 * exist.
 *
 * Usage:
 *   bun run cat-harness-tools/scripts/dynamic-state-export.ts [--site <dir>] [--out <file>]
 *
 * A store that could not be read (a checkout without its bean branch) is
 * named in `unreadStores`, so its instances read as unknown, never as none.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { dynamicStateInputs, dynamicStateTarget } from "./state-visualizer.ts";
import { dynamicStateDocument } from "./workflow-view.ts";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string" }, site: { type: "string" } }, strict: false });
  const out = typeof values.out === "string" ? resolve(values.out) : dynamicStateTarget();
  const { harness, inputs, unread } = await dynamicStateInputs();
  const doc = dynamicStateDocument(harness, inputs, new Date(), unread);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
  const stuck = doc.graph.filter((n) => n.stuck.length > 0).length;
  console.log(
    `dynamic-state-export: ${doc.graph.length} instance(s), ${stuck} stuck` +
      (unread.length > 0 ? `; could not read ${unread.join(", ")} (named in unreadStores)` : "") +
      ` → ${out}`,
  );
}

if (import.meta.main) await main();
