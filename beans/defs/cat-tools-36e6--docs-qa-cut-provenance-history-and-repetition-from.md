---
# cat-tools-36e6
title: 'Docs QA: cut provenance, history and repetition from reader docs'
status: completed
type: task
priority: normal
created_at: 2026-11-03T16:14:56Z
updated_at: 2026-11-04T13:10:16Z
---

Owner-requested docs QA of cat-harness-tools reader docs (README/AGENTS, subdirectory READMEs, skills, tools, scripts/schemas module headers). Classify findings (bean-ref, owner-decision, proposal-ref, history, wordy, stale-or-wrong), publish a QA report artifact, apply fixes, open one PR.

## Done

Merged as #1463 (root docs and directory descriptions), #1464 (`schemas/`
headers) and #1465 (`scripts/` headers): 311,939 words to 192,708 over 768
documents. QA report: https://claude.ai/artifact/6xMoPLRk412iT2hXKkqYfK

Left open: five headers spell a checkout script without `cat`
(`bun run schema:viz`, `bun run detect:live-corpus`, …) and so do the scripts'
own messages; `generate-schemas.ts` and `generate-registry.ts` still give
`npx ts-node` as their runner.
