/**
 * `.github/mount-from-lock.sh` fetches `scripts/mount-from-lock.ts` ALONE at
 * the pinned commit and runs it, before any layer is on disk. A relative
 * import there fails to resolve and every CI job's mount step fails with it
 * (folio-assistant#3011: `Cannot find module '../schemas/sdlc/input-trace.ts'`).
 * The header's rule, checked: it imports nothing but `node:*`.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("mount-from-lock.ts imports nothing but node:*", () => {
  const src = readFileSync(new URL("../scripts/mount-from-lock.ts", import.meta.url), "utf-8");
  const specs = [...src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)].map((m) => m[1]);
  expect(specs.length).toBeGreaterThan(0);
  expect(specs.filter((s) => !s!.startsWith("node:"))).toEqual([]);
});
