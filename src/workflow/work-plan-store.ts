/**
 * **The work-plan store, as operations.** The interface every Tool that backs
 * the Beans store implements, and the engine calls.
 *
 * The contract is `work-plan-store` in cat-harness
 * (`skills/sdlc/sdlc-core/work-plan-store.md`); its conformance suite is
 * `scripts/tests/sdlc/work-plan-store-conformance.ts`. A process or a module
 * names the operation it performs ("note the bean", "claim it"), never the
 * command a Tool performs it with: that is cat-harness#991, step 3.
 *
 * Archiving is a field, not an operation (owner, 2026-11-02, Q-BSD-7 B):
 * `update(id, { archived: true }, ifMatch)`. Each Tool decides where an
 * archived bean lives; every Tool refuses to archive a bean that is not
 * `completed` or `scrapped` (`check:bean-archive`'s invariant), `get` still
 * finds an archived bean, and `list` leaves archived beans out unless asked.
 *
 * `history`, `positions` and `beansAt` are optional until steps 4 and 5 give
 * them a first implementation.
 *
 * @module folio-assistant/workflow/work-plan-store
 */
import { createHash } from "node:crypto";

/** A bean as the contract speaks of it: fields, not a file. */
export interface BeanFields {
  id: string;
  title: string;
  status: string;
  type: string;
  parent?: string;
  blockedBy?: string[];
  tags?: string[];
  /** Set only when true. */
  archived?: boolean;
  body: string;
}

/** A change to a bean's fields. The id never changes; the body changes only through `note`. */
export type BeanChange = Partial<Omit<BeanFields, "id" | "body">>;

export type Refusal = {
  state: "refused";
  /**
   * `stale`: `ifMatch` is not the current version. `exists`: the id is taken.
   * `dangling-link`: a link names no bean. `closed-list`: a value outside the
   * schema's list. `not-terminal`: archiving a bean that is not completed or
   * scrapped.
   */
  why: "stale" | "exists" | "dangling-link" | "closed-list" | "not-terminal";
  detail: string;
};

export type Got = { state: "hit"; bean: BeanFields; version: string } | { state: "none" };

export interface BeanFilter {
  status?: string;
  type?: string;
  tag?: string;
  parent?: string;
  /** `true`: archived beans only. Absent or `false`: only beans not archived. */
  archived?: boolean;
}

/** One entry of `history(id)`, oldest first. */
export interface HistoryEvent {
  at: string;
  by: string;
  what: string;
  instance?: string;
  node?: string;
}

/** One entry of `positions(id)`. */
export interface Position {
  process: string;
  instance: string;
  nodes: string[];
  status: string;
}

/** The contract's operations. */
export interface WorkPlanStore {
  get(id: string): Got;
  list(filter?: BeanFilter): BeanFields[];
  create(bean: BeanFields): { state: "created"; version: string } | Refusal;
  update(id: string, change: BeanChange, ifMatch: string): { state: "updated"; version: string } | Refusal | { state: "none" };
  note(id: string, text: string, by: string): { state: "noted"; version: string } | { state: "none" };
  history?(id: string): HistoryEvent[];
  positions?(id: string): Position[];
  beansAt?(process: string, step?: string): string[];
}

/** The statuses a bean may be archived in. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "scrapped"]);

/**
 * A bean's version for `ifMatch`: git's blob id of its text. The same value
 * whether the bean was read from a mounted checkout or from the branch itself,
 * so a version read one way can be matched the other.
 */
export function versionOf(text: string): string {
  return createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// The bean file, as the `beans` CLI writes it. Shared by every Tool that keeps
// beans as files, so they read and write one format.

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export const slugifyTitle = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** A front-matter block sequence: `key:` then one `    - id` line per entry. */
function sequenceLines(key: string, ids: readonly string[] | undefined): string[] {
  return ids?.length ? [`${key}:`, ...ids.map((x) => `    - ${x}`)] : [];
}

function sequenceIn(front: string, key: string): { ids: string[]; span?: [number, number] } {
  const m = new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]+-[ \\t]*\\S.*(?:\\n|$))+)`, "m").exec(front);
  if (!m) return { ids: [] };
  const ids = m[1]!
    .split("\n")
    .map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  return { ids, span: [m.index, m.index + m[0].length] };
}

/** A new bean's file text. `archived` is where the file is, not a field in it. */
export function renderBeanText(b: BeanFields, stamp: string): string {
  return (
    [
      "---",
      `# ${b.id}`,
      `title: ${quote(b.title)}`,
      `status: ${b.status}`,
      `type: ${b.type}`,
      "priority: normal",
      ...sequenceLines("tags", b.tags),
      `created_at: ${stamp}`,
      `updated_at: ${stamp}`,
      ...(b.parent ? [`parent: ${b.parent}`] : []),
      ...sequenceLines("blocked_by", b.blockedBy),
      "---",
      "",
    ].join("\n") + b.body
  );
}

/** A bean file's fields; `undefined` when it has no front matter or no id. */
export function parseBeanText(text: string, fallbackId?: string): BeanFields | undefined {
  const m = FM.exec(text);
  if (!m) return undefined;
  const front = m[1]!;
  const field = (k: string): string | undefined => {
    const v = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(front)?.[1]?.trim();
    if (!v) return undefined;
    return v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v.replace(/^"|"$/g, "");
  };
  const id = /^#\s*(\S+)\s*$/m.exec(front)?.[1] ?? fallbackId;
  if (!id) return undefined;
  const parent = field("parent");
  const blockedBy = sequenceIn(front, "blocked_by").ids;
  const tags = sequenceIn(front, "tags").ids;
  return {
    id,
    title: field("title") ?? id,
    status: field("status") ?? "unknown",
    type: field("type") ?? "task",
    ...(parent ? { parent } : {}),
    ...(blockedBy.length ? { blockedBy } : {}),
    ...(tags.length ? { tags } : {}),
    body: m[2] ?? "",
  };
}

/** Replace (or drop, when empty) a block sequence in the front matter. Leaves `updated_at` to the caller. */
export function setSequenceInText(raw: string, key: string, ids: readonly string[]): string {
  const m = FM.exec(raw);
  if (!m) throw new Error("not a bean file: no front matter");
  let front = m[1]!;
  const { span } = sequenceIn(front, key);
  const block = sequenceLines(key, ids).join("\n");
  if (span) front = front.slice(0, span[0]) + (block ? `${block}\n` : "") + front.slice(span[1]);
  else if (block) front = `${front}\n${block}`;
  return `---\n${front.replace(/\n+$/, "")}\n---\n${m[2]}`;
}

/** Whether a filter admits a bean. */
export function admits(filter: BeanFilter, b: BeanFields): boolean {
  return (
    (filter.archived === true) === (b.archived === true) &&
    (!filter.status || b.status === filter.status) &&
    (!filter.type || b.type === filter.type) &&
    (!filter.tag || (b.tags ?? []).includes(filter.tag)) &&
    (!filter.parent || b.parent === filter.parent)
  );
}

/**
 * The checks every Tool makes before a write, in the contract's order, so a
 * refusal reads the same whichever Tool gave it. `all` is the store as read.
 */
export function refuseWrite(
  all: ReadonlyMap<string, BeanFields>,
  after: Pick<BeanFields, "status" | "parent" | "blockedBy" | "archived">,
  statuses: ReadonlySet<string>,
): Refusal | undefined {
  if (!statuses.has(after.status)) return { state: "refused", why: "closed-list", detail: `status ${after.status}` };
  for (const l of [...(after.parent ? [after.parent] : []), ...(after.blockedBy ?? [])]) {
    if (!all.has(l)) return { state: "refused", why: "dangling-link", detail: l };
  }
  if (after.archived && !TERMINAL_STATUSES.has(after.status)) {
    return { state: "refused", why: "not-terminal", detail: `it is ${after.status}, and only a completed or scrapped bean may be archived` };
  }
  return undefined;
}

/** An exact id, else the one id ending `-<id>`; ambiguous is none. */
export function resolveId(ids: Iterable<string>, id: string): string | undefined {
  const all = [...ids];
  if (all.includes(id)) return id;
  const bySuffix = all.filter((k) => k.endsWith(`-${id}`));
  return bySuffix.length === 1 ? bySuffix[0] : undefined;
}
