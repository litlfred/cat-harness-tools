---
# folio-assistant-5rmf
title: 'NAVBAR QR ICON GONE: the LHS top row''s QR code for the current page no longer appears, though its generator still loads'
status: todo
type: bug
priority: normal
created_at: 2026-10-06T06:51:27Z
updated_at: 2026-10-12T16:11:34Z
parent: folio-assistant-9rq1
---

Owner, 2026-10-06 (https://claude.ai/code/session_012qoycyCSGidZqW245vXhze), verbatim:

> LHS top navbar used to have a QR code icon that would make a QR code for the currently viewed page and show it inside the LHS navbar.

## Measured
- The generator is still shipped. `cat-harness/docs/_includes/head_custom.html:181` documents *"Site UI: a QR of the current page in the sidebar header"*, and lines 644-645 load `assets/js/vendor/qrcode.js` and `qrcode_UTF8.js` on every page.
- So it is the **icon (the entry point)** that went missing, not the capability. Likely suspects, not yet confirmed: the 2026-10-05 navbar reworks that rebuilt the icon row from shared data, #2185 (rail drawn in the browser) and #2206 (processes and kg out of the icon row).

## Done when
- [ ] the commit that dropped the icon is named (`git log -S` on the icon markup)
- [ ] the QR icon is back in the LHS top row as a declared navbar capability (the `9rq1` one-mechanism rule), on platform pages AND folio sites
- [ ] clicking it shows the current page's QR code inside the LHS navbar; a second click hides it (`l4zi`: the inverse is reachable)
- [ ] a navbar-inventory or e2e check fails if the icon is missing again
- [ ] screenshots at desktop and phone width, sent to the owner (`rendered-verification`)

Queued for later, or for an idle agent. Not separation work.


## Re-triage 2026-10-10 (lane B drain)

- [x] The icon is back as a declared navbar capability. `cat-harness/docs/assets/js/navbar-row.js` (`.fa-nav-qr` → `.fa-qr-panel`) has it, and `test/navbar-qr.test.ts` passes 7/7 in the CI-shaped mount. The test checks the button, its accessible attributes, the open → hide toggle (l4zi), Escape, and the hashchange update.
- [ ] The e2e check (`test/navbar-row.e2e.ts`, "QR icon button toggles…") exists, but **the e2e suite cannot start** (cat-tools-g9m3), so it has never fired, and the screenshots for rendered verification can't come from it yet. Now blocked by g9m3.
- [ ] Not done: the commit that dropped the icon is still unnamed. The history before the move lives in the folio-assistant monorepo.


### Finding 2026-10-10: the icon is not declared, so it is not drawn

With e2e running (PR #69 for g9m3), `navbar-row.e2e.ts` fails exactly the 5rmf checks. The rendered row is `Todos, Beans, fsh-guts…, More actions`, with no `QR code for this page`. `navbar-row.js` can draw `qr`, and `NAVBAR_ICONS` in `cat-harness/schemas/cat-harness.ts` allows it, but `cat-harness/cat-harness.json`'s `navbarIcons` does not list it, so `docs/_data/harness.json` resolves `[close, todos, beans, fsh-guts, launcher]`. **The fix is in litlfred/cat-harness:** add `"qr"` between `"fsh-guts"` and `"launcher"` in `navbarIcons` and regenerate `docs/_data/harness.json` (`bun run cat docs:harness`). After that, the two e2e checks here should pass unchanged.


## Lane C, 2026-10-12: the icon is drawn, and its panel now works

- [x] **Declared and drawn.** `qr` is in `cat-harness.json` `navbarIcons` on cat-harness main. The e2e check `navbar-row.e2e.ts` "QR icon button toggles…" passes locally with a minimal Playwright config, which skips the global setup that g9m3 blocks.
- [x] **The rendered check found two defects**, both fixed in cat-harness `fix/qr-opens-rail`:
  - Desktop: the code opened as a 56px sliver inside the collapsed strip. The pointer on the icon column holds the strip shut (`.fa-nav-tip-hold`). Opening the code now pins the bar, and closing it unpins only a pin it made.
  - Phone (390px): the card's top rows sat under the fixed top bar. It now starts at 3rem.
- [x] **The e2e check now fails if the code opens in a closed bar**, or if closing it leaves the bar pinned or held open. It fails on cat-harness main and passes with the fix. `navbar-row`, `sidebar-rail`, `rail-tips`, `rail-icon-row` and `site-title-rtl` pass 100/100.
- [x] **Screenshots** (desktop 1280px, phone 390px) are in `test/results/5rmf/`, taken from the e2e fixture with the fix applied.
- [ ] **Still open:** the commit that dropped the icon is still not named. The pre-split history is in the folio-assistant monorepo, and this session's clone is shallow. This is archaeology only; nothing that ships depends on it.
