---
# cat-tools-1as6
title: 'RENDER STAGE 3: the dynamic-state export has a position but no filename — the owner left it open on purpose'
status: todo
type: task
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:33:42Z
updated_at: 2026-10-10T16:33:42Z
parent: folio-assistant-yj32
---

**Rehomed 2026-10-10 from `litlfred/folio-assistant-core` bean `folio-assistant-6h47`** by the owner's ruling (the code this bean changes lives in cat-harness-tools; the core copy stays as a pointer). Body copied verbatim below; history and rulings recorded there remain authoritative up to this date.



Owner, 2026-09-20, settling where the README render sits in the pipeline:

> dynamic content then hets get json/jsonld export avaiable under
> cat-harness/state.jsonld or so (whatever matches the dyanmic state
> vsualizesrs)

**"or so (whatever matches …)" is an explicit uncertainty, and it was not
closed by guessing.** `scripts/render-pipeline.ts` declares the step
(`kg-dynamic`), fixes its POSITION — after every stage-2 renderer has
contributed, fatal on failure — and re-exports the graph as its body. What it
should actually write is open.

## What settles it

The dynamic-state visualisers saying what they read. Until one exists and
names its input, any filename minted here is a published artefact name nobody
chose, and a consumer fetching it would be relying on a guess.

## Done when

[ ] A dynamic-state visualiser names the document it reads
[ ] `kg-dynamic` writes that, at the path that visualiser resolves
[ ] It is distinguishable from the stage-1 current-state export — two
    documents, two names, and a reader can tell which is which

Related: `render-order` skill §"What stage 3 writes is not settled", issue
#592, PR #593.

## Re-measured 2026-10-03 — still blocked on its first box

- `kg-viewer` reads the stage-1 current-state export (`../<stub>.jsonld`), not a dynamic-state document.
- PR #1918 (the newest viewer work open at the time) reads no `.jsonld` at all.
- `kg-dynamic` still writes `state.jsonld` to scratch only; nothing published, nothing consumes it.

So no dynamic-state visualiser yet names an input, and the rule above stands:
no filename is minted here by guess. Left `todo`; re-measure when a viewer
that reads dynamic state opens a PR.


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The dynamic-state export is `render-pipeline.ts` in cat-harness-tools. It also waits on a visualiser that names an input. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/cat-harness-tools`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/cat-harness-tools`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.
