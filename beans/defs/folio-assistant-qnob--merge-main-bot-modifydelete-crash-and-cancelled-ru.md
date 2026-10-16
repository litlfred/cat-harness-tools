---
# folio-assistant-qnob
title: 'merge-main bot: modify/delete crash and cancelled runs reported as errors'
status: completed
type: bug
priority: normal
created_at: 2026-10-02T11:35:12Z
updated_at: 2026-10-16T06:30:00Z
parent: folio-assistant-hfag
---

Issue #1854. (1) modify/delete conflicts on generated-pattern paths: take main's side (rm or main's copy), authored stays refused. (2) cancelled/superseded merge-main runs rewrite the PR comment to 'Error (exit )': leave it untouched; comment composition moved to a tested TS function.

## Done when

- [ ] tests fail on origin/main and pass with the fix
- [ ] bun run cat gates green, PR CI green, PR marked ready

_2026-10-16T06:30:00Z_ — Store reconciliation: status `in-progress` → `completed` (Owner ruling 2026-10-16, item 9: "based on semantic content"; the copies said folio-assistant: completed, cat-harness: in-progress, cat-harness-tools: in-progress). Evidence: closed in the folio-assistant store copy (2026-10-09); commit 26249104 is on folio-assistant main, commit 9b4a71c9 is on folio-assistant main, commit 9fe66112 is on folio-assistant main. Session https://claude.ai/code/session_01Pc8vSeXCwp5Ckvmz56cMDs.
