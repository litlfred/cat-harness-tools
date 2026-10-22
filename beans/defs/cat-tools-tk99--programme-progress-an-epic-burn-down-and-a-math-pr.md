---
# cat-tools-tk99
$schema: bean/1.0.0
title: 'PROGRAMME PROGRESS: an epic burn-down and a math-progress heat map as a board feed'
status: todo
type: feature
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:33:42Z
updated_at: 2026-10-20T15:15:39Z
parent: folio-assistant-6lb8
---

**Rehomed 2026-10-10 from `litlfred/folio-assistant-core` bean `folio-assistant-hf2q`** by the owner's ruling (the code this bean changes lives in cat-harness-tools; the core copy stays as a pointer). Body copied verbatim below; history and rulings recorded there remain authoritative up to this date.


Recorded from the qou work-plan analysis, 2026-10-04 (session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91). Not started: recorded so the gap has an owner. milestone-status.ts rolls up milestones; nothing draws an epic over time or chapter x {proved, sorry, axiom, conjecture open, active bean, verdict}. Depends on WORK TRACEABILITY and CONJECTURE REGISTER. Must follow board-diagram-interchange (folio -> board, never back) and say 'no data is not zero'.


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The burn-down and heat-map feed belong to `scripts/milestone-status.ts` and the board generators in cat-harness-tools. It also depends on `ckej`. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/cat-harness-tools`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/cat-harness-tools`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.


## Owner decision above — resolved

The rehome question (option 1) was settled by the owner's ruling of 2026-10-10: this bean IS the rehomed copy, so the question above is closed and must not be re-asked. Kept for history.

## Re-measured 2026-10-20 — blocked on beans outside this store

The body names two prerequisites, WORK TRACEABILITY and CONJECTURE REGISTER
(`ckej`). Neither has a bean in this store (`beans/defs` at `3420b76`), so the
dependency cannot be expressed as `blocked_by` here. Left `todo`; not
claimable until those land in whichever store holds them.

Session https://claude.ai/code/session_01Kymnx79TxWvxVoLzcAjBRr (cat-harness-tools drain lane, 2026-10-20).
