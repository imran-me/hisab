# Research — what would make Hisab feel great on a phone

Written 2026-09-26 as input to `docs/DIRECTION.md`. Research only: nothing here
is a decision until DIRECTION.md or `context.md` §3 adopts it.

The owner's verdict on the current app was "i am not liking at all". This file
tries to say why, from screenshots of the real app, and what the best mobile
money apps do instead — filtered through Hisab's locked rules: plain
HTML/CSS/JS, no framework, no build step, Laravel behind it, 360px first.

**Effort scale** used below: **S** = a day or less, one file or two;
**M** = a few days, one module plus a shared component; **L** = a week or more,
touches the shell, the backend or several modules.

---

## Top 10 to do next

| # | Idea | Why, in one line | Effort | Touches |
|---|---|---|---|---|
| 1 | **Keypad-first quick add** | Logging a CNG fare should be 3 taps and 3 seconds, not a 9-field form | M | `ledger/entry-sheet.js`, `shared/components/sheet.js` |
| 2 | **Recent and repeat entries** | Most of a month is the same 15 entries; let him tap one instead of typing it | S–M | `ledger`, entry sheet |
| 3 | **One visual language, everywhere** | Right now two apps are fighting on one screen; pick one and finish it | M | `shared/css`, `accounts`, shell |
| 4 | **A home that answers one question first** | "How much can I still spend this month?" — above the fold, in one number | M | `overview` |
| 5 | **Navigation built for the thumb** | Add lives in the top-right "ow zone" and three places at once; fix the tab bar | M | `shared/components/shell.js` |
| 6 | **Instant paint + offline entry** | 2.5 s of grey skeletons on every tab; show the last known figures at once, sync after | M–L | `shared/js/core`, a service worker, `ledger/api.js` |
| 7 | **Money that reads like money in Bangladesh** | `৳ 385`, not `BDT −385.00`; lakh/crore compact; drop the paisa where it is noise | S | `shared/js/core/money.js`, CSS |
| 8 | **Row gestures with visible fallbacks** | Swipe to repeat / edit / reverse, long-press menu, tap to open | M | `ledger`, `overview` recent list |
| 9 | **Paste a bKash / Nagad SMS** | Turns the message he already has into a filled-in entry, fee split out, TrxID de-duplicated | M | entry sheet, a parser in `ledger` |
| 10 | **Insights that exist** | One of five primary tabs is a "not built yet" page; ship three small SVG charts | M | `reports` |

---

## Critique of the current screens

Taken with headless Chrome at **390×844, DPR 2, touch emulated**, signed in on a
throwaway SQLite database with `php artisan hisab:demo` (108 entries). Screens:
Overview, Ledger, Accounts, Insights, Business, Vault, the entry sheet opened
from both the header and the FAB. Accounts was captured twice because its markup
was being changed in the working tree during the review; both states are
described.

**Overview**

- First paint is a screen of grey skeletons and `—` placeholders for about
  2.5 seconds. On a phone on mobile data it will be longer. Every visit starts
  with a wait for numbers he saw a minute ago.
- The net worth hero is the best thing in the app — but its three chips
  (`+৳88.2k  −৳5k  −৳45.9k`) have no labels, so they read as a puzzle.
- "This month" is a horizontal row of three tall cards that is wider than the
  screen: the third card is cut off mid-figure (`BDT 45,9`), and the first two
  clip their own decimals (`88,185.`). It looks broken rather than scrollable.
- The floating **Add** button sits on top of the category legend's amounts and
  percentages. On Ledger it hides the amount of a row (Meena Bazar).
- "What the numbers say" is three paragraphs of prose. Nobody reads paragraphs
  on a phone between two errands.

**Header and navigation**

- **Out** and **In** are in the top-right corner — the hardest place on the
  screen to reach one-handed — and duplicate the FAB. Three buttons add an entry;
  none of them is where the thumb is.
- One of the five tabs (**Insights**) is a dead end: "Reports are not built yet".
  Business, Investments and Budgets are the same. A primary tab that goes
  nowhere teaches the owner the app is unfinished.
- **Vault** drops the tab bar entirely. Once in, the only way out is the
  browser's back gesture.

**Entry sheet** (the most important screen in the app)

- It is a form, not a quick-add. Amount uses the OS keyboard, which then covers
  half the sheet. Category is a native `<select>` defaulting to
  *Uncategorised*, so the lazy path produces useless data.
- "Was it worth it?" is pre-set to *Discretionary*. A default on a judgement
  question is a nudge in a direction nobody chose.
- The same sheet renders differently on two pages: from Ledger the chips are
  truncated (`Discretion…`); from Overview they wrap unevenly (Transfer and
  Avoidable orphaned on their own rows).
- The sticky **Add entry** button covers "Paid to" and "Note"; the BDT currency
  box has a stray white border on two sides.

**Ledger**

- Every day is a heavy full-width band with its own total, even when the day has
  one entry — the band is as tall as the entry. Half the list is headers.
- A ghost row sits at the top of the list (an empty row with a clipped icon
  above "TODAY"), and the month label has a grey box behind it that looks like
  selected text.
- Six filter pills (All / Out / In / Held / Moves / History) run edge to edge.

**Accounts**

- The committed version is consistent with the rest of the app but truncates
  exactly what identifies an account: `Cash in hand …`, `Mobile m… · bK…`.
- The version in the working tree at review time is a **different app**: light
  background, indigo gradients, frosted cards, a hamburger instead of the tab
  bar, a Tailwind-style type scale. It is precisely the "generated look" that
  `context.md` §4 lists as avoided on purpose. Its month banner breaks a
  sentence into three stacked lines ("Its / ৳61,200 / leftover…") and mixes two
  different ৳ glyphs.

**Numbers, everywhere**

- `BDT` before and `.00` after every figure on every row. In a list of 30 taka
  amounts that is 30 repetitions of information he already knows. The mono face
  at that size makes rows wide enough that labels truncate.

**The honest summary:** the data model underneath is excellent and the
Overview hero shows the visual idea can work. What the owner feels is (a) slow
first paint, (b) a form where he wanted a keypad, (c) buttons out of reach,
(d) tabs that lead nowhere, and (e) two design languages at once.

---

## The ideas, ranked

### 1. Keypad-first quick add — M — `ledger/entry-sheet.js`, `shared/components/sheet.js`

**What.** Opening Add shows a sheet whose top half is the amount in very large
type and whose bottom half is an **in-page number pad** (1–9, 0, 00, ⌫, and a
`+` / `−` so `120+45` works like a calculator — Money Manager and Monefy both
do this). Above the pad: one row of **category chips** (his 8 most used for the
selected type, ranked by frequency over 60 days, plus "More"), and one row of
**account chips** (Cash, bKash, Nagad, Bank…) defaulting to the last one used
for that category. A big **Save** in the thumb zone. Everything else — date,
payee, note, necessity, method — sits behind a "Details" disclosure and keeps
its last-used or sensible default. Type (Out / In / Deposit / Transfer) is a
segmented control at the top, remembered.

**Why.** Every review of manual trackers says the same thing: the tracker you
keep using is the one where logging takes seconds. The owner is standing at a
CNG or a shop counter with one hand free. A custom pad also means the OS
keyboard never covers the sheet, and it lets `12.999`-style typos be impossible
by construction (the pad enforces the currency's `minor_unit`).

**How hard.** A grid of `<button>`s writing into a string buffer; parse with the
existing `money.js`. Chips are buttons with `aria-pressed`. Frequency ranking
can be computed client-side from the ledger list already loaded, or a tiny
`GET /api/ledger/suggestions` later. Keep the current full form as the "Details"
view so nothing is lost. `inputmode="none"` on the display field keeps the
keyboard away while still allowing a hardware keyboard on desktop.

### 2. Recent and repeat entries — S–M — `ledger`, entry sheet

**What.** At the top of the quick-add sheet, a horizontal strip of the last
5–8 distinct entries as chips ("CNG ৳385 · Cash", "Meena Bazar · bKash").
Tapping one fills payee, category, account and amount; the amount is selected
so one keystroke replaces it. In the Ledger, a **Repeat** action on any row
(see #8). Later: saved **templates** (Wallet by BudgetBakers' pattern) for
rent, salary, DPS instalment.

**Why.** A personal ledger is mostly repeats: the same transport, the same
grocer, the same bKash top-up. This is the single cheapest speed-up available.

**How hard.** The data is already in the list response; dedupe by
payee + category + account. No backend change for v1.

### 3. One visual language, everywhere — M — `shared/css/partials`, `accounts`, shell

**What.** Choose one direction and apply it to every screen before building
more screens. The dark instrument-panel language in `context.md` §4 is the
better starting point: it is already on five screens, it is documented, and the
Overview hero proves it can look good. The light OppTracker cockpit either
gets re-skinned onto the same tokens or does not ship.

**Why.** Moving between tabs currently changes the background, the fonts, the
navigation model and the currency glyph. That is what "not liking at all" feels
like when the owner cannot name it.

**How hard.** Mostly deletion and token discipline. The rule already exists
(`CONVENTIONS.md`: no hex outside `_variables.css`); enforce it with a grep in
`tools/check-pages.py`.

**Visual notes from the reference apps** (Revolut, Monzo, Copilot, Cleo):
near-black backgrounds with **one** accent; big numbers, small labels; colour
reserved for meaning (in/out) and never for decoration; generous row height
(56–64px) with two lines max; category shown as a small tinted icon, not a text
column. Copilot's praise is almost entirely about restraint and consistent
motion, not about novelty.

### 4. A home that answers one question first — M — `overview`

**What.** Reorder the Overview so the first screen, with no scrolling, holds:

1. **Left to spend this month** (income so far − spent − deposited, or against
   a budget once `budgets` exists) as the one large figure, with a thin pace
   bar: "৳1,450 a day for the next 4 days". Monzo's "left to spend" and YNAB's
   "available" are the most-cited home patterns because they are *actionable*.
2. **Today** — spent today, one line.
3. **Accounts strip** — horizontally scrollable chips with balance: Cash
   ৳10,087 · bKash ৳−1,537 · Bank ৳86,842. Negative bKash should glow; it is
   an error in reality.
4. Recent entries (5), then the category bar, then net worth.

Replace the three clipped "This month" cards with a single row of three
compact figures that fits 360px. Label the hero chips (In / Saved / Out).
Turn the insight paragraphs into one-line cards with a number first
("48% kept — above the 20% mark").

**Why.** A glanceable home is what makes people open the app. He should get
the answer in the time it takes to unlock the phone.

**How hard.** Layout and ordering; the figures already come back from the
period summary. The pace figure is arithmetic on existing data.

### 5. Navigation built for the thumb — M — `shared/js/components/shell.js`

**What.** A bottom tab bar of **four** destinations with a raised centre
**Add** button (Home · Ledger · [+] · Accounts · More). "More" is a sheet
holding Insights, Business, Investments, Budgets, Vault, Settings. Remove the
Out/In buttons from the header (the Add sheet's type toggle replaces them), and
remove the FAB so nothing floats over content. Long-press on [+] opens straight
into Income or Transfer. The tab bar stays on every screen, Vault included.
Hide destinations that are "not built yet" rather than linking to a stub.

**Why.** Hoober's field research: about half of people use the phone
one-handed, and the bottom-centre is the easy zone while top corners are the
hard zone. The primary action belongs bottom-centre. Five tabs where one is a
dead end is worse than four that all work.

**How hard.** `shell.js` already renders the tab bar from a `PRIMARY` list;
this is a data change plus CSS for the centre button and one sheet.

### 6. Instant paint + offline entry — M–L — `shared/js/core`, service worker, `ledger/api.js`

**What.** Two parts:

- **Stale-while-revalidate for figures.** Every page renders immediately from
  the last response cached in `localStorage`/IndexedDB (marked with a subtle
  "updated 2 min ago"), then refreshes from the API and ticks changed values.
  No skeletons after the first ever visit.
- **An app-shell service worker** that pre-caches HTML/CSS/JS/fonts/sprite, so
  the app opens with no network, plus an **outbox**: an entry saved offline is
  stored locally with its client ULID, shown in the list with a "waiting to
  sync" mark, and POSTed when `online` fires (Background Sync where Chromium
  has it; a retry on page load elsewhere, because iOS has no Background Sync).

**Why.** Speed is the feeling. Mobile data in Bangladesh and building
basements in the Gulf both drop out; an expense not recorded at the moment is
an expense forgotten. The ledger's client-minted ULIDs already make idempotent
retries possible.

**How hard.** The cache layer is small. The service worker is plain JS but
needs care: cache versioning tied to deploy, never caching `/api/*` responses
in the SW (the vault and the session must not be served stale), and the
existing CSP in `.htaccess` must allow it. The outbox must respect "recorded is
final" — a queued entry is not yet recorded, and must say so.

### 7. Money that reads like money in Bangladesh — S — `shared/js/core/money.js`, CSS

**What.**

- Use the symbol **৳** instead of the prefix `BDT` for the home currency;
  show the code (`USD`, `AED`) only for foreign amounts.
- **Drop `.00`** in lists when the fraction is zero; keep paisa in the entry
  sheet and detail view. Show the fraction smaller and dimmer when present (the
  hero already does this well).
- Keep lakh/crore grouping (`2,66,467` — `Intl.NumberFormat('en-IN')` does it
  natively) and use **L / Cr** in compact figures above one lakh (`৳2.66L`).
  `money.js` already has `compact`; use it on chips and chart labels.
- Out amounts do not need a minus sign *and* a red colour *and* an arrow icon.
  Pick two.
- Optional Bangla setting: Bengali digits via `nu-beng`
  (`Intl.NumberFormat('bn-BD')`), Bangla month names, Bangla labels. The fonts
  already ship a Bengali subset.

**Why.** Every row currently carries about ten characters of noise. Removing
it stops truncation of names and makes the amounts scannable.

**How hard.** One formatter with options; the rule that formatting only
happens in `formatMoney()` makes it a single change. Existing
`tools/test-money.mjs` must be extended, not loosened.

### 8. Row gestures with visible fallbacks — M — `ledger`, `overview`

**What.** On an entry row: swipe left reveals **Reverse** (the app's delete),
swipe right reveals **Repeat**; tap opens detail/edit; long-press opens a menu
with the same actions. On an account row: swipe for Transfer from / Add to.

**Why.** Gestures make a list feel native, but NN/g's research is clear that
swipe actions are undiscoverable and must never be the only path. The menu and
the detail view are the fallback, and are what a screen reader uses.

**How hard.** Pointer events with a horizontal threshold and
`touch-action: pan-y` so vertical scroll is untouched; the sheet component
already tracks a finger for drag-to-close, so the pattern exists. Respect
`prefers-reduced-motion`.

### 9. Paste a bKash / Nagad SMS — M — entry sheet, a parser module in `ledger`

**What.** A "Paste message" button in the Add sheet (and, once installed as a
PWA on Android, a **share target** so he can share the SMS straight to Hisab).
A parser recognises bKash/Nagad/Rocket formats — "Tk 500.00 sent to 01XXX…
Fee Tk 0.00 … TrxID …", "Cash Out Tk 2,000 … Fee Tk 37.00", "You have received
Tk …" — and fills amount, direction, account (bKash), counterparty number and
date. The **fee becomes its own expense line** in a "Fees & charges" category,
so cash-out charges (≈৳18.50 per ৳1,000) stop disappearing. The TrxID is stored
and a second paste of the same message is refused.

**Why.** This is the Bangladeshi equivalent of bank sync, which Hisab cannot
have. MFS is how daily money moves, the messages already exist on the phone,
and local apps (Hat-Khoroch, Hishabee) list MFS support as a headline feature.

**How hard.** Regexes and a test file of real sample messages — pure JS,
testable with node like `test-money.mjs`. `share_target` needs the manifest
entry (absolute `action` URL on Android) and installability (#11). No reading of
SMS is possible from the web, and that is fine — paste/share is explicit.

### 10. Insights that exist — M — `reports`

**What.** Replace the stub with three small, honest charts, each one screen
wide, hand-drawn SVG (no chart library):

- **6-month bars**: in vs out per month, current month highlighted.
- **Category trend**: tap a category on Overview → this month vs 3-month
  average, as a bar pair and one sentence.
- **Spending by day of month**: a cumulative line against last month's line,
  so "am I ahead or behind last month" is visible.

Rules for small screens: at most 6–7 bars, labels on the bars not in a legend,
one accent colour, tap a bar to read the value (no hover), and a table view
behind each chart.

**Why.** It is a primary tab. The data and the period summary endpoint exist.

**How hard.** SVG `<rect>`/`<path>` generated from arrays; `spark.js` is
already in `shared/components`. Needs a `GET /api/ledger/summary?months=6`
style endpoint or several period calls.

### 11. Proper PWA install — S — root, `site.webmanifest`, `.htaccess`

**What.** PNG icons at 192 and 512 (plus maskable) alongside the SVGs, an
`apple-touch-icon`, the service worker from #6, a one-time "Add Hisab to your
home screen" card on Android (`beforeinstallprompt`) and an instruction card on
iOS (Share → Add to Home Screen — iOS has no prompt). The manifest shortcuts
already exist ("Add an entry", "Open the vault") and become real long-press
shortcuts once installed.

**Why.** Installed, it opens full screen from the home screen like an app, and
it unlocks the share target (#9).

**How hard.** Small. Test on a real Android and a real iPhone; installability
rules differ.

### 12. Remittance: AED → BDT as one action — M — entry sheet, `fx`

**What.** A "Send home" transfer preset: from the Gulf account in AED to a BDT
account, entering either side and the rate (or the received amount, deriving
the rate), with the fee as its own line. A small remittance history card:
total sent this year, average rate.

**Why.** The owner lives between the Gulf and Bangladesh. Multi-currency
transfers are the exact place where FX snapshots matter, and they are the
entry he will get wrong most often on a generic form.

**How hard.** The backend already snapshots rates on rows; this is a UI
preset over a transfer.

### 13. Dues / baki (money lent and borrowed) — M–L — new slice or `ledger`

**What.** "Gave ৳5,000 to Rahim", "Owe ৳2,000 to the shop" — a list of open
dues per person, with settle-up entries. Bangladeshi trackers (Hat-Khoroch,
Hishabee's "due collection") treat this as core.

**Why.** Informal lending is a large part of personal money in the region and
is invisible in a plain expense list.

**How hard.** A new transaction pairing (loan out / repayment in) that does not
count as income or expense — similar in spirit to `deposit`. Needs a decision
in `context.md` before code.

### 14. Motion that reports state — S — `shared/css`, `shared/components`

**What.** Values tick when they change (already a stated principle); the Add
sheet rises from the + button; a saved entry slides into the list where it
belongs; cross-page **View Transitions** (`@view-transition { navigation: auto }`)
so tab changes crossfade instead of flashing white/black. Supported in Chrome
on Android and Safari 18.2+; elsewhere it silently does nothing.

**Why.** A multi-page app flashes on every tab change; this is the cheapest way
to make it feel like one app.

**How hard.** A few lines of CSS per page, behind `prefers-reduced-motion`.

### 15. Haptics, carefully — S — shared helper

**What.** A 10ms `navigator.vibrate()` on Save, on reaching a swipe threshold,
and on a keypad press (off by default for the keypad).

**Why.** Confirms an action without looking.

**How hard.** Trivial on Android Chrome. iOS Safari support has been
unreliable; the `<input type="checkbox" switch>` trick libraries used was
closed in iOS 26.5. Treat haptics as Android-only progressive enhancement and
never depend on it.

### 16. Search that understands money — S–M — `ledger`

**What.** One search box that accepts `>500`, `bkash`, `food sep`, a payee.
Results show a total at the top ("12 entries · ৳4,380").

**Why.** "How much did I spend at Meena Bazar this year?" is a real question
with no answer today.

**How hard.** Client-side over the loaded range; server filter params later.

### 17. Recurring bills and a "coming up" strip — M — `budgets`

**What.** Mark an entry as recurring (the `recurring` column already landed in
a migration). Home shows "Coming up: Rent ৳18,000 in 4 days, Internet ৳1,200".
Left-to-spend (#4) subtracts them.

**Why.** Turns the home number from backward-looking to forward-looking.

**How hard.** Schedule logic on the server; a strip on the home.

### 18. Month close as a ritual, not a banner — M — `budgets` / `accounts`

**What.** On the 1st, a single card: "September: ৳88k in, ৳46k out, kept 48%.
Review 3 uncategorised entries → Close." A one-minute flow, then a small
archive of closed months.

**Why.** The OppTracker month close is a good idea; the current banner version
is text-heavy and competes with the page.

**How hard.** The backend for it exists in the working tree; this is UI.

### 19. Quick unlock for the Vault — M — `vault`

**What.** WebAuthn (fingerprint / Face ID) to unwrap a device-held key that in
turn unlocks the vault, so the long master password is typed rarely; auto-lock
on background. The master password stays the root of trust.

**Why.** A vault he has to type a five-word passphrase into on a phone every
time is a vault he will stop using.

**How hard.** Real care needed — the PRF extension or a wrapped key in
IndexedDB, and a security review against `modules/vault/SECURITY.md`.

### 20. Pull to refresh — S — shared

**What.** Pull down on Home and Ledger to re-fetch.

**Why.** Expected in a finance app; with #6 it confirms "these numbers are
current".

**How hard.** Small, but conflicts with the browser's own pull-to-refresh;
use `overscroll-behavior-y: contain` and only enable in standalone mode.

### 21. Receipt photo on an entry — M — `ledger`, storage

**What.** Attach a photo from the camera (`<input type="file" accept="image/*"
capture="environment">`), downscaled in the browser before upload.

**Why.** Business expenses need proof.

**How hard.** Storage and privacy decisions on the server; UI is simple.

### 22. Split an entry — M — `ledger`

**What.** One payment, two categories (groceries + household), or personal vs
business share.

**Why.** Real receipts are mixed; forcing one category makes reports wrong.

**How hard.** Backend-first: legs already exist, so a split is several legs in
one group.

---

---

## Added during review

Ideas the reviewed commits suggested. They are ranked as a backlog, below the
list above.

### R1. Show a converted total's working — S — `formatMoney()` callers, `overview`, `reports`

**What.** When a month total includes a foreign-currency row, add a quiet
footnote under the figure, for example "includes USD 450.00 at 122.50
(1 Sep)". Tapping it lists the converted rows.

**Why.** Every Gulf salary and every Upwork payout lands in a different
currency from the home total. `context.md` already requires a converted figure
to carry its rate and date. Showing them is what makes the owner trust the
number, and it would have made the cross-currency summing bug found in review
round 1 visible on the first screenshot.

**How hard.** The rate and `as_of` are already on the row (`fx_rate`,
`fx_as_of`) and on the rates endpoint. It needs a small `<details>` under the
hero.

### R2. A "which book" pill on every total — S — `overview`, `accounts`, `reports`

**What.** Every month figure is now for one book (`?book=`). Show which one as
a small pill next to the figure ("Personal" / "Business"), and let a tap switch
it.

**Why.** The personal/business mix-up that `ea255c8` fixed was invisible on
screen: both totals looked equally plausible. A label makes a wrong book
obvious at a glance.

**How hard.** Trivial once C6's book switch exists. Until then, a static label.

### R4. Amount memory on the pad — S — `ledger/numpad.js`, entry sheet

**What.** Once a recent entry or a category is chosen, show that payee's last
two or three distinct amounts as small chips just above the pad ("৳250 ·
৳294 · ৳301" for CNG). One tap fills the amount.

**Why.** The round 3 pad makes typing fast. For the same trip at slightly
different fares, not typing at all is faster still. The data is already in the
loaded list.

**How hard.** Small. It is a client-side group-by over the rows B3 already
reads.

### R3. Fonts for a Latin + Bengali finance app — S–M — `shared/css/partials/_typography.css`, `assets/fonts`

**The problem, from the round 2 screenshots.** The app already self-hosts IBM
Plex Sans, IBM Plex Mono and Space Grotesk, plus Noto Sans Bengali at a
**single** weight (400). None of the three Latin faces draws ৳ (U+09F3), so
every symbol falls back to that one Bengali weight. The result is a thin ৳
beside medium-weight digits, which reads as a "b". A Bengali label would have
the same problem next to a semibold Latin heading.

**Candidates.** All are OFL, free to self-host, and on Google Fonts, so there
are subsetted woff2 builds to take from.

| Face | Scripts | Weights / axes | Figures | Character | Fit here |
|---|---|---|---|---|---|
| **Noto Sans Bengali** | Bengali (+ Latin via Noto Sans) | variable, 100–900; width axis 62.5–100 | proportional by default | neutral and very complete (conjuncts, ৳, Bengali digits) | the safe fallback. Ship the **variable** file, not one static weight |
| **Anek Bangla** (Ek Type) | Bengali + its own Latin | variable weight **and width** | check `tnum` before relying on it | modern, slightly geometric, confident at display sizes | best match for Space Grotesk's personality; the width axis helps at 360px |
| **Hind Siliguri** (ITF) | Bengali + Latin (Hind) | 5 static weights (300–700) | proportional | humanist; very common on Bangladeshi sites and apps | familiar and readable, but five files, and its Latin is plain next to Plex |
| **Baloo Da 2** | Bengali + Latin | variable 400–800 | proportional | rounded, friendly | too soft for "instrument panel"; fine for a marketing page |
| **Tiro Bangla** | Bengali + Latin | 400 + italic | proportional | serif, bookish | wrong register for a money app |

For Latin with **tabular figures** (`font-variant-numeric: tabular-nums`):
Space Grotesk, IBM Plex Sans / Mono, Inter and Manrope all have them.
Inter is the default "generated" look that `context.md` §4 avoids by name.
Manrope is pleasant but rounder than the brand. Plex and Space Grotesk are
already paid for in bytes.

**Recommendation.**

- **Figures:** Space Grotesk with `tnum`, for heroes and tiles (as A4 plans).
- **Lists and columns:** IBM Plex Mono, unchanged.
- **Body and UI Latin:** IBM Plex Sans, unchanged.
- **Bengali, including ৳:** **Anek Bangla variable**, subset to Bengali +
  U+09F3 + the Bengali digits. It carries real weights, so the ৳ matches the
  digits it sits beside (a 500 figure gets a 500 ৳), and it supports the
  Bangla-labels option (R#7) without a second family later.
- **Fallback:** keep Noto Sans Bengali behind it, switched to the variable
  file, for anything Anek's subset misses.
- Set `size-adjust` / `ascent-override` on the Bengali `@font-face`, so a ৳ or
  a Bangla word does not shift the line height of a Latin row.
- **Budget:** one variable Bengali subset is typically well under 100 KB. The
  current 400-only Noto file can go once Anek is in.
- **Check before adopting:** render ৳, ০–৯ and a few conjuncts (ক্ষ, ন্ত,
  স্ত্র) at 12px and 32px in both themes, and confirm the `tnum`/`lnum`
  features with a quick `font-feature-settings` test page.

Sources: [Anek on GitHub (EkType)](https://github.com/EkType/Anek),
[Anek Bangla on Google Fonts](https://fonts.google.com/specimen/Anek+Bangla),
[Google Design — Anek multiscript](https://design.google/library/anek-multiscript),
[IBM Plex (no Bengali released)](https://github.com/IBM/plex).

### R5. Reconcile as a small ritual, dated properly — S–M — `accounts`, `ledger`

**What.** On an account's page, add "Match a statement": pick the statement's
date and type what it says. The screen then shows three lines:

- the ledger's balance **on that date**;
- the entries after that date, which the statement cannot know about yet;
- the gap.

One tap posts an `adjustment` that no month total counts. After that the card
wears a small "matched 20 Sep" tick until the next entry on or before that
date.

**Why.** Review round 6 H1: the current version compares a dated statement
with today's balance, so it posts wrong money. A bank app's "reconciled" tick
is also what makes an owner trust every other figure on the card.

**How hard.** The detail page already walks balances backwards for
balance-after, so the as-of figure is one loop. The new type needs B.

### R6. A payday month — S — `overview`, `accounts` (MonthCockpit), settings

**What.** Add a setting: "My month starts on" — the 1st, or a day such as
the 25th, when salary lands. "Left to spend", the a-day pace and the budgets
then run payday to payday.

**Why.** Salaried Bangladeshis and Gulf workers think in salary cycles, not
calendar months. On the 28th, "৳12,162 a day for 3 days" is true of the
calendar and useless to someone paid on the 25th.

**How hard.** MonthCockpit and BudgetBook already take a month key. They
would take a start day, and `periodBounds()` would learn an offset.

### R7. The payee's own tile — S — `shared/js/components/bank-logo.js`, `ledger/row.js`

**What.** Let `findInstitution()`'s matching also cover merchants: Shwapno,
Meena Bazar, Agora, Uber, Pathao, foodpanda, DESCO, Titas, Grameenphone,
Robi. Draw their tile in the row's circle in place of the category glyph,
with the category glyph as a small badge.

**Why.** "Bank logos everywhere" is the owner's request, and a ledger of
Shwapno, Uber and DESCO tiles reads at a glance. Most demo rows are exactly
these payees.

**How hard.** Small. The matcher and the tile renderer exist. It needs 20
marks, or brand-colour monograms, in the same data file.

### R8. Budget left on the chips — S — entry sheet, `budgets` api

**What.** Under each category chip in the entry sheet, show what is left in
that budget this month ("৳2.2k left"). Once the typed amount is known,
colour the chip amber or red where this entry would take the budget past 75%
or 100%.

**Why.** Budgets are most useful at the moment of spending, not on a report.
The owner asked for "huge logic, yet easy", and this is logic with no extra
tap.

**How hard.** One `budgets.month()` read, cached with the chips. It is
display only; the server stays the judge.

### R9. A card's cycle, on the card — S–M — `accounts`

**What.** On a credit card account, show the statement cycle from
`statement_day`: spent this cycle, what is due, and when. Add a
"Pay the card" preset that opens a transfer from the default bank account
with the due amount filled in.

**Why.** `d259c5f` now stores the statement day and the limit, but nothing
uses them. Paying a card on time is the one card task that costs money when
it is forgotten.

**How hard.** It is a date window over rows the page already loads, plus a
compose call with `to_account_id` preset.

### R10. A dense ledger that still breathes — S — `ledger/list-page.js`, `row.css`

**What.** A day with one entry becomes a single row, with the date in its
sub-line ("Uber · Cash · Sat 26"). Headers are kept only for days with two
or more entries, and their total is shown only then. Long-press a header to
collapse that day.

**Why.** Round 6 M6: five entries a screen at 360×780, against the 10 that B5
promised. The owner asked for compact spacing twice.

**How hard.** It is a change to the group-by in the list page. The rows
already carry everything the sub-line needs.

## What the reference apps are good at, in one line each

- **Monzo** — "left to spend" as the home number; spending grouped into pots
  you can hide; a single activity feed.
- **Revolut** — dense but calm dark UI; big balance, account chips, one accent.
- **Copilot Money** — restraint: consistent motion, one clear hierarchy per
  screen, charts that animate and read in a glance.
- **YNAB** — every figure is actionable ("available to spend"), not just
  historical.
- **Cleo** — insight as a short, human sentence with a number in it, not a
  paragraph.
- **Money Manager (Realbyte)** — calculator keypad in the entry, + on every tab.
- **Monefy** — the fastest manual entry: tap a category icon, type amount, done.
- **Wallet by BudgetBakers** — templates for repeat entries; MFS accounts
  (bKash, Nagad, Rocket) supported for Bangladeshi users.
- **Spendee** — colourful but consistent category icons; wallets shared per
  purpose.
- **Hat-Khoroch / Hishabee (Bangladesh)** — fully Bangla, MFS accounts first
  class, dues (baki) as a core feature.

## Sources

- Hoober's thumb-zone research: [Smashing Magazine — The Thumb Zone](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/)
- Swipe actions and fallbacks: [NN/g — Using Swipe to Trigger Contextual Actions](https://www.nngroup.com/articles/contextual-swipe/), [LogRocket — accessible swipe interactions](https://blog.logrocket.com/ux-design/accessible-swipe-contextual-action-triggers/)
- Monzo home: [The new Home screen](https://monzo.com/blog/the-new-and-improved-home-screen)
- Copilot design: [Money with Katie review](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/), [StackSwitch review](https://stackswitch.app/review/copilot-money)
- Wallet templates: [BudgetBakers — Using Templates](https://support.budgetbakers.com/hc/en-us/articles/7077050225042-Using-Templates)
- Money Manager entry: [The Wise Coin review](https://thewisecoin.com/review-money-manager-app)
- Fast entry as the retention factor: [Finny — best expense trackers 2026](https://getfinny.app/blog/best-expense-tracker-apps-2026)
- Bangladeshi apps: [Hat-Khoroch on Google Play](https://play.google.com/store/apps/details?id=com.hatkhoroch.hat_khoroch&hl=en), [Hishabee](https://www.hishabee.io/)
- bKash SMS and fees: [syncpay-bd SMS parse issue](https://github.com/jahidulislamseo/syncpay-bd/issues/1), [bKash Cash Out](https://www.bkash.com/en/products-services/cashout), [bKash charges 2026](https://emicalculator.bd/bkash-charge-2026-cash-out-send-money-bank-transfer-fees-explained/)
- Lakh/crore formatting: [MDN — Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat)
- Share target: [Chrome — Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target), [Absolute URL fix on Android](https://martin.hjartmyr.se/articles/pwa-web-share-target-android/)
- PWA on iOS vs Android: [PWA 2026 mobile testing checklist](https://mobileviewer.github.io/pwa-mobile-testing-checklist-2026)
- View Transitions: [Chrome — cross-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)
- Web haptics on iOS: [ios-haptics](https://github.com/tijnjh/ios-haptics), [haptics on iOS 26.5+](https://haptics.kushagragolash.dev/)
