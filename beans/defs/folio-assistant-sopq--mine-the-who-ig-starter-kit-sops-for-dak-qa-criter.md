---
# folio-assistant-sopq
title: Mine the WHO IG starter kit SOPs for DAK QA criteria
status: completed
type: task
priority: normal
created_at: 2026-08-26T19:15:00Z
updated_at: 2026-10-10T16:53:38Z
parent: folio-assistant-1swy
---

Split out of `p2en`, whose original question — what schema consolidates math and
health-policy ingestion — is answered. This is the follow-on it uncovered.

## Why

`p2en` landed DAK block kinds, adapter-scoped QA axes, and five DAK checkers,
but those criteria were written from what the corpus happens to contain. WHO
publishes its own authoring standards, and they are the better source: a
criterion derived from `checklist.md` is one a DAK author is already being held
to, rather than one this platform invented.

Repo: <https://github.com/WorldHealthOrganization/smart-ig-starter-kit>
(cloned at `/home/user/litlfred/smart-ig-starter-kit` during `p2en`).

## Unread

~3,900 of the kit's ~4,300 SOP lines. Only `l2_dak_authoring.md` (421) was read.

Highest-value first, by apparent fit to existing QA machinery:

- `checklist.md` (297) — reads as WHO's own pre-publication gate. Closest thing
  to a ready-made criterion list.
- `qa_check.md` (28) — short; likely names the mechanical checks WHO runs.
- `authoring_conventions.md` (78) — naming/structure rules, the kind a
  mechanical axis can enforce.
- `l3_*.md` (~12 files) — per-artefact-type L3 authoring rules
  (`l3_requirements`, `l3_testing`, `l3_indicators`, `l3_logicalmodels`,
  `l3_valuesets`, `l3_personas`, `l3_forms`, `l3_processes`,
  `l3_structuremaps`, `l3_scenarios`, `l3_examples`, `l3_libraries`).
- `l2_l3_overview.md` (247), `l2_templates.md` (99), `semanticreferences.md`,
  `structure.md`, `l4_compliance.md`.

## Two findings already in hand that belong here

1. **An unenforceable constraint WHO ships.** Every `*Source` in
   `DAKComponentSources.fsh` says in prose "**exactly one of** url | canonical |
   instance must be provided", and there is **not one `Invariant:`/`obeys` in
   any of WHO's 17 logical models** (grepped). A DAK supplying all three, or
   none, validates clean against the FHIR toolchain. This is a QA criterion this
   platform can carry and that toolchain structurally cannot — a strong
   candidate for the first SOP-derived axis.

2. **The official component templates are `.xlsx`, and we have them.**
   `input/images/` ships `DAK_core data dictionary_template_v2.1.xlsx`,
   `DAK_decision-support logic_template_v2.1.xlsx`, `DAK_scheduling logic…`,
   `DAK_indicators and performance metrics…`, `DAK_high-level functional and
   non-functional requirements…` (v2 and v2.1). These define the canonical sheet
   structure for exactly the kinds `WORKBOOK_BACKED_KINDS` exempts from a
   required companion. A workbook reader is now bounded against a published
   template rather than reverse-engineered from one repository — which also
   unblocks the `.xlsx` rendering deferred since §12.18.

## Also still open from `p2en`

- Compare `sgex`'s `bpmn-to-svg.js` (jsdom) against `scripts/bpmn-render.ts`
  (Chromium) on the same 8 WHO processes. Low priority: the Chromium route
  works (8/8, 0 failures), so this is a "is there a lighter dependency" question,
  not a gap.

## Not in scope

Authoring folio content. This repo is the platform; anything WHO-domain that
turns out to be subject matter belongs in a DAK repo as data, per AGENTS.md.


## Summary of Changes

Mined 2026-10-10 (lane B drain) from `WorldHealthOrganization/smart-ig-starter-kit` (`input/pagecontent/`): `checklist.md` (297 lines), `qa_check.md` (28) and `authoring_conventions.md` (78), the three files the bean ranked highest. The source was read as data.

**Already covered** by smart-base's `content/pipeline/qa-checkers-dak.ts`: `dak-companion-present`, `dak-bpmn-has-process`, `dak-dmn-has-decision-table`, `dak-fsh-declares-kind`, `dak-label-prefix-matches-kind`. None of the checklist's IG-structure rows below is covered.

**Candidate criteria, each a rule WHO already holds DAK authors to** (✓ = mechanically checkable over the IG source):

| source row | candidate criterion | check |
|---|---|---|
| L1 Home.Summary | `dak-home-links-guidance`: home page links its L1/L2 guidance documents | ✓ ≥1 external link with a description |
| L1 Home.Providing Feedback | `dak-feedback-section` | ✓ section present on the home page |
| L1 Adapting Guidelines | `dak-adapting-page` (`adapting_guidelines`) | ✓ page exists |
| L2 Business Requirements (8 pages) | `dak-l2-pages-present`: concepts, personas, usecases, business_process, dictionary, decision_support, functional, nonfunctional; indicators only if indicators are defined | ✓ each page exists (conditional rule for indicators) |
| L3 Logical Models | `dak-logical-model-per-dataset`: one logical model per L2 data-dictionary asset | ✓ given the dictionary list |
| L3 Sequence Diagram | `dak-sequence-diagram` | ✓ page exists |
| L3 Mappings | `dak-map-per-dataset`: a StructureMap per data set, IPS as source | ✓ per data set |
| L3 QA Report (×3) | `dak-qa-no-profile-errors`: no shareable/publishable/computable/executable profile errors | ✓ from the IG Publisher `qa.json` |
| L4 Testing | `dak-example-per-profile`: every non-abstract profile has an example | ✓ |
| L4 Test Data (optional) | `dak-cql-has-test-library` | ✓, advisory |
| Global STU note | `dak-stu-maturity`: home page states maturity and version | ✓ |
| Global footer | `dak-qa-warnings-reasoned`: no errors, and every suppressed warning carries a reason | ✓ from `qa.json` |
| Global Home.Changes | `dak-changes-page` | ✓ page exists |
| qa_check: every artefact | `dak-title-description`: every artefact has a title and a description | ✓ |
| qa_check: logical model elements | `dak-lm-internal-code`: each element maps to an internal code (LOINC/SNOMED optional) | ✓ |
| conventions: ids | `dak-resource-id`: `[A-Za-z0-9\-.]{1,64}`, no underscore | ✓ |
| conventions: names | `dak-resource-name`: `^[A-Z][A-Za-z0-9_]{1,254}$`, underscores discouraged | ✓ (warn on `_`) |
| conventions: files | `dak-file-matches-id`: FSH at `ResourceType/resourceid.fsh`, JSON/XML `ResourceType-resourceid`, no two names differing only in case, aliases in `fsh/Aliases.fsh` | ✓ |
| conventions: locations | `dak-input-folder`: each resource sits in its declared `input/[fsh/]<kind>` folder | ✓ |

**Where this goes next:** the criteria are DAK-adapter rules, so the implementing bean belongs to **smart-base's store**, beside `qa-checkers-dak.ts`. That was handed to the coordinating session to file. Still unread and worth a second pass there: the ~12 `l3_*.md` per-artefact SOPs (~3,600 lines).
