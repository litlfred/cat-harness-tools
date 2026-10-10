---
# folio-assistant-ff09
title: 'DOGFOOD test plan #1: certify the crdm-detect skill against a plan built from its existing 27-case run'
status: todo
type: task
priority: normal
created_at: 2026-10-01T08:00:47Z
updated_at: 2026-10-10T16:50:00Z
parent: folio-assistant-3fva
blocked_by:
    - folio-assistant-3o5b
    - folio-assistant-zaui
---

Arc `3fva`, proposal §3.3 and §4 item 5.6. Blocked on the TEST PROCESS bean.

`test/results/crdm-detect-eval.test-run.json` already holds 27 cases with precision and recall, plus a second-annotator corpus in `scripts/eval/`. Turn it into `test-plan/v1`, execute it through `test-plan-execution.bpmn`, and take a certification decision. The second plan is an MCP tool (`workflow_complete` refuses a step that is not enabled). The third is a FHIR IG, which needs CWA 16408 uploaded (`y4uj`).

## Done when
- [ ] a signed certification exists for crdm-detect at a stated version, stored per D5
- [ ] the report renders, and its badge links to the run


## Owner ruling 2026-10-01
A plan needs at least one `req:` requirement. **Write a crdm-detect requirement first** (what precision/recall it must reach, and on which corpus), then build the plan against it.


## Re-triage 2026-10-10 (lane B drain)

- **Blocked by `zaui`:** nothing calls `fileCertification` yet, so "a signed certification exists … stored per D5" has nowhere to land.
- **Measured baseline** (`crdm-detect-eval.test-run.json`, 27 cases from the issue corpus): TP 21, FP 1, TN 4, FN 1, so **precision 0.9545, recall 0.9545, F1 0.9545**.

## Owner decision

The owner ruled 2026-10-01 that a requirement comes first. What must crdm-detect reach, on the 27-case issue corpus plus the second-annotator set in `scripts/eval/`?

1. **(Recommended)** **Precision ≥ 0.90 and recall ≥ 0.90.** The current run passes with room for one more error on each side.
2. **Precision ≥ 0.95 and recall ≥ 0.95.** The current run passes exactly; one more error fails it.
3. **Precision ≥ 0.95 and recall ≥ 0.85.** This favours precision, because a false CRDM flag spends a person's time.
4. **No threshold:** the certification records the numbers and certifies only that the plan was executed.

**Default if no answer:** option 1, written as the `req:` requirement once zaui unblocks the filing.
