/**
 * Readable page paths for ArchiMate views and elements, pinned in a committed
 * ledger so a path never moves under a reader.
 *
 * @module cat-harness/archimate/schemas/slugs
 * @covers archimate
 *
 * Owner, 2026-10-30, of `…/views/id-007936f8c2424b96ad1893ef0ff66059/`:
 * *"do we need to use such ugly IDs … why not nicer slug IRIs?"*
 *
 * ## The id stays the IRI; the slug is where the page is
 *
 * A node's `@id` is still `<m>/views/<archi id>.jsonld`: Archi's ids are what
 * the RA mapper keys on, and an IRI that moved on a rename would need a
 * tombstone each time. Only the PAGE moves, to `<m>/views/<slug>/`, and the
 * page at `<m>/views/<archi id>/` becomes a one-file redirect to it, so every
 * id link ever shared still lands. Relationships are almost all unnamed
 * (smart-ra 0.2.0: 6 of 284 named), so they keep their id paths.
 *
 * ## Pinned, so a path never moves silently
 *
 * `cat-archimate.slugs.json`, beside `cat-archimate.config.json`, holds each
 * object's slug and every slug it had before. {@link planSlugs} keeps what the
 * ledger says unless the name changed:
 *
 * - a renamed object moves to its new slug, and the old one is kept as an
 *   ALIAS, which is written as a redirect page, so the old path still lands;
 * - a slug, once claimed, is never handed to another object — not while the
 *   object is in the model, and not after it has gone — so a path never comes
 *   to mean something else;
 * - on a clash the first claimant keeps the plain slug and a later one gets
 *   `-<first hex of its id>`, so adding an element never moves another's page.
 *
 * An author can choose a slug in Archi with a `slug` property on the view or
 * element. It must be lower-case words joined by `-`; anything else is
 * refused, because a rewritten slug is a path nobody chose.
 *
 * A model with no ledger keeps id paths: slugs are opt-in per instance, and
 * `archimate-slugs.ts --instance <dir>` writes the first ledger.
 */
import { z } from "zod";
import type { ArchimateModel, ArchimateProperty } from "./archimate.ts";

export const SLUG_LEDGER_FILE = "cat-archimate.slugs.json";
export const SLUG_LEDGER_SCHEMA_TAG = "cat-archimate-slugs/v1";

/** Lower-case words of letters and digits joined by single dashes. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A derived slug is cut at a word break at or below this length. */
export const SLUG_MAX = 60;
/** The kinds that get slugs, as the path segment their pages are under. */
export const SLUG_KINDS = ["views", "elements"] as const;
export type SlugKind = (typeof SLUG_KINDS)[number];

const SlugEntrySchema = z
  .object({
    slug: z.string().regex(SLUG),
    /** Slugs this object had before, newest last. Each is a redirect to {@link slug}. */
    aliases: z.array(z.string().regex(SLUG)).optional(),
  })
  .strict();
export type SlugEntry = z.infer<typeof SlugEntrySchema>;

const KindLedgerSchema = z.record(z.string(), SlugEntrySchema);
const ModelLedgerSchema = z.object({ views: KindLedgerSchema.optional(), elements: KindLedgerSchema.optional() }).strict();
export type ModelLedger = z.infer<typeof ModelLedgerSchema>;

export const SlugLedgerSchema = z
  .object({
    $schema: z.literal(SLUG_LEDGER_SCHEMA_TAG),
    /** Keyed by the model id in `cat-archimate.config.json`, then by kind, then by Archi id. */
    models: z.record(z.string(), ModelLedgerSchema),
  })
  .strict()
  .superRefine((l, ctx) => {
    // One slug, one object: a slug or alias claimed twice in a kind is a path
    // that would mean two things.
    for (const [m, ml] of Object.entries(l.models)) {
      for (const kind of SLUG_KINDS) {
        const owner = new Map<string, string>();
        for (const [id, e] of Object.entries(ml[kind] ?? {})) {
          for (const s of [e.slug, ...(e.aliases ?? [])]) {
            const prev = owner.get(s);
            if (prev !== undefined && prev !== id) ctx.addIssue({ code: "custom", path: ["models", m, kind, id], message: `slug "${s}" is also claimed by ${prev}` });
            owner.set(s, id);
          }
        }
      }
    }
  });
export type SlugLedger = z.infer<typeof SlugLedgerSchema>;

/**
 * A name as a slug: accents dropped, lower case, every run of other
 * characters one `-`, cut at a word break at {@link SLUG_MAX}. `undefined`
 * when nothing readable is left, or when what is left looks like an Archi id
 * (`id-<hex>`), which would be mistaken for one.
 */
export function slugify(name: string): string | undefined {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX) {
    const cut = s.slice(0, SLUG_MAX + 1);
    const at = cut.lastIndexOf("-");
    s = (at > 0 ? cut.slice(0, at) : s.slice(0, SLUG_MAX)).replace(/-+$/, "");
  }
  return s === "" || looksLikeId(s) ? undefined : s;
}

const looksLikeId = (s: string): boolean => /^id-[0-9a-f]{8,}$/.test(s);

/** The slug an author chose in Archi, if any. Throws on one that is not a slug. */
export function chosenSlug(properties: ArchimateProperty[] | undefined, what: string): string | undefined {
  const p = (properties ?? []).find((x) => x.key === "slug");
  if (p === undefined) return undefined;
  if (!SLUG.test(p.value) || looksLikeId(p.value)) {
    throw new Error(`${what}: its \`slug\` property "${p.value}" is not lower-case words joined by "-"`);
  }
  return p.value;
}

/** The short tail a clashing slug takes: its id's first characters, as a slug. */
function idTail(id: string, n: number): string {
  const t = id.replace(/^id-/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return (t || "x").slice(0, n);
}

/** What {@link planSlugs} decided for one model. */
export interface SlugPlan {
  /** The model's ledger as it should be committed. */
  ledger: ModelLedger;
  /** The slug of each object that has one, by Archi id (views and elements together; ids are unique in a model). */
  slugOf: Map<string, string>;
}

/**
 * The slugs of one model's views and elements, from what the ledger already
 * pins (see the module doc). Pure: the same model and ledger give the same
 * plan, so a build and a check agree.
 */
export function planSlugs(model: ArchimateModel, pinned: ModelLedger | undefined): SlugPlan {
  const ledger: ModelLedger = {};
  const slugOf = new Map<string, string>();
  const objects: Record<SlugKind, Array<{ id: string; name: string; properties?: ArchimateProperty[]; what: string }>> = {
    views: model.views.map((v) => ({ id: v.id, name: v.name, properties: v.properties, what: `view "${v.name}" (${v.id})` })),
    elements: model.elements.map((e) => ({ id: e.id, name: e.name, properties: e.properties, what: `element "${e.name}" (${e.id})` })),
  };
  const allIds = new Set([...model.views, ...model.elements, ...model.relationships].map((o) => o.id));
  for (const kind of SLUG_KINDS) {
    const before = pinned?.[kind] ?? {};
    const after: Record<string, SlugEntry> = {};
    // Every slug ever claimed in this kind, by whom — gone objects included.
    const owner = new Map<string, string>();
    for (const [id, e] of Object.entries(before)) for (const s of [e.slug, ...(e.aliases ?? [])]) owner.set(s, id);
    const free = (s: string, id: string) => !allIds.has(s) && (owner.get(s) ?? id) === id;
    const claim = (s: string, id: string) => owner.set(s, id);

    // Objects the ledger already knows go first, so a newcomer can never take
    // a slug from one of them; then the rest, in the model's own order.
    const known = objects[kind].filter((o) => before[o.id] !== undefined);
    const fresh = objects[kind].filter((o) => before[o.id] === undefined);
    for (const o of [...known, ...fresh]) {
      const chosen = chosenSlug(o.properties, o.what);
      if (chosen !== undefined && !free(chosen, o.id)) {
        throw new Error(`${o.what}: its \`slug\` property "${chosen}" is already claimed by ${owner.get(chosen) ?? "an object id"}`);
      }
      const want = chosen ?? slugify(o.name);
      const prev = before[o.id];
      let slug: string | undefined;
      if (want === undefined) slug = prev?.slug;
      // Already pinned to this name, or to its clash form while the plain
      // slug is still someone else's: nothing moves.
      else if (prev !== undefined && (prev.slug === want || (prev.slug.startsWith(`${want}-`) && !free(want, o.id)))) slug = prev.slug;
      else if (free(want, o.id)) slug = want;
      else for (let n = 4; slug === undefined; n++) {
        const c = `${want}-${idTail(o.id, n)}`;
        if (free(c, o.id)) slug = c;
        else if (n > 40) throw new Error(`${o.what}: no free slug for "${want}"`);
      }
      if (slug === undefined) continue;
      claim(slug, o.id);
      const aliases = [...(prev?.aliases ?? []), ...(prev && prev.slug !== slug ? [prev.slug] : [])].filter((a) => a !== slug);
      after[o.id] = { slug, ...(aliases.length ? { aliases } : {}) };
      slugOf.set(o.id, slug);
    }
    // Objects that have left the model keep their entry: their slugs stay
    // claimed, so no later object is ever given a path that meant something else.
    for (const [id, e] of Object.entries(before)) if (after[id] === undefined) after[id] = e;
    if (Object.keys(after).length) ledger[kind] = sortKeys(after);
  }
  return { ledger, slugOf };
}

const sortKeys = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** The ledger's text, as committed: stable key order, two-space indent, trailing newline. */
export function ledgerText(l: SlugLedger): string {
  return `${JSON.stringify({ $schema: l.$schema, models: sortKeys(l.models) }, null, 2)}\n`;
}
