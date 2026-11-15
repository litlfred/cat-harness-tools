---
# note on cat-tools-pfng from claude/pfng-done-smart-trust
$schema: folio-bean-note/v1
bean: cat-tools-pfng
branch: "claude/pfng-done-smart-trust"
created: "2026-11-15"
---
## done smart-trust

Completed `smart-trust` under `cat-tools-pfng` (PR `litlfred/smart-trust#242`, branch `translations/opus-mt-candidates` @ `db0dbe714a67b255866bbd6c124321467f103ba5`):

- **Candidates (`opus-mt`):** Collected candidates into `translations/{ar,es,fr,zh}/menu/menu.candidates.json` (`ru/menu/menu` `"WHO SMART Trust"` refused by placeholder round-trip check).
- **Glossary (`translation-glossary.ts --instance . --check`):** Fixed 6 `fr` findings in `translations/fr/apps/onboarding-game.po` (`Legal Representative` → `Représentant juridique`, `Onboarding Process` → `Processus d’intégration`) and 8 `zh` findings in `translations/zh/apps/onboarding-game.po` + `translations/zh/menu/menu.po` (`QR` → `QR`, `PKI` → `PKI`). All 5 locales (`ar`, `es`, `fr`, `ru`, `zh`) now exit `0` with `0 finding(s)`.
- **Blind semantic round trip (`pfng-back-translator` `fcc9138e-cdb7-4960-b93a-be4fd698a1a2` + `pfng-adjudicator` `48353010-50c5-4f52-b97c-c761da4211b0`):**
  - `es/menu/menu` (`"WHO SMART Trust"` → `"WHO SMART Trust"`): `pass` (retained `#, fuzzy`).
  - `fr/menu/menu` (`"WHO SMART Trust"` → `"La confiance de l'OMS SMART"`): `warn` (`minor`, retained `#, fuzzy`).
  - `ar/menu/menu` (`"WHO SMART Trust"` → `"صندوق سمارت الاستئماني لمنظمة الصحة العالمية (WHO SMART Trust)"`): `fail` (`major` — `'Trust'` rendered as financial `'Trust Fund'`; `msgstr` emptied in `.po`, candidate kept in `menu.candidates.json`).
  - `zh/menu/menu` (`"WHO SMART Trust"` → `"卫生组织SMART信托基金"`): `fail` (`major` — `'Trust'` rendered as financial `'Trust Fund'`; `msgstr` emptied in `.po`, candidate kept in `menu.candidates.json`).
  - All 14 glossary-aligned strings in `fr/apps/onboarding-game.po`, `zh/apps/onboarding-game.po`, and `zh/menu/menu.po`: `pass`.
