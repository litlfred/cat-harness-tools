/**
 * keep-shared-payloads: a main deploy keeps a payload blob it drops while an
 * older preview may still borrow it (bean fwtz, Q-S2-2).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { payloadFiles, planKeep, readRetained, sharingPreviews } from "../../keep-shared-payloads.ts";
import { planShare } from "../../staging-share.ts";

function tree(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "keep-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(d, p, ".."), { recursive: true });
    writeFileSync(join(d, p), c);
  }
  return d;
}

const A = "payload/sha256/aa";
const B = "payload/sha256/bb";

describe("planKeep", () => {
  test("keeps a dropped blob while a preview staged before the drop borrows", () => {
    const now = "2026-11-01T00:00:00.000Z";
    const r = planKeep(new Set([A, B]), new Set([B]), { version: 1, kept: {} }, [Date.parse("2026-10-31T12:00:00Z")], now);
    expect(r.kept).toEqual({ [A]: now });
  });

  test("drops it once every borrowing preview was staged after the drop", () => {
    const since = "2026-10-31T00:00:00.000Z";
    const r = planKeep(new Set([A]), new Set(), { version: 1, kept: { [A]: since } }, [Date.parse("2026-10-31T06:00:00Z")], "2026-11-01T00:00:00.000Z");
    expect(r.kept).toEqual({});
  });

  test("a preview with no staging time counts as older; no borrowing preview keeps nothing", () => {
    expect(Object.keys(planKeep(new Set([A]), new Set(), { version: 1, kept: {} }, [undefined], "2026-11-01T00:00:00Z").kept)).toEqual([A]);
    expect(planKeep(new Set([A]), new Set(), { version: 1, kept: {} }, [], "2026-11-01T00:00:00Z").kept).toEqual({});
  });

  test("a blob the new build writes again leaves the record", () => {
    expect(planKeep(new Set([A]), new Set([A]), { version: 1, kept: { [A]: "2026-10-30T00:00:00Z" } }, [undefined], "2026-11-01T00:00:00Z").kept).toEqual({});
  });
});

describe("reading the trees", () => {
  test("payload files, sharing previews and the retained record", () => {
    const site = tree({
      [A]: "a",
      "payload/sha256/sub/cc.json": "{}",
      "STAGING/one/shared.json": "{}",
      "STAGING/one/.staged-at": "2026-10-31T12:00:00Z",
      "STAGING/two/index.html": "x",
      "STAGING/_retired/x.json": "{}",
      "payload/retained.json": JSON.stringify({ version: 1, kept: { [A]: "2026-10-31T00:00:00Z" } }),
    });
    expect([...payloadFiles(site)].sort()).toEqual([A, "payload/sha256/sub/cc.json"]);
    expect(sharingPreviews(site)).toEqual([Date.parse("2026-10-31T12:00:00Z")]);
    expect(readRetained(site).kept).toEqual({ [A]: "2026-10-31T00:00:00Z" });
    expect(readRetained(tree({})).kept).toEqual({});
  });

  test("staging-share never lets a new preview borrow a retained blob", () => {
    const live = tree({ [A]: "a", [B]: "b", "payload/retained.json": JSON.stringify({ version: 1, kept: { [A]: "2026-10-31T00:00:00Z" } }) });
    const preview = tree({ [A]: "a", [B]: "b" });
    expect(planShare(live, preview, "s1").shared).toEqual([B]);
  });
});
