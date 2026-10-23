/**
 * `exit-status-swallowed`: a run body that reads `$?` on a line Actions'
 * `bash -e` never reaches. See `exitStatusSwallowed` in `check-workflows.ts`.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exitStatusSwallowed } from "../check-workflows.js";

const step = (body: string): string =>
  ["jobs:", "  a:", "    steps:", "      - name: s", "        run: |", ...body.split("\n").map((l) => `          ${l}`)].join("\n");

describe("exit-status-swallowed", () => {
  test("a bare call then `code=$?` is a finding, on the `code=$?` line", () => {
    const f = exitStatusSwallowed(step('set -uo pipefail\nbun run cat x > out.json\ncode=$?\ncat out.json\nexit "$code"'), "t.yml");
    expect(f).toHaveLength(1);
    expect(f[0]!.kind).toBe("exit-status-swallowed");
    expect(f[0]!.line).toBe(8);
  });

  test("a failing assignment from a substitution is the same defect", () => {
    expect(exitStatusSwallowed(step('out="$(bun x.ts)"\nrc=$?'), "t.yml")).toHaveLength(1);
  });

  test("`|| code=$?` is the sanctioned form", () => {
    expect(exitStatusSwallowed(step("code=0\nbun run cat x || code=$?\nexit $code"), "t.yml")).toEqual([]);
  });

  test("`set +e` earlier in the same body makes the read reachable", () => {
    expect(exitStatusSwallowed(step("set +e\nbun run cat x\ncode=$?"), "t.yml")).toEqual([]);
    expect(exitStatusSwallowed(step("set -u +e\nbun x\ncode=$?"), "t.yml")).toEqual([]);
    expect(exitStatusSwallowed(step("set +o errexit\nbun x\ncode=$?"), "t.yml")).toEqual([]);
  });

  test("`set +e` in ANOTHER step does not cover this one", () => {
    const two = `${step("set +e\nbun x\ncode=$?")}\n      - name: t\n        run: |\n          bun y\n          code=$?`;
    const f = exitStatusSwallowed(two, "t.yml");
    expect(f).toHaveLength(1);
    expect(f[0]!.line).toBe(two.split("\n").length);
  });

  test("the first line of an else, or of a `|| {` group, reads the failed command's status", () => {
    // feature-staging.yml / docs-site.yml: shell-exit-status.test.ts refuses $? after a substitution.
    const ifElse = 'if DIR=$(bun x.ts); then\n  DIR=${DIR%/}\nelse\n  rc=$?\n  [ "$rc" -eq 3 ] || exit "$rc"\nfi';
    expect(exitStatusSwallowed(step(ifElse), "t.yml")).toEqual([]);
    expect(exitStatusSwallowed(step("if bun x.ts; then :; else\n  rc=$?\nfi"), "t.yml")).toEqual([]);
    expect(exitStatusSwallowed(step("bun x.ts || {\n  rc=$?\n  exit $rc\n}"), "t.yml")).toEqual([]);
  });

  test("the else exemption is the first line only", () => {
    const later = "if bun x.ts; then :; else\n  bun y.ts\n  rc=$?\nfi";
    expect(exitStatusSwallowed(step(later), "t.yml")).toHaveLength(1);
  });

  test("a comment naming `code=$?` is not a read", () => {
    expect(exitStatusSwallowed(step("# then code=$? would be skipped\ncode=0\nbun x || code=$?"), "t.yml")).toEqual([]);
  });

  test("this layer's own workflows are clean", () => {
    const dir = resolve(import.meta.dir, "..", "..", ".github", "workflows");
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(exitStatusSwallowed(readFileSync(join(dir, f), "utf-8"), f)).toEqual([]);
  });
});
