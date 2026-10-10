---
# cat-tools-1wre
title: 'Tabular tools are built: replace the tabular-csv/xlsx STUB declarations and fix the stub check that no longer exists (eief follow-up a)'
status: todo
type: task
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:49:20Z
updated_at: 2026-10-10T16:49:20Z
---

Follow-up (a) of folio-assistant-core bean `folio-assistant-eief`, split out on the owner's ruling of 2026-10-10 (eief's option 1).

The extractors exist now, in folio-assistant-core: `scripts/tabular-csv.ts` and `scripts/tabular-xlsx.ts` (core PRs #33, #34, 31 tests). But:

- cat-harness `tools/index.ts` still declares `tabular-csv` and `tabular-xlsx` as **STUB** (`install: { none: true }`, `invoke: { manual: true }`). Replace them with real declarations invoking `bun run folio-assistant-core/scripts/tabular-{csv,xlsx}.ts`. They probably belong in folio-assistant-core's own `tools/index.ts` beside `dublin-core-render`, since the code is core's.
- `package.json` here names `check:tabular-stubs` → `cat-harness-tools/scripts/check-tabular-stubs.ts`, and `scripts/tests/tabular-csvw.test.ts` imports `../check-tabular-stubs.ts`. **That file exists in no repository** (checked 2026-10-10 in cat-harness-tools, cat-harness and folio-assistant-core). Its test asserts both tools are in the stubbed set, which must invert once they are built.
- `install: { none: true }` cannot mean "stub": `dublin-core-render` carries it as a working tool. Mark a stub explicitly, or drop the stub reading once no stub remains.

## Done when
- [ ] neither tool is declared STUB, and each invokes its core script
- [ ] the stub check exists where its package script says, or the script entry and test are removed
- [ ] `tabular-csvw.test.ts` asserts the built state, not the stubbed one
