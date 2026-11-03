/**
 * The work-plan store's conformance suite: the contract's operations, held to
 * its responsibilities, against any Tool.
 *
 * The contract is `work-plan-store` in cat-harness
 * (`skills/sdlc/sdlc-core/work-plan-store.md`): operations every Tool must
 * provide, and seven responsibilities "each something a test can check
 * against any Tool". This file is those checks, written against
 * {@link StoreUnderTest} and nothing else, so a second Tool (a beans server,
 * an MCP service, a run-scoped store) passes or fails the same tests the git
 * branch does (cat-harness#991, step 2).
 *
 * {@link StoreUnderTest} is the operations as this suite calls them. Step 3
 * of the proposal lifts it into the `WorkPlanStore` interface the engine
 * calls; until then it lives here, beside its only callers.
 *
 * `history`, `positions` and `beansAt` are optional on the type. A Tool that
 * does not yet provide one gets a `todo` naming the step that adds it, never a
 * pass: an operation nobody implemented has not met its guarantee.
 *
 * @module scripts/tests/sdlc/work-plan-store-conformance
 */
import { describe, expect, test } from "bun:test";

import { BeanStatusSchema } from "../../../schemas/tools/tool-types.ts";

/** A bean as the contract speaks of it: fields, not a file. */
export interface BeanFields {
  id: string;
  title: string;
  status: string;
  type: string;
  parent?: string;
  blockedBy?: string[];
  tags?: string[];
  body: string;
}

/** A change to a bean's fields. The id never changes; the body changes only through `note`. */
export type BeanChange = Partial<Omit<BeanFields, "id" | "body">>;

export type Refusal = {
  state: "refused";
  /** `stale`: `ifMatch` is not the current version. `exists`: the id is taken. `dangling-link`: a link names no bean. `closed-list`: a value outside the schema's list. */
  why: "stale" | "exists" | "dangling-link" | "closed-list";
  detail: string;
};

export type Got = { state: "hit"; bean: BeanFields; version: string } | { state: "none" };

export interface BeanFilter {
  status?: string;
  type?: string;
  tag?: string;
  parent?: string;
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

/** The contract's operations, as this suite calls them. */
export interface StoreUnderTest {
  get(id: string): Got;
  list(filter?: BeanFilter): BeanFields[];
  create(bean: BeanFields): { state: "created"; version: string } | Refusal;
  update(id: string, change: BeanChange, ifMatch: string): { state: "updated"; version: string } | Refusal | { state: "none" };
  note(id: string, text: string, by: string): { state: "noted"; version: string } | { state: "none" };
  history?(id: string): HistoryEvent[];
  positions?(id: string): Position[];
  beansAt?(process: string, step?: string): string[];
}

/**
 * A Tool under test. `fresh` returns two writers on ONE new, empty store, so
 * the race responsibility is two real writers and not one writer twice.
 */
export interface ToolUnderTest {
  name: string;
  fresh(): { a: StoreUnderTest; b: StoreUnderTest };
  /** Per-test budget, for Tools whose operations are real I/O. */
  timeoutMs?: number;
}

const bean = (id: string, extra: Partial<BeanFields> = {}): BeanFields => ({
  id,
  title: `bean ${id}`,
  status: "todo",
  type: "task",
  body: "The first paragraph.\n",
  ...extra,
});

function hit(g: Got): { bean: BeanFields; version: string } {
  if (g.state !== "hit") throw new Error("expected a bean, got none");
  return g;
}

function created(r: ReturnType<StoreUnderTest["create"]>): string {
  if (r.state !== "created") throw new Error(`create refused: ${r.why} — ${r.detail}`);
  return r.version;
}

/** The fields a reader compares: what was written, minus the Tool's own bookkeeping. */
const fields = (b: BeanFields): BeanFields => ({
  id: b.id,
  title: b.title,
  status: b.status,
  type: b.type,
  ...(b.parent ? { parent: b.parent } : {}),
  ...(b.blockedBy?.length ? { blockedBy: [...b.blockedBy] } : {}),
  ...(b.tags?.length ? { tags: [...b.tags] } : {}),
  body: b.body,
});

export function workPlanStoreConformance(tool: ToolUnderTest): void {
  const t = tool.timeoutMs;

  describe(`work-plan store conformance — ${tool.name}`, () => {
    describe("1. give back what was written", () => {
      test("get after create returns the bean written", () => {
        const { a } = tool.fresh();
        const b = bean("fx-aaaa", { parent: undefined, tags: ["area:store"] });
        created(a.create(b));
        expect(fields(hit(a.get("fx-aaaa")).bean)).toEqual(fields(b));
      }, t);

      test("get after update returns the change, and the rest unchanged", () => {
        const { a } = tool.fresh();
        const v = created(a.create(bean("fx-aaaa")));
        const r = a.update("fx-aaaa", { status: "in-progress", title: "renamed" }, v);
        expect(r.state).toBe("updated");
        expect(fields(hit(a.get("fx-aaaa")).bean)).toEqual(fields(bean("fx-aaaa", { status: "in-progress", title: "renamed" })));
      }, t);

      test("an unknown id is none, not an error and not another bean", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        expect(a.get("fx-zzzz").state).toBe("none");
      }, t);

      test("a short id resolves to exactly one bean, or to none when it is ambiguous", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        expect(hit(a.get("aaaa")).bean.id).toBe("fx-aaaa");
        created(a.create(bean("fy-aaaa")));
        expect(a.get("aaaa").state).toBe("none");
      }, t);

      test("list filters by status, type, tag and parent", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa", { type: "epic" })));
        created(a.create(bean("fx-bbbb", { parent: "fx-aaaa", tags: ["area:store"] })));
        created(a.create(bean("fx-cccc", { parent: "fx-aaaa", status: "completed" })));
        const ids = (f: BeanFilter): string[] => a.list(f).map((b) => b.id).sort();
        expect(ids({})).toEqual(["fx-aaaa", "fx-bbbb", "fx-cccc"]);
        expect(ids({ status: "completed" })).toEqual(["fx-cccc"]);
        expect(ids({ type: "epic" })).toEqual(["fx-aaaa"]);
        expect(ids({ tag: "area:store" })).toEqual(["fx-bbbb"]);
        expect(ids({ parent: "fx-aaaa" })).toEqual(["fx-bbbb", "fx-cccc"]);
      }, t);
    });

    describe("2. keep ids unique", () => {
      test("create with a taken id is refused, and the first bean stands", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        const r = a.create(bean("fx-aaaa", { title: "an impostor" }));
        expect(r).toMatchObject({ state: "refused", why: "exists" });
        expect(hit(a.get("fx-aaaa")).bean.title).toBe("bean fx-aaaa");
      }, t);

      test("two writers creating one id at once: one lands, the other is refused", () => {
        const { a, b } = tool.fresh();
        const ra = a.create(bean("fx-aaaa", { title: "from a" }));
        const rb = b.create(bean("fx-aaaa", { title: "from b" }));
        expect([ra.state, rb.state]).toEqual(["created", "refused"]);
        expect(hit(b.get("fx-aaaa")).bean.title).toBe("from a");
      }, t);
    });

    describe("3. keep links whole", () => {
      test("create naming a parent that does not exist is refused", () => {
        const { a } = tool.fresh();
        expect(a.create(bean("fx-aaaa", { parent: "fx-gone" }))).toMatchObject({ state: "refused", why: "dangling-link" });
        expect(a.get("fx-aaaa").state).toBe("none");
      }, t);

      test("update to a blocked_by that does not exist is refused", () => {
        const { a } = tool.fresh();
        const v = created(a.create(bean("fx-aaaa")));
        expect(a.update("fx-aaaa", { blockedBy: ["fx-gone"] }, v)).toMatchObject({ state: "refused", why: "dangling-link" });
      }, t);

      test("links to beans that exist land", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        const v = created(a.create(bean("fx-bbbb", { parent: "fx-aaaa" })));
        expect(a.update("fx-bbbb", { blockedBy: ["fx-aaaa"] }, v).state).toBe("updated");
        expect(hit(a.get("fx-bbbb")).bean.blockedBy).toEqual(["fx-aaaa"]);
      }, t);
    });

    describe("4. keep the lists closed", () => {
      test("a status outside the schema's list is refused, on create and on update", () => {
        const { a } = tool.fresh();
        expect(a.create(bean("fx-aaaa", { status: "almost-done" }))).toMatchObject({ state: "refused", why: "closed-list" });
        const v = created(a.create(bean("fx-bbbb")));
        expect(a.update("fx-bbbb", { status: "almost-done" }, v)).toMatchObject({ state: "refused", why: "closed-list" });
        expect(hit(a.get("fx-bbbb")).bean.status).toBe("todo");
      }, t);

      test("every status the schema declares is accepted", () => {
        const { a } = tool.fresh();
        let v = created(a.create(bean("fx-aaaa")));
        for (const s of BeanStatusSchema.options) {
          const r = a.update("fx-aaaa", { status: s }, v);
          if (r.state !== "updated") throw new Error(`status ${s} refused: ${JSON.stringify(r)}`);
          v = r.version;
        }
      }, t);

      // The contract says type is a closed list too, but the bean schema
      // declares `type` as a bare string and no closed list of types exists
      // anywhere to test against. Reported on cat-harness#991 rather than
      // invented here.
      test.todo("a type outside the schema's list is refused — the schema declares no list of types yet", () => {});
    });

    describe("5. lose nothing to a race", () => {
      test("an update with a stale ifMatch is refused; a retry on the current version lands; both changes stand", () => {
        const { a, b } = tool.fresh();
        const v0 = created(a.create(bean("fx-aaaa")));

        // Both read the same version.
        expect(hit(b.get("fx-aaaa")).version).toBe(v0);

        expect(a.update("fx-aaaa", { status: "in-progress" }, v0).state).toBe("updated");
        expect(b.update("fx-aaaa", { title: "b's title" }, v0)).toMatchObject({ state: "refused", why: "stale" });

        const fresh = hit(b.get("fx-aaaa"));
        expect(fresh.bean.status).toBe("in-progress");
        expect(b.update("fx-aaaa", { title: "b's title" }, fresh.version).state).toBe("updated");

        const end = hit(a.get("fx-aaaa")).bean;
        expect(end.status).toBe("in-progress");
        expect(end.title).toBe("b's title");
      }, t);

      test("two writers' notes both land, in the order they were written", () => {
        const { a, b } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        expect(a.note("fx-aaaa", "first, from a", "writer-a").state).toBe("noted");
        expect(b.note("fx-aaaa", "second, from b", "writer-b").state).toBe("noted");
        const body = hit(a.get("fx-aaaa")).bean.body;
        expect(body.indexOf("first, from a")).toBeGreaterThan(-1);
        expect(body.indexOf("second, from b")).toBeGreaterThan(body.indexOf("first, from a"));
      }, t);

      test("a note never rewrites what was there before it", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        a.note("fx-aaaa", "one", "w");
        const before = hit(a.get("fx-aaaa")).bean.body.trimEnd();
        a.note("fx-aaaa", "two", "w");
        expect(hit(a.get("fx-aaaa")).bean.body.startsWith(before)).toBe(true);
      }, t);

      test("a note on an unknown id is none, and creates nothing", () => {
        const { a } = tool.fresh();
        expect(a.note("fx-zzzz", "x", "w").state).toBe("none");
        expect(a.list()).toEqual([]);
      }, t);
    });

    describe("6. keep the history", () => {
      const probe = tool.fresh().a;
      if (!probe.history) {
        test.todo(`history(id) — not provided by ${tool.name} yet (cat-harness#991 step 5)`, () => {});
        return;
      }
      test("history answers every change, oldest first, with who made it", () => {
        const { a } = tool.fresh();
        const v = created(a.create(bean("fx-aaaa")));
        a.update("fx-aaaa", { status: "in-progress" }, v);
        a.note("fx-aaaa", "a note", "writer-a");
        const h = a.history!("fx-aaaa");
        expect(h.length).toBeGreaterThanOrEqual(3);
        const ats = h.map((e) => e.at);
        expect([...ats].sort()).toEqual(ats);
        for (const e of h) expect(e.by.length).toBeGreaterThan(0);
      }, t);
    });

    describe("7. know where a bean is", () => {
      const probe = tool.fresh().a;
      if (!probe.positions || !probe.beansAt) {
        test.todo(`positions(id) and beansAt(process, step) — not provided by ${tool.name} yet (cat-harness#991 step 4)`, () => {});
        return;
      }
      test("a bean no instance names has no position, and is at no step", () => {
        const { a } = tool.fresh();
        created(a.create(bean("fx-aaaa")));
        expect(a.positions!("fx-aaaa")).toEqual([]);
        expect(a.beansAt!("code-change-review")).not.toContain("fx-aaaa");
      }, t);
    });
  });
}
