# Track A log — shell, design system, edges

Newest last. Each entry: what shipped, what was verified, what was not.

## Defaults used while the owner's questions are open (DIRECTION §6)

- Dark theme by default; Settings offers "follow the phone" as a toggle.
- Vault lives in More.
- Poisha hidden in lists, shown in detail and edit views. The formatter's
  display default is "hidden when zero, small otherwise"; a list passes
  `{ minor: 'never' }`, a detail or edit view `{ minor: 'always' }`.
- Bangla digits: an optional setting, off by default.

---

## A1 — Money that fits

`formatMoneyHTML()` (the display form) now shows the home currency as `৳`
with no code, keeps the code for any other currency (`USD 1,070`), hides a
zero minor part and sets a non-zero one small, and puts the sign first
(`−৳450`). New options: `minor: 'auto' | 'always' | 'never'` (never rounds
half away from zero, it does not truncate) and `compact` in the HTML form.
`code: true` still forces the code, `code: false` still drops the marker.
The home currency is the display currency: `state.js` pushes it into
`money.js` via `setHomeCurrency()`.

`formatMoney()` (the text form) keeps its old defaults on purpose: it fills
input fields and must round-trip through `parseAmount()`. `symbol: true` now
means "৳ at home, the code abroad". `moneyLabel()` is new: the text form with
display defaults, for toasts, aria labels and titles.

CSS: from `.money--lg` up, figures are set in Space Grotesk (tabular), not
the mono. A stat tile is a size container and its figure scales to fit
(`min(--fs-23, 15cqi)`). At 380px and below a row's gaps and side padding
step down and a trailing ⋮ hangs into the padding, so the name gets the width.

Verified: test-money (88 assertions), test-crypto, check-pages, check-sprite.
shoot-mobile at 360 in both themes on Overview, Ledger, Accounts, with a
probe that reports any `.money` clipped by an ancestor and any truncated
`.row__title`: none on any of the three. An 18-character name
("Brokerage (DSE) ac") was written into every Accounts row and measured: it
fits on every row except the one that also carries a Default chip (the name
fits, the chip ellipsizes).

For B and C: pass `{ minor: 'never' }` on list rows (the owner default), and
switch `formatMoney(…, { code: true })` in toasts and titles to
`moneyLabel(…)`. The Overview's sideways-scrolling tile strip still puts its
third tile off-screen by design; C2 replaces it.

Tooling: `shoot-mobile.mjs` takes `CDP_PORT` (a fixed debug port, so agents
on one machine do not collide) and `PROBE` (a JS expression evaluated per
page, its result printed).

## A2 — The bottom bar, +, and More

The phone bar is Home · Ledger · + · Accounts · More on every page, Vault
included. Each slot measures 72 × 55 at 360px. The header is 48px.

- **+** is raised, centred, and the only accent fill on the bar. Tap asks for
  an expense; hold (420ms) or drag up offers In, Save and Move in a menu.
  It emits `EVENTS.COMPOSE` (`{ type }`) when something listens
  (`hasListeners()` is new in bus.js). Until B1/C2 ship `mountCompose()`, it
  clicks the page's own `[data-compose]` trigger (so it opens the existing
  sheet on Home and the Ledger today), and otherwise goes to
  `modules/ledger/list.html?compose=<type>` (the form B's `mountCompose()` reads). The bridge in `compose()`
  should be deleted once no page has `[data-compose]` left.
- **More** is a sheet: Vault and Settings (the only built destinations in
  it), then the signed-in email and Sign out. `SECONDARY` in shell.js lists
  only built destinations; Insights, Business, Investments, Budgets and
  Categories are out of the bar, the More sheet and the rail until their
  track ships them and adds its line.
- The rail gets an "Add an entry" button at the top.
- `.fab` is hidden everywhere (`display:none !important`); `main.js` no
  longer tucks it. Home and the Ledger still carry fab markup and header
  Out/In buttons: B1 and C2 remove them.
- Vault: the lock screen stops at the tab bar on phones, so there is a way
  out; its own Add moved from the floating button into the header (gold,
  shown only while unlocked), so a secret is never one mis-aimed tap from an
  expense.
- Toasts sit 28px above the bar, clear of the raised +.

Verified at 360: all ten pages render the new bar, header 48px, no
horizontal overflow; + on Home opens the entry sheet, + on Accounts lands on
the Ledger with the sheet open; hold opens the type menu above +; More opens
with Vault, Settings, the email and Sign out, on the Ledger and on the locked
Vault. Both themes checked. test-money, check-pages, check-sprite pass.
Browser tests: settings passes; vault has one flaky assertion (a generated
24-char password has no digit about 8% of the time: a real generator gap, to
fix in the vault); auth fails because it expects owner@hisab.test, which the
throwaway DB does not have (not a regression). `run-browser-tests.sh` now
takes `DEBUG_PORT` from the environment; shoot-mobile takes `BEFORE`.
Fix-up before push: the Ledger fallback is `?compose=<type>`, the form B's
`mountCompose()` reads; checked that + on Accounts opens the sheet there.

## Review round fixes

- `formatMoneyHTML(-40, 'BDT', { minor: 'never' })` printed `−৳0`. The sign
  now follows the figure as shown, so a negative that rounds to nothing is
  `৳0` (and a positive one is never `+0`). Four new assertions.
- `tests/Unit` was not tracked, so `artisan test` failed in a clean checkout
  (phpunit.xml names it). Committed with a `.gitkeep`.
- `shoot-mobile.mjs` crashed on Windows for a path with a query string: the
  file name kept `?` and `=`. Anything outside `[A-Za-z0-9_-]` is now `_`.

Verified: test-money (92), artisan test (139 passed), shoot-mobile of
`modules/ledger/list.html?compose=income` writes
`modules_ledger_list_compose_income-1.png`.

## A3 — One design system

Deleted `assets/vendor/` (Bootstrap, Bootstrap Icons, Inter, Plus Jakarta
Sans, JetBrains Mono, `opptracker.css`) and `tools/check-vendor.html`, the
only thing that loaded them. Nothing else referenced either (grep over html,
js, css, py, sh, mjs, .htaccess, the manifest). `assets/` went from 1,336 KB
to 160 KB; `deploy.sh` publishes `assets/` with `rsync --delete` (or a staged
swap), so the server copy goes too.

Verified: check-pages passes; shoot-mobile over all ten pages with a probe
listing every resource that answered 400+ or came from a vendor path: none,
except `/api/vault/header` 404 on the Vault, which is the known "no vault on
the server yet" answer the module handles (context.md, 2026-09-08).

## A4.1 — v2 tokens (DIRECTION §3.7)

`_variables.css` rewritten to the v2 names and values, both palettes:
`--bg-0…3`, `--line`, `--line-soft`, `--text-1…4`, marigold `--accent`,
`--accent-text`, `--on-accent`, `--plus-bg/--plus-ink` (the day + is ink
with a marigold plus), `--in/--out/--saved/--move/--warn/--danger` with
washes, eight `--cat-*` tints per theme, the v2 type scale (`--t-hero` …
`--t-key`, in rem) with `--wd-*` widths, the 4px space scale (`--s-5` 20,
`--s-6` 24, `--s-8` 32, `--s-10` 40), radii `--r-xs…--r-plus/--r-pill`,
`--shadow-sheet`, `--shadow-plus`, and the v2 motion (`--t-press` 90,
`--t-fast` 140, `--t-base` 220, `--t-leave` 160, `--t-tick` 420).
`--tabbar-h` is 64px per §3.7.6.

Every v1 name (`--void`, `--surface*`, `--ink*`, `--flow-*`, `--r-1…4`,
`--e-*`, `--hero*`, `--need-*`) is kept as an ALIAS of its v2 token, so B's
and C's CSS switched palette with no edit. Delete the aliases once no module
reads them (grep `--flow-\|--ink\|--surface` in modules/).

Decisions taken here, flag if wrong:
- **Vault colour.** v1 gold would be read as marigold ("tap here"). The
  vault now takes the steel cyan the app used to wear (`--vault` #5CC8D6
  night, #0B6E7C day), which nothing else uses.
- **Business book** keeps its own `--biz` (the transport-blue tint), since
  §3.7 does not name one and it must differ from the personal book.
- `.money--out` is now `--text-1` (outflows are plain ink). The wordmark's
  "b" uses `--accent-text`, since marigold is never text on paper.
- The page `<meta name="theme-color">` in each page's head still says the
  v1 `#06080B`; `applyTheme()` overwrites it at runtime with `--bg-0`, and
  the manifest is updated. Each page owner can change their meta line.

Verified: shoot-mobile of Home, Ledger, Accounts and Settings at 360 in both
themes: the new palettes apply through the aliases, no overflow;
check-pages passes.

## A4.2 — v2 fonts

`assets/fonts/` now holds exactly four files: `ibm-plex-sans-var.woff2`
(46 KB, kept), `anek-latin.woff2` (65 KB), `anek-bengali.woff2` (265 KB,
`unicode-range` U+0980–09FF so it loads only when Bengali is on screen) and
`hisab-taka.woff2` (1.4 KB, U+09F3 only, `font-display: block`). Space
Grotesk, both Plex Mono files and Noto Sans Bengali are deleted. The three
new files moved from `docs/visual-v2/f/`, which is gone; the mock's
`v2.css` now points at `assets/fonts/` so it still renders.

`.money` is Plex Sans 500 tabular in lists, with the ৳ at 0.9em in the
figure's own colour. From `--lg` up a figure is Anek 600 condensed
(`--wd-fig` 92%, `--wd-hero` 86% for xl and hero), with the ৳ at 0.5em and
the minor part at 0.42em in `--text-3`. Headings are Anek 600 at 96%.
`--font-mono` is now an alias of the body stack (no mono face ships).

Verified at 360, both themes, Home, Ledger, Accounts: `document.fonts`
lists only IBM Plex Sans, Anek Bangla (Latin half) and Hisab Taka as
loaded, so no figure uses another face and the ৳ comes from Hisab Taka
(the Bengali half is never fetched on these screens). Home compared against
`docs/visual-v2/shots/home-night.png`: the figures, taka and weights match;
the bar and tab colours differ until A4.4. check-pages passes.


## A4.3 — v2 partials: buttons, cards, rows, sheet, chips, segments

- Buttons: press is scale .97 plus a surface step in the 90ms press window.
  Primary is marigold at the body size; its hover mixes toward `--text-1`
  (never `--accent-text`, which is brown on paper). Secondary is an outline,
  the same edge as a chip. Danger hover text is `--bg-0`, not `#fff`.
- Segmented control (`.btn-group`): a `--bg-3` track with 3px padding, 34px
  segments, the selected one lifting to `--bg-1` with `--shadow-lift`. No
  accent.
- Cards and stat tiles: `--bg-1`, `--r-lg`, no border at night, a 1px
  `--line-soft` ring by day (new token `--ring-card`).
- Rows: 60px minimum; a 40px glyph tile at `--r-md` painted from `--tint`
  (the tint at 15% behind its icon, `--text-3` without one); `.cat-food` …
  `.cat-health` set `--tint` from the category tokens, for B5. Name 15/500,
  meta 12.5 `--text-3`. Separators start at the text (68px), not full width.
  The narrow-phone gap tweak from A1 is gone: v2's type fits without it.
- Day headers (`.list-group-head`): text only, no band, 12.5/500 `--text-3`.
- Sheet: `--bg-2`, `--r-lg` top corners, `--shadow-sheet`, no border, a
  36 × 4 `--text-4` handle, no rule under the head, 12px plus the safe area
  at the bottom. The dialog matches.
- Pills and choices: pill radius for pills; selected is a `--bg-3` fill in
  `--text-1` (a filter is a view, not an action, so no marigold). Badges
  (`.chip`) are `--r-xs` on `--bg-3`. Inputs are `--bg-3` wells, no border.

Verified at 360 in both themes on the Ledger, Accounts and Settings: no
figure clipped, no row name cut below 18 characters (the one ellipsis is
"Cash in hand" beside its Default badge, in C's markup); check-pages passes.

## A4.4 — the v2 bottom bar

64px plus the safe area, a grid of `1fr 1fr 76px 1fr 1fr` (tabs measure
71 × 63 and the + slot 76 × 63 at 360). Tabs: 22px icon, 11px label,
`--text-3`; the current tab is `--text-1` with a 20 × 2 marigold mark on the
bar's top edge (the label is no longer marigold: it would say "tap me" about
where you already are). The bar is `--bg-1` at 94% with a 12px blur and a
`--line-soft` top rule. + is a 54px square at `--r-plus` (18), raised 20px,
with a 26px plus at a 2.2 stroke and `--shadow-plus` (the 5px `--bg-0` ring
that notches it into the bar): marigold with an ink plus at night, ink with
a marigold plus by day (`--plus-bg` / `--plus-ink`).

Verified at 360 in both themes on Home against
`docs/visual-v2/shots/home-night.png` and `home-day.png`: the bar, the tab
states and both + treatments match.

## A4.5 — category glyphs in the sprite

Eight category glyphs from `docs/visual-v2/cat.svg`, redrawn onto the
sprite's grid and its 1.5 stroke: `i-cat-food`, `i-cat-transport`,
`i-cat-home`, `i-cat-utilities`, `i-cat-dining`, `i-cat-shopping`,
`i-cat-mobile`, `i-cat-health`, plus `i-backspace` for the entry pad. For
B5: `<span class="row__glyph cat-food">` + `icon('cat-food')` gives the tint's
icon on the tint at 15%.

Verified: check-sprite passes; all nine rendered at 360 at night inside
`.row__glyph` tiles, each in its own tint.

## Stopping point

Not yet done in A4: deleting the v1 token aliases (waits on B and C to move
off `--flow-*`, `--ink*`, `--surface*`); dark-by-default with a "follow the
phone" option (A7, needs `state.js` to store 'night' on first run, since the
pre-paint block is frozen); the flaky vault generator (a 24-character
password has no digit about 8% of the time); qa-viewport at 390.

## Vault — a generated password has every class it promises

`generatePassword()` drew characters uniformly (with the existing rejection
sampling over `crypto.getRandomValues`, so no modulo bias), which left a
24-character password with no digit about 8% of the time. Now a draw that
misses any class (lower, upper, digit, and a symbol when symbols are on) is
discarded whole and drawn again, which keeps every valid password equally
likely. A length shorter than the number of classes draws once.

The harness assertion was one sample; it is now 500 eight-character
passwords with symbols and 500 six-character ones without, each required to
contain every class (and, without symbols, none). Checked in Node as well:
20,000 eight-character draws, zero missing a class, zero ambiguous
characters, all the right length.

Verified: test-vault-browser 52 passed (was 50 plus 1 flaky failure),
test-settings 13 passed; test-crypto passes.

## Category colours are tokens (for C's Home bar)

`segmentColor(index, name)` in `spark.js` now returns a token reference, not
a generated `hsl()`: the category's own tint (`var(--cat-home)` …) when the
name matches one, otherwise the index-th of eight ordered tokens
`--seg-1 … --seg-8` (the category tints in an order where neighbours differ)
plus `--seg-rest` for "everything else". All are aliases of the `--cat-*`
tints, so both themes follow. `categoryTint(name)` is exported for B5 and
C: English and Bangla keywords, whole-word where a short word would
misfire ("bus" in "Business", "tea" in "team").

For C: pass the name (`segmentColor(i, c.name)`) so Rent is the same violet
everywhere, and use `var(--seg-rest)` for the "everything else" band.
Without any change, Home's bar already switched to the token palette.

Verified: Node check of the name mapping (Rent → home, Gadgets / tech →
shopping, Subscriptions → mobile, Business → none, Business travel →
transport); Home at 360 in both themes shows the v2 tints in the bar and
the legend.

## A6 — the shared month grid, and a stepper that is not a grey box

`shared/js/components/month-grid.js` exports `openMonthGrid({ value, onPick,
earliest })`: a sheet with the year (‹ 2026 ›, no stepping past this year)
and its twelve months as a 3 × 4 grid of 52px keys. Future months are
disabled, not hidden. The chosen month has an ink ring and the current month
the marigold "today" tick; "Back to this month" appears when another is
chosen. Defaults: the app's period, and `state.setPeriod` on pick. It is
re-exported from `shell.js`, so C can replace Home's month sheet with
`openMonthGrid()` from the import it already has.

`periodStepper()` is now ‹ September 2026 ⌄ ›: the name is a display-face
heading that opens the grid (v1 left it a bare button the browser drew as a
grey box), and a sideways swipe across the stepper steps the month (48px,
clearly more across than down; `touch-action: pan-y`). The arrows stay, so a
swipe is never the only way. `attachSwipe(node, step)` is exported for
Home's header.

Verified at 360 in both themes on the Ledger: the stepper is 250px and fits
beside search; tapping the name opens the grid with 12 months, 3 disabled
(Oct–Dec 2026), September ringed with its tick. check-pages passes.

## A7 (theme) — dark by default, "Follow phone" as a choice

The theme is `'night'` (default), `'day'` or `'system'`, and is always
stored. The inline pre-paint block is frozen, and it sets `data-theme` for a
stored day or night and removes it for anything else, so the default is
made real by `state.js` STORING `'night'` on the first run. From the second
page on, night paints before the first frame. The one exception is the very
first page ever opened on a light phone: it paints one light frame before
`applyTheme()` corrects it. That cannot be removed without changing the
frozen block (director's call). A stored null from before meant "followed
the device by default, not by choice", so it becomes night too.
`setTheme()` treats any unknown value as `'system'`, the one setting that
cannot strand someone.

Settings: Follow phone / Dark / Light, with the hint saying what the phone
is doing. Every page's `<meta name="theme-color">` is now the v2 canvas
`#0C0F14` (13 pages; `applyTheme()` still sets it per theme at runtime).

Verified: test-settings-browser 14 passed (new: Follow phone removes the
attribute and stores `system`; an unknown value falls back to it);
test-vault-browser 52. At 360 with the phone set to LIGHT and a fresh
profile: Accounts and Settings open dark, storage says night, meta says
#0C0F14. Choosing Follow phone turns the page light, stores system, sets
the meta to #F5F3EF, and the hint reads correctly. check-pages passes.

Still in A7: Settings as a grouped list, and the "Reaching hand" hint still
mentions the old compose button.

## v1 token names: Track A's files moved off them (aliases kept)

All of Track A's CSS and JS (every shared partial, `spark.js`, the vault's
CSS, `deploy-check.html`) now read the v2 names. That was 281 references,
rewritten by whole-name mapping, so `--ink` never ate `--ink-inv`. The
ALIASES STAY in `_variables.css`, because origin/main still has v1 names
in other tracks' files:
- `modules/ledger/ledger.css`: `--surface` (line 12), `--ink-3`, `--ink-2`
  (Dev B).
- `modules/overview/overview.css`: `--t-slow` (Dev C).

Once those four are gone, the alias block in `_variables.css` can be deleted
in one commit. The ones that are real v2 tokens (`--surface-inv`,
`--ink-inv`, `--need-*`) stay.

`shoot-mobile.mjs`: the app now opens dark whatever the phone says, so
`THEME=light` also stores the app's own 'day' choice, and `APP_THEME`
(night | day | system) sets that choice on its own.

Verified: the Ledger, Vault and Home at 360 in both themes look the same as
before the rename; check-pages passes.
