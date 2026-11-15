---
# note on cat-tools-pfng from claude/pfng-done-smart-trust-tools
$schema: folio-bean-note/v1
bean: cat-tools-pfng
branch: "claude/pfng-done-smart-trust-tools"
created: "2026-11-15"
---
## done smart-trust-tools

Completed translation candidate & glossary consistency pass for `litlfred/smart-trust-tools` (PR `litlfred/smart-trust-tools#72`, head `c7988842c4d8990960c9a04ab39ca0fff814b857`):

- **Template extraction & declaration:** Declared `translations/` (`translation-sources`) in `smart-trust-tools.json` and extracted BPMN `.pot` templates via `translate-bpmn.ts --instance . --extract` across `ar`, `es`, `fr`, `ru`, and `zh` (4 BPMN processes × 5 locales = 20 catalogues, 76 strings per locale = 380 strings total).
- **OPUS-MT candidates (`translation-candidates.ts --instance . --engine opus-mt --init`):**
  - Recorded **380** OPUS-MT candidates across 20 `.candidates.json` files (`76` per locale across `ar`, `es`, `fr`, `ru`, `zh`), `0` refused.
  - **374** strings retained as `#, fuzzy` in `.po` after blind round-trip verification emptied 6 `fail` strings (`generatedBy: "machine"`, `official` unset).
- **Glossary consistency (`pipeline/translation-glossary.ts --instance . --check`, 31 fixed terms across 7-layer `declarationChain`):**
  - Exits `0` with `0 finding(s), 0 pending adjudication` across all 5 locales (`ar`, `es`, `fr`, `ru`, `zh`).
- **Blind semantic round-trip verification:**
  - Back-translator subagent (`fcc9138e-cdb7-4960-b93a-be4fd698a1a2`, blind to English `msgid`) + Adjudicator subagent (`48353010-50c5-4f52-b97c-c761da4211b0`, comparing `msgid` vs `back_en`) evaluated 40 sampled strings (2 per catalogue across all 20 catalogues): **30 `pass`**, **4 `warn`**, **6 `fail`** (`ar/processes/hcert-contract-change#5`, `ar/processes/hcert-issuance#5`, `ru/processes/hcert-contract-change#5`, `ru/processes/hcert-issuance#5`, `ru/processes/hcert-verification#5`, `zh/processes/hcert-verification#5` emptied in `.po`).
