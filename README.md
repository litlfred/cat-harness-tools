# cat/cat-harness-tools/health

Repository health reports for litlfred/cat-harness-tools: the `health-report/v1` document the
daily sweep (`cat-harness-tools/test/health/run.ts`) writes, under `health/`. A
named-subgraph state branch, one per subgraph (owner, 2026-10-03, bean `laqs`:
"Keep per-graph branches"), declared on the `health` directory with
`source: { kind: "branch", branch: "cat/cat-harness-tools/health", keyedBy: "tip" }` in
`cat-harness-tools.json`.

- **Seeded** 2026-10-11T06:03:01Z from `main` at `5da2d9b68b380c9f8b33c0d5e287f073e13ddc7e`. Owner, 2026-10-11 (session
  01UC1NuEuSy1MBNpEhnDuiGj, 05:58:12Z): "move health to state branch now".
  `main` drops `health/` in the same change, so this branch is the only store.
- **Layout:** paths mirror the checkout (`health/**`); the root `manifest.json`
  (`state-manifest/v1`, `keyedBy: tip`) makes it a state branch.
- **Writes:** spliced onto the tip through `scripts/branch-store.ts`
  (`bun run cat state:mount`, then `bun run cat state:push`), never
  force-pushed, never merged into `main`.
