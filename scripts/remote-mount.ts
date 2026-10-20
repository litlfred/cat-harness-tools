#!/usr/bin/env bun
/**
 * remote-mount — lay a harness and its dependency closure down from another
 * repository at a pinned commit, lock what arrived, and check it.
 *
 * @module scripts/remote-mount
 * @graphNode none — a session-start step and a gate over declared `remoteMounts`
 * @covers none — it MAKES dependency layers readable and judges none of their
 * content; the gates that judge a layer run over it once it is mounted, and a
 * mount that claimed their coverage would let them be removed unnoticed (the
 * reasoning `state-mount.ts` records for the branch mounts).
 *
 * Bean `0mpw`. Schema and the owner's rulings: `schemas/remote-mount.ts`.
 *
 *   bun run cat mount:remote              # plan, fetch, mount, write the lock, re-render the agent surface if it changed
 *   bun run cat mount:remote --plan       # resolve the closure and print it; write nothing
 *   bun run cat mount:remote:check        # disk against lock against declaration — no network
 *   bun run cat mount:remote --no-install # lay the bytes down without `bun install` in each mount
 *   bun run cat mount:remote --help       # print this header; run nothing
 *   echo "<where they said yes>" | bun run cat mount:remote --seed <name>=<owner/repo>@<sha> --consent-by <who> [--whole]
 *                                          # create or re-pin a remote instance in index.config.json, WITH its consent
 *   bun run cat mount:repin:standing [--dry-run]
 *                                          # re-pin every instance a STANDING consent covers (repin-standing.ts, #401)
 *
 * `state:mount` runs the mount after the branch mounts, so the session-start
 * hook needs no second entry point.
 *
 * ## The closure, transitively
 *
 * A downstream names a harness, its repository and a 40-character pin. The
 * harness's declaration is read FROM THAT TREE; each name in its `needs` is
 * looked for in the same tree (an instance whose `<name>.json` agrees with its
 * own `name`), and failing that as a GITLINK at that tree — a submodule entry
 * is itself a pin, so `cat-harness`'s `needs: ["bootstrap"]` at a pinned
 * folio-assistant commit names `litlfred/bootstrap` at the gitlink's SHA, with
 * no submodule in the downstream. A need found in neither is `missing`, never
 * dropped. A need the downstream already holds as a local instance is
 * `local` — supplied, not mounted over.
 *
 * ## Three states, never two (bean `1xhc`)
 *
 * Every instance comes back `mounted`, `missing` or `could-not-determine`. A
 * fetch that failed is the third, not an empty layer; a lock that cannot be
 * read is the third, not "nothing mounted". The process exits 0 only when
 * every instance is mounted or local (or nothing is declared), 1 when any is
 * missing, 2 when any could not be determined.
 *
 * ## A changed lock re-renders the agent surface
 *
 * A mount is not done when the bytes are on disk. A newly pinned layer can
 * bring new skills, renamed skills and new agent-memory entries, and what an
 * agent actually reads is the GENERATED surface: `.claude/commands/` (from
 * the skills, `skill:commands`) and `.claude/agent-memory/` plus the
 * `.agents/` copies (from the memory nodes, `agent-memory`). Left to a
 * separate, remembered step, a re-pin commit ships the new layer with the old
 * surface; that is how folio-assistant#2526 went red on three agent-memory
 * tests. So when this run CHANGES the lock, it runs both generators from the
 * checkout root before exiting, and a generator that fails fails the run.
 * `--no-agent-surface` skips it; `--check`, `--plan` and `--staging` never
 * run it. Owner, 2026-10-10: *"that should be a part of process/skills/tools
 * when a new/updated subgraph is mounted... it may have new agentic skills to
 * re-render and add. same for memory."*
 *
 * ## A mount is runnable, and an install does not make it modified
 *
 * After the bytes are locked, each mounted instance that carries a
 * `package.json` gets `bun install --no-save --omit dev` (`--install-all`
 * keeps devDependencies, `--no-install` skips it). `node_modules/` is outside
 * every mount digest and the lockfile is put back byte-for-byte, so `--check`
 * still passes over an installed mount and a re-mount does not refuse it.
 * Why that route and not a root-level workspace: `installDependencies` in
 * `mount-from-lock.ts` (task #10, gap b).
 *
 * ## Seeding writes consent
 *
 * `--seed <name>=<owner/repo>@<sha> --consent-by <who> --evidence "<…>"`
 * creates or re-pins a remote instance in `index.config.json` and writes its
 * `trust.consent` bound to that pin in the same write (task #10, gap c), so a
 * pin and its consent cannot be committed apart.
 *
 * ## It never discards work
 *
 * A mounted directory whose bytes no longer hash to the lock is left exactly
 * as it is and reported, never re-fetched over: somebody edited it, and those
 * edits are theirs to move upstream or drop. A path that holds anything this
 * mount did not put there — a tracked file, an unlocked directory — is refused.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { z } from "zod";

import { mountTrust, withConsent, type ConsentGrant, type TrustVerdict } from "@litlfred/cat-harness/schemas/mount-trust.js";
import { checkoutRootFor, instanceRootsIn, readDeclaration } from "@litlfred/cat-harness/schemas/cat-harness.js";
import { INDEX_CONFIG_SCHEMA, lockedMountPaths, readDeclaredMounts, readIndexConfig, readMountFields, syncIgnoreBlock, writeDeclaredMounts, type IndexConfig } from "@litlfred/cat-harness/schemas/index-config.js";
import {
  MOUNT_LOCK_SCHEMA,
  MountDefaultsSchema,
  MountPathSchema,
  mountLockFilename,
  mountLockPathFor,
  readMountLock,
  type LockedInstance,
  type MountLock,
  type RemoteMount,
  WHOLE_INSTANCE_ID,
  checkMountPathCollisions,
} from "@litlfred/cat-harness/schemas/remote-mount.js";
import { contentIsOffCheckout, type SubgraphSource } from "@litlfred/cat-harness/schemas/subgraph-source.js";
import { treeDigest, treeEntries } from "./kg-parts.ts";
import { builtAtPublishOf, installDependencies, isInstallArtefact, stateMountedDirs, withoutBuiltAtPublish, withoutInstallArtefacts, withoutStateMounts, type InstallMode } from "./mount-from-lock.ts";
import { RemoteTree, type UrlFor } from "./remote-tree.ts";

/**
 * Move every state mount under `target` (per `stateMountedDirs`) out of the
 * way, and return how to put them back. The hold is in the git directory, so
 * nothing scanning the checkout sees it, and on the same filesystem, so a
 * rename moves it. `restore` replaces whatever the re-lay put at those paths.
 */
/**
 * The directory ids a declaration's `builtAtPublish` names: an entry's
 * `directory`, or the declared directory whose `path` is the entry's. Such a
 * directory is built by the publish and is never committed, so a pin of it
 * has nothing there to copy; the remote mount must not report it absent.
 */
export function builtAtPublishDirectories(declText: Buffer | string): Set<string> {
  const out = new Set<string>();
  let d: { builtAtPublish?: unknown; directories?: unknown };
  try {
    d = JSON.parse(String(declText));
  } catch {
    return out;
  }
  if (!Array.isArray(d.builtAtPublish)) return out;
  const norm = (x: string) => x.replace(/^\.\//, "").replace(/\/+$/, "");
  const paths = new Set<string>();
  for (const e of d.builtAtPublish as Array<{ path?: unknown; directory?: unknown }>) {
    if (!e || typeof e !== "object") continue;
    if (typeof e.directory === "string") out.add(e.directory);
    if (typeof e.path === "string") paths.add(norm(e.path));
  }
  for (const dir of Array.isArray(d.directories) ? (d.directories as Array<{ id?: unknown; path?: unknown }>) : [])
    if (dir && typeof dir.id === "string" && typeof dir.path === "string" && paths.has(norm(dir.path))) out.add(dir.id);
  return out;
}

function holdStateMounts(checkout: string, target: string): { restore: () => void } {
  const under = resolve(target) + "/";
  return holdPaths(checkout, stateMountedDirs(checkout).filter((d) => (resolve(d) + "/").startsWith(under)));
}

/**
 * Move each mounted directory's `node_modules/` out of the way for a re-lay,
 * and return how to put it back. An install artefact is outside every digest
 * and is never this mount's bytes, so a re-lay must not delete it — and for a
 * WORKSPACE MEMBER it cannot be rebuilt here: {@link installDependencies}
 * rightly declines to install inside one, because the root's own `bun install`
 * provides it. Deleting it therefore left the member with no dependencies of
 * its own until the root was installed again: a nested devDependency the
 * member pins (the formal-math layer's `katex@0.18.10`, beside the root's 0.16)
 * then resolved to the root's copy, which is how `crepe-latex.test.ts` failed
 * its version guard on CI after `state:mount` re-laid the mount.
 */
function holdInstallArtefacts(checkout: string, dirs: readonly string[]): { restore: () => void } {
  return holdPaths(checkout, [...new Set(dirs.map((d) => resolve(d, "node_modules")))]);
}

/** Rename each existing path in `paths` into a hold beside the git directory; `restore` puts each back. */
function holdPaths(checkout: string, paths: readonly string[]): { restore: () => void } {
  const inside = paths.filter((d) => existsSync(d));
  if (inside.length === 0) return { restore: () => {} };
  // input-site: inert #8ef446b5 — where a re-lay parks a state mount for a moment; it is put back before the mount returns
  const gitPath = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "branch-mount-hold"], { cwd: checkout, encoding: "utf-8" });
  const base = gitPath.status === 0 ? gitPath.stdout.trim() : join(checkout, ".branch-mount-hold");
  mkdirSync(base, { recursive: true });
  const hold = mkdtempSync(join(base, "relay-"));
  const moved = inside.map((d, i) => {
    const to = join(hold, String(i));
    renameSync(d, to);
    return { d, to };
  });
  return {
    restore: () => {
      for (const { d, to } of moved) {
        rmSync(d, { recursive: true, force: true });
        mkdirSync(dirname(d), { recursive: true });
        renameSync(to, d);
      }
      rmSync(hold, { recursive: true, force: true });
    },
  };
}

// ── Reading an upstream declaration STRUCTURALLY ─────────────────────────────

/**
 * The fields of an upstream declaration the planner reads — and only those.
 * Structural on purpose: the upstream is at ITS pin, and its schema may be
 * newer or older than the one in this checkout. Holding it to this
 * checkout's full schema would refuse a harness for a field the mount never
 * reads.
 */
const UpstreamDeclarationSchema = z
  .object({
    name: z.string().min(1),
    needs: z.array(z.string().min(1)).optional(),
    livesAt: z.object({ path: z.string().min(1) }).passthrough().optional(),
    mountDefaults: MountDefaultsSchema.optional(),
    assets: z.array(z.object({ src: z.string().min(1), scope: z.string().optional() }).passthrough()).optional(),
    directories: z
      .array(z.object({ id: z.string().min(1), path: z.string().min(1), source: z.unknown().optional(), storage: z.unknown().optional() }).passthrough())
      .default([]),
  })
  .passthrough();
type UpstreamDeclaration = z.infer<typeof UpstreamDeclarationSchema>;

// ── The plan ─────────────────────────────────────────────────────────────────

export interface PlannedDirectory {
  id: string;
  /** Checkout-relative, no trailing slash. */
  path: string;
  /** Upstream-relative, no trailing slash. */
  upstreamPath: string;
}

export interface PlannedInstance {
  instance: string;
  repository: string;
  sha: string;
  upstreamRoot: string;
  path: string;
  via: string;
  pinnedBy: LockedInstance["pinnedBy"];
  declarationFile: string;
  directories: PlannedDirectory[];
  /**
   * The declaration's instance-scoped `assets[].src` (instance-relative, no
   * `..`): single files the declaration itself names — its README and
   * AGENTS.md — laid down beside it. Declared, so they arrive through a
   * declared path like a directory does (bean `hupw`).
   */
  assets: string[];
}

export type InstanceOutcome =
  | { instance: string; state: "mounted"; path: string; detail: string }
  /** The downstream holds this instance itself; nothing was mounted over it. */
  | { instance: string; state: "local"; path: string; detail: string }
  /** An override said `skip`. */
  | { instance: string; state: "skipped"; detail: string }
  | { instance: string; state: "missing"; path?: string; detail: string }
  /** The trust check (H8) said no — at mount time, or on re-judging a recorded basis. */
  | { instance: string; state: "refused"; path?: string; detail: string }
  /** Mounted on consent whose `by` no declared `mountApprovers` list checked. Its own state, never clean. */
  | { instance: string; state: "unverified-approver"; path: string; detail: string }
  | { instance: string; state: "could-not-determine"; path?: string; detail: string };

export interface Plan {
  /** Absolute root of the declaring (downstream) instance. */
  instanceRoot: string;
  downstream: string;
  mounts: RemoteMount[];
  /** The downstream's declared `mountApprovers`, if any. */
  approvers?: string[];
  instances: PlannedInstance[];
  outcomes: InstanceOutcome[];
}

export interface RemoteMountOptions {
  /** The downstream instance root; defaults to the checkout's root instance. */
  instanceRoot?: string;
  /** How `owner/repo` becomes a fetch URL — tests serve local bare repositories. */
  urlFor?: UrlFor;
  /**
   * `staging` mounts for a preview and needs neither signature nor consent
   * (owner, 2026-10-07: "staging doesnt need signature"). Anything else is a
   * real mount and must pass {@link mountTrust}. Default `mount`.
   */
  purpose?: "staging" | "mount";
  /**
   * After the bytes are down and locked, `bun install` in each mounted
   * instance that carries a `package.json`, so its tools run (task #10, gap b).
   * `production` (default) skips devDependencies; `false` lays bytes only.
   * The install writes only `node_modules/`, which no digest covers, so it
   * never makes a mount read modified.
   */
  install?: InstallMode | false;
}

const strip = (p: string): string => p.replace(/\/+$/, "");
const joinRel = (...ps: string[]): string => ps.map(strip).filter(Boolean).join("/");

/** `.gitmodules` → `path → url`. */
function gitmodules(text: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!text) return out;
  let path: string | undefined;
  let url: string | undefined;
  const flush = (): void => {
    if (path && url) out.set(strip(path), url);
    path = url = undefined;
  };
  for (const line of text.split("\n")) {
    if (/^\s*\[submodule /.test(line)) flush();
    const m = /^\s*(path|url)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) {
      if (m[1] === "path") path = m[2];
      else url = m[2];
    }
  }
  flush();
  return out;
}

/** A github URL → `owner/repo`; anything else is kept as the URL it is. */
function repositoryOf(url: string): string {
  const m = /^(?:https?:\/\/|git@)github\.com[/:]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url);
  return m ? m[1]! : url;
}

/**
 * Find instance `name` in a tree: the root's own `<name>.json`, else a
 * top-level directory's — each accepted only when the file's `name` agrees,
 * the rule `findDeclarationFile` applies on disk.
 */
function findInstance(tree: RemoteTree, name: string): { root: string; file: string; text: string; decl: UpstreamDeclaration } | { error: string } | undefined {
  const candidates = [`${name}.json`, ...tree.list("").filter((e) => e.kind === "tree").map((e) => `${e.path}/${name}.json`)];
  for (const file of candidates) {
    const text = tree.readText(file);
    if (text === undefined) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    if ((raw as { name?: unknown })?.name !== name) continue;
    const p = UpstreamDeclarationSchema.safeParse(raw);
    if (!p.success) return { error: `${file} at ${tree.sha.slice(0, 12)} declares \`${name}\` but its mount fields do not parse: ${p.error.issues[0]?.message}` };
    return { root: dirname(file) === "." ? "" : dirname(file), file, text, decl: p.data };
  }
  return undefined;
}

/** The downstream's own declaration and its `remoteMounts`, or why not. */
function downstreamOf(opts: RemoteMountOptions): { instanceRoot: string; name: string; mounts: RemoteMount[]; approvers?: string[] } {
  const instanceRoot = resolve(opts.instanceRoot ?? checkoutRootFor(process.cwd()));
  // Only the mount fields: a full read needs kinds the mounts themselves supply (bean qump).
  const decl = readMountFields(instanceRoot);
  const idx = readIndexConfig(instanceRoot);
  if (!decl && idx.state !== "ok") throw new Error(`${instanceRoot} holds no instance declaration or index.config.json`);
  // `index.config.json` when the checkout has one, else the declaration's
  // `remoteMounts` — and BOTH is an error, never a pick (schemas/index-config.ts).
  const name = decl?.name ?? (idx.state === "ok" ? idx.config.site?.landing ?? "coordinator" : "downstream");
  return { instanceRoot, name, mounts: readDeclaredMounts(instanceRoot).mounts, approvers: decl?.mountApprovers };
}

/**
 * H8 for one instance of a closure. The declared mount's own trust covers the
 * harness and anything in the same tree; an instance reached through a GITLINK
 * is another repository at another commit, so it ALSO needs consent of its
 * own, on the mount's override for that instance (roast `1ygp` L4.2). Staging
 * needs neither, and is recorded as such.
 */
export function trustFor(
  via: RemoteMount | undefined,
  inst: { instance: string; sha: string; pinnedBy: LockedInstance["pinnedBy"] },
  purpose: "staging" | "mount",
  approvers?: readonly string[],
): TrustVerdict {
  if (!via) return { ok: false, state: "could-not-determine", detail: `no declared mount brought \`${inst.instance}\` in` };
  const parent = mountTrust(via, purpose, approvers);
  if (!parent.ok || purpose === "staging" || inst.pinnedBy !== "gitlink") return parent;
  const own = mountTrust({ harness: inst.instance, ref: inst.sha, trust: via.overrides?.[inst.instance]?.trust }, purpose, approvers);
  return own.ok
    ? own
    : {
      ...own,
      detail: `reached through a gitlink in \`${via.harness}\`'s tree, at another repository and commit, which \`${via.harness}\`'s consent does not cover; give consent on \`overrides.${inst.instance}.trust\`: ${own.detail}`,
    };
}

/** The outcome a successful trust verdict gives a mounted instance. */
function mountedState(v: TrustVerdict): "mounted" | "unverified-approver" {
  return v.ok && v.basis === "consent" && v.approver === "unverified" ? "unverified-approver" : "mounted";
}

/**
 * Resolve every declared mount's closure. Fetches trees (blobless) and reads
 * declarations; writes nothing. The trees stay open in `trees` for
 * {@link mountRemote} to check out from; {@link planRemote} closes them.
 */
function resolveClosure(opts: RemoteMountOptions, trees: Map<string, RemoteTree>): Plan {
  const ds = downstreamOf(opts);
  const plan: Plan = { instanceRoot: ds.instanceRoot, downstream: ds.name, mounts: ds.mounts, approvers: ds.approvers, instances: [], outcomes: [] };
  if (ds.mounts.length === 0) return plan;

  // Instances the downstream checkout ALREADY holds and did not get from a
  // previous mount: those are local, and a mount never lands on them.
  const prior = readMountLock(mountLockPathFor(ds.instanceRoot, ds.name));
  // A refused instance's old mount, left on disk, is still this mount's — not local.
  const previouslyMounted = new Set(
    prior.ok ? [...prior.lock.instances.map((i) => i.instance), ...prior.lock.unmounted.flatMap((u) => (u.leftOnDisk ? [u.instance] : []))] : [],
  );
  const local = new Map<string, string>();
  for (const root of instanceRootsIn(ds.instanceRoot)) {
    try {
      const n = readDeclaration(root)?.name;
      if (n && !previouslyMounted.has(n)) local.set(n, root);
    } catch {
      // unreadable: check:declaration-filename's finding, not this one's
    }
  }

  const open = (repository: string, sha: string): RemoteTree => {
    const key = `${repository}@${sha}`;
    let t = trees.get(key);
    if (!t) {
      t = RemoteTree.open(repository, sha, { urlFor: opts.urlFor, prefix: "remote-mount-" });
      trees.set(key, t);
    }
    return t;
  };

  const seen = new Map<string, { repository: string; sha: string }>();
  for (const m of ds.mounts) {
    const queue: Array<{ name: string; repository: string; sha: string; pinnedBy: LockedInstance["pinnedBy"] }> = [
      { name: m.harness, repository: m.repository, sha: m.ref, pinnedBy: "declared" },
    ];
    while (queue.length) {
      const q = queue.shift()!;
      const was = seen.get(q.name);
      if (was) {
        if (was.repository === "(skipped)") {
          seen.set(q.name, { repository: q.repository, sha: q.sha });
        } else {
          if (was.repository !== q.repository || was.sha !== q.sha) {
            plan.outcomes.push({
              instance: q.name,
              state: "could-not-determine",
              detail: `reached at two pins — ${was.repository}@${was.sha.slice(0, 12)} and ${q.repository}@${q.sha.slice(0, 12)}; one instance cannot be mounted twice, so pin one with an override`,
            });
          }
          continue;
        }
      }
      seen.set(q.name, { repository: q.repository, sha: q.sha });
      if (local.has(q.name) && q.name !== m.harness) {
        plan.outcomes.push({ instance: q.name, state: "local", path: local.get(q.name)!, detail: "held by this checkout; not mounted over" });
        continue;
      }
      const override = m.overrides?.[q.name];
      if (override?.skip) {
        plan.outcomes.push({ instance: q.name, state: "skipped", detail: "the downstream's override says `skip`" });
        continue;
      }
      let tree: RemoteTree;
      try {
        tree = open(q.repository, q.sha);
      } catch (e) {
        plan.outcomes.push({ instance: q.name, state: "could-not-determine", detail: `could not fetch ${q.repository}@${q.sha}: ${(e as Error).message}` });
        continue;
      }
      let found: ReturnType<typeof findInstance>;
      try {
        found = findInstance(tree, q.name);
      } catch (e) {
        plan.outcomes.push({ instance: q.name, state: "could-not-determine", detail: `could not read ${q.repository}@${q.sha.slice(0, 12)}: ${(e as Error).message}` });
        continue;
      }
      if (found === undefined) {
        plan.outcomes.push({ instance: q.name, state: "missing", detail: `no declaration of \`${q.name}\` in ${q.repository}@${q.sha.slice(0, 12)}` });
        continue;
      }
      if ("error" in found) {
        plan.outcomes.push({ instance: q.name, state: "could-not-determine", detail: found.error });
        continue;
      }
      const { decl } = found;
      const path = strip(override?.path ?? decl.mountDefaults?.path ?? decl.livesAt?.path ?? (found.root || q.name));
      if (!MountPathSchema.safeParse(path).success || path === "") {
        plan.outcomes.push({ instance: q.name, state: "could-not-determine", detail: `mount path \`${path}\` is not a repository-relative directory` });
        continue;
      }
      const dsDecl = readMountFields(ds.instanceRoot);
      const declaredDirs = [
        ...(dsDecl?.directories ?? []).map((d) => d.path),
        ...[...local.entries()].map(([n, r]) => relative(ds.instanceRoot, r) || n).filter((p) => p && p !== "."),
      ];
      const otherMounts = plan.instances.map((i) => ({ harness: i.instance, path: i.path }));
      const collisions = checkMountPathCollisions([{ harness: q.name, path }, ...otherMounts], { declaredDirs });
      const myCollision = collisions.find((c) => c.harness === q.name);
      if (myCollision) {
        plan.outcomes.push({
          instance: q.name,
          state: "could-not-determine",
          path,
          detail: myCollision.message,
        });
        continue;
      }

      const byId = new Map(decl.directories.map((d) => [d.id, d]));
      const whole = override?.whole ?? decl.mountDefaults?.whole === true;
      if (whole) {
        plan.instances.push({
          instance: q.name,
          repository: q.repository,
          sha: q.sha,
          upstreamRoot: found.root,
          path,
          via: m.harness,
          pinnedBy: q.pinnedBy,
          declarationFile: found.file,
          directories: [{ id: WHOLE_INSTANCE_ID, path, upstreamPath: found.root || "." }],
          assets: [],
        });
      }
      const ids = whole
        ? []
        : override?.directories ??
        decl.mountDefaults?.directories ??
        decl.directories.filter((d) => !contentIsOffCheckout({ source: d.source as SubgraphSource | undefined, storage: d.storage })).map((d) => d.id);
      const unknown = ids.filter((id) => !byId.has(id));
      if (unknown.length) {
        plan.outcomes.push({
          instance: q.name,
          state: "could-not-determine",
          detail: `\`${unknown.join("`, `")}\` named for mounting but not declared by \`${q.name}\` at ${q.sha.slice(0, 12)}`,
        });
        continue;
      }
      const directories: PlannedDirectory[] = [];
      if (!whole) for (const id of ids) {
        const d = byId.get(id)!;
        if (strip(d.path).split("/").includes("..")) continue; // a path that climbs out is not this instance's to give
        directories.push({ id, path: joinRel(path, d.path), upstreamPath: joinRel(found.root, d.path) });
      }
      if (!whole)
        plan.instances.push({
          instance: q.name,
          repository: q.repository,
          sha: q.sha,
          upstreamRoot: found.root,
          path,
          via: m.harness,
          pinnedBy: q.pinnedBy,
          declarationFile: found.file,
          directories,
          assets: [
            ...new Set(
              (decl.assets ?? [])
                .filter((a) => a.scope !== "repository")
                .map((a) => strip(a.src.replace(/^\.\//, "")))
                .filter((s) => s && !s.startsWith("/") && !s.split("/").includes("..")),
            ),
          ].sort(),
        });

      // TRANSITIVELY: each need in the same tree, else as a gitlink there.
      const modules = gitmodules(tree.readText(".gitmodules"));
      for (const need of decl.needs ?? []) {
        if (seen.has(need)) continue;
        // A need the downstream mounts by an entry of ITS OWN is that entry's
        // to lay down, at that entry's pin. Walking it here as well reached it
        // at a second pin ("reached at two pins") whenever this entry came
        // first, which is why every index entry carried a `skip: true` for
        // each sibling it needs, and the lock then listed those siblings as
        // `unmounted: skipped` beside their own `mounted` record (measured
        // 2026-10-09: 4 of 11 in folio-assistant's lock). Not an outcome:
        // nothing was skipped, it is simply mounted once, by its own entry.
        if (ds.mounts.some((other) => other !== m && other.harness === need)) continue;
        const skip = m.overrides?.[need]?.skip ?? ds.mounts.some((other) => other.overrides?.[need]?.skip);
        if (skip) {
          seen.set(need, { repository: "(skipped)", sha: "" });
          plan.outcomes.push({ instance: need, state: "skipped", detail: "the downstream's override says `skip`" });
          continue;
        }
        let inTree: ReturnType<typeof findInstance>;
        try {
          inTree = findInstance(tree, need);
        } catch {
          inTree = undefined;
        }
        if (inTree !== undefined) {
          queue.push({ name: need, repository: q.repository, sha: q.sha, pinnedBy: "same-tree" });
          continue;
        }
        const link = tree.list("").find((e) => e.kind === "commit" && e.path === need);
        const url = link ? modules.get(link.path) : undefined;
        if (link && url) {
          queue.push({ name: need, repository: repositoryOf(url), sha: link.oid, pinnedBy: "gitlink" });
          continue;
        }
        if (local.has(need)) {
          seen.set(need, { repository: "(local)", sha: "" });
          plan.outcomes.push({ instance: need, state: "local", path: local.get(need)!, detail: "held by this checkout; not mounted over" });
          continue;
        }
        seen.set(need, { repository: q.repository, sha: q.sha });
        plan.outcomes.push({
          instance: need,
          state: "missing",
          detail: `\`${q.name}\` needs \`${need}\`, which ${q.repository}@${q.sha.slice(0, 12)} neither holds nor pins as a gitlink`,
        });
      }
    }
  }
  return plan;
}

/** Resolve the closure and close every fetched tree. Writes nothing. */
export function planRemote(opts: RemoteMountOptions = {}): Plan {
  const trees = new Map<string, RemoteTree>();
  try {
    return resolveClosure(opts, trees);
  } finally {
    for (const t of trees.values()) t.close();
  }
}

// ── Mounting ─────────────────────────────────────────────────────────────────

function sha256Text(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

function digestOf(abs: string, skip: readonly string[] = []): { treeDigest: string; files: number } {
  // Install artefacts (`node_modules/`) are never pinned bytes: see
  // `installDependencies` in mount-from-lock.ts for why they are outside fixity.
  // Neither are the paths the instance declares `builtAtPublish`: the publish
  // writes them into the mount, so the lock's digest (mount-from-lock.ts
  // `digestOf`) leaves them out and this one must too, or a mount whose site
  // was built reads as modified.
  const files = withoutBuiltAtPublish(
    withoutInstallArtefacts(withoutStateMounts(abs, treeEntries(abs).files, skip)),
    builtAtPublishOf(abs),
  );
  return { treeDigest: treeDigest(abs, files), files: files.length };
}

function gitIn(cwd: string, args: string[]): { status: number; stdout: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { status: r.status ?? 128, stdout: r.stdout ?? "" };
}

/** Is any file under `rel` tracked by the checkout? A mount never lands on tracked bytes. */
function tracked(base: string, rel: string): boolean {
  const r = gitIn(base, ["ls-files", "--", rel]);
  return r.status === 0 && r.stdout.trim() !== "";
}

/**
 * Keep the mount out of commits. When the checkout's own rules already
 * ignore the path nothing is written; otherwise the path goes to this
 * worktree's `info/exclude` — local, never committed — and the report says
 * so, so a folio that wants the rule visible can commit it to `.gitignore`.
 *
 * WITH `index.config.json` (`indexed`) nothing goes to `info/exclude`: the
 * committed `.gitignore` block generated from the index is the rule, and a
 * path it does not cover is `not-ignored` — reported, never patched locally,
 * because a local exclude is invisible to every other clone.
 *
 * `mountRemote` now always passes `indexed`: a folio with no index gets the
 * same committed block, written from its lock (owner, 2026-10-09). The
 * `info/exclude` branch stays for a direct caller that asks for it.
 */
function ensureIgnored(base: string, rel: string, indexed = false): "ignored" | "excluded" | "not-ignored" | "not-a-checkout" {
  if (gitIn(base, ["rev-parse", "--git-dir"]).status !== 0) return "not-a-checkout";
  if (gitIn(base, ["check-ignore", "-q", "--no-index", `${rel}/`]).status === 0) return "ignored";
  if (indexed) return "not-ignored";
  // `info/exclude` patterns are relative to the top of the worktree, and the
  // downstream instance may sit below it.
  const prefix = gitIn(base, ["rev-parse", "--show-prefix"]).stdout.trim();
  const file = resolve(base, gitIn(base, ["rev-parse", "--git-path", "info/exclude"]).stdout.trim());
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `# remote mount (bean 0mpw) — bun run cat mount:remote\n/${prefix}${rel}/\n`);
  return "excluded";
}

/** Directories of a previously locked instance whose bytes no longer match the lock. */
function modifiedSince(base: string, locked: LockedInstance): string[] {
  const out = locked.directories
    .filter((d) => existsSync(join(base, d.path)) && digestOf(join(base, d.path), stateMountedDirs(base)).treeDigest !== d.treeDigest)
    .map((d) => d.path);
  for (const a of locked.assets ?? []) {
    const abs = join(base, locked.path, a.src);
    if (existsSync(abs) && sha256Text(readFileSync(abs)) !== a.sha256) out.push(`${locked.path}/${a.src}`);
  }
  return out;
}

export interface MountReport {
  plan: Plan;
  lockFile: string;
  /** Paths written to `info/exclude` rather than already ignored. */
  excluded: string[];
}

/** Plan, fetch, lay each planned instance down, write the lock. */
export function mountRemote(opts: RemoteMountOptions = {}): MountReport {
  const trees = new Map<string, RemoteTree>();
  try {
    const plan = resolveClosure(opts, trees);
    const lockFile = join(plan.instanceRoot, mountLockFilename(plan.downstream));
    const excluded: string[] = [];
    if (plan.mounts.length === 0) return { plan, lockFile, excluded };
    // The lock moved to `index.lock.json` (owner, 2026-10-07). A legacy
    // `<name>.mount-lock.json` is RENAMED onto the new name before it is
    // rewritten — moved, never dropped — so the two never coexist.
    const legacyLock = mountLockPathFor(plan.instanceRoot, plan.downstream);
    if (legacyLock !== lockFile && existsSync(legacyLock)) renameSync(legacyLock, lockFile);
    // With an index, the committed `.gitignore` block is regenerated from it
    // before anything lands, and `info/exclude` is never written.
    const idx = readIndexConfig(plan.instanceRoot);
    const index = idx.state === "ok" ? idx.config : undefined;
    // The PLANNED closure, so an instance the mount brings in transitively is
    // ignored before its bytes land; re-synced from the lock once written.
    //
    // WITHOUT an index the same committed block is written from the lock
    // alone (owner, 2026-10-09: "yes, write the .gitignore block"). Until then
    // such a folio got `info/exclude` lines, local to one clone, so every
    // other clone — CI's included — had the mounted bytes one `git add -A`
    // away from a commit.
    const blockConfig: IndexConfig = index ?? { $schema: INDEX_CONFIG_SCHEMA, instances: [] };
    syncIgnoreBlock(plan.instanceRoot, blockConfig, [...lockedMountPaths(plan.instanceRoot), ...plan.instances.map((i) => i.path)]);

    const prior = readMountLock(lockFile);
    // A refused instance's left-on-disk record counts as "this mount put it
    // there", so consent restored later can re-mount over it.
    const priorBy = new Map(
      (prior.ok ? [...prior.lock.unmounted.flatMap((u) => (u.leftOnDisk ? [u.leftOnDisk] : [])), ...prior.lock.instances] : []).map((i) => [i.instance, i]),
    );
    const locked: LockedInstance[] = [];
    const untouched = new Set<string>();
    const leftOnDisk = new Map<string, LockedInstance>();

    for (const p of plan.instances) {
      const target = join(plan.instanceRoot, p.path);
      const before = priorBy.get(p.instance);
      // H8, bean `ieum`: a remote graph is mounted only on signed provenance or a
      // person's consent for this pin; a staging preview needs neither. Checked
      // BEFORE anything is checked out, so a refused mount writes nothing.
      const via = plan.mounts.find((m) => m.harness === p.via);
      const trust = trustFor(via, p, opts.purpose ?? "mount", plan.approvers);
      if (!trust.ok) {
        // Roast `1ygp` L4.2: the previous mount is NOT carried forward as
        // current. It stays on disk (an agent does not delete it) and is
        // recorded as left-on-disk under `unmounted`, so the check reports it.
        let detail = `not mounted: ${trust.detail}`;
        if (before && existsSync(join(plan.instanceRoot, before.path))) {
          leftOnDisk.set(p.instance, before);
          detail += `; the previous mount (${before.repository}@${before.sha.slice(0, 12)}) is still on disk at \`${before.path}/\` and is NOT mounted — delete it, or restore trust and re-mount`;
        }
        plan.outcomes.push({ instance: p.instance, state: trust.state, path: p.path, detail });
        continue;
      }
      try {
        if (before) {
          const changed = modifiedSince(plan.instanceRoot, before);
          if (changed.length) {
            plan.outcomes.push({
              instance: p.instance,
              state: "missing",
              path: p.path,
              detail: `left untouched: ${changed.join(", ")} no longer hash to the lock — edits there are somebody's work; move them upstream or delete the directory, then re-mount`,
            });
            locked.push(before);
            untouched.add(p.instance);
            continue;
          }
        } else if (existsSync(target)) {
          plan.outcomes.push({ instance: p.instance, state: "missing", path: p.path, detail: `\`${p.path}/\` already exists and no lock says this mount put it there — refused` });
          continue;
        }
        if (tracked(plan.instanceRoot, p.path)) {
          plan.outcomes.push({ instance: p.instance, state: "missing", path: p.path, detail: `\`${p.path}/\` holds tracked files — a mount never lands on tracked bytes` });
          continue;
        }
        const tree = trees.get(`${p.repository}@${p.sha}`)!;
        const work = tree.checkout([
          p.declarationFile,
          ...p.directories.map((d) => (d.upstreamPath === "." ? "*" : `${d.upstreamPath}/`)),
          ...(p.assets ?? []).map((a) => joinRel(p.upstreamRoot, a)),
        ]);
        // The digest leaves `node_modules/` out so an install cannot make a
        // mount read modified. That is only sound while no upstream PINS a
        // file there, so a tree that does is refused rather than half-verified.
        const pinsArtefacts = p.directories.find((d) => {
          const src = join(work, d.upstreamPath);
          return existsSync(src) && treeEntries(src).files.some((f) => !f.startsWith(".git/") && isInstallArtefact(f));
        });
        if (pinsArtefacts) {
          plan.outcomes.push({
            instance: p.instance,
            state: "could-not-determine",
            path: p.path,
            detail: `\`${pinsArtefacts.upstreamPath}\` at ${p.sha.slice(0, 12)} tracks files under node_modules/, which the mount digest excludes as install artefacts — refused rather than locked with bytes no check would see`,
          });
          continue;
        }

        // A STATE mount inside the instance (its `health`, say) is not this
        // mount's to replace: its files come from a state branch, may hold
        // unpushed edits, and a re-lay that deleted them left the marker
        // describing files that were gone — the next `state:push` would have
        // sent their deletion. Set aside here, put back after the digest, so
        // the lock hashes only what this mount laid down.
        const held = holdStateMounts(plan.instanceRoot, target);
        const installs = holdInstallArtefacts(
          plan.instanceRoot,
          [target, ...(before?.directories ?? []).map((d) => join(plan.instanceRoot, d.path))],
        );
        const dirs: LockedInstance["directories"] = [];
        const absent: string[] = [];
        const skipped: string[] = [];
        const assets: NonNullable<LockedInstance["assets"]> = [];
        let declText: Buffer;
        try {
          // Replace what THIS mount put there before — only that.
          if (before) {
            for (const d of before.directories) rmSync(join(plan.instanceRoot, d.path), { recursive: true, force: true });
            rmSync(join(plan.instanceRoot, before.path, `${before.instance}.json`), { force: true });
            for (const a of before.assets ?? []) rmSync(join(plan.instanceRoot, before.path, a.src), { force: true });
          }
          mkdirSync(target, { recursive: true });
          declText = readFileSync(join(work, p.declarationFile));
          writeFileSync(join(target, `${p.instance}.json`), declText);
          const built = builtAtPublishDirectories(declText);
          for (const d of p.directories) {
            const src = join(work, d.upstreamPath);
            if (!existsSync(src)) {
              // A directory the declaration builds at publish is never in the
              // pinned commit: absent is its committed state, not a defect.
              // It is left out of the lock, so verify asks nothing of it.
              if (!built.has(d.id)) absent.push(d.id);
              else skipped.push(d.id);
              continue;
            }
            const dst = join(plan.instanceRoot, d.path);
            mkdirSync(dirname(dst), { recursive: true });
            // A whole-instance mount at the upstream's root copies the fetch's
            // own work tree: its `.git` is the temporary repository, never content.
            cpSync(src, dst, { recursive: true, verbatimSymlinks: true, force: true, filter: (from) => !(d.upstreamPath === "." && from === join(src, ".git")) });
          }
          // The declared assets: single files, each locked by its own hash.
          for (const a of p.assets ?? []) {
            const src = join(work, p.upstreamRoot, a);
            if (!existsSync(src) || !statSync(src).isFile()) {
              absent.push(`asset ${a}`);
              continue;
            }
            const dst = join(target, a);
            mkdirSync(dirname(dst), { recursive: true });
            cpSync(src, dst, { force: true });
          }
          // Digest AFTER every copy, so a nested directory's digest covers what is on disk.
          for (const d of p.directories) {
            if (absent.includes(d.id) || skipped.includes(d.id)) continue;
            dirs.push({ id: d.id, path: d.path, upstreamPath: d.upstreamPath, ...digestOf(join(plan.instanceRoot, d.path)) });
          }
          for (const a of p.assets ?? []) {
            if (absent.includes(`asset ${a}`)) continue;
            assets.push({ src: a, sha256: sha256Text(readFileSync(join(target, a))) });
          }
        } finally {
          held.restore();
          installs.restore();
        }
        const ignored = ensureIgnored(plan.instanceRoot, p.path, true);
        if (ignored === "excluded") excluded.push(p.path);
        locked.push({
          instance: p.instance,
          repository: p.repository,
          sha: p.sha,
          upstreamRoot: p.upstreamRoot,
          path: p.path,
          via: p.via,
          pinnedBy: p.pinnedBy,
          declaration: { file: `${p.instance}.json`, sha256: sha256Text(declText) },
          directories: dirs,
          ...(assets.length ? { assets } : {}),
          trust: trust.record,
        });
        const files = dirs.reduce((n, d) => n + d.files, 0) + assets.length;
        plan.outcomes.push({
          instance: p.instance,
          state: absent.length || ignored === "not-ignored" ? "missing" : mountedState(trust),
          path: p.path,
          detail:
            (absent.length
              ? `declared but absent at ${p.sha.slice(0, 12)}: ${absent.join(", ")} — the rest is mounted`
              : `${dirs.length} director${dirs.length === 1 ? "y" : "ies"}, ${files} file(s) from ${p.repository}@${p.sha.slice(0, 12)}; basis: ${trust.detail}`) +
            (ignored === "not-ignored" ? ` — but \`${p.path}/\` is NOT ignored: the committed .gitignore index-mounts block does not cover it` : ""),
        });
      } catch (e) {
        plan.outcomes.push({ instance: p.instance, state: "could-not-determine", path: p.path, detail: `mounting threw: ${(e as Error).message}` });
      }
    }

    // Install each mounted instance's dependencies AFTER every instance is
    // down, so a manifest's `workspaces` that names a sibling mount
    // (`../cat-harnes[s]`) finds it. A failed install is reported against the
    // instance and fails the run, but is not written into the lock: the lock
    // records which pinned bytes are on disk, and they are.
    const installFailed = new Set<string>();
    if (opts.install !== false) {
      for (const l of locked) {
        if (untouched.has(l.instance)) continue;
        const r = installDependencies(join(plan.instanceRoot, l.path), opts.install ?? "production");
        if (r.state === "none") continue;
        const o = plan.outcomes.find((x) => x.instance === l.instance && (x.state === "mounted" || x.state === "unverified-approver" || x.state === "missing"));
        if (!o) continue;
        if (r.state === "installed") o.detail += `; ${r.detail}`;
        else {
          installFailed.add(l.instance);
          Object.assign(o, { state: "missing", detail: `${o.detail}; the pinned bytes are on disk but its dependencies are NOT installed, so its tools will not run: ${r.detail}` });
        }
      }
    }

    const lock: MountLock = {
      $schema: MOUNT_LOCK_SCHEMA,
      mounts: plan.mounts.map((m) => ({ harness: m.harness, repository: m.repository, ref: m.ref })),
      instances: locked.sort((a, b) => a.instance.localeCompare(b.instance)),
      // Every non-mounted answer EXCEPT an untouched prior mount, which stays
      // in `instances` and is re-judged from disk by the check.
      unmounted: plan.outcomes
        .filter((o): o is Exclude<InstanceOutcome, { state: "mounted" | "unverified-approver" }> => o.state !== "mounted" && o.state !== "unverified-approver" && !untouched.has(o.instance) && !installFailed.has(o.instance))
        .map((o) => {
          const left = leftOnDisk.get(o.instance);
          return { instance: o.instance, state: o.state, detail: o.detail, ...(left ? { leftOnDisk: left } : {}) };
        })
        .sort((a, b) => a.instance.localeCompare(b.instance)),
    };
    writeFileSync(lockFile, JSON.stringify(lock, null, 2) + "\n");
    syncIgnoreBlock(plan.instanceRoot, blockConfig);
    return { plan, lockFile, excluded };
  } finally {
    for (const t of trees.values()) t.close();
  }
}

// ── Seeding: create or re-pin a remote instance, WITH its consent ────────────

/** One `--seed <name>=<owner/repo>@<sha>`: what to write into the index. */
export interface SeedSpec {
  harness: string;
  repository: string;
  ref: string;
  /** Mount every tracked file (`overrides.<harness>.whole: true`). */
  whole?: boolean;
}

/** Parse `<name>=<owner/repo>@<40-char sha>`; throws with the expected shape. */
export function parseSeed(arg: string): SeedSpec {
  const m = /^([^=\s]+)=([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})$/.exec(arg);
  if (!m) throw new Error(`--seed \`${arg}\`: expected <name>=<owner/repo>@<40-character sha>`);
  return { harness: m[1]!, repository: m[2]!, ref: m[3]! };
}

/**
 * Create or re-pin remote instances in `index.config.json`, and write each
 * one's `trust.consent {by, on, ref, evidence}` from `grant` as part of the
 * same write (task #10, gap c). Until 2026-10-12 nothing seeded an index with
 * remote instances, so every entry was hand-written and its consent typed in
 * after — and a re-pin that forgot to move `consent.ref` was refused at the
 * next mount (H8: a moved pin asks again). Here the consent is bound to the
 * pin being written, by `withConsent`, so the two cannot disagree.
 *
 * An existing entry keeps its overrides and note; only its repository and pin
 * move, and a consent already recorded for the SAME pin is kept. Other
 * entries are not touched. The write goes through `writeDeclaredMounts`, so
 * the committed `.gitignore` block moves with it. Nothing is fetched: run
 * `mount:remote` afterwards.
 */
export function seedRemote(instanceRoot: string, specs: readonly SeedSpec[], grant: ConsentGrant): { file: string; mounts: RemoteMount[] } {
  if (specs.length === 0) throw new Error("nothing to seed");
  const current = readDeclaredMounts(instanceRoot).mounts;
  const next: RemoteMount[] = [...current];
  for (const spec of specs) {
    const at = next.findIndex((m) => m.harness === spec.harness);
    let m: RemoteMount = at >= 0 ? { ...next[at]!, repository: spec.repository, ref: spec.ref } : { harness: spec.harness, repository: spec.repository, ref: spec.ref };
    if (spec.whole) m = { ...m, overrides: { ...m.overrides, [spec.harness]: { ...m.overrides?.[spec.harness], whole: true } } };
    m = withConsent(m, grant);
    if (at >= 0) next[at] = m;
    else next.push(m);
  }
  const { file } = writeDeclaredMounts(instanceRoot, next);
  return { file, mounts: next.filter((m) => specs.some((s) => s.harness === m.harness)) };
}

// ── Checking (no network) ────────────────────────────────────────────────────

export interface CheckResult {
  /**
   * `unverified-approver`: every instance is mounted and verified, but at
   * least one on consent no declared `mountApprovers` list checked. It exits
   * 0 (the bytes are the pinned bytes) and is reported as its own state,
   * never rendered as clean (roast `1ygp` L4.2).
   */
  state: "not-enabled" | "mounted" | "unverified-approver" | "missing" | "could-not-determine";
  reason: string;
  outcomes: InstanceOutcome[];
}

/**
 * Disk against lock against declaration, with no fetch. The declaration's pins
 * must be the lock's; every locked directory must be on disk and hash to its
 * digest; every locked declaration must be byte-identical.
 */
export function checkRemote(opts: { instanceRoot?: string } = {}): CheckResult {
  let ds: ReturnType<typeof downstreamOf>;
  try {
    ds = downstreamOf(opts);
  } catch (e) {
    return { state: "could-not-determine", reason: `could not read the declaration: ${(e as Error).message}`, outcomes: [] };
  }
  if (ds.mounts.length === 0) return { state: "not-enabled", reason: "no `remoteMounts` declared; nothing to check", outcomes: [] };
  let lockFile: string;
  try {
    lockFile = mountLockPathFor(ds.instanceRoot, ds.name);
  } catch (e) {
    return { state: "could-not-determine", reason: (e as Error).message, outcomes: [] };
  }
  const r = readMountLock(lockFile);
  if (!r.ok) {
    return r.absent
      ? { state: "missing", reason: `\`remoteMounts\` declared and no lock at ${mountLockFilename(ds.name)} — run \`bun run cat mount:remote\``, outcomes: [] }
      : { state: "could-not-determine", reason: r.why, outcomes: [] };
  }
  const want = JSON.stringify(ds.mounts.map((m) => [m.harness, m.repository, m.ref]).sort());
  const have = JSON.stringify(r.lock.mounts.map((m) => [m.harness, m.repository, m.ref]).sort());
  if (want !== have) {
    return { state: "missing", reason: "the lock was written for different pins than the declaration names — run `bun run cat mount:remote`", outcomes: [] };
  }
  // What the mount reached and did not lay down is carried in the lock, so
  // "the lock lists nothing wrong" is never mistaken for "nothing was wrong".
  const outcomes: InstanceOutcome[] = r.lock.unmounted.map(
    (u) =>
      ({
        instance: u.instance,
        state: u.state,
        detail: u.leftOnDisk && !u.detail.includes("still on disk") ? `${u.detail}; previous mount still on disk at \`${u.leftOnDisk.path}/\`, NOT mounted` : u.detail,
      }) as InstanceOutcome,
  );
  for (const inst of r.lock.instances) {
    // Roast `1ygp` L4.2: re-judge the recorded basis against the CURRENT
    // declaration, so consent withdrawn (or an approver list tightened) after
    // the mount is reported, not inherited from the lock.
    const via = ds.mounts.find((m) => m.harness === inst.via);
    const purpose = inst.trust?.basis === "staging" ? "staging" : "mount";
    const trust = trustFor(via, inst, purpose, ds.approvers);
    if (!trust.ok) {
      outcomes.push({
        instance: inst.instance,
        state: trust.state,
        path: inst.path,
        detail: `the recorded basis (${inst.trust ? inst.trust.basis : "none recorded"}) no longer holds, so this is not mounted: ${trust.detail}`,
      });
      continue;
    }
    const basis = inst.trust ? trust.detail : `${trust.detail} (no basis recorded in the lock; re-derived — re-run \`bun run cat mount:remote\` to record it)`;
    try {
      const decl = join(ds.instanceRoot, inst.path, inst.declaration.file);
      if (!existsSync(decl)) {
        outcomes.push({ instance: inst.instance, state: "missing", path: inst.path, detail: `${inst.path}/${inst.declaration.file} is not on disk` });
        continue;
      }
      if (sha256Text(readFileSync(decl)) !== inst.declaration.sha256) {
        outcomes.push({ instance: inst.instance, state: "missing", path: inst.path, detail: `${inst.path}/${inst.declaration.file} does not hash to the lock` });
        continue;
      }
      const bad: string[] = [];
      for (const d of inst.directories) {
        const abs = join(ds.instanceRoot, d.path);
        if (!existsSync(abs)) bad.push(`${d.path}/ absent`);
        else if (digestOf(abs, stateMountedDirs(ds.instanceRoot)).treeDigest !== d.treeDigest) bad.push(`${d.path}/ modified`);
      }
      for (const a of inst.assets ?? []) {
        const abs = join(ds.instanceRoot, inst.path, a.src);
        if (!existsSync(abs)) bad.push(`${inst.path}/${a.src} absent`);
        else if (sha256Text(readFileSync(abs)) !== a.sha256) bad.push(`${inst.path}/${a.src} modified`);
      }
      outcomes.push(
        bad.length
          ? { instance: inst.instance, state: "missing", path: inst.path, detail: `the pinned bytes are not on disk: ${bad.join("; ")}` }
          : {
            instance: inst.instance,
            state: mountedState(trust),
            path: inst.path,
            detail: `${inst.repository}@${inst.sha.slice(0, 12)}, ${inst.directories.length} director${inst.directories.length === 1 ? "y" : "ies"} verified; basis: ${basis}`,
          },
      );
    } catch (e) {
      outcomes.push({ instance: inst.instance, state: "could-not-determine", path: inst.path, detail: `could not read: ${(e as Error).message}` });
    }
  }
  return { ...summarise(outcomes), outcomes };
}

/** The aggregate: could-not-determine outranks missing, which outranks mounted. */
export function summarise(outcomes: InstanceOutcome[]): { state: CheckResult["state"]; reason: string } {
  const by = (s: InstanceOutcome["state"]): InstanceOutcome[] => outcomes.filter((o) => o.state === s);
  const cnd = by("could-not-determine");
  const missing = by("missing");
  const refused = by("refused");
  const unverified = by("unverified-approver");
  if (cnd.length) return { state: "could-not-determine", reason: `${cnd.length} instance(s) could not be determined: ${cnd.map((o) => o.instance).join(", ")} — never a pass` };
  // A refused mount is not mounted: it reads as missing, and says why.
  if (missing.length || refused.length) {
    const parts = [
      ...(missing.length ? [`${missing.length} instance(s) missing: ${missing.map((o) => o.instance).join(", ")}`] : []),
      ...(refused.length ? [`${refused.length} instance(s) refused by the trust check (H8): ${refused.map((o) => o.instance).join(", ")}`] : []),
    ];
    return { state: "missing", reason: parts.join("; ") };
  }
  if (unverified.length) {
    return {
      state: "unverified-approver",
      reason: `${by("mounted").length + unverified.length} instance(s) mounted, ${unverified.length} on consent by an UNVERIFIED approver (no \`mountApprovers\` declared): ${unverified.map((o) => o.instance).join(", ")}`,
    };
  }
  return { state: "mounted", reason: `${by("mounted").length} instance(s) mounted${by("local").length ? `, ${by("local").length} held locally` : ""}` };
}

export function exitCode(state: CheckResult["state"]): number {
  return state === "could-not-determine" ? 2 : state === "missing" ? 1 : 0;
}

export function reportOutcomes(title: string, state: CheckResult["state"], reason: string, outcomes: InstanceOutcome[]): string {
  const L = [`## ${title}`, ""];
  if (state === "not-enabled") return [...L, `Not enabled — ${reason}.`].join("\n");
  L.push(state === "mounted" ? `✅ ${reason}.` : state === "unverified-approver" ? `⚠️ **UNVERIFIED-APPROVER** — ${reason}. Not clean: declare \`mountApprovers\` so who consented is checked.` : `🛑 **${state.toUpperCase()}** — ${reason}. A layer that is not mounted is absent from every overlay; do not read its absence as "nothing there".`, "");
  if (outcomes.length) {
    L.push("| instance | state | path | detail |", "|---|---|---|---|");
    for (const o of outcomes) L.push(`| \`${o.instance}\` | ${o.state} | ${"path" in o && o.path ? `\`${o.path}\`` : "—"} | ${o.detail} |`);
  }
  return L.join("\n");
}

// ── Every declaring instance in a checkout (the session-start fan-out) ───────

/** The instances in `checkout` that declare remote mounts (index or `remoteMounts`). An unreadable declaration or index is reported, not skipped. */
export function declaringInstances(checkout: string): { roots: string[]; unreadable: Array<{ root: string; why: string }> } {
  const roots: string[] = [];
  const unreadable: Array<{ root: string; why: string }> = [];
  const mounted = new Set(lockedMountPaths(checkout));
  const candidates = [...new Set([checkout, ...instanceRootsIn(checkout)])];
  for (const root of candidates) {
    if (root !== checkout && mounted.has(relative(checkout, root))) continue;
    try {
      if (readDeclaredMounts(root).mounts.length > 0) roots.push(root);
    } catch (e) {
      unreadable.push({ root, why: (e as Error).message.split("\n")[0]! });
    }
  }
  return { roots, unreadable };
}

/**
 * Mount (or, with `check`, verify) every declaring instance in `checkout` —
 * what `state:mount` and the session-start hook call. An instance whose
 * declaration cannot be read is could-not-determine for the whole fan-out:
 * it may be the one that declares mounts.
 */
export function remoteFanOut(checkout: string, opts: { check?: boolean; plan?: boolean; urlFor?: UrlFor; purpose?: "staging" | "mount"; install?: InstallMode | false } = {}): { state: CheckResult["state"]; text: string } {
  const { roots, unreadable } = declaringInstances(checkout);
  const parts: string[] = [];
  const states: CheckResult["state"][] = [];
  for (const u of unreadable) {
    states.push("could-not-determine");
    parts.push(`## Remote mounts\n\n🛑 **could-not-determine** — ${u.root}'s declaration is unreadable (${u.why}); it may declare mounts.`);
  }
  for (const root of roots) {
    if (opts.check) {
      const r = checkRemote({ instanceRoot: root });
      states.push(r.state);
      parts.push(reportOutcomes(`Remote mounts — ${root}`, r.state, r.reason, r.outcomes));
    } else if (opts.plan) {
      // `--plan` writes nothing: no fetch into the tree, no lock, no install.
      const p = planRemote({ instanceRoot: root, urlFor: opts.urlFor });
      const sum = summarise(p.outcomes);
      states.push(sum.state);
      parts.push(reportOutcomes(`Remote mounts — plan for ${root}`, sum.state, sum.reason, p.outcomes));
    } else {
      const r = mountRemote({ instanceRoot: root, urlFor: opts.urlFor, purpose: opts.purpose, install: opts.install });
      const sum = summarise(r.plan.outcomes);
      states.push(sum.state);
      parts.push(reportOutcomes(`Remote mounts — ${root}`, sum.state, sum.reason, r.plan.outcomes));
      if (r.excluded.length) parts.push(`Added to this worktree's info/exclude (not committed): ${r.excluded.map((p) => `\`${p}/\``).join(", ")}.`);
    }
  }
  if (states.length === 0) return { state: "not-enabled", text: "## Remote mounts\n\nNot enabled — no instance in this checkout declares `remoteMounts`." };
  const state = states.includes("could-not-determine")
    ? "could-not-determine"
    : states.includes("missing")
      ? "missing"
      : states.includes("unverified-approver")
        ? "unverified-approver"
        : "mounted";
  return { state, text: parts.join("\n\n") };
}

/**
 * The generators whose output an agent reads, re-run after a mount changed
 * the lock. Each finds its own roots, so they run from the checkout root.
 * Kept to the two that DERIVE the agent surface from mounted layers; adding a
 * third here is the place to do it, and `remote-mount.md` names the list.
 */
export const AGENT_SURFACE_GENERATORS = ["gen-skill-commands.ts", "agent-memory.ts"] as const;

/** Run every {@link AGENT_SURFACE_GENERATORS} entry from `root`; `ok` is false if any exits non-zero. */
export function regenerateAgentSurface(root: string): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  for (const g of AGENT_SURFACE_GENERATORS) {
    const r = spawnSync(process.execPath, [join(import.meta.dir, g)], { cwd: root, encoding: "utf-8" });
    const pass = r.status === 0;
    ok &&= pass;
    lines.push(`  ${pass ? "✓" : "✗"} ${g}${pass ? "" : ` exited ${r.status ?? r.signal}: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ")}`}`);
  }
  return { ok, lines };
}

/** The lock's bytes, or `undefined` when there is none — compared before and after a mount. */
export function lockBytes(root: string): string | undefined {
  const f = join(root, mountLockFilename());
  return existsSync(f) ? readFileSync(f, "utf-8") : undefined;
}

/**
 * After a mount: when the lock changed and the caller did not opt out,
 * re-render the agent surface and fold its outcome into the exit code.
 */
export function afterMount(root: string, before: string | undefined, argv: string[], code: number): number {
  if (argv.includes("--no-agent-surface") || lockBytes(root) === before) return code;
  const r = regenerateAgentSurface(root);
  console.log(`\n## Agent surface — the lock changed, so the skills and memory agents read were re-rendered\n\n${r.lines.join("\n")}`);
  if (!r.ok) console.log("\nRe-run the failed generator before committing this re-pin: the new layer and the old agent surface disagree.");
  return r.ok ? code : Math.max(code, 1);
}

/**
 * Every flag this script reads, and which of them take a value. Anything else
 * is refused before the script does anything: an unrecognised flag used to be
 * ignored, so `mount:remote --help` (no such flag then) ran a full mount, and
 * `mount:remote --plan` without `--instance` fetched and wrote the lock.
 */
export const MOUNT_REMOTE_FLAGS: ReadonlyMap<string, "switch" | "value"> = new Map([
  ["--help", "switch"],
  ["-h", "switch"],
  ["--plan", "switch"],
  ["--check", "switch"],
  ["--staging", "switch"],
  ["--json", "switch"],
  ["--no-install", "switch"],
  ["--install-all", "switch"],
  ["--no-agent-surface", "switch"],
  ["--whole", "switch"],
  ["--instance", "value"],
  ["--seed", "value"],
  ["--consent-by", "value"],
  ["--consent-on", "value"],
  ["--evidence", "value"],
]);

/** What is wrong with `argv`, one line each; empty when every argument is a known flag or a known flag's value. */
export function argvProblems(argv: readonly string[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const kind = MOUNT_REMOTE_FLAGS.get(a);
    if (kind === "value") {
      if (argv[i + 1] === undefined || MOUNT_REMOTE_FLAGS.has(argv[i + 1]!)) problems.push(`${a} needs a value`);
      else i++;
    } else if (kind === undefined) {
      problems.push(a.startsWith("-") ? `unknown flag ${a}` : `unexpected argument ${a}`);
    }
  }
  return problems;
}

/** The usage text: this file's header comment, as the other scripts here print it. */
export function usageText(): string {
  return readFileSync(import.meta.path, "utf-8").split("*/")[0]!;
}

/** `--no-install` lays bytes only; `--install-all` adds devDependencies; default `production`. */
function installOf(argv: string[]): InstallMode | false {
  return argv.includes("--no-install") ? false : argv.includes("--install-all") ? "all" : "production";
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usageText());
    process.exit(0);
  }
  const problems = argvProblems(argv);
  if (problems.length) {
    console.error(`mount:remote: ${problems.join("; ")} — nothing was run. \`bun run cat mount:remote --help\` lists the flags.`);
    process.exit(2);
  }
  const at = argv.indexOf("--instance");
  if (argv.includes("--seed")) {
    const valueOf = (flag: string): string | undefined => {
      const i = argv.indexOf(flag);
      return i >= 0 ? argv[i + 1] : undefined;
    };
    const by = valueOf("--consent-by");
    // The evidence is free prose — it quotes what was said — so its home is
    // stdin, where it is data rather than a command-line word (the Tool's
    // `evidence` input, and check:tools' injection rule). `--evidence` is still
    // read for a caller already passing it.
    const evidence = valueOf("--evidence") ?? (process.stdin.isTTY ? undefined : readFileSync(0, "utf-8").trim() || undefined);
    if (!by || !evidence) {
      console.error("--seed writes consent, so it needs --consent-by <who> and the evidence (where they consented, readable) on stdin (H8: a remote instance without consent is refused at mount)");
      process.exit(2);
    }
    try {
      const specs = argv.flatMap((a, i) => (a === "--seed" ? [parseSeed(argv[i + 1] ?? "")] : [])).map((s) => ({ ...s, whole: argv.includes("--whole") }));
      const root = at === -1 ? checkoutRootFor(process.cwd()) : resolve(argv[at + 1]!);
      const r = seedRemote(root, specs, { by, evidence, on: valueOf("--consent-on") });
      for (const m of r.mounts) console.log(`✓ ${m.harness} = ${m.repository}@${m.ref.slice(0, 12)}; consent by ${m.trust?.consent?.by} on ${m.trust?.consent?.on}`);
      console.log(`wrote ${r.file} — run \`bun run cat mount:remote\` to lay the bytes down`);
      process.exit(0);
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(2);
    }
  }
  if (at === -1) {
    const root = checkoutRootFor(process.cwd());
    const plan = argv.includes("--plan");
    const mounting = !argv.includes("--check") && !argv.includes("--staging") && !plan;
    const before = lockBytes(root);
    const r = remoteFanOut(root, { check: argv.includes("--check"), plan, purpose: argv.includes("--staging") ? "staging" : "mount", install: installOf(argv) });
    console.log(r.text);
    process.exit(mounting ? afterMount(root, before, argv, exitCode(r.state)) : exitCode(r.state));
  }
  const instanceRoot = resolve(argv[at + 1]!);
  if (argv.includes("--check")) {
    const r = checkRemote({ instanceRoot });
    console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : reportOutcomes("Remote mounts — check", r.state, r.reason, r.outcomes));
    process.exit(exitCode(r.state));
  }
  if (argv.includes("--plan")) {
    const p = planRemote({ instanceRoot });
    console.log(JSON.stringify({ instances: p.instances, outcomes: p.outcomes }, null, 2));
    process.exit(exitCode(p.mounts.length ? summarise(p.outcomes).state : "not-enabled"));
  }
  const before = lockBytes(instanceRoot);
  const r = mountRemote({ instanceRoot, purpose: argv.includes("--staging") ? "staging" : "mount", install: installOf(argv) });
  const state = r.plan.mounts.length ? summarise(r.plan.outcomes).state : "not-enabled";
  console.log(reportOutcomes("Remote mounts", state, state === "not-enabled" ? "no `remoteMounts` declared" : summarise(r.plan.outcomes).reason, r.plan.outcomes));
  if (r.excluded.length) console.log(`\nAdded to this worktree's info/exclude (not committed): ${r.excluded.map((p) => `\`${p}/\``).join(", ")}.`);
  process.exit(argv.includes("--staging") ? exitCode(state) : afterMount(instanceRoot, before, argv, exitCode(state)));
}
