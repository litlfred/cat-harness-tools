---
# cat-tools-x5e0
title: Gates that read an absent repository-scoped graph should say not-applicable, not fail (content indexes outside folio-assistant)
status: todo
type: bug
priority: high
tags:
    - ci
    - state-mount
created_at: 2026-10-21T07:39:52Z
updated_at: 2026-10-21T07:39:52Z
---

A content index outside folio-assistant (here smart-immunizations, `layer-pr-checks.yml` in index mode) cannot mount the platform's repository-scoped state graphs. `state-mount.ts` reports cat-harness's `beans` and `fsh-guts` as `absent` there, by the owner's ruling of 2026-10-14 (smart-ra#59 "Report as absent"; tools#249 "Tighten it"). Several consumers still read `absent` as a failure or UNKNOWN, so any index that re-pins cat-harness past cat-harness#363 goes red on gates it can never satisfy.

Measured on litlfred/smart-immunizations#66 (771314f, cat-harness ac96988, cat-harness-tools ca99a6b). These are the 4 NEW gate failures:

1. `sweep:mark:check`: UNKNOWN, "beans is on cat/cat-harness/beans and is not mounted".
2. `derive:publish`: stops at `gen-fsh-guts-viz` (exit 2, fsh-guts not mounted), so the pages built at publish are never written. Hence:
3. `document-kinds:viz:check`: `en/cat-harness/document-kinds/index.html` and `.../smart-base/index.html` are "missing".
4. `skill:register:check` and `skill:register:declarations:check`: "no package manifests found — cannot tell registered from unregistered". Not yet explained; it may be a different cause.

## Done when

- Each consumer of a repository-scoped graph that `state-mount` reports `absent` decides, and says in its own output, whether that makes the gate NOT APPLICABLE (skipped, with the reason) or a real failure. A decision per gate, not a blanket rule.
- `derive:publish` skips a writer whose input graph is `absent` (reported, not exit 2), so the other publish-time pages are still built.
- `skill:register`'s missing manifests are explained, and fixed or classified.
- smart-immunizations#66's "No new failures" goes green without changing smart-immunizations.

## Proposed design (2026-10-21, session_016heucWhrncLm4uy52csBcz)

`absent` is decided only at mount time (`state-mount.ts` `fanOut`, which asks the remote whether it carries the namespace). Readers run offline and cannot decide it again, so today they see the same "not mounted" whether the graph is absent or never mounted.

1. **Record it.** When `fanOut` reports `absent`, write `<git-dir>/branch-mounts/<key>.absent.json` with `{id, path, declaredBy, reason}`. A later `mounted` clears it. The record lives beside the mount markers and in the worktree only, never committed.
2. **Answer it.** Add `absent` as a state of `contentAt` (branch-store.ts) and `graphReadPath` (graph-read.ts), answered from the record, and only where a record exists. With no record, the answer stays `not-mounted`/`refused` as today, so "never mounted" still reads as could-not-determine.
3. **Decide per consumer** (the bean's point):
   - `exitUnlessMounted`: `absent` is not applicable. Exit 0 with the reason, write nothing, and let `derive:publish` continue, so the document-kinds pages are built.
   - `sweep:mark:check` (via `resolveBeanGraphNode`): `absent` gives judgement `ok` with "not applicable: …".
   - Every other caller of the two resolvers keeps treating `absent` as it treats `refused` until someone decides otherwise. That is the safe default: no reader turns an absent graph into an empty pass.
4. `skill:register`'s "no package manifests" is investigated separately; it does not look like the same cause.
