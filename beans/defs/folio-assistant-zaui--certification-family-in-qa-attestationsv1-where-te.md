---
# folio-assistant-zaui
title: 'CERTIFICATION family in qa-attestations/v1: where test-plan-execution files a signed certification'
status: todo
type: task
priority: normal
created_at: 2026-10-02T05:48:39Z
updated_at: 2026-10-10T16:46:13Z
parent: folio-assistant-3fva
---

Follow-up from 3o5b (owner, 2026-10-02: open a bean). test-plan-execution.bpmn's A_FileCertification names the attestations graph as its destination, but qa-attestations/v1 has no certification family, so the filing step has nowhere to write.

## Do
- add a `certification` family to qa-attestations/v1 (schema + store paths under test/attestations/certification/)
- the filing step writes it; corrupt store → UNKNOWN and the write is refused, as for the other families
- qa:attestations:migrate:check and audit:coverage cover the new family

## Done when
- [ ] a filed certification round-trips through the store in a test
- [ ] kg:audit / audit:coverage report the family as judged, not typed-only


## Progress 2026-10-10 (lane B drain re-triage)

- [x] **Schema and store, in cat-harness:** `schemas/qa-attestations.ts` has the `certification` family (`CertificationEntrySchema`, `certificationPath` → `<attestations>/certification/<id>.attestations.json`, `read`/`write`/`fileCertification`), and `schemas/qa-attestations.test.ts` round-trips a certification file. That satisfies done-when #1 on the cat-harness side.
- [ ] **The filing step is not wired here:** nothing in cat-harness-tools calls `fileCertification`. In `test-plan-execution.test.ts`, `A_FileCertification` completes without writing a file. Next: have the step (or its skill's tool) call `fileCertification` with the signed entry, and refuse with UNKNOWN on a corrupt store.
- [ ] **Judged, not typed-only:** no `kg-qa` criterion reads `test/attestations/certification/**`. That needs a criterion defined in cat-harness `schemas/kg-qa.ts` (definitions there) with its checker here, then `audit:coverage` stops reporting the family as typed-only. `migrate-qa-attestations.ts` covers kg-qa, block-qa and translation-qa only, so certification needs no migration because it has no derived predecessor.
