---
# cat-tools-og5t
title: 'PAPER SITE in the harness rendering (yj32): math, Lean links and notation macros, blocking qou''s legacy-render retirement'
status: todo
type: feature
tags:
    - rehomed-from-core
created_at: 2026-10-10T16:33:42Z
updated_at: 2026-10-20T18:42:21Z
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


## Measured 2026-10-20: block-kind inventory, viewer fixes, and what the qou deprecation changes

**Block-kind inventory (done-when item 3), measured on qou `main` @ `77e7f0e`**:
3,663 block files under `folio/quantum-observable-universe/` use 16 builders —
remark 1019, proposition 628, table 443, proof 441, prose 390, definition 267,
conjecture 184, example 102, theorem 55, lemma 49, chapter 36, corollary 17,
algorithm 16, simulator 11, diagram 2, paper 1. Against
`src/blocks/registry.ts` (18 kinds), only `chapter` and `paper` are absent, and
those are structural containers rather than blocks a page renders as one. So
every block kind qou uses has a registry entry; whether each renders
*correctly* is the rendering check, not this inventory.

**Viewer, fixed in litlfred/cat-harness-tools#487**:
- `viewer/index.html`'s module script did not parse on `main` (Chromium:
  "Unexpected end of input"), so none of the viewer ran. Fixed, with a test.
- 1,269 of qou's blocks carry `lean.ref` (`"qou:QOU.X.y"`), and the viewer read
  only `lean.file`/`lean.decl`, so they showed "no lean". It now reads both.

**The owner deprecated qou's rendered GitHub Pages site on 2026-09-27** (qou
`AGENTS.md`, "Build output (gh-pages)"). The `gh-pages` branch stays as a file
store, and the platform's `publish.yml` (which builds the PDFs) stays live on
dispatch. And qou has **no doc-gen4 workflow**: measured, no `doc-gen4`
workflow file exists anywhere in qou's tree, and its Lake `require` is commented
out (bean `qou-mfst`). Two consequences for this bean:

1. Done-when item 4 ("qou's HTML comes from the harness rendering, not
   `publish.yml@0fba270`") has no static HTML site left to replace. Under the
   owner's option 1 (HTML parity), the HTML that qou readers get **is the
   viewer**, and #487 is what made it run.
2. Done-when item 2's open part, "a link to the Lean declaration", has **no
   hosted declaration page** to point at.

## Owner decision

Where should a block's Lean declaration link point, now that qou publishes no
doc-gen4 pages? (Asked 2026-10-20 by the cat-harness-tools drain lane.)

1. **(Recommended) The declaration's source on GitHub.** Resolve `lean.ref`
   (`<package>:<Decl.Name>`) through the Lake package registry to the file and
   line, and link to it at the commit the viewer serves. This needs no doc
   hosting, never goes stale against a separate build, and the viewer already
   shows the source inline, so the link is a "view in context" for it.
2. **Revive doc-gen4 hosting** (a workflow plus a publish target) and link to
   its declaration pages. The richest view, but it brings back a build and a
   hosted site that qou's 2026-09-27 ruling has just retired.
3. **No link.** The status badge plus inline source already show what a reader
   needs. Close item 2 as done.

**Default if no answer:** option 1.

Session https://claude.ai/code/session_01Kymnx79TxWvxVoLzcAjBRr.
