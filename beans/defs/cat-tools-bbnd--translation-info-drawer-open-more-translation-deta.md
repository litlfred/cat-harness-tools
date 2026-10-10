---
# cat-tools-bbnd
title: 'Translation info drawer: open more translation detail from every translation warning — blocks, pages, (sub)graphs, locales'
status: todo
type: feature
tags:
    - rehomed-from-core
created_at: 2026-10-10T17:26:18Z
updated_at: 2026-10-10T17:26:18Z
---

Owner, 2026-10-10: *"i want to see in the translations warning somewhere the ability to open panel w/ more translation info. needs to be integrated in a few places … see it on content blocks, on a harnessed (sub)graph, etc."* Analysed the same day (folio-assistant-core lane C session https://claude.ai/code/session_018NFVUeJjQJdrEU32AS1Mco).

## Owner rulings, 2026-10-10
- **Form: an inline drawer.** A `<details>`-style drawer under the warning, reusing the existing QA panel (`qaBuildPanel`/`qaToggle`, cat-harness `docs/assets/js/docs-ui.js:11198-11290`), so one component serves every scope.
- **JS-rendered.** *"trying to have slim html"*: the warning and its panel are mounted by JavaScript from data the page already carries, not server-rendered.
- **Officiality: recorded in both places, and checked to agree.** The PO header `X-Folio-Official` and `translations/<locale>/status.json` (`official`, `signedOffBy/At`), with a check that fails when they disagree. Official means human sign-off (issue #206).

## Where warnings render today
- **Page badge** "🌐 n/N languages": `docs-ui.js:10620-10700` (`mountTranslationBadges`), reading `#fa-translation-meta`, which `head_custom.html:252-290` writes.
- **Sweep badge**: `docs-ui.js:10708-10741`. Its detail is only in a `title` tooltip.
- **"Unverified translation" notice**: a JS `<details>` at `docs-ui.js:10743-10850`.
- **Per-block and per-page TR QA badges**: `gen-docs-pages.ts:543`, ~595-660 and ~686-711. They are painted from `qa-index.json` and open `qaBuildPanel`.
- **Navbar locale switcher**: `docs-ui.js:430-600`. It stamps `data-fa-translation-status`, which nothing visible uses.
- **KG viewer boundary sentence**: `kg-viewer.ts:591-605`, from the PO header `X-Folio-Official`.
- **who-iris interface notice**: `gen-iris-pages.ts:822`.
- **Translation-status visualiser**: `gen-translation-status.ts:361-560`. It has its own head and no panel.
- **folio-assistant-core's builders**: `build-document-site.ts`, `build-library-site.ts` and `build-folio-site.ts` emit **no** translation status.

## Data per scope
- **Block**: the `translation-qa/v1` sidecar: criteria, witnesses, `source_hashes` for staleness, the PO.
- **Page**: the roll-up `page.translation.json`, `translation_status` and `translation_source`, and the heading drift from `translation-drift.ts:313`.
- **Locale**: `translations/<locale>/status.json` (only `cat-harness/translations/fr` has one) and the PO headers.
- **(Sub)graph**: `localeStatuses(translationsDir)` in `gen-translation-status.ts:223`. No per-graph JSON projection exists yet; `folio-translation-status/v1` is declared at line 77.
- **Catalogue round trip**: new as of who-iris PR #35, `test/results/translation-roundtrip/*.qa-results.json`.

## Integration points
| place | panel shows | data | change |
|---|---|---|---|
| content block (TR icon) | officiality, translator, stale or current, criteria and witnesses, PO link | block sidecar + status.json | `gen-docs-pages.ts` `qaIcons`; `qaBuildPanel` header |
| document page header | per-locale official / agent / missing / stale, drift | meta + roll-up + status.json | `docs-ui.js:10743` |
| folio document and library pages | the same page panel | PO headers + sidecars | core `build-document-site.ts`, `build-library-site.ts` emit `fa-translation-meta` |
| harness / (sub)graph landing | locale coverage, officiality per catalogue, link to the status page | a new per-graph JSON from `localeStatuses` | `gen-translation-status.ts` emits it; the landing generator reads it |
| translation-status visualiser | per-row drawer: catalogues, officiality, missing `.pot`, round-trip results | the same | `gen-translation-status.ts:361` |
| navbar locale control | per-locale state and its reason | `data-fa-translation-status` + status.json | `docs-ui.js:430-600` |
| KG viewer, who-iris | a link into the same panel | `X-Folio-Official`, round-trip report | `kg-viewer.ts:600`, `gen-iris-pages.ts:822` |

## Done when
- [ ] one drawer component serves block, page, (sub)graph and locale scopes, mounted by JS from data attributes, with no new server-rendered markup beyond a data hook
- [ ] it is integrated on content blocks, document pages, the harness/(sub)graph landing and the translation-status visualiser at least
- [ ] officiality is read from both PO header and status.json, and a check fails when they disagree
- [ ] a stale translation (source hash moved) says so in the drawer
- [ ] e2e: opening the drawer on a block and on a graph page shows its facts in both colour schemes

## Owner decision
(1) **Recommended:** a (sub)graph-scope drawer per harness instance, one per instance landing. (2) One per declared sub-graph directory. (3) Per locale only.
**Default if no answer:** option 1.
