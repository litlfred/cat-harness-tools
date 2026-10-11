---
# cat-tools-v8wg
title: Library titles for non-PDF entries (pptx deck, CODATA table)
status: todo
type: task
tags:
    - rehomed-from-core
created_at: 2026-10-11T06:19:15Z
updated_at: 2026-10-11T06:19:15Z
---

**Rehomed 2026-10-11 from `litlfred/folio-assistant-core` bean `folio-assistant-6eiw`** by the owner's ruling of 2026-10-10 (option 1 + 2: move to the code's repo, keep a pointer in core). Body copied verbatim below; history and rulings recorded there remain authoritative up to this date.


## Why

Bean `w6fu` (PR #1849) gave PDF library entries a verified title: a title is
used only when two independent sources agree, or when an editorial
`title_correction` exists. Two entries are not PDFs, so that resolver never
reaches them, and they still show placeholder titles:

| entry | format | what shows now | evidence in the file |
|---|---|---|---|
| `cat-harness/library/kg-folio-asst-2026-09-30` | slide deck (pptx) | placeholder title | no title metadata; slide 1 reads "WHO SMART Guidelines" |
| `folio-assistant-sci/library/codata-2022` | tabular text | `allascii-codata-2022.txt` (the file name) | nothing in the file names its title |

The owner decided on 2026-10-02 (option 1 on #1849): leave both as they are in
#1849, and track titling non-PDF entries as a separate bean.

## Approach (proposed, not decided)

- A title source for each non-PDF format: pptx `docProps/core.xml` dc:title,
  then the first slide's title placeholder; for tabular reference datasets,
  the catalogue record (`reference-dataset-ingestion`).
- Apply the same rule as `w6fu`: two agreeing sources, or an explicit editorial
  correction that records its basis. Never adopt a single unverified guess.

## Done when

- [ ] Both entries show a title that is verified or editorially corrected, and the source is recorded beside it.
- [ ] A non-PDF entry with no title source is reported as such rather than shown under its file name.


## Owner decision (answered 2026-10-10: option 1 + 2, which is this rehome)

Asked 2026-10-10 by the bean-backlog drain (lane C). The pptx title is fixed with an editorial `title_correction`. codata-2022 still shows its slug as its title (folio-assistant-sci `library/codata-2022/manifest.jsonld`). The 'report no title source' rule belongs to the cat-harness-tools resolver `gen-library-jsonld.ts`. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/cat-harness-tools`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/cat-harness-tools`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.


## 2026-10-10: half reverted (bean-backlog drain, lane C)

The cat-harness-store copy was closed on 2026-10-09. Measured on today's
default branches:
- **Still holds:** the pptx deck's editorial title. cat-harness `3f8a5236` is
  on main, and `library/kg-folio-asst-2026-09-30/manifest.jsonld:12,31`
  carries the title.
- **Reverted:** the CODATA title. sci `f5641f5` merged, but a later
  regeneration (`99d054e`) overwrote it. Main's
  `library/codata-2022/manifest.jsonld:12` reads `"title": "codata-2022"`, and
  `:34` reads `"title_source": "slug"`.

So the fix exists but the regeneration does not keep it. The real defect is
that an editorial title is not preserved across regeneration (the resolver,
cat-harness-tools `gen-library-jsonld.ts`). **This copy stays open as the
owning one**, since sci has no store, until a title correction survives
regeneration. The cat-harness-store copy should be reopened.
