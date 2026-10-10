---
# cat-tools-g9m3
title: 'E2E CANNOT START: playwright.config.ts names ../cat-harness/test (moved in 70lx), and under it a .js specifier fails to resolve — 0 specs, no job reports it'
status: in-progress
type: bug
priority: high
created_at: 2026-10-10T16:28:44Z
updated_at: 2026-10-10T16:28:58Z
parent: folio-assistant-1xhc
---

`bun run cat test:e2e` (`playwright test -c cat-harness-tools/playwright.config.ts`) cannot start. Measured 2026-10-10 in the CI-shaped mount (the folio-assistant index, every instance from its lock, cat-harness main):

1. `globalSetup: '../cat-harness/test/e2e-global-setup.ts'` and `testDir: '../cat-harness/test'` name the pre-70lx location. All 82 `*.e2e.ts` files and `e2e-global-setup.ts` now live in `cat-harness-tools/test/`, and `cat-harness/test` holds 0 of them. Run: `Error: Cannot find module '../cat-harness/test/e2e-global-setup.ts'`.
2. With both paths pointed at `./test`, `--list` gets further and then fails: `Cannot find module '…/node_modules/@litlfred/cat-harness/schemas/cat-harness.js' imported from cat-harness-tools/scripts/qa-store.ts`. Playwright's Node loader does not map the `.js` specifier to the workspace's `.ts` source the way Bun does. Result: `Total: 0 tests in 0 files`.

This repository's PR workflow runs no e2e job, so nothing reports either failure. That is the 1xhc shape: a gate that does not fire looks the same as one that passed.

## Done when

- [x] `testDir` and `globalSetup` name `./test` (and the web server runs `cat-harness-tools/test/test-server.mjs`, the third stale path).
- [x] `--list` collects the 82 specs under the CI-shaped mount (fix the specifier resolution, or run Playwright under Bun).
- [ ] A PR job runs them, or the reason none does is recorded in the workflow.

## Progress 2026-10-10

- The `.js` specifier was the first of two Node-vs-Bun gaps. The code also uses Bun's `import.meta.dir` (`scripts/lib/roots.ts`), which is undefined under Node. The fix is to run Playwright **under Bun**: `test:e2e` is now `bunx --bun playwright test -c cat-harness-tools/playwright.config.ts`. A tsconfig `paths` mapping only gets past the first gap, so it was not used.
- Result in the CI-shaped mount, with beans/todos/fsh-guts mounted: **1049 tests collected (was 0)**.
- Still open, and outside this bean: `beans-page-search.e2e.ts` reads a committed `cat-harness/docs/beans/index.html` at module load, and cat-harness main no longer commits it. While that holds, an unfiltered run stops at load time. folio-assistant's `e2e-shard` job also runs `bunx playwright test` **without `--bun`**, so it fails at `globalSetup` until it gets the same change. That fix belongs to folio-assistant and was handed to lane A.
