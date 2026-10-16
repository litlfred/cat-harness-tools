---
# folio-assistant-he8h
title: 'QA-REPORTS: don''t record a result when neither content nor result changed'
status: completed
type: task
priority: normal
created_at: 2026-10-05T18:45:22Z
updated_at: 2026-10-16T06:30:00Z
parent: folio-assistant-3fva
---

## Why

The owner saw the same mechanical QA results repeated on the `cat/cat-harness/qa-reports`
branch (2026-10-05). Measured that day: `main/` holds 140 per-commit snapshots, and its
`cat-harness/test/results/translation-qa` subtree has only **2 distinct trees** across
them (89 + 51 identical copies). 142 `pr/<n>` refs add more. Prune keeps everything on
main for 90 days, so nothing has gone yet.

## Owner's rule (2026-10-05)

> if content didnt change, and result didnt change, dont need to record.

So a publish must not write a new entry for a subject whose content hashes
(`field_hash` / `source_hashes`) AND result are both unchanged from the newest
recorded entry. A reader at a later sha must still resolve the result — e.g. by
falling back to the newest earlier entry (like `MOVED_QA_SUBJECTS`/`movedFrom` falls
back on a miss), not by reporting `miss`/unknown.

## Done when

- [ ] `qa-store` publish skips unchanged subjects (or entire unchanged snapshots).
- [ ] `readBaseline`/`readQa` resolve a skipped sha to the last recorded result; a
      test shows a skipped commit is not read as "never audited".
- [ ] Measured again on qa-reports after a few pushes: no identical repeats added.

_2026-10-05T21:45:56Z_ — Claimed by claude/vibrant-darwin-r6im60 — pushed to main so sibling sessions see it before this branch has a PR (bean 35nj).

_2026-10-16T06:30:00Z_ — Store reconciliation: status `in-progress` → `completed` (Owner ruling 2026-10-16, item 9: "based on semantic content"; the copies said folio-assistant: completed, cat-harness: in-progress, cat-harness-tools: in-progress). Evidence: closed in the folio-assistant store copy (2026-10-09); commit 231aa7ef is on cat-harness main. Session https://claude.ai/code/session_01Pc8vSeXCwp5Ckvmz56cMDs.
