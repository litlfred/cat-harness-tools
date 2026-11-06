---
# cat-tools-sm8r
$schema: bean/1.0.0
title: 'A local gate run reddens every later state:mount: its own steps write into the mounted layers'
status: todo
type: bug
priority: normal
tags:
    - ci-speed
    - pp9g
created_at: 2026-11-06T05:00:00Z
updated_at: 2026-11-06T05:00:00Z
parent: cat-tools-pp9g
---

Found re-timing the pre-push hook (`pp9g`) on a cold, freshly mounted
folio-assistant agent checkout (4 CPUs), tools at main after #1532, 2026-11-06.
Asked for by the CI-speed coordinator: "find out why it exits 1 in this
container, and whether #1489's skip should apply".

## Measured

- Before the gate run, `state:mount` exits 0: 62 s the first time, 17 s again.
- Inside it, all 8 `state:mount` steps (one per CI job) exit **1**, at
  41.7, 35.9, 36.8, 39.3, 41.0, 38.2, 39.0 and 32.9 s: **305 s**, about 5 min
  of a 1396 s gate run.
- Each reports 8 remote instances `missing`: *"left untouched: <dir> no longer
  hash to the lock — edits there are somebody's work"*. The fetch it makes
  first changes nothing.

## Cause

A local `gates` run runs every job's steps one after another in **one**
checkout. In CI each job starts from a fresh mount, so its `state:mount`
comes first and sees an intact mount. Here, steps of earlier jobs have
already written into the mounted layers, and the lock check (rightly) refuses
to call an edited mount current:

1. **Generated output inside a mount.** `ig-index:build` writes
   `smart-trust/fhir-artifact-index/{index.json,menu.json,package.tgz,contexts,sidecars}`
   and the same under `smart-trust-phw/`. The QA working copy and docs steps
   write `cat-harness/docs/_data/{provenance,todo_listing.json}`,
   `docs/_includes/generated`, `docs/assets/{auto-docs,beans}`.
2. **Committed generated files rewritten.** The glossary writers regenerate
   `cat-harness/docs/assets/glossary/*.skos.jsonld`,
   `who-iris/glossary/generated/**/*.glossary.json` and
   `folio-assistant-core/glossary/generated/**/*.glossary.json`, and the
   content differs: definitions changed in the other layers' sources at their
   pins. **The glossaries committed in those three layers are stale against
   the pins.** That is a finding in its own right, which CI does not see
   because each job mounts fresh.

Reproduced in a fresh worktree mounted from the same lock:
`mount-from-lock.sh --check` says `current`. **One** extra file in
`smart-trust/fhir-artifact-index/` makes smart-trust `missing`, and **one**
appended byte in a committed `who-iris/glossary/generated/*.json` makes
who-iris `missing`.

## Whether #1489's skip should apply

**No.** It skips the fetch only when every instance is current per the lock,
and these are not: the mounts really differ. What is wasted is the fetch
after that verdict. Every non-current instance is one the fetch will leave
untouched, so it cannot change the outcome.

## Fixes, smallest first (not built; owner or coordinator to pick)

1. **`remote-mount.ts`: skip the fetch when it cannot help.** When every
   non-current instance is "edited, would be left untouched", report that
   without fetching. Each of the 8 steps then takes about 1–2 s and stays
   red, honestly. Saves about 290 s per cold local run. It changes nothing in
   CI.
2. **`gates.ts`: a local run sets up once.** Run each distinct setup command
   (`state:mount`, `ig-index:build`, `bun install`) once per run, not once
   per job. That saves the same 290 s plus about 60 s of repeated
   `ig-index:build`, and removes the false reds. The risk is a job whose
   setup really depends on an earlier job's writes; none is known.
3. **Root: nothing a CI step writes goes inside a mounted layer.** Either
   `ig-index:build` and the glossary writers write outside the mounts, or the
   lock digest excludes outputs the layer declares as built. Separately, the
   three stale committed glossaries need regenerating in their own layers.
