/**
 * Artefacts an instance must NOT commit, because no commit of it can hold them
 * current: they are built when the site is published, and only then.
 *
 * @module schemas/built-at-publish
 * @graphNode none — a declaration shape and two pure readers over it
 *
 * ## The ruling (owner, 2026-10-14, "B1")
 *
 * cat-harness committed pages whose bytes depended on WHICH version of every
 * other instance a consuming index had pinned — the auto-docs indexes, the UML
 * overview, the named-subgraph JSON-LD and its payloads, the process pages and
 * BPMN drawings of other instances' diagrams. Their `:check` gates then failed
 * in the index whenever its pins differed from the ones cat-harness was last
 * regenerated against, so every re-pin needed another regeneration PR here, and
 * the pair never converged. The ruling: stop committing them; build them at
 * publish time.
 *
 * The owner widened it the same day ("fix all, in proper way") to the
 * projections of a BRANCH-KEPT graph — the beans and todos counts, the todo
 * listings — which are the same defect on a different clock: the committed
 * `harness.json` said 190 open beans while the committed `count.json` said 179,
 * two snapshots of `cat/cat-harness/beans` taken at different times.
 *
 * ## The rule, so the list can be checked rather than remembered
 *
 * An artefact may be committed in an instance only if every input it is
 * computed from is pinned BY THAT INSTANCE'S OWN COMMIT: its own tree, plus the
 * instances it `needs` at the pins its own lock names. Two ways to fail it,
 * and {@link BuiltAtPublishSchema} names which one each entry fails:
 *
 * - `checkout` — computed over every instance the checkout stacks on this one.
 *   Those are ABOVE it (they `need` it), so it cannot pin them, and the bytes
 *   are a function of the consuming index's lock, not of this commit.
 * - `state` — computed from a graph kept on a branch (`beans`, `todos`, `qa`),
 *   which moves without a commit. This is `check:derived-from`'s storage clock
 *   (bean `0b8c`), stated for artefacts that are not a declared directory.
 *
 * ## Why a list in the declaration, and not only `.gitignore`
 *
 * `.gitignore` says "never committed". It does not say who builds the file, so
 * a page that is ignored and never built would read as absent rather than as
 * broken. The declaration names the WRITER (a package script, run as
 * `bun run cat <script>` — a script NAME, because the generators live in a layer
 * above this one and this layer may not name its paths), so the publish step
 * can run it and a gate can refuse an entry nobody builds. The two are kept
 * equal by `built-at-publish.test.ts`: every declared path is ignored, and
 * nothing declared is tracked.
 *
 * ## Writer order, and the one edge that must be declared
 *
 * Owner, 2026-10-15 ("A1"). `derive:publish` runs every instance's writers
 * lowest layer first (dependency order), each instance's entries in their
 * declared order, a writer named twice running once, at its first mention.
 * That is right whenever a writer reads what it reads at the checkout's pins.
 * It is wrong for a `checkout` artefact computed over what an instance ABOVE
 * builds at publish: cat-harness's `docs/_data/harness.json` (`docs:harness`)
 * tiles every instance's site directory, and an IG instance's `docs/` is
 * that instance's own publish-time artefact, so lowest-first wrote the tiles
 * before the directory existed. The ruling: a writer is ordered AFTER the
 * writers of other instances' outputs it reads, by an edge it DECLARES
 * (`reads`, the kinds of directory it reads), never by a guess at which
 * direction reads which. `derive:publish` sorts by those edges and refuses a
 * cycle.
 */
import { z } from "zod";

/** Why an artefact cannot be current in a commit of the instance that serves it. */
export const BuiltAtPublishCauseSchema = z.enum(["checkout", "state"]);
export type BuiltAtPublishCause = z.infer<typeof BuiltAtPublishCauseSchema>;

/** A path relative to the instance root: a file, or a directory ending in `/`. No `..`, no leading `/`. */
const InstancePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), "an instance-relative path, with no leading / and no ..")
  .refine((p) => !/[*?[\]]/.test(p), "a literal path, not a glob: a glob cannot be checked against what a writer produced");

export const BuiltAtPublishSchema = z
  .object({
    /** Instance-relative; a directory ends in `/`. */
    path: InstancePath,
    /** Package scripts that write it, in order — run as `bun run cat <script>`. */
    writer: z
      .array(z.string().regex(/^[A-Za-z0-9:_-]+$/, "a package script name"))
      .min(1)
      .refine((ws) => new Set(ws).size === ws.length, "writer names a script twice"),
    /** Which half of the rule it fails. */
    because: BuiltAtPublishCauseSchema,
    /** `state` only: the declared directory ids of the branch-kept graphs it is computed from. */
    from: z.array(z.string().min(1)).min(1).optional(),
    /** The declared directory id this path fills, when it is one (so presence checks do not expect it on disk). */
    directory: z.string().min(1).optional(),
    /**
     * The graph typologies (directory kinds) whose directories, in OTHER
     * instances, this entry's writers read: the declared READ EDGE that orders
     * them (see "Writer order" above). `derive:publish` runs these writers after
     * the writers of every other instance's entry that fills (`directory`) a
     * directory of one of these kinds. Kinds, never instance names: a lower
     * layer reading what the layers above it build cannot name them.
     */
    reads: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a graph typology name"))
      .min(1)
      .refine((ks) => new Set(ks).size === ks.length, "reads names a kind twice")
      .optional(),
    /** One sentence a reviewer can check: what makes it pin- or state-dependent. */
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.because === "state" && e.from === undefined) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "a `state` artefact names the branch-kept graph it is computed from" });
    }
    if (e.because === "checkout" && e.from !== undefined) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "`from` names branch-kept graphs; a `checkout` artefact is computed over instances, not a branch" });
    }
  });
export type BuiltAtPublish = z.infer<typeof BuiltAtPublishSchema>;

/** The list, refusing a path declared twice or nested inside another entry (one writer per route). */
export const BuiltAtPublishListSchema = z.array(BuiltAtPublishSchema).superRefine((list, ctx) => {
  for (const [i, a] of list.entries()) {
    for (const [j, b] of list.entries()) {
      if (i === j) continue;
      if (a.path === b.path && i < j) ctx.addIssue({ code: "custom", path: [j, "path"], message: `${b.path} is declared twice` });
      else if (a.path.endsWith("/") && b.path !== a.path && b.path.startsWith(a.path)) {
        ctx.addIssue({ code: "custom", path: [j, "path"], message: `${b.path} is inside ${a.path}: one route, one declared writer` });
      }
    }
  }
});

/** The `.gitignore` line that keeps one entry out of a commit: anchored at the instance root. */
export function ignoreLineFor(entry: Pick<BuiltAtPublish, "path">): string {
  return `/${entry.path}`;
}

/** Whether `rel` (instance-relative) is one of the declared artefacts or under one. */
export function isBuiltAtPublish(list: readonly Pick<BuiltAtPublish, "path">[], rel: string): boolean {
  return list.some((e) => (e.path.endsWith("/") ? rel.startsWith(e.path) || `${rel}/` === e.path : rel === e.path));
}
