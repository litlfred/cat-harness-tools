/**
 * The store tools' typed results agree with the interfaces their scripts
 * print under `--json` (owner, 2026-11-01, Q-DS-10 A).
 *
 * @module scripts/tests/store-tool-results
 * @graphNode none — a test
 *
 * The agreement is checked by the TYPE checker, in both directions: a field
 * added to a script's interface and not to its schema, or the reverse, fails
 * `tsc`. The runtime cases hold that real-shaped values parse and that a
 * wrong state is refused.
 */
import { describe, expect, test } from "bun:test";
import type { z } from "zod";

import type { ClaimCheck } from "../bean-claim-check.ts";
import type { Queue } from "../drain-queue.ts";
import type { Lookup } from "../lib/bean-drain.ts";
import type { SessionSweep } from "../sibling-sessions.ts";
import {
  BeanClaimCheckSchema,
  DrainQueueSchema,
  OpenWorkLookupSchema,
  SessionSweepSchema,
} from "../../schemas/tools/store-tool-results.ts";
import { TOOL_TYPES } from "../../schemas/tools/tool-types.ts";

/** Compiles only when A and B are each assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const agree = <T extends true>(_: T) => _;
agree<Same<z.infer<typeof BeanClaimCheckSchema>, ClaimCheck>>(true);
agree<Same<z.infer<typeof DrainQueueSchema>, Queue>>(true);
agree<Same<z.infer<typeof OpenWorkLookupSchema>, Lookup>>(true);
agree<Same<z.infer<typeof SessionSweepSchema>, SessionSweep>>(true);

const lookup: Lookup = {
  query: { kind: "bean", value: "folio-assistant-f1e1" },
  checkedAt: "2026-11-01T10:00:00Z",
  hits: [{ repo: "litlfred/folio-assistant", where: "open-pr", pr: 12, match: "branch" }],
  unread: [],
};

describe("the store tools' results", () => {
  test("are published as shared tool types", () => {
    for (const n of ["BeanClaimCheck", "DrainQueue", "OpenWorkLookup", "SessionSweep"]) expect(n in TOOL_TYPES).toBe(true);
  });

  test("a claim check parses, and an unknown state is refused", () => {
    const r: ClaimCheck = { bean: "folio-assistant-f1e1", state: "skip-open-pr", copies: [], openWork: lookup, reason: "open PR #12" };
    expect(BeanClaimCheckSchema.parse(r)).toEqual(r);
    expect(BeanClaimCheckSchema.safeParse({ ...r, state: "maybe" }).success).toBe(false);
  });

  test("a drain queue parses", () => {
    const q: Queue = {
      refreshedAt: "2026-11-01T10:00:00Z",
      sources: [{ repo: "r", ref: "main", sha: "abc" }],
      byOwner: [{ owner: "me", beans: [{ id: "a", title: "A", status: "todo", type: "task", priority: "normal" }] }],
      spare: [],
      excluded: [{ id: "b", reason: "owner-held" }],
      disagreements: [{ id: "c", byCopy: { r: "todo" }, used: "r" }],
    };
    expect(DrainQueueSchema.parse(q)).toEqual(q);
  });

  test("a session sweep parses", () => {
    const s: SessionSweep = { since: "1 day ago", commitsScanned: 3, sessions: [], untrailered: 3 };
    expect(SessionSweepSchema.parse(s)).toEqual(s);
  });
});
