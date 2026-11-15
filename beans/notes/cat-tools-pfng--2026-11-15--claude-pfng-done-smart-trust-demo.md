---
# note on cat-tools-pfng from claude/pfng-done-smart-trust-demo
$schema: folio-bean-note/v1
bean: cat-tools-pfng
branch: "claude/pfng-done-smart-trust-demo"
created: "2026-11-15"
---
## done smart-trust-demo

Completed translation candidate & glossary consistency pass for `litlfred/smart-trust-demo` (PR `litlfred/smart-trust-demo#164`, head `9ff9cae17734ebd59ba6b6a55cb0121f644578ce`):

- **Catalogue coverage:** Verified all 36 `.pot`/`.po` catalogues per locale (`ar`, `es`, `fr`, `ru`, `zh`, 2,106 strings per locale = 10,530 strings total) are 100% translated (`0` empty `msgstr`, `0` fuzzy, `0` obsolete).
- **Glossary consistency (`pipeline/translation-glossary.ts --instance . --check` across the full 10-layer `declarationChain`):**
  - Adjudicated and recorded all 11 remaining pending uses (`policy`, `Reference`, `Role`) in `translations/glossary-sense.json` so `translation-glossary.ts --instance . --check` exits `0` with `0 finding(s), 0 pending adjudication` across all 5 locales (`ar`, `es`, `fr`, `ru`, `zh`).
  - `python3 -I tools/translation/glossary_qa.py --check` passes across all 5 locales (`losses 0, glossary 0 to fix, round trip PASS`).
- **Blind semantic round-trip verification:**
  - Back-translator subagent (`fcc9138e-cdb7-4960-b93a-be4fd698a1a2`, blind to English `msgid`) + Adjudicator subagent (`48353010-50c5-4f52-b97c-c761da4211b0`, comparing `msgid` vs `back_en`): **5 / 5 `pass`** across `ar`, `es`, `fr`, `ru`, and `zh`.
