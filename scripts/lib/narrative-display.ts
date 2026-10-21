/**
 * The narrative an UNTYPED reader shows from a record's `narrative` key.
 *
 * Bean `cat-tools-e1lo`, stage 3: a slot is the single narrative records hold
 * today, or a list with one entry per language. Typed readers call
 * `narrativeFor` / `narrativesOfSlot` from cat-harness directly. This is for
 * readers that take a record as plain JSON: a list goes through
 * `narrativeFor` (owner ruling 2026-10-21, "locale match, else first"), and
 * anything else is returned exactly as before, so the single form reads the
 * same as it did.
 *
 * @module scripts/lib/narrative-display
 */
import { NarrativeSlotSchema, narrativeFor } from "@litlfred/cat-harness/schemas/narrative.ts";

/** The one narrative to show, as a plain record, or `undefined` when there is none. */
export function displayNarrative(raw: unknown, lang?: string): Record<string, unknown> | undefined {
  if (Array.isArray(raw)) {
    const r = NarrativeSlotSchema.safeParse(raw);
    return r.success ? (narrativeFor(r.data, lang) as Record<string, unknown>) : undefined;
  }
  return raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
}
