#!/usr/bin/env bun
/**
 * Lay down every remote mount a committed lock records — from the LOCK alone,
 * with nothing but Node's own modules.
 *
 * ## Why a second mounter
 *
 * `remote-mount.ts` (bean `0mpw`) PLANS a mount: it reads the harness's
 * declaration at the pin, follows `needs` across the closure, checks trust and
 * writes the lock. To do that it reads declarations through
 * `schemas/cat-harness.ts`, whose import closure reaches six modules under
 * `bootstrap-tools/schemas/` (measured 2026-10-07: `declared-order`, `graph`,
 * `requirement`, `model-registry`, `release-iri`, `declaration`). That is fine
 * while `bootstrap-tools` arrives as a git submodule. It is a bootstrapping
 * loop the moment `bootstrap-tools` itself arrives by remote mount: the tool
 * that would fetch it cannot be loaded until it is there (bean `nn8e`, #2462,
 * blocker B2).
 *
 * This script breaks the loop by doing the one part that needs no
 * declaration: REPLAYING a lock. Every decision — which instances, which
 * repository, which commit, which directories, where — was made when the lock
 * was written and is committed; what is left is fetch, copy and verify. So it
 * imports only `node:*`, runs on a fresh clone with no submodule, and is what
 * CI and the session-start hook run first. `mount:remote` stays the only
 * writer of a lock.
 *
 * ## What it guarantees
 *
 * - **Pinned and verified.** Each instance is fetched at the lock's 40-char
 *   SHA, and each directory's bytes must hash to the lock's `treeDigest`
 *   (the same digest `kg-parts.ts` computes) — a mismatch is undone and
 *   reported, never kept. Trust was checked when the lock was written; the
 *   digest is what makes replaying it safe.
 * - **Never over somebody's work.** A path that holds tracked files, or holds
 *   bytes that no longer hash to the lock, is left untouched and reported.
 * - **Three states.** `mounted` / `current` exit 0, `missing` (refused or
 *   absent) exits 1, `could-not-determine` (fetch failed, lock unreadable)
 *   exits 2 — never folded into one another.
 *
 * Usage:
 *   bun run cat mount:lock                 # lay down / refresh every locked mount
 *   bun run cat mount:lock -- --check      # no network: is every locked mount on disk and intact?
 *   bun run cat mount:lock -- --root <dir> # the downstream instance root (default: cwd)
 *   bun run cat mount:lock -- --no-install # lay the bytes down, do not `bun install` in each mount
 *   bun run cat mount:lock -- --install-all # install devDependencies too (default: --omit dev)
 *
 * `CAT_MOUNT_URL_PREFIX` replaces `https://github.com` in fetch URLs (tests
 * serve local bare repositories this way); a repository that is already a URL
 * or an absolute path is used as it stands.
 *
 * @graphNode none — a command-line tool; the lock's shape is `schemas/remote-mount.ts`
 * @covers none — replays a lock; `mount:remote:check` is the gate on the lock itself
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

/** The lock's shape, read structurally — this file may not import the schema (see the header). */
export interface LockDir {
  id: string;
  path: string;
  upstreamPath: string;
  treeDigest: string;
  files: number;
}
export interface LockAsset {
  src: string;
  sha256: string;
}
export interface LockInstance {
  instance: string;
  repository: string;
  sha: string;
  upstreamRoot: string;
  path: string;
  declaration: { file: string; sha256: string };
  directories: LockDir[];
  assets?: LockAsset[];
}

export type State = "mounted" | "current" | "missing" | "could-not-determine";
export interface Outcome {
  instance: string;
  state: State;
  detail: string;
}

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;

// ── Digest — byte-identical to kg-parts.ts `treeEntries` + `treeDigest` ──────

export function treeFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(relative(dir, p).split("\\").join("/"));
    }
  };
  if (existsSync(dir)) walk(dir);
  return files.sort();
}

const sha256 = (b: string | Buffer): string => createHash("sha256").update(b).digest("hex");

/**
 * The directories a STATE mount laid down in this worktree, absolute, read
 * from `state:mount`'s own markers (`<git-dir>/branch-mounts/<id>.json`,
 * `branch-mount/v1`, written by `branch-store.ts`).
 *
 * An instance-scoped state graph sits INSIDE its instance: cat-harness's
 * `health` is `cat-harness/test/health/results/`, and in an index that is
 * inside the remote mount of cat-harness. Its files come from the state
 * branch, not from the pinned tree, so hashing them against the lock reads
 * every state mount as an edit to the pinned instance ("no longer hash to the
 * lock") and refuses the remount. They are skipped here, and ONLY them: the
 * marker is the state store's own record of exactly what it put down, and the
 * store judges those bytes itself (`state:push` refuses a conflict).
 *
 * Restated rather than imported from `branch-store.ts` for the reason the
 * header gives: this file imports nothing but `node:*`.
 */
export function stateMountedDirs(root: string): string[] {
  const r = spawnSync("git", ["rev-parse", "--git-path", "branch-mounts"], { cwd: root, encoding: "utf-8" });
  if (r.status !== 0) return [];
  const dir = resolve(root, r.stdout.trim());
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    if (!n.endsWith(".json")) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, n), "utf-8")) as { $schema?: unknown; into?: unknown };
      if (m.$schema === "branch-mount/v1" && typeof m.into === "string") out.push(resolve(m.into));
    } catch {
      // An unreadable marker skips nothing: the digest then judges those bytes.
    }
  }
  return out;
}

/** `files` (relative to `dir`) minus any under one of `skip` (absolute directories). */
export function withoutStateMounts(dir: string, files: readonly string[], skip: readonly string[]): string[] {
  if (skip.length === 0) return [...files];
  const under = skip.map((s) => resolve(s) + "/");
  return files.filter((f) => !under.some((u) => (resolve(dir, f) + "/").startsWith(u)));
}

/**
 * The paths a mounted instance DECLARES it builds at publish (`builtAtPublish`
 * in its `<name>.json`; owner, 2026-10-14, "B1"), instance-relative. They are
 * excluded from the digest for the same reason as `node_modules/`: the pinned
 * commit cannot contain them (the instance ignores them, and its own test holds
 * that nothing declared is tracked), so a publish build that writes them into
 * the mount has written none of the PINNED bytes, and must not make the next
 * re-mount refuse the mount as "somebody's work". An old pin declares nothing,
 * so its digest is unchanged. Read with `node:fs` alone, as this file must.
 */
export function builtAtPublishOf(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return out;
  }
  for (const n of names) {
    try {
      const d = JSON.parse(readFileSync(join(dir, n), "utf-8")) as { $schema?: unknown; builtAtPublish?: unknown };
      if (typeof d.$schema !== "string" || !d.$schema.startsWith("cat-harness-declaration") || !Array.isArray(d.builtAtPublish)) continue;
      for (const e of d.builtAtPublish) if (e && typeof e.path === "string") out.push(e.path);
    } catch {
      // Not a declaration, or not JSON: it excludes nothing, so the digest judges every byte.
    }
  }
  return out;
}

/** `files` minus any declared built at publish (a directory entry ends in `/`). */
export function withoutBuiltAtPublish(files: readonly string[], declared: readonly string[]): string[] {
  if (declared.length === 0) return [...files];
  return files.filter((f) => !declared.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
}

export function digestOf(dir: string, skip: readonly string[] = []): { treeDigest: string; files: number } {
  const files = withoutBuiltAtPublish(withoutInstallArtefacts(withoutStateMounts(dir, treeFiles(dir), skip)), builtAtPublishOf(dir));
  const listing = files.map((f) => `${sha256(readFileSync(join(dir, f)))}  ${f}\n`).join("");
  return { treeDigest: sha256(listing), files: files.length };
}

// ── Installing a mount's dependencies (task #10, gap b) ──────────────────────
//
// A mounted layer is CODE (`cat-harness`, `cat-harness-tools`, …), and code
// with no `node_modules` does not run: `Cannot find module
// '@litlfred/cat-harness/schemas/mount-trust.js'`. Until 2026-10-12 the
// workaround was a hand `bun install` inside the mount, and that made the mount
// read MODIFIED: `--check` said "the pinned bytes are not on disk:
// cat-harness/ modified" and the next re-mount refused it.
//
// Two routes were on the table. (1) Resolve the workspace packages WITHOUT
// writing into the mount — a generated workspace manifest at the downstream
// root. Rejected: it edits the downstream's tracked `package.json`, and bun's
// default (isolated) linker writes a `node_modules/` into every workspace
// member anyway, i.e. into the mounts, so it does not even keep them pristine.
// (2) Install INTO the mount and define what fixity covers. Taken, because the
// question fixity answers is "are the PINNED bytes on disk", and an install
// writes none of them:
//
// - `node_modules/`, at any depth, is excluded from every mount digest — the
//   lock's writer (`remote-mount.ts`), its replayer (this file) and both
//   `--check`s, through this one function. At any depth because bun's isolated
//   linker also writes into the SIBLING mounts a manifest's `workspaces` names
//   (`../cat-harnes[s]`). Nothing upstream tracks a `node_modules/` (measured
//   2026-10-12 over cat-harness, cat-harness-tools, bootstrap, bootstrap-tools
//   and two content instances: 0 paths), and `remote-mount.ts` refuses
//   to lay down a tree that does, so the exclusion can never hide a pinned byte.
// - The lockfile is NOT excluded: it is a pinned byte. The install runs with
//   `--no-save`, so bun writes no lockfile and edits no manifest, and the
//   lockfile's bytes are compared before and after and put back if anything
//   moved them — a mount stays verifiable by the same digest it was locked at.
//
// Old locks keep verifying: a digest over a tree with no `node_modules/` is
// the same with or without the exclusion.

/** Directory names an install writes and a mount never pins. */
export const INSTALL_ARTEFACT_DIRS: readonly string[] = ["node_modules"];

/** Is this tree-relative path inside an install artefact? */
export function isInstallArtefact(rel: string): boolean {
  return rel.split("/").some((seg) => INSTALL_ARTEFACT_DIRS.includes(seg));
}

/** `files` without anything an install wrote — what every mount digest hashes. */
export function withoutInstallArtefacts(files: readonly string[]): string[] {
  return files.filter((f) => !isInstallArtefact(f));
}

/** Lockfiles the install must leave byte-identical: they are pinned bytes. */
const LOCKFILES = ["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

export type InstallMode = "production" | "all";
export interface InstallOutcome {
  state: "installed" | "none" | "failed";
  detail: string;
}

/**
 * `bun install` in `dir` when it holds a `package.json`; nothing otherwise.
 * `production` (the default) skips devDependencies (`--omit dev`) — the mount is there to RUN
 * tools, and a typechecker or a browser is a per-session choice (`all`).
 * Leaves every lockfile as it found it; see the section comment above.
 */
/**
 * The enclosing `package.json` whose `workspaces` names `dir`, or undefined.
 *
 * A mounted instance that is a WORKSPACE MEMBER of the checkout's root is
 * installed by the root's own `bun install`. Installing it again from inside
 * the member is not local: bun resolves the whole workspace and rewrites the
 * ROOT `node_modules/` — and with `--omit dev` it does so without the dev
 * graph, so a package two versions of which coexist is re-hoisted to the
 * production one. Measured on folio-assistant#2529 (2026-10-14): eslint
 * (dev) needs ajv@6, the MCP SDK (prod) needs ajv@8; `state:mount` hoisted
 * ajv@8 over the root, and `bun run cat lint` failed with "Cannot find
 * module 'ajv/lib/refs/json-schema-draft-04.json'" after a clean
 * `--frozen-lockfile` install had laid down ajv@6.
 *
 * Patterns are matched literally or as a trailing `/*`, the two forms the
 * manifests here use; a pattern this cannot read never matches, so the
 * fallback is the old behaviour (install), not a skipped install.
 */
export function enclosingWorkspaceRoot(dir: string): string | undefined {
  const abs = resolve(dir);
  for (let up = dirname(abs); ; up = dirname(up)) {
    const manifest = join(up, "package.json");
    if (existsSync(manifest)) {
      let ws: unknown;
      try {
        ws = JSON.parse(readFileSync(manifest, "utf-8")).workspaces;
      } catch {
        ws = undefined;
      }
      const patterns = Array.isArray(ws) ? ws : Array.isArray((ws as { packages?: unknown })?.packages) ? (ws as { packages: unknown[] }).packages : [];
      const rel = relative(up, abs).split("\\").join("/");
      for (const p of patterns) {
        if (typeof p !== "string") continue;
        const pat = p.replace(/^\.\//, "").replace(/\/+$/, "");
        if (pat === rel) return up;
        if (pat.endsWith("/*") && dirname(rel) === pat.slice(0, -2)) return up;
      }
    }
    if (dirname(up) === up) return undefined;
  }
}

export function installDependencies(dir: string, mode: InstallMode = "production"): InstallOutcome {
  if (!existsSync(join(dir, "package.json"))) return { state: "none", detail: "no package.json" };
  const ws = enclosingWorkspaceRoot(dir);
  if (ws !== undefined) {
    return { state: "none", detail: `a workspace member of ${ws}: the root's own \`bun install\` provides its dependencies, and installing from inside it would re-hoist the root's node_modules` };
  }
  const before = new Map(LOCKFILES.map((f) => [f, existsSync(join(dir, f)) ? readFileSync(join(dir, f)) : undefined]));
  const bun = /bun(\.exe)?$/i.test(process.execPath) ? process.execPath : "bun";
  // `--omit dev`, not `--production`: bun's `--production` implies
  // `--frozen-lockfile`, so a mount whose lockfile is behind its package.json
  // ("lockfile had changes, but lockfile is frozen", cat-harness@73ff183) or
  // that bun reads as frozen-incompatible ("Unknown lockfile version",
  // cat-harness-tools@57721f6) failed to install, and every repository pinning
  // this mounter lost its tools (smart-ra#48). The lockfile is put back
  // byte-for-byte below either way, so not freezing it costs nothing.
  const args = ["install", "--no-save", ...(mode === "production" ? ["--omit", "dev"] : [])];
  const r = spawnSync(bun, args, { cwd: dir, encoding: "utf-8", maxBuffer: 1 << 26 });
  for (const [f, bytes] of before) {
    const abs = join(dir, f);
    const now = existsSync(abs) ? readFileSync(abs) : undefined;
    if (bytes === undefined && now !== undefined) rmSync(abs, { force: true });
    else if (bytes !== undefined && (now === undefined || !bytes.equals(now))) writeFileSync(abs, bytes);
  }
  if (r.status !== 0) {
    const why = (r.error?.message ?? (r.stderr || r.stdout || "")).trim().split("\n").slice(-3).join(" | ");
    return { state: "failed", detail: `\`bun ${args.join(" ")}\` exited ${r.status ?? r.signal}: ${why}` };
  }
  return { state: "installed", detail: `dependencies installed (\`bun ${args.join(" ")}\`; node_modules/ is outside the fixity digest)` };
}

// ── Reading the lock ─────────────────────────────────────────────────────────

/** The lock's name since 2026-10-07: the generated companion to `index.config.json`. */
export const INDEX_LOCK = "index.lock.json";
/** The retired name, `<root-instance>.mount-lock.json` — still READ, so a downstream folio or an old branch replays. */
export const LEGACY_LOCK_SUFFIX = ".mount-lock.json";

/**
 * The lock file(s) beside `root`: `index.lock.json`, else every legacy
 * `*.mount-lock.json`. BOTH present is an error naming both, never a merge.
 *
 * RESTATED from `lockFilesIn` in `schemas/instance-roots.ts` rather than
 * imported, because this file imports nothing but `node:*` (the header says
 * why); `mount-from-lock.test.ts` holds the two to the same answers.
 */
export function lockNames(root: string): { names: string[]; conflict?: string } {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return { names: [] };
  }
  const legacy = entries.filter((n) => n.endsWith(LEGACY_LOCK_SUFFIX)).sort();
  if (entries.includes(INDEX_LOCK)) {
    if (legacy.length > 0) {
      return {
        names: [],
        conflict: `${join(root, INDEX_LOCK)} and ${legacy.map((n) => join(root, n)).join(", ")} both exist — one lock per checkout; keep ${INDEX_LOCK} (\`git mv\` the legacy one over it, or remove the stale one) rather than have two replayed`,
      };
    }
    return { names: [INDEX_LOCK] };
  }
  return { names: legacy };
}

/** Every lock beside `root` ({@link lockNames}), parsed structurally. A malformed one — or two that conflict — is an answer, not a skip. */
export function readLocks(root: string): { file: string; instances?: LockInstance[]; error?: string }[] {
  const { names, conflict } = lockNames(root);
  if (conflict !== undefined) return [{ file: join(root, INDEX_LOCK), error: conflict }];
  return names.map((n) => {
    const file = join(root, n);
    try {
      const raw = JSON.parse(readFileSync(file, "utf-8")) as { $schema?: unknown; instances?: unknown };
      if (raw.$schema !== "cat-harness-mount-lock/v1") return { file, error: `not a cat-harness-mount-lock/v1 lock` };
      if (!Array.isArray(raw.instances)) return { file, error: "no `instances` array" };
      const bad = (raw.instances as LockInstance[]).find(
        (i) =>
          typeof i?.instance !== "string" ||
          typeof i.repository !== "string" ||
          !SHA.test(String(i.sha)) ||
          typeof i.path !== "string" ||
          !Array.isArray(i.directories) ||
          i.directories.some((d) => typeof d?.path !== "string" || typeof d.upstreamPath !== "string" || !DIGEST.test(String(d.treeDigest))) ||
          (i.assets !== undefined && (!Array.isArray(i.assets) || i.assets.some((a) => typeof a?.src !== "string" || !DIGEST.test(String(a?.sha256))))),
      );
      if (bad) return { file, error: `instance \`${String((bad as { instance?: unknown })?.instance)}\` is malformed` };
      return { file, instances: raw.instances as LockInstance[] };
    } catch (e) {
      return { file, error: `not JSON: ${(e as Error).message}` };
    }
  });
}

/** A lock path may not climb out of the root or land on it. */
function safeRel(p: string): boolean {
  const parts = p.split("/");
  return p !== "" && !p.startsWith("/") && !parts.includes("..") && !parts.some((s) => s.startsWith("."));
}

// ── git ──────────────────────────────────────────────────────────────────────

function git(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8", maxBuffer: 1 << 28 });
  return { status: r.status ?? 128, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function urlFor(repository: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repository) || repository.startsWith("/")) return repository;
  const prefix = process.env.CAT_MOUNT_URL_PREFIX;
  return prefix ? `${prefix.replace(/\/+$/, "")}/${repository}` : `https://github.com/${repository}.git`;
}

function tracked(root: string, rel: string): boolean {
  const r = git(root, ["ls-files", "--", rel]);
  return r.status === 0 && r.stdout.trim() !== "";
}

function ensureIgnored(root: string, rel: string): void {
  if (git(root, ["rev-parse", "--git-dir"]).status !== 0) return;
  if (git(root, ["check-ignore", "-q", "--no-index", `${rel}/`]).status === 0) return;
  const prefix = git(root, ["rev-parse", "--show-prefix"]).stdout.trim();
  const file = resolve(root, git(root, ["rev-parse", "--git-path", "info/exclude"]).stdout.trim());
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `# remote mount (bean nn8e) — bun run cat mount:lock\n/${prefix}${rel}/\n`);
}

/** Shallow, blobless fetch of one commit, then a sparse checkout of `paths`. Returns the work tree. */
function fetchAt(repository: string, sha: string, paths: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "mount-from-lock-"));
  const steps: string[][] = [
    ["init", "-q"],
    ["fetch", "-q", "--depth", "1", "--filter=blob:none", urlFor(repository), sha],
    ["sparse-checkout", "set", "--no-cone", ...paths],
    ["checkout", "-q", "FETCH_HEAD"],
  ];
  for (const s of steps) {
    const r = git(dir, s);
    if (r.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`git ${s[0]} failed: ${r.stderr.trim().split("\n").pop() ?? r.status}`);
    }
  }
  const head = git(dir, ["rev-parse", "FETCH_HEAD"]).stdout.trim();
  if (head !== sha) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`the remote served ${head} for ${sha}`);
  }
  return dir;
}

// ── One instance ─────────────────────────────────────────────────────────────

/** Is every locked directory of `inst` on disk with the locked digest? Lists the ones that are not. */
function drift(root: string, inst: LockInstance): { absent: string[]; changed: string[] } {
  const absent: string[] = [];
  const changed: string[] = [];
  const decl = join(root, inst.path, inst.declaration.file);
  if (!existsSync(decl)) absent.push(`${inst.path}/${inst.declaration.file}`);
  else if (sha256(readFileSync(decl)) !== inst.declaration.sha256) changed.push(`${inst.path}/${inst.declaration.file}`);
  const skip = stateMountedDirs(root);
  for (const d of inst.directories) {
    const abs = join(root, d.path);
    if (!existsSync(abs)) absent.push(d.path);
    else if (digestOf(abs, skip).treeDigest !== d.treeDigest) changed.push(d.path);
  }
  for (const a of inst.assets ?? []) {
    const abs = join(root, inst.path, a.src);
    if (!existsSync(abs)) absent.push(`${inst.path}/${a.src}`);
    else if (sha256(readFileSync(abs)) !== a.sha256) changed.push(`${inst.path}/${a.src}`);
  }
  return { absent, changed };
}

export function checkInstance(root: string, inst: LockInstance): Outcome {
  const { absent, changed } = drift(root, inst);
  if (changed.length) return { instance: inst.instance, state: "missing", detail: `${changed.join(", ")} no longer hash to the lock` };
  if (absent.length) return { instance: inst.instance, state: "missing", detail: `not on disk: ${absent.join(", ")} — run \`bun run cat mount:lock\`` };
  return { instance: inst.instance, state: "current", detail: `${inst.directories.length} director${inst.directories.length === 1 ? "y" : "ies"} at ${inst.sha.slice(0, 12)}` };
}

export function mountInstance(root: string, inst: LockInstance): Outcome {
  const id = inst.instance;
  const bad = [inst.path, ...inst.directories.map((d) => d.path)].find((p) => !safeRel(p));
  if (bad !== undefined) return { instance: id, state: "could-not-determine", detail: `lock path \`${bad}\` climbs out of the checkout or is dot-prefixed` };
  const { absent, changed } = drift(root, inst);
  if (changed.length) {
    return { instance: id, state: "missing", detail: `left untouched: ${changed.join(", ")} no longer hash to the lock — edits there are somebody's work; move them upstream or delete the directory, then re-mount` };
  }
  if (absent.length === 0) return checkInstance(root, inst);
  const trackedPath = inst.directories.map((d) => d.path).find((p) => tracked(root, p));
  if (trackedPath) return { instance: id, state: "missing", detail: `\`${trackedPath}/\` holds tracked files — a mount never lands on tracked bytes` };

  const upstreamDecl = inst.upstreamRoot ? `${inst.upstreamRoot.replace(/\/+$/, "")}/${inst.declaration.file}` : inst.declaration.file;
  const assetPaths = (inst.assets ?? []).map((a) => {
    const p = inst.upstreamRoot ? `${inst.upstreamRoot.replace(/\/+$/, "")}/${a.src}` : a.src;
    return `/${p}`;
  });
  const sparse = [`/${upstreamDecl}`, ...inst.directories.map((d) => (d.upstreamPath === "." ? "/*" : `/${d.upstreamPath.replace(/\/+$/, "")}/`)), ...assetPaths];
  let work: string;
  try {
    work = fetchAt(inst.repository, inst.sha, sparse);
  } catch (e) {
    return { instance: id, state: "could-not-determine", detail: `could not fetch ${inst.repository}@${inst.sha.slice(0, 12)}: ${(e as Error).message}` };
  }
  try {
    const written: string[] = [];
    const declSrc = join(work, upstreamDecl);
    if (!existsSync(declSrc) || sha256(readFileSync(declSrc)) !== inst.declaration.sha256) {
      return { instance: id, state: "could-not-determine", detail: `the declaration \`${upstreamDecl}\` at ${inst.sha.slice(0, 12)} is absent or does not hash to the lock` };
    }
    for (const d of inst.directories) {
      if (!absent.includes(d.path)) continue;
      const src = d.upstreamPath === "." ? work : join(work, d.upstreamPath);
      if (!existsSync(src)) {
        for (const w of written) rmSync(join(root, w), { recursive: true, force: true });
        return { instance: id, state: "missing", detail: `\`${d.upstreamPath}\` is not in ${inst.repository}@${inst.sha.slice(0, 12)}, though the lock records it` };
      }
      const dst = join(root, d.path);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst, { recursive: true, verbatimSymlinks: true, force: true, filter: (from) => from !== join(work, ".git") });
      written.push(d.path);
      const got = digestOf(dst).treeDigest;
      if (got !== d.treeDigest) {
        for (const w of written) rmSync(join(root, w), { recursive: true, force: true });
        return { instance: id, state: "could-not-determine", detail: `\`${d.path}\` fetched at ${inst.sha.slice(0, 12)} hashes to ${got.slice(0, 12)}, the lock says ${d.treeDigest.slice(0, 12)} — removed, not kept` };
      }
    }
    for (const a of inst.assets ?? []) {
      if (!absent.includes(`${inst.path}/${a.src}`)) continue;
      const p = inst.upstreamRoot ? `${inst.upstreamRoot.replace(/\/+$/, "")}/${a.src}` : a.src;
      const src = join(work, p);
      if (!existsSync(src)) {
        for (const w of written) rmSync(join(root, w), { recursive: true, force: true });
        return { instance: id, state: "missing", detail: `asset \`${a.src}\` is not in ${inst.repository}@${inst.sha.slice(0, 12)}, though the lock records it` };
      }
      const dst = join(root, inst.path, a.src);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst, { force: true });
      written.push(join(inst.path, a.src));
      const got = sha256(readFileSync(dst));
      if (got !== a.sha256) {
        for (const w of written) rmSync(join(root, w), { recursive: true, force: true });
        return { instance: id, state: "could-not-determine", detail: `asset \`${a.src}\` fetched at ${inst.sha.slice(0, 12)} hashes to ${got.slice(0, 12)}, the lock says ${a.sha256.slice(0, 12)} — removed, not kept` };
      }
    }
    const declDst = join(root, inst.path, inst.declaration.file);
    if (!existsSync(declDst)) {
      mkdirSync(dirname(declDst), { recursive: true });
      cpSync(declSrc, declDst);
    }
    ensureIgnored(root, inst.path);
    for (const d of inst.directories) ensureIgnored(root, d.path);
    const files = inst.directories.reduce((n, d) => n + d.files, 0) + (inst.assets?.length ?? 0);
    return { instance: id, state: "mounted", detail: `${written.length} director${written.length === 1 ? "y" : "ies"}, ${files} file(s) from ${inst.repository}@${inst.sha.slice(0, 12)}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ── All of them ──────────────────────────────────────────────────────────────

export function exitCode(outcomes: Outcome[]): 0 | 1 | 2 {
  if (outcomes.some((o) => o.state === "could-not-determine")) return 2;
  if (outcomes.some((o) => o.state === "missing")) return 1;
  return 0;
}

export function run(root: string, check: boolean, opts: { install?: InstallMode | false } = {}): { outcomes: Outcome[]; locks: number } {
  const outcomes: Outcome[] = [];
  const locks = readLocks(root);
  const laid: Array<{ inst: LockInstance; outcome: Outcome }> = [];
  for (const l of locks) {
    if (l.error) {
      outcomes.push({ instance: relative(root, l.file), state: "could-not-determine", detail: l.error });
      continue;
    }
    for (const inst of l.instances!) {
      const outcome = check ? checkInstance(root, inst) : mountInstance(root, inst);
      outcomes.push(outcome);
      if (outcome.state === "mounted" || outcome.state === "current") laid.push({ inst, outcome });
    }
  }
  // AFTER every instance is down, so a manifest's `workspaces` reaching a
  // sibling mount finds it. A failed install is reported against the instance
  // (its tools will not run) but never touches what `--check` verifies.
  const mode = opts.install ?? "production";
  if (!check && mode !== false) {
    for (const { inst, outcome } of laid) {
      const r = installDependencies(join(root, inst.path), mode);
      if (r.state === "installed") outcome.detail += `; ${r.detail}`;
      if (r.state === "failed") {
        outcome.state = "missing";
        outcome.detail += `; the bytes are pinned but its dependencies are NOT installed, so its tools will not run: ${r.detail}`;
      }
    }
  }
  return { outcomes, locks: locks.length };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const at = argv.indexOf("--root");
  const root = resolve(at >= 0 && argv[at + 1] ? argv[at + 1]! : process.cwd());
  const { outcomes, locks } = run(root, check, { install: argv.includes("--no-install") ? false : argv.includes("--install-all") ? "all" : "production" });
  if (locks === 0) {
    console.log(`mount:lock: not-enabled — no ${INDEX_LOCK} (or legacy *${LEGACY_LOCK_SUFFIX}) in ${root}`);
    process.exit(0);
  }
  for (const o of outcomes) console.log(`  ${o.state.padEnd(20)} ${o.instance.padEnd(22)} ${o.detail}`);
  const code = exitCode(outcomes);
  console.log(`mount:lock${check ? " --check" : ""}: ${outcomes.length} instance(s) — ${code === 0 ? "OK" : code === 1 ? "MISSING" : "COULD NOT DETERMINE"}`);
  process.exit(code);
}
