#!/usr/bin/env bun
/**
 * WHEN A SWEEP STEP WAS LAST RUN — so skipping it leaves a trace.
 *
 * Bean `rq8s`. The session-start sweep asks the agent to run
 * `check:session-staleness` (a session stopped holding a question for the owner
 * is otherwise invisible). The sweep cannot run it: the input is a
 * `list_sessions` listing only an agent holds. So the step is a rule in prose,
 * and a session that skips it leaves nothing behind — the next sweep cannot
 * tell "nobody checked" from "checked, nothing waiting".
 *
 * The owner ruled on 2026-10-10 (drain session ml9h): **timestamp.** The check
 * writes a last-checked mark to the state branch, so a skipped sweep is
 * visible after the terminal scrolls.
 *
 * ## One file per check, overwritten
 *
 * A mark answers one question — when did this check last read its input —
 * so it is a single file per check (`<check>.json`), replaced on each
 * determined run. A history of marks would answer a question nobody asked,
 * and grow on every session.
 *
 * ## Only a DETERMINED run writes one
 *
 * A run that could not read its input did not check anything. Writing a mark
 * for it would make "could not determine" look like "checked", which is the
 * defect this record exists to expose (`1xhc`: absence taken for a clean
 * result).
 *
 * @module cat-harness/schemas/sweep-mark
 * @graphNode schema
 */
import { z } from "zod";

/** The tag every mark carries, so the file declares what it is. */
export const SWEEP_MARK_TAG = "folio-sweep-mark/v1";

export const SweepMarkSchema = z
  .object({
    $schema: z.literal(SWEEP_MARK_TAG),
    /** The check this marks, by its `cat` command name — `session-staleness`. Also the file's stem. */
    check: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a check name: lower case, digits and hyphens"),
    /** When the check last read its input, ISO-8601 with a zone. */
    checkedAt: z.string().datetime({ offset: true }),
    /** Who ran it, so a reader can ask: a session URL or id. Absent when the runner did not know. */
    by: z.string().min(1).optional(),
    /** How many subjects the run read — sessions, for `session-staleness`. Zero is a real answer. */
    read: z.number().int().nonnegative(),
    /** How many findings it reported. */
    findings: z.number().int().nonnegative(),
  })
  .strict();
export type SweepMark = z.infer<typeof SweepMarkSchema>;
