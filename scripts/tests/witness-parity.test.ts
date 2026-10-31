/**
 * `witness:parity`: the comparison, the environment check, and the three
 * verdicts end to end against a throwaway git repository whose producers are
 * tracked scripts invoked as direct argv (never `bash -c`).
 */
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripEphemeral } from "../../schemas/computation-witness.ts";
import { checkParity, diffPaths, environmentMismatch, parseReproduce, resolveScript } from "../witness-parity.ts";

describe("stripEphemeral", () => {
  it("removes run-specific fields at every depth and keeps the rest", () => {
    const w = { computedAt: "t", data: { x: 1, elapsed_s: 2, rows: [{ durationMs: 3, y: 4 }] }, environment: { a: "1" } };
    expect(stripEphemeral(w)).toEqual({ data: { x: 1, rows: [{ y: 4 }] } });
  });
  it("masks extra keys on request", () => {
    expect(stripEphemeral({ a: 1, b: 2 }, new Set(["b"]))).toEqual({ a: 1 });
  });
});

describe("diffPaths", () => {
  it("ignores key order and names each differing path", () => {
    expect(diffPaths({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([]);
    expect(diffPaths({ a: 1, b: [1, 2] }, { a: 2, b: [1, 3], c: 0 })).toEqual(["$.a", "$.b[1]", "$.c (added)"]);
    expect(diffPaths([1], [1, 2])).toEqual(["$ (length 1 → 2)"]);
  });
});

describe("environmentMismatch", () => {
  const installed = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, n === "mpmath" ? "1.3.0" : n === "python" ? "3.11.15" : null]));
  it("reports a missing or different package, and skips build fingerprints", () => {
    const env = { python: "3.11.15", mpmath: "1.3.0", pyhecke_native: "0.9.0", pyhecke_native_build: "abc" };
    expect(environmentMismatch(env, installed)).toEqual([{ key: "pyhecke_native", recorded: "0.9.0", installed: null }]);
  });
  it("treats a witness with no environment as matching", () => {
    expect(environmentMismatch(undefined, installed)).toEqual([]);
  });
});

describe("checkParity", () => {
  const COPY_SCRIPT = "import shutil\nshutil.copy('computations/out.json', 'computations/w.witness.json')\n";
  /** A repo whose producer writes `out` to `computations/w.witness.json`. */
  function repo(witness: object, producerOut: string, scriptBody = COPY_SCRIPT) {
    const root = mkdtempSync(join(tmpdir(), "witness-parity-"));
    const g = (...a: string[]) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
    g("init", "-q");
    g("config", "user.email", "t@t");
    g("config", "user.name", "t");
    mkdirSync(join(root, "computations"));
    writeFileSync(join(root, "computations", "p.py"), scriptBody);
    writeFileSync(join(root, "computations", "w.witness.json"), JSON.stringify(witness));
    writeFileSync(join(root, "computations", "out.json"), producerOut);
    g("add", "-A");
    g("commit", "-qm", "init");
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  }
  const base = { scriptFile: "computations/p.py", data: { x: 1 } };
  const run = (cmd = "python3 -u computations/p.py") => ({ ...base, invocation: { reproduce: cmd } });

  it("passes when the producer rewrites the same witness, run-specific fields aside", () => {
    const w = run();
    const t = repo({ ...w, computedAt: "old" }, JSON.stringify({ ...w, computedAt: "new", durationMs: 9 }));
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("pass");
    } finally {
      t.cleanup();
    }
  });

  it("fails, naming the path, when the producer writes a different value", () => {
    const w = run();
    const t = repo(w, JSON.stringify({ ...w, data: { x: 2 } }));
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("fail");
      expect(r.diff).toEqual(["$.data.x"]);
    } finally {
      t.cleanup();
    }
  });

  it("is unknown, not fail, when the producer exits non-zero", () => {
    const w = run();
    const t = repo(w, "{}", "import sys\nprint('refusing: precision floor not met')\nsys.exit(3)\n");
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("unknown");
      expect(r.reason).toContain("exited 3");
      expect(r.reason).toContain("precision floor");
    } finally {
      t.cleanup();
    }
  });

  it("is unknown on an environment mismatch, and does not run the producer", () => {
    const w = { ...run("touch ran-anyway"), environment: { surely_not_installed_pkg: "9.9.9" } };
    const t = repo(w, "{}");
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("unknown");
      expect(r.envMismatch?.[0]?.key).toBe("surely_not_installed_pkg");
    } finally {
      t.cleanup();
    }
  });

  it("is unknown when the re-run records a different environment, e.g. another native build", () => {
    const w = { ...run(), environment: { ext_build: "aaa" } };
    const t = repo(w, JSON.stringify({ ...w, environment: { ext_build: "bbb" }, data: { x: 1.0000001 } }));
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("unknown");
      expect(r.reason).toContain("environment.ext_build");
    } finally {
      t.cleanup();
    }
  });

  it("is unknown, not fail, when the witness was written by another version of its script", () => {
    const w = { ...run(), scriptHash: "aaa" };
    const t = repo(w, JSON.stringify({ ...w, scriptHash: "bbb", data: { x: 2 } }));
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("unknown");
      expect(r.reason).toContain("stale");
    } finally {
      t.cleanup();
    }
  });

  it("leaves the folio's own checkout untouched", () => {
    const w = run();
    const t = repo(w, JSON.stringify({ ...w, data: { x: 99 } }));
    try {
      const before = readFileSync(join(t.root, "computations", "w.witness.json"), "utf8");
      checkParity(t.root, "computations/w.witness.json");
      expect(readFileSync(join(t.root, "computations", "w.witness.json"), "utf8")).toBe(before);
      const st = spawnSync("git", ["status", "--porcelain"], { cwd: t.root, encoding: "utf8" });
      expect(st.stdout).toBe("");
      const wl = spawnSync("git", ["worktree", "list"], { cwd: t.root, encoding: "utf8" });
      expect(wl.stdout.trim().split("\n")).toHaveLength(1);
    } finally {
      t.cleanup();
    }
  });

  it("refuses a witness whose reproduce is 'touch /tmp/x; true' without executing it (bean cat-tools-w7tx)", () => {
    const dir = mkdtempSync(join(tmpdir(), "w7tx-marker-"));
    const marker = join(dir, "pwned");
    const w = run(`touch ${marker}; true`);
    const t = repo(w, "{}");
    try {
      const r = checkParity(t.root, "computations/w.witness.json");
      expect(r.verdict).toBe("unknown");
      expect(r.reason).toContain("refused");
      expect(existsSync(marker)).toBe(false);
    } finally {
      t.cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses unlisted executables, inline code flags (-c), and strips non-allowlisted environment variables (bean cat-tools-w7tx)", () => {
    const w = { ...run(), data: { secret: "absent" } };
    const t = repo(
      w,
      "{}",
      "import json, os, pathlib\np = pathlib.Path('computations/w.witness.json')\nd = json.loads(p.read_text())\nd['data'] = {'secret': os.environ.get('WITNESS_SECRET_TEST', 'absent')}\np.write_text(json.dumps(d))\n",
    );
    try {
      expect(parseReproduce("bash computations/p.py", t.root, "computations/w.witness.json")).toEqual({
        reason: expect.stringContaining("not in the allowed producer table"),
      });
      expect(parseReproduce("python3 -c import_os", t.root, "computations/w.witness.json")).toEqual({
        reason: expect.stringContaining("executes inline code"),
      });
      expect(parseReproduce("python3 computations/missing.py", t.root, "computations/w.witness.json")).toEqual({
        reason: expect.stringContaining("resolves to no unique tracked file"),
      });

      process.env.WITNESS_SECRET_TEST = "leaked-token";
      const r = checkParity(t.root, "computations/w.witness.json");
      // The producer sees "absent" for WITNESS_SECRET_TEST because non-allowlisted env vars are stripped.
      expect(r.verdict).toBe("pass");
    } finally {
      delete process.env.WITNESS_SECRET_TEST;
      t.cleanup();
    }
  });
});

describe("resolveScript", () => {
  it("finds a bare scriptFile beside the witness, else by its unique name, else nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "witness-parity-resolve-"));
    const g = (...a: string[]) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
    try {
      g("init", "-q");
      g("config", "user.email", "t@t");
      g("config", "user.name", "t");
      for (const f of ["computations/probes/p.py", "computations/probes/w.witness.json", "computations/other/q.py", "a/dup.py", "b/dup.py"]) {
        mkdirSync(join(root, f, ".."), { recursive: true });
        writeFileSync(join(root, f), "");
      }
      g("add", "-A");
      g("commit", "-qm", "init");
      expect(resolveScript(root, "computations/probes/w.witness.json", "p.py")).toBe("computations/probes/p.py");
      expect(resolveScript(root, "computations/probes/w.witness.json", "q.py")).toBe("computations/other/q.py");
      expect(resolveScript(root, "computations/probes/w.witness.json", "dup.py")).toBeUndefined();
      expect(resolveScript(root, "computations/probes/w.witness.json", "computations/other/q.py")).toBe("computations/other/q.py");
      expect(resolveScript(root, "computations/probes/w.witness.json", "missing.py")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
