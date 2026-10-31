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
import { decideWriter, emptyRecords, tracedArgv, underOutputs, verifySummary, verifyWriters, writerRecordOf } from "../writer-cone.ts";

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

  test("a write that failed is a probe: mkdir -p meeting an existing directory does not rewrite it", () => {
    const r = collect([
      `10 newfstatat(AT_FDCWD</work/repo>, "smart-base/docs", {st_mode=S_IFDIR|0755}, 0) = 0`,
      `10 mkdir("/work/repo/smart-base/docs", 0777) = -1 EEXIST (File exists)`,
      `10 openat(AT_FDCWD</work/repo>, "smart-base/docs/p.md", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 4</work/repo/smart-base/docs/p.md>`,
    ]);
    expect(r).toEqual({ paths: ["smart-base/docs"], git: [], writes: ["smart-base/docs/p.md"], absentBefore: [] });
  });

  test("a call strace lost as a thread detached names nothing, and is passed over", () => {
    const r = collect([`10 openat(AT_FDCWD</work/repo>, "a.md", O_RDONLY|O_CLOEXEC) = 3</work/repo/a.md>`, `11 ???( <detached ...>`]);
    expect(r).toEqual({ paths: ["a.md"], git: [], writes: [], absentBefore: [] });
  });

  test("git run with an absolute -C at the root is replayed from the root", () => {
    const r = collect([
      `20 getcwd("/work/repo", 4096) = 11`,
      `20 execve("/usr/bin/git", ["git", "-C", "/work/repo", "remote", "get-url", "origin"], 0x1 /* 3 vars */) = 0`,
    ]);
    expect(r).toEqual({ paths: [], git: [{ cwd: "", args: ["remote", "get-url", "origin"] }], writes: [], absentBefore: [] });
  });

  test("re-reading its own declared output before rewriting it is not an input; anything else still refuses", () => {
    const lines = [
      `10 openat(AT_FDCWD</work/repo>, "docs/out/index.html", O_RDONLY|O_CLOEXEC) = 3</work/repo/docs/out/index.html>`,
      `10 openat(AT_FDCWD</work/repo>, "docs/out/index.html", O_WRONLY|O_TRUNC|O_CLOEXEC) = 4</work/repo/docs/out/index.html>`,
    ];
    const own = underOutputs(["docs/out/"]);
    expect(parseTrace(lines.join("\n"), ROOT, { writes: "collect", ownOutput: own })).toEqual({ paths: [], git: [], writes: ["docs/out/index.html"], absentBefore: [] });
    expect(parseTrace(lines.join("\n"), ROOT, { writes: "collect", ownOutput: underOutputs(["docs/other/", "docs/out"]) })).toEqual({
      undetermined: "the writer reads docs/out/index.html and then rewrites it",
    });
    expect(underOutputs(["a/b/", "c.json"])("a/b")).toBe(true);
    expect(underOutputs(["a/b/", "c.json"])("a/bc")).toBe(false);
    expect(underOutputs(["a/b/", "c.json"])("c.json")).toBe(true);
  });

  test("the default still refuses any write (checks are unchanged)", () => {
    const r = parseTrace(`10 openat(AT_FDCWD</work/repo>, "x", O_WRONLY|O_CREAT, 0644) = 3</work/repo/x>`, ROOT);
    expect("undetermined" in r).toBe(true);
  });
});

describe("writerRecordOf and decideWriter", () => {
  const fp = { hash: "base1", audit: "clean" } as const;

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
      // A path it probed absent and created is its own output, not an input.
      expect(Object.keys(rec.reads)).toEqual(["in/a.txt"]);
      expect(Object.keys(rec.outputs)).toEqual(["out/o.json"]);

      const records = emptyRecords("abc123");
      records.writers["w"] = rec;
      const yes = decideWriter(records, "w", fp, root, new FileDigests(root));
      expect(yes.skip && yes.proof).toBe(true);
      records.writers["w"] = { ...rec, audit: "unannotated env site" };
      const ev = decideWriter(records, "w", fp, root, new FileDigests(root));
      expect(ev.skip && !ev.proof && ev.why.includes("evidence only")).toBe(true);
      records.writers["w"] = rec;
      expect(decideWriter(records, "w", { hash: "other", audit: "clean" }, root, new FileDigests(root))).toEqual({ skip: false, why: "its script, imports, audited environment or tools changed" });
      writeFileSync(join(root, "in/a.txt"), "two");
      expect(decideWriter(records, "w", fp, root, new FileDigests(root))).toEqual({ skip: false, why: "in/a.txt changed" });
      writeFileSync(join(root, "in/a.txt"), "one");

      // verifyWriters: a skippable writer whose fresh output matches is safe; one that differs is unsafe.
      const v = (files: string[]) => verifyWriters({ prev: records, writers: ["w", "x"], base: () => fp, root, digests: new FileDigests(root), filesNow: (w) => (w === "w" ? files : []) });
      expect(v(["out/o.json"])).toEqual([
        { writer: "w", verdict: "skip-safe", proof: true, outputs: 1 },
        { writer: "x", verdict: "rerun", why: "the deploy at abc123 recorded nothing for it" },
      ]);
      writeFileSync(join(root, "out/o.json"), '{"changed":1}');
      expect(v(["out/o.json", "out/new.json"])[0]).toEqual({ writer: "w", verdict: "skip-unsafe", proof: true, differs: ["out/new.json (not in the record)", "out/o.json"] });
      expect(verifySummary(v(["out/o.json"]), "abc123")).toContain("**unsafe**");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("records nothing for a failed run, a traced site, a moved fingerprint or an unenumerable trace", () => {
    const base = { sha: "s", ran: true, before: fp, after: fp, reads: { paths: [], git: [] }, reached: undefined, root: ROOT, digests: new FileDigests(ROOT) };
    expect(writerRecordOf({ ...base, ran: false })).toEqual({ none: "the writer did not succeed" });
    expect(writerRecordOf({ ...base, reached: "network" })).toEqual({ none: "the run reached a traced input site (network)" });
    expect(writerRecordOf({ ...base, after: { hash: "moved", audit: "clean" } })).toEqual({ none: "its script, imports or audited environment moved while it ran" });
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
