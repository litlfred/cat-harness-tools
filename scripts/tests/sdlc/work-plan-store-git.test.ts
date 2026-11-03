/**
 * The git state branch Tool, held to the work-plan store's conformance suite.
 *
 * cat-harness#991, step 2. The Tool is what every checkout uses today: beans
 * as files under `beans/defs/` on a `cat/<harness>/beans` branch, written
 * through {@link BranchStore}. Its `expect` (the blob id the writer read) is
 * the contract's `ifMatch`, and a push that finds a different blob is refused
 * as `conflict` — the race guarantee, done by git rather than by a mock of it.
 *
 * The adapter below is the operations performed the way this Tool performs
 * them (`work-plan-store-git-branch` in cat-harness), with the same text
 * transforms the filesystem writer uses ({@link setFieldInText},
 * {@link appendNoteToText}), so a bean it writes reads back under the `beans`
 * CLI. Step 3 moves it into `src/` behind the `WorkPlanStore` interface.
 *
 * @module scripts/tests/sdlc/work-plan-store-git
 */
import { afterAll, expect, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BranchStore } from "../../branch-store.ts";
import { appendNoteToText, setFieldInText } from "../../beans-fallback.ts";
import { BeanStatusSchema } from "../../../schemas/tools/tool-types.ts";
import {
  workPlanStoreConformance,
  type BeanChange,
  type BeanFields,
  type BeanFilter,
  type Got,
  type Refusal,
  type StoreUnderTest,
} from "./work-plan-store-conformance.ts";

// Real git, two clones of one bare remote, several subprocesses per operation
// (see claim-branch-store.test.ts for the measured cost on CI).
const GIT_MS = 60_000;
setDefaultTimeout(GIT_MS);

const BRANCH = "cat/cat-harness/beans";
const DEFS = "beans/defs";

const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  expect(`${args[0]} -> ${r.status}: ${r.stderr}`).toBe(`${args[0]} -> 0: ${r.stderr}`);
}

/** A bare remote carrying an empty, tip-keyed beans branch, and a checkout declaring it. */
function world(): { repo: string; url: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), "wps-git-"));
  made.push(base);
  const url = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", url);

  const seed = join(base, "seed");
  git(base, "clone", "-q", url, seed);
  writeFileSync(join(seed, "manifest.json"), JSON.stringify({ $schema: "state-manifest/v1", status: "store", authoritative: true, keyedBy: "tip" }, null, 2) + "\n");
  mkdirSync(join(seed, DEFS), { recursive: true });
  writeFileSync(join(seed, "beans", "beans.json"), JSON.stringify({ name: "f", directories: [{ id: "defs", path: "defs", graphTypologies: ["bean-defs"] }] }));
  writeFileSync(join(seed, DEFS, "README.md"), "The beans.\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "seed");
  git(seed, "push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`);

  const repo = join(base, "checkout");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "remote", "add", "origin", url);
  writeFileSync(
    join(repo, "fixture.json"),
    JSON.stringify({ $schema: "cat-harness-declaration/1.0.0", name: "fixture", directories: [{ id: "beans", path: "beans/", graphTypologies: ["beans"], storage: { branch: BRANCH, keyedBy: "tip" } }] }, null, 2),
  );
  return { repo, url, base };
}

// ---------------------------------------------------------------------------
// The bean file, as the `beans` CLI writes it.

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

function sequence(key: string, ids: readonly string[] | undefined): string[] {
  return ids?.length ? [`${key}:`, ...ids.map((x) => `    - ${x}`)] : [];
}

function render(b: BeanFields, stamp: string): string {
  return [
    "---",
    `# ${b.id}`,
    `title: ${quote(b.title)}`,
    `status: ${b.status}`,
    `type: ${b.type}`,
    "priority: normal",
    ...sequence("tags", b.tags),
    `created_at: ${stamp}`,
    `updated_at: ${stamp}`,
    ...(b.parent ? [`parent: ${b.parent}`] : []),
    ...sequence("blocked_by", b.blockedBy),
    "---",
    "",
  ].join("\n") + b.body;
}

function seqIn(front: string, key: string): { ids: string[]; span?: [number, number] } {
  const m = new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]+-[ \\t]*\\S.*(?:\\n|$))+)`, "m").exec(front);
  if (!m) return { ids: [] };
  const ids = m[1]!
    .split("\n")
    .map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  return { ids, span: [m.index, m.index + m[0].length] };
}

function parse(text: string): BeanFields | undefined {
  const m = FM.exec(text);
  if (!m) return undefined;
  const front = m[1]!;
  const field = (k: string): string | undefined => {
    const v = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(front)?.[1]?.trim();
    if (!v) return undefined;
    return v.startsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v.replace(/^"|"$/g, "");
  };
  const id = /^#\s*(\S+)\s*$/m.exec(front)?.[1];
  if (!id) return undefined;
  const parent = field("parent");
  const blockedBy = seqIn(front, "blocked_by").ids;
  const tags = seqIn(front, "tags").ids;
  return {
    id,
    title: field("title") ?? "",
    status: field("status") ?? "",
    type: field("type") ?? "",
    ...(parent ? { parent } : {}),
    ...(blockedBy.length ? { blockedBy } : {}),
    ...(tags.length ? { tags } : {}),
    body: m[2] ?? "",
  };
}

/** Replace a block sequence in the front matter (or drop it when empty). */
function setSequenceInText(raw: string, key: string, ids: readonly string[]): string {
  const m = FM.exec(raw)!;
  let front = m[1]!;
  const { span } = seqIn(front, key);
  const block = sequence(key, ids).join("\n");
  if (span) front = front.slice(0, span[0]) + (block ? `${block}\n` : "") + front.slice(span[1]);
  else if (block) front = `${front}\n${block}`;
  front = front.replace(/\n+$/, "");
  return setFieldInText(`---\n${front}\n---\n${m[2]}`, "updated_at", new Date().toISOString().replace(/\.\d+Z$/, "Z"));
}

// ---------------------------------------------------------------------------
// The Tool.

const STATUSES = new Set<string>(BeanStatusSchema.options);

class GitBranchStore implements StoreUnderTest {
  constructor(private readonly s: BranchStore) {}

  /** Every bean at the tip: id → path, blob, fields. */
  private all(): Map<string, { path: string; blob: string; bean: BeanFields }> {
    const d = this.s.listDir(DEFS);
    if (d.state !== "hit") throw new Error(`cannot read ${DEFS}: ${d.reason}`);
    const out = new Map<string, { path: string; blob: string; bean: BeanFields }>();
    for (const e of d.entries) {
      if (e.type !== "blob" || !e.name.endsWith(".md") || e.name === "README.md") continue;
      const path = `${DEFS}/${e.name}`;
      const r = this.s.readFile(path);
      if (r.state !== "hit") throw new Error(`cannot read ${path}: ${r.reason}`);
      const bean = parse(r.text);
      if (bean) out.set(bean.id, { path, blob: r.blob, bean });
    }
    return out;
  }

  private resolve(all: ReturnType<GitBranchStore["all"]>, id: string): string | undefined {
    if (all.has(id)) return id;
    const bySuffix = [...all.keys()].filter((k) => k.endsWith(`-${id}`));
    return bySuffix.length === 1 ? bySuffix[0] : undefined;
  }

  private linksExist(all: ReturnType<GitBranchStore["all"]>, b: Pick<BeanFields, "parent" | "blockedBy">): string | undefined {
    for (const l of [...(b.parent ? [b.parent] : []), ...(b.blockedBy ?? [])]) {
      if (!all.has(l)) return l;
    }
    return undefined;
  }

  get(id: string): Got {
    const all = this.all();
    const key = this.resolve(all, id);
    if (!key) return { state: "none" };
    const e = all.get(key)!;
    return { state: "hit", bean: e.bean, version: e.blob };
  }

  list(filter: BeanFilter = {}): BeanFields[] {
    return [...this.all().values()]
      .map((e) => e.bean)
      .filter((b) => !filter.status || b.status === filter.status)
      .filter((b) => !filter.type || b.type === filter.type)
      .filter((b) => !filter.tag || (b.tags ?? []).includes(filter.tag))
      .filter((b) => !filter.parent || b.parent === filter.parent)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  create(bean: BeanFields): { state: "created"; version: string } | Refusal {
    if (!STATUSES.has(bean.status)) return { state: "refused", why: "closed-list", detail: `status ${bean.status}` };
    const all = this.all();
    if (all.has(bean.id)) return { state: "refused", why: "exists", detail: bean.id };
    const dangling = this.linksExist(all, bean);
    if (dangling) return { state: "refused", why: "dangling-link", detail: dangling };
    const path = `${DEFS}/${bean.id}--${slugify(bean.title)}.md`;
    const text = render(bean, new Date().toISOString().replace(/\.\d+Z$/, "Z"));
    // `expect: null` — the path must not exist at the tip. A sibling that
    // created the same id between our read and our push makes this a conflict.
    const w = this.s.write([{ path, content: text, expect: null }], `create ${bean.id}`);
    if (w.state === "conflict") return { state: "refused", why: "exists", detail: `${bean.id} was created by another writer` };
    if (w.state !== "pushed") throw new Error(`create ${bean.id}: ${w.state} — ${w.reason}`);
    return { state: "created", version: this.s.hashBlob(text) };
  }

  update(id: string, change: BeanChange, ifMatch: string): { state: "updated"; version: string } | Refusal | { state: "none" } {
    if (change.status !== undefined && !STATUSES.has(change.status)) {
      return { state: "refused", why: "closed-list", detail: `status ${change.status}` };
    }
    const all = this.all();
    const key = this.resolve(all, id);
    if (!key) return { state: "none" };
    const e = all.get(key)!;
    if (e.blob !== ifMatch) return { state: "refused", why: "stale", detail: `${key} is at ${e.blob.slice(0, 12)}, not ${ifMatch.slice(0, 12)}` };
    const dangling = this.linksExist(all, change);
    if (dangling) return { state: "refused", why: "dangling-link", detail: dangling };

    const r = this.s.readFile(e.path);
    if (r.state !== "hit") throw new Error(`cannot read ${e.path}: ${r.reason}`);
    let text = r.text;
    if (change.title !== undefined) text = setFieldInText(text, "title", quote(change.title));
    if (change.status !== undefined) text = setFieldInText(text, "status", change.status);
    if (change.type !== undefined) text = setFieldInText(text, "type", change.type);
    if (change.parent !== undefined) text = setFieldInText(text, "parent", change.parent);
    if (change.blockedBy !== undefined) text = setSequenceInText(text, "blocked_by", change.blockedBy);
    if (change.tags !== undefined) text = setSequenceInText(text, "tags", change.tags);

    const w = this.s.write([{ path: e.path, content: text, expect: ifMatch }], `update ${key}`);
    if (w.state === "conflict") return { state: "refused", why: "stale", detail: `${key} changed between this read and this write` };
    if (w.state !== "pushed") throw new Error(`update ${key}: ${w.state} — ${w.reason}`);
    return { state: "updated", version: this.s.hashBlob(text) };
  }

  /**
   * A note carries no `ifMatch`: the caller cannot be asked to retry an
   * append. So the Tool retries it — re-read, append, write against what it
   * read — until it lands on an unchanged blob.
   */
  note(id: string, text: string, by: string): { state: "noted"; version: string } | { state: "none" } {
    for (let attempt = 0; attempt < 5; attempt++) {
      const all = this.all();
      const key = this.resolve(all, id);
      if (!key) return { state: "none" };
      const e = all.get(key)!;
      const r = this.s.readFile(e.path);
      if (r.state !== "hit") throw new Error(`cannot read ${e.path}: ${r.reason}`);
      const next = appendNoteToText(r.text, `${text} (${by})`);
      const w = this.s.write([{ path: e.path, content: next, expect: r.blob }], `note ${key}`);
      if (w.state === "pushed") return { state: "noted", version: this.s.hashBlob(next) };
      if (w.state !== "conflict") throw new Error(`note ${key}: ${w.state} — ${w.reason}`);
    }
    throw new Error(`note ${id}: five writers in a row changed the bean under this one`);
  }
}

workPlanStoreConformance({
  name: "git state branch (beans-git-branch)",
  timeoutMs: GIT_MS,
  fresh() {
    const w = world();
    const open = (name: string): GitBranchStore =>
      new GitBranchStore(BranchStore.open(BRANCH, { repoRoot: w.repo, remote: w.url, storeDir: join(w.base, `${name}.git`), log: () => {} }));
    return { a: open("a"), b: open("b") };
  },
});
