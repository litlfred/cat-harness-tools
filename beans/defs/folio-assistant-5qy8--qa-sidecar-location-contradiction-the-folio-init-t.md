---
# folio-assistant-5qy8
title: 'QA SIDECAR LOCATION CONTRADICTION: the folio_init template commits *.qa.json while AGENTS.md puts QA on the qa-reports branch'
status: todo
type: bug
priority: normal
created_at: 2026-10-04T15:10:09Z
updated_at: 2026-10-10T16:39:19Z
parent: folio-assistant-3fva
---

Recorded from the qou work-plan analysis, 2026-10-04 (session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91). Not started: recorded so the gap has an owner. The owner ruled 2026-10-04 for qou: use the cat-harness qa-reports branch. The folio_init template (cat-harness/templates/) still writes a layout that commits sidecars on main. Reconcile the template with skills/sdlc/sdlc-core/qa-reports.md.


## Progress 2026-10-10 (lane B drain, PR for cat-tools-yylt)

- [x] The scaffold's `.gitignore` now ignores `test/results/`, the QA working copy. Derived verdicts go to `qa-reports`; `test/attestations/` stays committed. Tested in `init-folio.test.ts`.
- [x] `qa-sweep.yml` and `qa-sweep-nightly.yml` already publish to `qa-reports` and commit nothing.
- [ ] **One contradiction is left, in `templates/document/github/workflows/section-title-audit.yml`.** Its comments say verdicts live on `qa-reports`, but its hard gate regenerates `{{folio}}/<document>/section-title-audit.qa.json` and runs `git diff --exit-code` on it, so the sidecar must be committed and fresh on main. The sidecar also carries the **agent** story-coherence verdicts (`agent[key]`, carried forward by `reviewed_hash`), and those are judgements, not derived results.

## Owner decision

Where do section-title-audit's agent verdicts live?

1. **(Recommended)** Move the `agent` slots to `test/attestations/section-title/…` (judgements on main, as ruling D2 says), make the sidecar a derived working copy published to `qa-reports`, and replace the freshness gate with compute-and-judge.
2. Keep the sidecar committed on main, and record it in `skills/sdlc/sdlc-core/qa-reports.md` as a named exception: a file that carries judgements.
3. Drop the agent block from the sidecar entirely and keep only the machine review.
4. Leave it as it is.

**Default if no answer:** option 2. It is documentation only: no data moves and no gate changes.
