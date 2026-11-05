/**
 * The pre-push gate hook: reading a push, the tree-keyed record, and the
 * verdict on a throwaway repository whose `cat` runner is a stub that writes
 * the report a real `bun run cat gates --report` would.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { judge, parsePushCommand, parsePushStdin } from "../pre-push-gates.ts";
import { buildRecord, covers, readRecord, stateDir, toolVersions, treeOf, type GatesReportLike } from "../gate-record.ts";

const PASS: GatesReportLike = {
  $schema: "folio-gates-report/v1",
  outcome: "pass",
  exitCode: 0,
  set: "fast",
  gates: 2,
  commands: ["bun run cat check:a", "bun run cat check:b"],
  failed: [],
  skipped: [{ command: "bun run cat check:b", why: "inputs unchanged" }],
  undetermined: [],
};

describe("parsePushCommand", () => {
  test("a plain push pushes HEAD", () => {
    expect(parsePushCommand("git push -u origin claude/x")).toEqual({ sources: ["claude/x"], noVerify: false, dryRun: false });
    expect(parsePushCommand("git push")?.sources).toEqual(["HEAD"]);
  });
  test("finds the push inside a compound command, past git's own options", () => {
    expect(parsePushCommand("cd a && git -C . push origin HEAD:refs/heads/b")?.sources).toEqual(["HEAD"]);
  });
  test("a delete names no source", () => {
    expect(parsePushCommand("git push origin :old")?.sources).toEqual([]);
  });
  test("reads the bypass reason and --no-verify", () => {
    const p = parsePushCommand("CAT_GATES_BYPASS='ci is down' git push --no-verify origin x");
    expect(p?.bypass).toBe("ci is down");
    expect(p?.noVerify).toBe(true);
  });
  test("a dry run and a non-push are told apart", () => {
    expect(parsePushCommand("git push -n origin x")?.dryRun).toBe(true);
    expect(parsePushCommand("git status && echo git push")).toBeUndefined();
    expect(parsePushCommand("git log --oneline")).toBeUndefined();
  });
});

test("parsePushStdin reads git's four fields per line", () => {
  const z = "0".repeat(40);
  expect(parsePushStdin(`refs/heads/a ${"1".repeat(40)} refs/heads/a ${z}\n\n`)).toEqual([
    { localRef: "refs/heads/a", localSha: "1".repeat(40), remoteRef: "refs/heads/a", remoteSha: z },
  ]);
});

describe("the record", () => {
  const ctx = { tree: "a".repeat(40), commit: "b".repeat(40), tools: { bun: "1.0.0", git: "2", platform: "x" }, runBy: "human" as const, startedAt: "s", finishedAt: "f" };
  test("only a pass that names its gate set is recorded", () => {
    expect(buildRecord(PASS, ctx)?.gates).toEqual(PASS.commands!);
    expect(buildRecord({ ...PASS, outcome: "fail", exitCode: 1 }, ctx)).toBeUndefined();
    expect(buildRecord({ ...PASS, commands: undefined }, ctx)).toBeUndefined();
    expect(buildRecord({ ...PASS, commands: ["one"] }, ctx)).toBeUndefined();
  });
  test("covers needs the same tree and the same bun", () => {
    const rec = buildRecord(PASS, ctx)!;
    expect(covers(rec, ctx.tree, ctx.tools).covered).toBe(true);
    expect(covers(rec, "c".repeat(40), ctx.tools).covered).toBe(false);
    expect(covers(rec, ctx.tree, { ...ctx.tools, bun: "9.9.9" }).covered).toBe(false);
    expect(covers(undefined, ctx.tree, ctx.tools).covered).toBe(false);
  });
});

describe("judge, on a throwaway repository", () => {
  let root: string;
  const sh = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  /** A `cat` runner stub: writes the report and exits with `code`, counting its runs. */
  const stub = (code: number, report: GatesReportLike) => {
    writeFileSync(join(root, "report.fixture.json"), JSON.stringify(report));
    writeFileSync(
      join(root, "fake-cat.ts"),
      `import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const a = process.argv; const out = a[a.indexOf("--report") + 1]!;
appendFileSync(${JSON.stringify(join(root, "runs.txt"))}, "x");
writeFileSync(out, readFileSync(${JSON.stringify(join(root, "report.fixture.json"))}, "utf-8"));
process.exit(${code});\n`,
    );
  };
  const runs = () => (existsSync(join(root, "runs.txt")) ? readFileSync(join(root, "runs.txt"), "utf-8").length : 0);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pre-push-"));
    sh("init", "-q");
    sh("config", "user.email", "t@example.invalid");
    sh("config", "user.name", "t");
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { cat: "bun run fake-cat.ts" } }));
    writeFileSync(join(root, ".gitignore"), "fake-cat.ts\nreport.fixture.json\nruns.txt\n");
    sh("add", "-A");
    sh("commit", "-qm", "init");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("a pass is recorded and noted, and the same tree is not judged twice", async () => {
    stub(0, PASS);
    const head = sh("rev-parse", "HEAD").stdout.trim();
    expect((await judge(root, [head])).kind).toBe("allow");
    expect(runs()).toBe(1);
    const tree = treeOf(root, head)!;
    expect(covers(readRecord(root, tree), tree, toolVersions(root)).covered).toBe(true);
    expect(JSON.parse(sh("notes", "--ref=refs/notes/cat-gates", "show", head).stdout).tree).toBe(tree);
    // An amend of the message keeps the tree: still covered, no second run.
    sh("commit", "-q", "--amend", "-m", "reworded");
    expect((await judge(root, [sh("rev-parse", "HEAD").stdout.trim()])).kind).toBe("allow");
    expect(runs()).toBe(1);
  });

  test("a red gate refuses, and leaves no record", async () => {
    stub(1, { ...PASS, outcome: "fail", exitCode: 1, failed: [{ command: "bun run cat check:a", job: "j", step: "s", why: ["boom"] }] });
    const head = sh("rev-parse", "HEAD").stdout.trim();
    const v = await judge(root, [head]);
    expect(v.kind).toBe("refuse");
    expect(v.kind === "refuse" && v.why.join("\n")).toContain("check:a");
    expect(readRecord(root, treeOf(root, head)!)).toBeUndefined();
  });

  test("exit 2 is undetermined, not a pass", async () => {
    stub(2, { ...PASS, outcome: "undetermined", exitCode: 2 });
    expect((await judge(root, [sh("rev-parse", "HEAD").stdout.trim()])).kind).toBe("undetermined");
  });

  test("a dirty tracked file, or a commit not checked out, is refused before any gate runs", async () => {
    stub(0, PASS);
    const first = sh("rev-parse", "HEAD").stdout.trim();
    writeFileSync(join(root, ".gitignore"), "changed\n");
    expect((await judge(root, [first])).kind).toBe("refuse");
    sh("commit", "-qam", "second");
    expect((await judge(root, [first])).kind).toBe("refuse");
    expect(runs()).toBe(0);
  });

  test("no cat runner is undetermined", async () => {
    writeFileSync(join(root, "package.json"), "{}");
    sh("commit", "-qam", "no runner");
    expect((await judge(root, [sh("rev-parse", "HEAD").stdout.trim()])).kind).toBe("undetermined");
    expect(existsSync(stateDir(root))).toBe(false);
  });
});
