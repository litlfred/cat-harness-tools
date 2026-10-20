---
# cat-tools-og5t
title: 'PAPER SITE in the harness rendering (yj32): math, Lean links and notation macros, blocking qou''s legacy-render retirement'
status: todo
type: feature
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:33:42Z
updated_at: 2026-10-20T17:49:46Z
parent: folio-assistant-yj32
---

**Rehomed 2026-10-10 from `litlfred/folio-assistant-core` bean `folio-assistant-kx6i`** by the owner's ruling (the code this bean changes lives in cat-harness-tools; the core copy stays as a pointer). Body copied verbatim below; history and rulings recorded there remain authoritative up to this date.


Recorded from the qou work-plan analysis, 2026-10-04 (session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91). Not started: recorded so the gap has an owner. qou cannot retire its legacy renderer until the harness-as-interface rendering handles a paper: KaTeX/MathJax with the folio's notation macros, block -> Lean declaration links, and the paper's block kinds.


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The paper site is rendered by the harness's rendering in cat-harness-tools; folio-assistant-sci consumes it. Nothing cites this bean yet. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/cat-harness-tools`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/cat-harness-tools`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.


## Owner decision above — resolved

The rehome question (option 1) was settled by the owner's ruling of 2026-10-10: this bean IS the rehomed copy, so the question above is closed and must not be re-asked. Kept for history.

## Re-measured 2026-10-20 — unscoped, not started

Nothing in this store cites the bean and it has no done-when list. Before it
can be claimed it needs one: which paper (qou), which block kinds, and which of
KaTeX/MathJax the harness rendering commits to. Left `todo` for whoever takes
the qou legacy-render retirement.

Session https://claude.ai/code/session_01Kymnx79TxWvxVoLzcAjBRr (cat-harness-tools drain lane, 2026-10-20).


## Scoped 2026-10-20 — measured, so the bean can be claimed

**What "legacy render" is.** qou (`main` @ `77e7f0e`) builds through
`.github/workflows/build.yml` → `litlfred/folio-assistant/.github/workflows/publish.yml@0fba270`,
the pre-separation platform. That workflow is an 8-job DAG whose paper output
is **LaTeX → PDF**: the content pipeline emits `main.tex`
(`content/pipeline/build.ts`), then `latexmk -pdf` runs in a folio-supplied TeX
builder image, plus appendix PDFs and a folio-supplied `blueprint-html`.
Retiring it means qou's build stops calling that pinned platform workflow.

**What the harness rendering already has.**
- KaTeX is declared as a viewer dependency of the `equation` and `simulator`
  block kinds (`src/blocks/registry.ts:96,98`).
- A generic `MacroDef` (`{ tex, unicode? }`) exists on `ResolvedDocument`
  (`src/content-types.ts`), so macros can reach a renderer. Whether any
  renderer feeds them to KaTeX's `macros` option is unmeasured.
- The paper-specific rendering knowledge (`folio-paper-adapter` skills
  `rendering-fixes`, `rendering-auditor`, and `editor-checkers/paper-latex.json`)
  is in **folio-assistant-sci**, not here.
- **Nothing** links a block to a Lean declaration in this repository.

So most of this bean's code lands in folio-assistant-sci (the paper adapter
renders its own content: AGENTS.md, "a content package's own server half lives
with that package"). This repository supplies the mechanism: the KaTeX
dependency, the macro channel, and a link slot on a block.

### Proposed done-when (for option 1 below)
- [ ] a paper block renders its math with KaTeX using the folio's notation
      macros, pinned by a rendered-output test on a qou block that uses a macro
- [ ] a block with a Lean counterpart links to the declaration, and a block
      whose declaration is missing is reported, never silently unlinked
- [ ] every paper block kind qou uses renders: an inventory is measured first
- [ ] qou's HTML comes from the harness rendering, and its `build.yml` no
      longer needs `publish.yml@0fba270` for HTML

## Owner decision

What must the harness rendering do before qou's legacy renderer retires?
(Asked 2026-10-20 by the cat-harness-tools drain lane.)

1. **(Recommended) HTML parity only.** The harness rendering replaces the
   legacy HTML (math with macros, Lean links, every block kind). The PDF stays
   on its LaTeX path as a folio asset (qou's own TeX builder image), so only
   the HTML half moves now.
2. **Full retirement, PDF included.** The harness also owns the LaTeX→PDF
   build. This is much larger: the TeX image and `latexmk` gates move too.
3. **Defer until the sci layer move (`zmdo`/`wggr`).** Wait for the paper
   adapter's wholesale move, then do option 1 there.

**Default if no answer:** option 1.

Session https://claude.ai/code/session_01Kymnx79TxWvxVoLzcAjBRr.
