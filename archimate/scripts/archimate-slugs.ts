#!/usr/bin/env bun
/**
 * Write, or check, an instance's `cat-archimate.slugs.json`: the readable
 * page path pinned for each ArchiMate view and element (`schemas/slugs.ts`).
 *
 * @module cat-harness/archimate/scripts/archimate-slugs
 * @covers archimate
 *
 * Usage:
 *   bun run cat-harness-tools/archimate/scripts/archimate-slugs.ts --instance <dir>          # write
 *   bun run cat-harness-tools/archimate/scripts/archimate-slugs.ts --instance <dir> --check  # gate
 *
 * Run it after adding or renaming objects in Archi, and commit the result:
 * the diff is where a reviewer sees which page paths are new and which moved
 * (an old slug stays as a redirect). The first run writes the ledger, which
 * is what turns slugs on for the instance.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { ledgerText } from "../schemas/slugs.ts";
import { ledgerPath, slugPlans } from "./check-archimate.ts";

if (import.meta.main) {
  const i = process.argv.indexOf("--instance");
  const instance = i >= 0 ? process.argv[i + 1] : undefined;
  if (!instance) {
    console.error("usage: archimate-slugs.ts --instance <dir> [--check]");
    process.exit(2);
  }
  const check = process.argv.includes("--check");
  const root = resolve(instance);
  const p = ledgerPath(root);
  const { ledger, plans } = slugPlans(root, { start: !check });
  const where = relative(process.cwd(), p);
  if (ledger === undefined) {
    console.log(`✓ ${where}: none committed — the pages keep id paths`);
    process.exit(0);
  }
  const text = ledgerText(ledger);
  const current = existsSync(p) ? readFileSync(p, "utf8") : undefined;
  const count = [...plans.values()].reduce((n, pl) => n + pl.slugOf.size, 0);
  if (current === text) {
    console.log(`✓ ${where}: current — ${count} slug(s)`);
  } else if (check) {
    console.error(`✗ ${where}: out of date — run without --check, and commit it`);
    process.exit(1);
  } else {
    writeFileSync(p, text);
    console.log(`wrote ${where}: ${count} slug(s)`);
  }
}
