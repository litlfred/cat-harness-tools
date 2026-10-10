---
# folio-assistant-4iey
title: 'PER-PLAN exit-criteria DMN: test-plan-execution looks up the plan''s own decision table'
status: completed
type: task
priority: normal
created_at: 2026-10-02T05:51:37Z
updated_at: 2026-10-10T16:45:33Z
parent: folio-assistant-3fva
---

Follow-up from 3o5b (owner, 2026-10-02: bean, build later). test-plan/v1 lets a plan name its exitCriteria DMN, but GW_ExitCriteria in test-plan-execution.bpmn always evaluates the platform default (processes/decisions/test-certification.dmn).

## Do first (interim guard, small)
- [ ] kg:audit criterion: a plan whose exitCriteria names a table other than the default is flagged (major), so no plan silently runs on the wrong rules until dispatch exists

## Then, when the first plan needs non-default rules
- [ ] GW_ExitCriteria resolves the plan's named DMN; unresolvable → undetermined (could-not-determine), never the default
- [ ] test: a fixture plan with its own table routes by that table

## Done when
- [ ] both of the above are verified by tests


## Summary of Changes

Re-triaged 2026-10-10 (lane B drain). The work was already on main; this commit records it.

- [x] **Dispatch:** `scripts/test-plan-execution.ts` (`resolvePlanExitCriteriaDmn`, `evaluatePlanExitCriteria`, `completeExitCriteriaGateway`) completes `GW_ExitCriteria` from the plan's own `exitCriteria.decision`. An unresolvable table is `could-not-determine` and never falls back to the default.
- [x] **Guard:** the `test-plan-exit-criteria-resolves` criterion (`cat-harness/schemas/kg-qa.ts`, run by `scripts/test-plan-audit.ts`) is a major finding for a table that does not resolve, and `unknown` when no plan was checked. Because dispatch exists, the interim "flag any non-default table" guard is no longer needed: a non-default table is now honoured, not ignored.
- [x] **Tests:** `scripts/tests/test-plan-exit-criteria-dmn.test.ts` covers a fixture plan routing by its own table, unresolvable → unknown with no default fallback, and the registration plus vacuity guard. 10/10 pass in the CI-shaped mount, and `test-plan-execution.test.ts` passes 31/31.
