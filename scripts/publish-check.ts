#!/usr/bin/env bun
/**
 * publish:check — the gate for a generator whose output is (partly) BUILT AT
 * PUBLISH: run it, then ask what a committed-bytes `--check` can no longer ask.
 *
 * @module scripts/publish-check
 * @covers none — it runs one declared writer and judges what it wrote; it reads no graph of its own
 *
 * ## Why the old `:check` cannot stay (owner, 2026-10-14, "B1")
 *
 * `auto:docs:check` and its siblings compared a generator's output with the
 * bytes the instance had COMMITTED. For an artefact an instance declares in
 * `builtAtPublish` (`@litlfred/cat-harness/schemas/kg/built-at-publish.ts`) there
 * are no committed bytes: it is computed over the checkout's other instances,
 * or from a branch-kept graph, so no commit could hold it current, and every
 * re-pin of the index turned the comparison red. Removing the comparison
 * without a replacement would leave a broken generator unseen until a publish.
 *
 * ## What it asks instead, in order
 *
 * 1. **The writer runs and exits 0** — a generator that throws is caught on the
 *    PR, not at publish.
 * 2. **The generator's own `--check` then passes against what it just wrote.**
 *    Nothing is compared with a commit any more; what that still catches is a
 *    generator that does not reach a fixed point (two runs disagree), an orphan
 *    it refuses, and every structural refusal the `--check` path already makes.
 * 3. **Every declared artefact of this writer was built**: present, and a
 *    directory not empty.
 * 4. **No COMMITTED file moved.** A generator that writes both kinds — the
 *    BPMN renderer draws this instance's own diagrams (committed, so its README
 *    renders on github.com) and other instances' (built at publish) — is still
 *    held to the committed half: any file that changed, appeared or vanished,
 *    is not under a declared path and is not ignored by ITS INSTANCE's own
 *    `.gitignore`, is stale, exactly what the old `--check` reported (see
 *    {@link ignoredBy} for why the enclosing checkout's rules are not asked).
 *
 * ```
 * bun run cat publish:check <writer-script>     # e.g. auto:docs
 * ```
 * With no declaration naming the writer it is exactly the old gate: the
 * writer's own `--check`, against committed bytes.
 *
 * ## It writes into a scratch copy, never into the checkout (owner, 2026-10-30)
 *
 * The writer runs in a copy of the checkout made for the run and deleted after
 * it ({@link scratchCopy}), and every question above is asked of the copy. The
 * mounted layers are never written. Before this, `render:bpmn:check` wrote 109
 * files into the cat-harness and bootstrap mounts on every run, so afterwards
 * `mount:remote:check` reported them "modified". On an air-gapped machine that
 * cannot re-clone a layer (bean `61tg`), that broke the mount until it was
 * re-laid by hand. The owner's ruling: a check never writes into a mount.
 *
 * Exit: 0 pass · 1 fail · 2 could not run (unknown script).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

import { readDeclaration } from "../schemas/kg/cat-harness.ts";
import { scriptsOf } from "../schemas/sdlc/script-table.ts";
import { built, declaredPlan } from "./derive-at-publish.ts";
import { readInstances } from "./check-import-direction.ts";
import { HARNESS_ROOT } from "./lib/roots.ts";

const REPO_ROOT = resolve(dirname(HARNESS_ROOT));
/** Never content: install artefacts, git, and the scratch a build writes. */
const SKIP_DIRS = new Set(["node_modules", ".git", "_site", "build"]);

/** sha256 of every file under each root, keyed repo-relative. */
export function snapshot(roots: readonly string[], repoRoot = REPO_ROOT): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const abs = join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) out.set(relative(repoRoot, abs), createHash("sha256").update(readFileSync(abs)).digest("hex"));
    }
  };
  for (const r of roots) if (existsSync(r)) walk(r);
  return out;
}

/** Paths whose bytes differ between two snapshots: changed, added or removed. */
export function moved(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  const all = new Set([...before.keys(), ...after.keys()]);
  return [...all].filter((p) => before.get(p) !== after.get(p)).sort();
}

/**
 * The subset each path's OWN INSTANCE ignores — asked of git with that
 * instance's `.gitignore` as the only exclude file, in a scratch repository.
 *
 * Not the enclosing checkout's ignore rules: an index ignores every mount
 * wholesale (`/cat-harness/` in folio-assistant's `.gitignore`), so asking the
 * checkout would call every file in a mount ignored, and the committed half of
 * this gate would pass vacuously (measured 2026-10-14). The question is "could
 * the instance's commit contain this file", and only the instance's own rules
 * answer it. Paths are repo-relative in, and grouped by the instance root that
 * contains them (`roots`, deepest first wins).
 */
export function ignoredBy(paths: readonly string[], roots: readonly string[], repoRoot = REPO_ROOT): Set<string> {
  const out = new Set<string>();
  if (paths.length === 0) return out;
  const sorted = [...roots].map((r) => resolve(r)).sort((a, b) => b.length - a.length);
  const byRoot = new Map<string, string[]>();
  for (const p of paths) {
    const abs = resolve(repoRoot, p);
    const root = sorted.find((r) => abs.startsWith(r + sep));
    if (root === undefined) continue; // outside every instance: not an instance's commit, so never "committed" here
    byRoot.set(root, [...(byRoot.get(root) ?? []), p]);
  }
  for (const [root, ps] of byRoot) {
    // A scratch repository holding ONLY this instance's `.gitignore` files, at
    // their own relative paths, so nested ones apply exactly as they do in the
    // instance's own repository, and nothing above the instance does.
    const scratch = mkdtempSync(join(tmpdir(), "publish-check-"));
    try {
      spawnSync("git", ["init", "-q"], { cwd: scratch });
      for (const g of gitignoresUnder(root)) {
        mkdirSync(dirname(join(scratch, g)), { recursive: true });
        copyFileSync(join(root, g), join(scratch, g));
      }
      const rel = ps.map((p) => relative(root, resolve(repoRoot, p)).split(sep).join("/"));
      const r = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd: scratch, input: rel.join("\n"), encoding: "utf-8" });
      // 0: some ignored, 1: none; anything else is "could not ask", which must not read as "none".
      if (r.status !== 0 && r.status !== 1) throw new Error(`git check-ignore failed: ${r.stderr.trim()}`);
      const hit = new Set(r.stdout.split("\n").filter(Boolean));
      rel.forEach((x, i) => hit.has(x) && out.add(ps[i]!));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return out;
}

/** Every `.gitignore` under `root`, root-relative (install artefacts and `.git` skipped). */
function gitignoresUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name === ".gitignore") out.push(relative(root, join(d, e.name)));
    }
  };
  walk(root);
  return out;
}

/** Paths outside every instance root: never an instance's committed file. */
export function outsideInstances(paths: readonly string[], roots: readonly string[], repoRoot = REPO_ROOT): Set<string> {
  const rs = roots.map((r) => resolve(r) + sep);
  return new Set(paths.filter((p) => !rs.some((r) => resolve(repoRoot, p).startsWith(r))));
}

function run(cmd: string, cwd = REPO_ROOT): number {
  // input-site: scripts — the writer's own command line, from the script table
  const r = spawnSync("sh", ["-c", cmd], { cwd, stdio: "inherit" });
  return r.status ?? 1;
}

/**
 * A copy of the checkout for one run, so a writer never touches the real one.
 *
 * Everything is copied except `node_modules` directories, which are linked:
 * they are installed, not authored, and copying them would multiply the cost.
 * The one exception is the top-level `node_modules/@litlfred`. Its workspace
 * links are relative (`../../cat-harness`), so they are copied as links and
 * resolve to the LAYERS IN THE COPY. Linking that folder to the original would
 * load the original layers, and a module there that locates files from its
 * own path would write into the real mounts again.
 *
 * Returns the copy's root. The caller removes it.
 */
export function scratchCopy(repoRoot = REPO_ROOT): string {
  const dest = mkdtempSync(join(tmpdir(), "publish-check-tree-"));
  const linked: Array<[string, string]> = [];
  cpSync(repoRoot, dest, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      if (src !== repoRoot && src.split(sep).at(-1) === "node_modules") {
        linked.push([src, join(dest, relative(repoRoot, src))]);
        return false;
      }
      return true;
    },
  });
  for (const [src, to] of linked) {
    if (dirname(src) === repoRoot) {
      // The top-level install: link every package to the original, except the
      // workspace links, which stay relative so they resolve inside the copy.
      mkdirSync(to, { recursive: true });
      for (const e of readdirSync(src)) {
        if (e === "@litlfred") cpSync(join(src, e), join(to, e), { recursive: true, verbatimSymlinks: true });
        else symlinkSync(join(src, e), join(to, e));
      }
    } else {
      symlinkSync(src, to);
    }
  }
  return dest;
}

if (import.meta.main) {
  const writer = process.argv[2];
  const scripts = scriptsOf(REPO_ROOT);
  if (!writer || scripts[writer] === undefined) {
    console.error(`publish:check: name a package script that writes (got ${JSON.stringify(writer)})`);
    process.exit(2);
  }
  const mine = declaredPlan(REPO_ROOT).filter((a) => a.writer.includes(writer));
  if (mine.length === 0) {
    // Nothing declares this writer yet (an index pinning a cat-harness from
    // before B1, or a generator whose output is all committed): its own
    // committed-bytes --check is still the right question, so ask exactly that.
    // This is what lets the tools land BEFORE any declaration flips.
    console.log(`publish:check ${writer}: no builtAtPublish entry names it — its own --check, against committed bytes`);
    process.exit(run(`${scripts[writer]} --check`));
  }
  const work = scratchCopy(REPO_ROOT);
  process.on("exit", () => rmSync(work, { recursive: true, force: true }));
  const instances = readInstances(work);
  const roots = instances.map((i) => i.root);
  // Under ANY instance's declared publish-time path or branch-stored directory
  // (e.g. `test/results/` on `qa-reports`), not only this writer's: a writer may
  // also refresh another publish-time or branch-stored artefact, and that is not
  // a commit moving.
  const declared = declaredPlan(work);
  const storedDirs = instances.flatMap((i) => {
    const decl = readDeclaration(i.root) as { directories?: Array<{ path: string; storage?: unknown }> } | undefined;
    return (decl?.directories ?? [])
      .filter((d) => d.storage !== undefined)
      .map((d) => resolve(i.root, d.path));
  });
  const under = (p: string) => {
    const abs = resolve(work, p);
    return (
      declared.some((a) => (a.path.endsWith("/") ? (abs + sep).startsWith(resolve(a.abs) + sep) : abs === resolve(a.abs))) ||
      storedDirs.some((d) => (abs + sep).startsWith(d + sep) || abs === d)
    );
  };
  const before = snapshot(roots, work);

  if (run(`bun run cat ${writer}`, work) !== 0) {
    console.error(`✗ publish:check: \`${writer}\` exited non-zero`);
    process.exit(1);
  }
  if (run(`${scripts[writer]} --check`, work) !== 0) {
    console.error(`✗ publish:check: \`${writer}\`'s own --check fails against the output it just wrote — not a fixed point, or a refusal above`);
    process.exit(1);
  }
  const empty = declared.filter((a) => a.writer.includes(writer) && a.writer.at(-1) === writer && !built(a));
  for (const a of empty) console.error(`✗ publish:check: ${a.instance}/${a.path} is declared built by \`${writer}\` and is missing or empty`);

  const changed = moved(before, snapshot(roots, work)).filter((p) => !under(p));
  const ignored = ignoredBy(changed, roots, work);
  const outside = outsideInstances(changed, roots, work);
  const stale = changed.filter((p) => !ignored.has(p) && !outside.has(p));
  for (const p of stale) console.error(`✗ ${p} is a COMMITTED artefact and \`${writer}\` changed it — run \`bun run cat ${writer}\` and commit it`);

  if (empty.length + stale.length > 0) process.exit(1);
  console.log(`✓ publish:check ${writer}: ran, its --check passes on its own output, ${mine.length} declared artefact(s) built, 0 committed file(s) moved`);
}
