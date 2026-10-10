---
# folio-assistant-1l13
title: witness-pipeline.yml has never run — keep, template, or retire?
status: scrapped
type: task
priority: normal
created_at: 2026-09-24T06:47:37Z
updated_at: 2026-10-10T16:44:10Z
parent: folio-assistant-1xhc
---

Split from 52dz (2026-09-24). 52dz's owner decisions moved section-title-audit into folio_init templates, but witness-pipeline.yml was not part of that decision and still sits in .github/workflows with ZERO runs all time (measured 2026-09-20), so check:ci-health cannot see it by construction.

## Done when
- [ ] measured: does it run against the platform at all, or only a folio's computations?
- [ ] owner: keep here, move to folio_init templates (paper/), or retire to fsh-guts/


## Measured 2026-10-05 (first checkbox)
It CANNOT run against the platform. Every step invokes `python3 folio-assistant/computations/<script>`, i.e. a folio checkout with the platform symlinked beside it. On platform main, `git ls-tree -r origin/main` holds **0** files under `folio-assistant/computations/` and 0 matches for `hyperbolic_volumes.py` or `codata_masses.py` anywhere. Both scripts exist only in qou, at `computations/`. So its zero runs are not a billing artefact: dispatched here, it would fail at the first script.

Relevant to the owner question: qou now has an executable replacement for the refresh half. litlfred/qou#7514 adds `processes/content/witness-refresh.bpmn` (plan → parity → owner approval → run → gates → commit) and a `witness-refresh-plan` Tool, with the per-producer Tools generated from the block manifests (205). That points toward 'move to folio_init templates or retire', not 'keep here'. This is the agent's reading; the decision is the owner's, and the second checkbox stays open.



## Reasons for Scrapping

Scrapped 2026-10-10 in the cat-harness-tools store (lane B drain): **the subject is not in this repository.** It asks whether folio-assistant's `.github/workflows/witness-pipeline.yml` should be kept, templated or retired, and the remaining box is an owner decision about that repository. The copy in the `cat/cat-harness/beans` store (litlfred/folio-assistant) is the live one. Keep it open there.
