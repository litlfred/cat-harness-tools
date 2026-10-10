---
# cat-tools-lwjc
title: 'Per-page todo listing: each page lists only its own todos, with its own count (dm4j residue)'
status: todo
type: task
priority: normal
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:35:18Z
updated_at: 2026-10-10T17:11:16Z
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


## Re-triage 2026-10-10 (lane B drain): this needs both repositories, in one step

- **Generator, here:** `scripts/gen-docs-pages.ts` (~line 1505) emits ONE fragment, `_includes/generated/todo-listing.html`, from all `items`. Per page, it would group `items` by `targetLabel` → page and emit `_includes/generated/todo-listing/<page key>.html`, one per page that has todos. A page with none gets **no file**, so "nothing here" stays an absence and never becomes an empty section. A page whose key cannot be determined goes into a separate `unplaced` fragment, so "could not determine" stays distinct. `renderTodoListing` is unchanged and runs once per page.
- **Include, in litlfred/cat-harness:** `docs/_includes/footer_custom.html:40` includes the single fragment. It needs the per-page key and a guarded include (Jekyll cannot include a missing file, so the generator also writes a `_data` index of which keys exist). This is #1886's phase C, so coordinate there.
- **Test:** `test/linear-floor.e2e.ts` can now run (cat-tools-g9m3, PR #69). Add the per-page case beside the global one; delete nothing.

Not started, because a generator change without the include change would publish fragments nothing reads.
