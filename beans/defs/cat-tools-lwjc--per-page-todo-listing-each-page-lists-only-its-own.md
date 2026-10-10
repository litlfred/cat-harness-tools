---
# cat-tools-lwjc
title: 'Per-page todo listing: each page lists only its own todos, with its own count (dm4j residue)'
status: todo
type: task
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:35:18Z
updated_at: 2026-10-10T16:35:18Z
parent: folio-assistant-o3xy
---

**Rehomed 2026-10-10 from `litlfred/folio-assistant-core` bean `folio-assistant-dm4j`** by the owner's ruling. That bean's `todos/index.html` case landed (cat-harness `eaccedc8`; `todo-listing.test.ts:168`, `linear-floor.e2e.ts:168,206`). These revised Done-when items did not, and are the work here.

The server-rendered todo listing (`renderTodoListing`, included through `footer_custom.html` → `generated/todo-listing.html`) is still ONE global listing, generated in `scripts/gen-docs-pages.ts` and shown on every page.

## Done when
- [ ] `renderTodoListing` is called per page with only that page's todos (by `targetLabel`)
- [ ] a page with no attached todo emits NO listing markup — not an empty section; 'could not determine' and 'nothing here' stay distinct
- [ ] the count on a page is that page's own cardinality, never the global total
- [ ] coordinated with #1886 (`footer_custom.html` is its phase C)
- [ ] `linear-floor.e2e.ts` asserts the per-page case; no test deleted
