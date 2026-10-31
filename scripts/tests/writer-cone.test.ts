/**
 * Writer records for the rerun-and-measure deploy (bean `fwtz`, option B).
 * @covers scripts/writer-cone.ts
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTrace } from "../ci-cone.ts";
import { FileDigests } from "../input-hash.ts";
import { decideWriter, emptyRecords, tracedArgv, writerRecordOf } from "../writer-cone.ts";

const ROOT = "/work/repo";

describe("parseTrace in collect mode — a writer's reads and writes", () => {
  const collect = (lines: string[]) => parseTrace(lines.join("\n"), ROOT, { writes: "collect" });

  test("what it wrote is output, not input; a path probed absent and then created was absent before", () => {
    const r = collect([
      `10 openat(AT_FDCWD</work/repo>, "beans/defs/a.md", O_RDONLY|O_CLOEXEC) = 3</work/repo/beans/defs/a.md>`,
      `10 newfstatat(AT_FDCWD</work/repo>, "site/out", 0x7ffc, 0) = -1 ENOENT (No such file or directory)`,
      `10 mkdir("/work/repo/site/out", 0777) = 0`,
      `10 openat(AT_FDCWD</work/repo>, "site/out/index.json", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 4</work/repo/site/out/index.json>`,
    ]);
    expect(r).toEqual({ paths: ["beans/defs/a.md"], git: [], writes: ["site/out", "site/out/index.json"], absentBefore: ["site/out"] });
  });

  test("a path it read while it existed and then rewrote cannot be replayed", () => {
    const r = collect([
      `10 openat(AT_FDCWD</work/repo>, "site/out/index.json", O_RDONLY|O_CLOEXEC) = 3</work/repo/site/out/index.json>`,
      `10 openat(AT_FDCWD</work/repo>, "site/out/index.json", O_WRONLY|O_TRUNC|O_CLOEXEC) = 4</work/repo/site/out/index.json>`,
    ]);
    expect(r).toEqual({ undetermined: "the writer reads site/out/index.json and then rewrites it" });
  });

  test("the default still refuses any write (checks are unchanged)", () => {
    const r = parseTrace(`10 openat(AT_FDCWD</work/repo>, "x", O_WRONLY|O_CREAT, 0644) = 3</work/repo/x>`, ROOT);
    expect("undetermined" in r).toBe(true);
  });
});

describe("writerRecordOf and decideWriter", () => {
  const fp = { hash: "base1" } as const;

  test("records reads with their state and outputs, then skips only while every read matches", () => {
    const root = mkdtempSync(join(tmpdir(), "writer-cone-"));
    try {
      mkdirSync(join(root, "in"), { recursive: true });
      writeFileSync(join(root, "in/a.txt"), "one");
      mkdirSync(join(root, "out"), { recursive: true });
      writeFileSync(join(root, "out/o.json"), "{}");
      const rec = writerRecordOf({
        sha: "abc123",
        ran: true,
        before: fp,
        after: fp,
        reads: { paths: ["in/a.txt"], git: [], writes: ["out/o.json"], absentBefore: ["later"] },
        reached: undefined,
        root,
        digests: new FileDigests(root),
      });
      if ("none" in rec) throw new Error(rec.none);
      expect(Object.keys(rec.reads).sort()).toEqual(["in/a.txt", "later"]);
      expect(rec.reads["later"]).toBe("absent");
      expect(Object.keys(rec.outputs)).toEqual(["out/o.json"]);

      const records = emptyRecords("abc123");
      records.writers["w"] = rec;
      expect(decideWriter(records, "w", fp, root, new FileDigests(root)).skip).toBe(true);
      expect(decideWriter(records, "w", { hash: "other" }, root, new FileDigests(root))).toEqual({ skip: false, why: "its script, imports, audited environment or tools changed" });
      writeFileSync(join(root, "in/a.txt"), "two");
      expect(decideWriter(records, "w", fp, root, new FileDigests(root))).toEqual({ skip: false, why: "in/a.txt changed" });
      writeFileSync(join(root, "in/a.txt"), "one");
      writeFileSync(join(root, "later"), "now here");
      expect(decideWriter(records, "w", fp, root, new FileDigests(root))).toEqual({ skip: false, why: "later changed" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("records nothing for a failed run, a traced site, a moved fingerprint or an unenumerable trace", () => {
    const base = { sha: "s", ran: true, before: fp, after: fp, reads: { paths: [], git: [] }, reached: undefined, root: ROOT, digests: new FileDigests(ROOT) };
    expect(writerRecordOf({ ...base, ran: false })).toEqual({ none: "the writer did not succeed" });
    expect(writerRecordOf({ ...base, reached: "network" })).toEqual({ none: "the run reached a traced input site (network)" });
    expect(writerRecordOf({ ...base, after: { hash: "moved" } })).toEqual({ none: "its script, imports or audited environment moved while it ran" });
    expect(writerRecordOf({ ...base, reads: { undetermined: "why" } })).toEqual({ none: "why" });
  });

  test("no records, or an unrecorded writer, always runs", () => {
    expect(decideWriter(undefined, "w", fp, ROOT, new FileDigests(ROOT)).skip).toBe(false);
    const r = emptyRecords("abc");
    r.unrecorded["w"] = "the run reached a traced input site (clock)";
    expect(decideWriter(r, "w", fp, ROOT, new FileDigests(ROOT))).toEqual({ skip: false, why: "not recorded: the run reached a traced input site (clock)" });
  });

  test("tracedArgv wraps the writer in strace", () => {
    expect(tracedArgv(["bun", "run", "cat", "w"], "/tmp/l").slice(-6)).toEqual(["-o", "/tmp/l", "bun", "run", "cat", "w"]);
    expect(tracedArgv(["x"], "/tmp/l")[0]).toBe("strace");
  });
});
