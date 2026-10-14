/**
 * `writeAllSync` delivers the whole document through a PIPE, even when the
 * writer exits immediately after — the case `fs.writeSync` alone truncated at
 * the pipe buffer (64 KiB), which `kg-audit --json` hit.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const MODULE = join(import.meta.dir, "..", "lib", "write-all-sync.ts");

/**
 * Spawn a child that writes `bytes` characters with `how`, then exits at once.
 *
 * It touches `process.stdout` first, as `kg-audit` does by logging: Bun then
 * puts fd 1 in non-blocking mode, which is the condition under which one
 * `writeSync` returns short or throws `EAGAIN`. A child that never touched it
 * would block on the pipe and prove nothing.
 */
async function piped(how: "writeSync" | "writeAllSync", bytes: number): Promise<number> {
  const prelude = `process.stdout.write("");`;
  const body =
    how === "writeAllSync"
      ? `import { writeAllSync } from ${JSON.stringify(MODULE)}; ${prelude} writeAllSync(1, "x".repeat(${bytes})); process.exit(0);`
      : `import { writeSync } from "node:fs"; ${prelude} try { writeSync(1, "x".repeat(${bytes})); } catch {} process.exit(0);`;
  const p = Bun.spawn(["bun", "-e", body], { stdout: "pipe", stderr: "pipe" });
  // Read slowly at first, so the child meets a full pipe buffer before exiting.
  await Bun.sleep(200);
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.length;
}

describe("a whole document through a pipe", () => {
  const SIZE = 1_000_000;

  test("writeAllSync delivers every byte before the writer exits", async () => {
    expect(await piped("writeAllSync", SIZE)).toBe(SIZE);
  });

  test("the defect it replaces is real: one writeSync stops at the pipe buffer", async () => {
    // Anti-vacuity: without this, a runtime that happened to block on the pipe
    // would make the test above pass for a reason that has nothing to do with
    // the helper.
    expect(await piped("writeSync", SIZE)).toBeLessThan(SIZE);
  });
});
