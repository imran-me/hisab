# Review log

The reviewer's findings on each batch pushed to `main` after `c0092c3`
(DIRECTION.md). Newest round first. Each finding has a severity, the commit, a
`file:line`, and the track that owns the fix.

**Severity:** **High** means wrong money, a security hole or a broken locked
rule, so fix it before the next increment on that track. **Medium** is a real
bug or a broken acceptance check. **Low** is polish, or a trap for later.

**How it was checked:** a detached worktree on `origin/main` with its own
`vendor/` (see the note at the end), a throwaway SQLite database with
`hisab:demo --months=3`, `php artisan test`, the API read directly with curl,
and `tools/shoot-mobile.mjs` at 360×780.

---

## Round 7 — `7cb63ce..1672fd2` (6 commits: A ×4, B ×1, C ×1)

`1512e88` (B, categories in one call), `0f373cc` (C, budgets UI),
`b5df5e5` and `69d9ebc` (A, bank and merchant logos), `866cd89` (A, press
and haptics), and `1672fd2` (A, sheets and toasts). The dues, swipe, count-up
and merchant-row commits that landed after them (`e236e35..a521dcf`) are left
for round 8.

**What was run**

- `php artisan test` at `7173c6f`: **175 passed, 739 assertions**.
- `test-money`: 97. `check-pages`: ok.
- Home and Budgets at 360 in both themes.
- The `tools/institutions.html` contact sheet: 130 tiles and 42 merchants.
- `findInstitution()` run over 90 account names, both real and everyday.

**Identity.** All six commits are `Md Imran Hossain
<me.imran.personal@gmail.com>` as author and committer. No AI attribution.

**Ownership.**

- `0f373cc` (C) adds its one `SECONDARY` line for Budgets. It also
  realigns the Vault line's spacing, which is harmless.
- `1512e88` (B) stays inside `categories/` and `ledger/`.
- A's four commits touch only `shared/`, `assets/` and `tools/`. None of
  them has a `track-a.md` entry, whose last entry is `ae1b7dc` (rule 6).

**Closed from round 6**

- M2, the grey legend dots: fixed by `0f373cc` (`overview-page.js:416`).
- Low, demo bKash below zero: the demo now ends September at +৳684.
- Low, a Payoneer tile: "Payoneer (USD)" now matches Payoneer's mark.

**Still open from round 6:** H1 (a statement reconciled against today's
balance) and H2 (Could-have-kept counts a corrected entry twice). Neither
has been touched.

### H3 · High: an everyday word in an account's name gives it a bank's logo and colour. Owner: A (`b5df5e5`)

- `findInstitution()` (`bank-logo.js`) matches the institution's **id** as
  a whole word, as well as its name. `accountInstitution()` then falls back
  to the account's **name**.
- `b5df5e5` adds ids that are ordinary English and Bangladeshi words:
  - `standard` (`institutions.js:85`), `one` (`:51`), `trust` (`:52`) and
    `basic` (`:60`);
  - `union` (`:84`), `wise` (`:106`) and `tap` (`:114`);
  - `padma`, `meghna`, `uttara`, `bengal` and `citizens`.
- **Checked** by running the matcher on these account names:

  | Account name | Shown as |
  |---|---|
  | "Trust fund" | Trust Bank |
  | "Standard savings" | Standard Bank |
  | "Basic savings" | BASIC Bank |
  | "Dhaka flat rent" | Dhaka Bank |
  | "Uttara flat" | Uttara Bank |
  | "Wise savings" | Wise |
  | "One card" | ONE Bank |
  | "Premier league" | The Premier Bank |

- The account card is then printed in that bank's colour, with its logo, and
  labelled as that bank. That is a wrong statement about where the money is
  held, on the screen the owner uses to check it.
- The merchant matcher in `69d9ebc` already solved this with an `exact`
  field.
- **Fix:**
  - Stop matching on `inst.id`.
  - Give every common-word institution an `exact` spelling, and require
    "bank" (or the full name) in the free text.
  - Add the table above to a test.

### M8 · Medium: "Left in your budgets" nets overruns against headroom. Owner: C (`bf8f7c8`, `0f373cc`)

- The Budgets screen's hero says "৳1,070 left, ৳356 a day for 3 days, 96%
  used, 2 over".
- Dining out is ৳2,430 over and Subscriptions ৳641 over. The four budgets
  still under their limits have **৳4,141** of headroom between them.
  `totals()` (`BudgetBook.php`) sums the limits and the spending across all
  budgets, so the ৳3,071 of overrun silently eats that headroom, and the ring
  is amber.
- One honest reading is "৳4,141 left in 4 budgets · ৳3,071 over in 2". If
  the net figure stays, label it "net of overruns".

### M9 · Medium: logos no one can read, and marks that need a second look. Owner: A (`b5df5e5`, `69d9ebc`)

From the contact sheet, at 40px on the phone:

- **Too blurry to read.** ONE Bank, Midland, NRB Bank and Apex are upscaled
  favicons, soft at 40px and worse at 18px.
- **Illegible.** The American Express tile is unreadable at 18 and 24px.
  Titas Gas's seal is a grey smudge at 24px. Both would read better as
  monograms.
- **Check these against each bank's own site before shipping:**
  - The Social Islami Bank tile (a red swoosh with a "9").
  - Union Bank (a purple "9").
  - SureCash (a blue Bengali "শি", which reads as another brand).
  - Shohoz (a green "Q").
- **Licence.** `assets/banks/README.md` now says many marks are
  "non-free logos used under fair use" on Wikipedia, or favicons fetched
  through Google's service. That is weaker than the Commons-only rule
  `9169432` started with. Record it as a decision in `context.md`, and keep
  the README row per file.

### Low

- **The merchant matcher is not used yet** (A, `69d9ebc`). Nothing imports
  `merchant-logo.js` at `1672fd2`. `8e5a136` wires it later, and is for
  round 8.
- **Merchant false positives** (A, `merchants.js`).
  - `bata` matches "shorshe bata" (mustard paste, a grocery line) as Bata
    shoes.
  - `gp` matches any line with "GP" in it, such as "GP fund".
  - Move both to `exact`, or add `not`.
- **Two haptics on one save** (A and B).
  - `press.js` fires `tap` on `.btn--primary`, and `entry-sheet.js` calls
    `navigator.vibrate(8)` on save.
  - The 30ms guard catches only the pair in the same frame.
  - B should call `haptic('success')` instead.
- **Cached categories outlive a sign-out** (B, `1512e88`). The session copy
  is keyed by owner id, which is right. But sign-out does not clear it, so a
  shared tab keeps the last owner's category names in `sessionStorage`.
  `categories.reset()` (`categories/backend/api.js:354`) exists, but nothing
  calls it on sign-out.
- **Archiving now calls DELETE** (B, `categories/backend/api.js`). The
  server hard-deletes a category that has no entries, which cascades to its
  budget (`bf8f7c8` migration). Deleting an unused category therefore also
  deletes the budget someone just set on it, and the only warning is the
  toast. Say so in the confirm step.
- **Budgets fall back silently** (C, round 6 Low, still open):
  `budgets/backend/api.js:37`.

### Visual

- **Home.** The budget rings are the best new element: the overrun lap and
  the marigold today tick read at a glance. But "limit reached" under a ring
  that says 181% undersells it; "৳2,430 over" already says it, so drop the
  third line. With the budgets added, Home is 901px tall, still within 1.6
  screens.
- **Budgets.** It is clean and dense, with red, amber and green used
  correctly. The "+ ৳20,000" pill on Rent is one tap to a budget, which is
  exactly "huge logic, yet easy". The ring's percentage text is 11px, which
  is hard to read in the light theme's 52px ring.
- **Contact sheet.** The coverage is impressive: 61 BD banks, 6 Gulf banks,
  11 wallets and 42 merchants. Fix the handful in M9, and the tiles will
  read as a real app's.

---

## Round 6 — `f34fa9e..bf8f7c8` (17 commits: A ×7, B ×4, C ×4, no track ×2)

**What was run**

- 360×780 screenshots of all ten screens in both themes, plus the entry
  sheet (open, and with ৳200 typed) and the bKash account page.
- `php artisan test`: **167 passed, 680 assertions** at `bf8f7c8`
  (156 / 610 at `4fdb218`).
- `test-money`: 97 assertions. `test-crypto`: 41. `check-pages`: ok.
  `check-sprite`: ok. No `OVERFLOW` on any page.
- MonthCockpit and BudgetBook called directly in tinker against the demo
  data, to check the figures on the Month screen.
- Every `var(--x)` without a fallback resolves to a defined property.

**Identity.** All 17 commits are authored and committed as
`Md Imran Hossain <me.imran.personal@gmail.com>`. No AI attribution in any
message or trailer.

**Ownership.**

- `c302dc8` (C) adds one line to `SECONDARY` in `shell.js`. That is the
  allowed exception.
- `bf8f7c8` (C) names the budgets module in `composer.json` and
  `bootstrap/providers.php`. Those are the module test's two allowed places.
- `4fdb218` (logos, A's track) edits C's `accounts/account-card.js`,
  `accounts/accounts.css` and `overview/overview-page.js`. This is an overlap.
- `7eeb426` and `7d7e182` have no track log entry. They edit C's
  `overview.css` and `accounts.css`, and A's tokens, in the same commit. See
  M7.

**Closed from earlier rounds**

- Round 5 High, Home's category bar under the CSP. Fixed by `c302dc8`: bands
  are set through `applyStyleVars()`. The legend beside the bar was missed
  (M2).
- Round 5 visual 1, the header Out/In buttons. They are gone on every
  screen.

### H1 · High: reconciling to a statement posts the wrong amount. Owner: C (`d259c5f`)

- The statement has a date (`statement_on`), but the gap is worked out
  against **today's** balance:
  - `detail-page.js:131`: `const gap = said - balance;`
  - `account-form.js:289`: the same.
  - `postAdjustment()` (`account-form.js:91`) then books that gap as an
    entry dated on the statement.
- **Checked on the bKash page.** The running balance after 20 Sep is −৳43,
  and today's is −৳2,060. Suppose a statement of 20 Sep says −৳43, which is
  what the ledger held that day. The page says "the ledger is ৳2,017 over",
  and one tap posts a ৳2,017 expense on 20 Sep.
- Every later entry reopens the gap and offers the button again, so the
  owner is invited to post a second wrong adjustment.
- **Cards.** A statement's "amount due" is typed as a positive figure, while
  the ledger holds a card's debt as negative. A ৳12,000 bill against −৳12,000
  shows "৳24,000 short" and posts ৳24,000 of income.
- **Fix:**
  - Compare with the balance **as of `statement_on`**. `ledger.balances()`
    could take an `on` date, or the detail page can walk its rows back, the
    way it already does for balance-after.
  - For a credit account, read the statement as owed, or label the field
    "Amount due".
  - Add a test with an entry dated after the statement.

### H2 · High: "Could have kept" counts a corrected entry twice. Owner: C (`MonthCockpit`, surfaced by `c302dc8`)

- `leak()` (`MonthCockpit.php:741`) and `quality()` (`:756`) keep only rows
  with `reverses_id === null`.
- That drops a correction's mirror, but keeps the **original** it cancels.
  The necessity mix (`by_need`) nets the two, so a single response disagrees
  with itself.
- **Checked on September's demo data.** Lunch at ৳12,500 (discretionary) is
  reversed and re-entered as ৳1,250.
  - `by_need[3]` = ৳8,437.28.
  - `leak_minor` = 1,046,864, so the screen says **"Could have kept
    ৳10,469"**. Directly above it, the Discretionary row reads ৳8,437, and
    the caption says "all of the avoidable, and half of the discretionary".
  - The right figure is **৳4,218.64**.
- The spend quality grade is also computed on ৳20,937 of discretionary
  spending instead of ৳8,437.
- This is pre-existing, from `2833ff8`. `c302dc8` is the first screen that
  shows it.
- **Fix:**
  - Use `signed()`, as `by_need` does, so a mirror subtracts.
  - Add a test with a correction in the same month, and one across two
    months.

### M1 · Medium: a statement adjustment counts as income or spending. Owner: C (with B for the type)

- `postAdjustment()` books `type: gap > 0 ? 'income' : 'expense'`
  (`account-form.js:93`), with no category.
- A ৳20,000 catch-up therefore moves "Spent this month", "Left to spend",
  the savings rate and the untagged share, although nothing was earned or
  spent.
- **Fix:** it needs a type the month totals skip. Either an `adjustment`
  type in the ledger (B), or book it as an opening-balance change.

### M2 · Medium: Home's legend dots are all grey. Owner: C (`c302dc8`)

- `overview-page.js:338` writes `data-vars="seg-color:…"` on each legend
  name, but `applyStyleVars()` runs only on the bar (`:335`).
- The three dots are therefore `--text-4` grey under a violet, orange and blue
  bar, so the key matches nothing. This shows in both themes.
- **Fix:** call `applyStyleVars(qs('[data-breakdown-legend]'))` after that
  `innerHTML`.

### M3 · Medium: the Month screen does not follow expense red, income green. Owner: C (`c302dc8`)

- In "Six months", Out is grey (`reports.css:135`, `fill: var(--text-2)`).
  In is a `--bg-3` track, which is almost invisible on the light theme's
  paper, so only the 2px green cap shows.
- The hero "Spent this month", the tables and "Out this month" on an account
  page are in ink.
- The colour-blind reasoning in `charts.js` is sound, but shape and hue can
  work together: keep the track-and-fill shape, fill Out with `--money-out`,
  and make the In track `--in-wash` with the green cap.
- Pass `{ type: 'expense' }` to `formatMoneyHTML` for spending totals.

### M4 · Medium: the account page still draws its own rows. Owner: C

- `detail-page.js:224` keeps a private `entryRow()` ("TODO(B5)"). B's
  `row.js` (`fe88020`) exists, and says it is for this screen.
- So the bKash page shows a type arrow on a red disc where the Ledger shows
  the category circle. Its comment ("Out in ink, not red") contradicts the
  owner's rule.
- DIRECTION C3: "reusing the ledger's row renderer … not by copying it".
- **Fix:** use `entryRowHTML(row, look, { showAccount: false, after })`.

### M5 · Medium: the entry sheet grows under the thumb. Owner: B (`e91cedd`)

- 700ms after `+`, the sheet has no category row. The chips arrive with
  `/api/categories/frequent` and push the note field and the whole pad down
  by about 90px.
- A digit tapped while that happens lands on the wrong key, which in this
  sheet means a wrong amount.
- **Fix:** reserve the row's height with five skeleton circles until the
  chips are drawn.

### M6 · Medium: the Ledger shows five entries a screen. Owner: B (`fe88020`, B5)

- Most demo days have one entry. Each one gets a full day header, plus a day
  total that repeats the row's own amount ("Yesterday −2,017" over
  "−৳2,017").
- At 360×780 the first screen holds five rows. B5 accepts at ten.
- "Bank account" is 12 characters, and is cut to "Bank accou…" in a row's
  sub-line. B5 says nothing is cut before 18.
- **Fix:**
  - Fold a single-entry day into its row, with the date in the sub-line.
  - Drop the day total when a day has only one entry.
  - Let the account name win space over the category name.

### M7 · Medium: two commits with no track, and a logo commit in C's files. Owners: the director / A

- `7eeb426` and `7d7e182` have one-line messages with no *why*
  (integration rule 2), and no entry in any track log (rule 6).
- Both edit C's `overview.css` / `accounts.css` together with A's
  `_variables.css`.
- `4fdb218` (logos) edits three of C's files, also with a one-line message.
- `7d7e182` moves `--s-4` from 16 to 10px, but `_variables.css:199` still
  says "--s-4 (16) is the page gutter, always". Seven `padding: var(--s-4)`
  rules shrank with it: card, sheet and panel insets.
- **Fix:**
  - Say which track owns these.
  - Log them.
  - Fix the stale token comment.
  - Ask C before touching accounts or overview.

### Low

- **The full account number is cacheable** (C, `d259c5f`). It is stored
  encrypted, and only `GET /api/accounts/{id}` returns it, which is right.
  But that response goes out with Laravel's default
  `Cache-Control: no-cache, private`, so it can sit in the browser's HTTP
  cache. Send `no-store` there, or on every `/api` response (A).
  This also reverses the older rule that "a full account number belongs in
  the vault", so record the decision in `context.md`.
- **Hex outside the tokens** (locked rule 2):
  - `accounts.css:131,246` (`4fdb218`).
  - `brand.js:24-33` GROUNDS (C).
  - `bank-logo.js:117,127,133` (A).
  - `_data.css:464` (`96dab84`, A).
  - The form's colour swatch is the token of the same name, while the card
    is printed in the GROUNDS hex, so the colour picked is not the colour
    shown.
  - `inkOn()` is duplicated in `bank-logo.js` and `brand.js`.
- **A band under the Ledger's header** (B or A). A 20px strip of page ground
  sits between the header and the period toolbar, in both themes.
  `7d7e182` closed it on Home only.
- **Poisha only on one side** (B). The Ledger header shows
  OUT −৳44,860**.28** but IN +৳86,348. Day totals drop the ৳ that their rows
  carry, and Home says ৳44,860 for the same month.
- **The day-by-day line falls** (C, `month-page.js:106`). A mirror is dated
  on the day of the fix, so September's line climbs to ৳57.4k on the 27th
  and drops to ৳44.9k on the 28th. The code comment says the mirror nets
  inside its day, which is true only for a same-day fix. A cumulative line
  that falls reads as a bug. Plot the mirror on its original's day when both
  are in the month, or mark the dip "corrected".
- **Zero rows** (C). "Was it worth it" shows the Important and Avoidable
  rows at ৳0 / 0%. "Six months" shows three months with that title.
- **Demo accounts show no logos** (C, AccountSeeder; B, DemoData).
  "Bank account", "DPS", "Payoneer" and "LankaBangla" match no institution,
  so they show generic glyphs. bKash also sits at −৳2,060, which a wallet
  cannot do. Seed real banks (City, DBBL) and top up bKash.
- **Logos are cached for a year** (A, `.htaccess:241`). PNGs are
  `immutable, max-age=31536000`, so a corrected logo under the same filename
  never reaches a phone that already has the old one. Version the filename,
  or give `assets/banks/` a shorter lifetime.
- **Budgets hide failures** (C, `bf8f7c8`, `budgets/backend/api.js:37`).
  Any non-auth failure (a 500, a 422) comes back as "no budgets, offline",
  so the rings vanish with no error. Separately, `PUT /budgets/{id}` accepts
  an archived category that `month()` never lists.
- **The account page's "In this month"** (C, `detail-page.js:161`) counts a
  correction's mirror as money in, and its original as money out.
- **"Remove demo data"** (A, settings) sits on a grey band left over from a
  container. It looks unfinished.
- **Still open from round 5:**
  - `spark.js:93,148` still write `style=""`.
  - Static `style=""` remains in `login.html:70`, `vault/list.html:74`, the
    four stubs and `ledger/list.html:110-112`.
  - `serve.php` still sends no CSP.
  - Compact `−৳0` is still printed, and is now also red.
  - The "Reaching hand" hint is still stale (`settings/index.html:124`).

### Visual, as a picky phone user

- **Home.** It is tight and reads in one pass. In, Saved and Out are green,
  violet and red, and bKash shows its logo. But the legend dots are grey
  (M2). "Where it went" amounts are in ink, not red. The third account tile
  is cut to "Bank accou…", which is a fair scroll hint.
- **Ledger.** Red minus and green plus are correct throughout, and the
  account logos in the sub-line look crafted. It is too airy for a list (M6),
  and the Corrected chip is green, which reads as income.
- **Accounts.** The cards in bank colours are the best screen in the app.
  Each card is about 224px tall, so six accounts take 1.5 screens. Offer a
  compact list toggle. Only bKash has a real logo in the demo (Low).
- **Month.** The charts are clean, and tap-to-read works. The red and green
  rule is missing (M3), and the Could-have-kept figure is wrong (H2).
- **Entry sheet (with data).** This is the most polished thing in the app:
  the balance before and after with a strikethrough, circles for the chips,
  and the "Again?" strip. The chip glyphs are small (16px in a 48px circle),
  and "Subscripti…" is cut.
- **Stubs.** Business, Investments, Budgets and Categories are still "not
  built yet" pages, against locked rule 6. Budgets is now in progress on
  the server.

---

## Round 5 — `a58fa8f..df932b3` (8 commits: A ×5, B ×2, C ×1)

**What was run**

- 360×780 screenshots of all ten screens, in both themes, compared with
  `docs/visual-v2/shots/`.
- `php artisan test`: **139 passed, 522 assertions**.
- `test-money`: 92 assertions. `check-pages`: ok. `check-sprite`: ok.
- `tools/run-browser-tests.sh`, all four harnesses:
  - Static server: vault 51, settings 13, ledger 33, all passed.
  - Against `serve.php`: vault 19, settings 13, auth 19, all passed.

**Identity.** Every commit in this batch is authored and committed as
`Md Imran Hossain`. They predate `69ef8ea`, so per the owner's correction the
`rabitgulf` author with `me.imran.personal` committer is not flagged.

**Ownership.** No track edited another's files. One borderline case: A's
`df932b3` moves fonts out of `docs/visual-v2/f/` and edits
`docs/visual-v2/v2.css`, which is the director's mock. That is harmless, but it
is worth telling the director.

**Closed from earlier rounds**

- Round 3 High, today's row hidden. Fixed by `4368832`: each day is its own
  `<li>`, and the card clips with `overflow: clip`. After a save, "local bazar"
  shows under TODAY in both themes.
- Round 2 Medium, −৳0. Fixed by `5f11c2b` for the list form.
- Round 1 Low, `tests/Unit`. Fixed by `5f11c2b`.
- Round 2 visual 1, the ৳ reading as "b". Fixed by `df932b3`, which draws ৳ in
  its own `Hisab Taka` face at the digits' weight. At hero size it now reads as
  taka.

### High: the production CSP strips every inline `style="…"` the JS writes. Owners: C (Home), A (`spark.js`)

- `.htaccess:288` sends `style-src 'self'` with no `'unsafe-inline'`. That
  policy applies to style **attributes** as well as `<style>` blocks.
- Home's category bar builds its bands as
  `<i style="--seg-share:…;--seg-color:…">`
  (`modules/overview/overview-page.js:332`, `:335`). `spark.js:93` and `:148`
  build bars the same way. On the live site every band loses its width and
  colour, so "Where it went" renders as an empty or equal-width bar.
- Local screenshots cannot show this, because `tools/serve.php` and
  `python -m http.server` send no CSP.
- **Checked:** a two-line page served locally with the same policy in headless
  Chrome. An `innerHTML` element with `style="width:37px"` computed as
  **`auto`**, while `el.style.setProperty('width', '41px')` computed as
  **41px**.
- **Fix:** write the variables with `el.style.setProperty('--seg-share', …)`
  after inserting the markup. CSSOM writes are allowed under the policy.
- The same applies to the static `style="…"` attributes in `login.html:70`,
  `vault/list.html:74`, the stub pages and the ledger skeletons. Move those into
  classes.
- **Also for A:** make `serve.php` send the same CSP as `.htaccess`, so
  screenshots show what production shows.

### Medium: a correction made offline never reaches the server. Owner: B (B9)

- `155c2a2` correctly stops the double-post. But in `update()`
  (`ledger/backend/api.js`), a PATCH that fails with `reason: 'offline'` keeps
  the local mirror and replacement and returns ok, and nothing queues the PATCH.
- The device then shows a corrected entry that the server never hears about.
  The next `memo = null` read from the server silently brings the original
  back.
- It needs the outbox (B9), or refusing corrections while offline until B9
  lands.

### Low: compact figures still print −৳0. Owner: A

- `formatMoney(-1, 'BDT', {compact: true, symbol: true})` returns `−৳0`. The
  compact path takes its sign from `parts()` in `'always'` mode, where one
  poisha still counts as shown.
- It is rare in practice, but it is the same bug in the one path `5f11c2b` did
  not cover.

### Low: the vault harness quietly runs fewer checks with a backend. Owner: A

- `test-vault-browser.html` reports **51** assertions on a static server and
  **19** against `serve.php`. Both say "passed".
- A run that silently skips 32 checks looks like full coverage. Print "N
  skipped (server mode)", or run both modes in `run-browser-tests.sh`.

### Low: the "Reaching hand" setting describes a button that no longer moves. Owner: A

- The hint at `modules/settings/index.html:124` says "Moves the compose button
  to the reachable side". Since `a58fa8f` the `+` is centred in the tab bar.
- Either make the setting mirror the pad's `⌫` column and chip grid, as §3.6
  says, or drop it.

### Visual, compared with `docs/visual-v2/shots`

- **Home (C).** It is now close to `home-night.png`:
  - The "Left to spend" hero, the labelled In / Saved / Out row, Today, the
    account strip and "Where it went" are all there.
  - The marigold `+` notch matches the mock, and the day theme's warm paper
    reads well.
  - The differences at `df932b3`:
    1. The header Out/In buttons were still there. Fixed later by `29ff132` /
       `45ea669`.
    2. The account strip started at x=0 with no gutter. Fixed later by
       `deff71b`.
    3. The category bar used the old cyan, pink and green, not the mock's muted
       tints. Fixed later by `6470ba9`.
    4. The hero shows `.72` poisha. The mock hides them at hero size, and I
       would too.
    5. A 48px "Hisab Home" header sits above a month line the mock uses as its
       header.
- **Ledger (B).** Still the v1 layout:
  - The grey month box and the edge-to-edge filter chips remain.
  - Every row has the same arrow tile, and the day headings are heavy bands.
  - Against `ledger-night.png` (plain day labels, category glyphs, one
    segmented filter, totals in one line), this is the screen furthest from
    the mock. It is B5/B6 plus the glyphs from `db2595d`.
- **Vault (A).** It now has the tab bar. But its accent is still the old
  cyan/teal (icon tile, "Create the vault" button) on a marigold app, and the
  password placeholder still indents for an icon that is not there.
- **Settings (A).** The grouped cards read well, and Sign out is reachable.

---

## Round 4 — `18e1b3b` (Track C: convert each row in the cockpit), `c47d5ab` (Track B: convert each row in the ledger summary)

Both commits answer round 1's High. Authors and emails are correct, with no AI
attribution. Each track kept to its own files: B *uses* C's
`Hisab\Fx\Services\Converter` and does not edit it. `php artisan test` shows
**136 passed, 504 assertions**.

The fix was checked against the API on the demo data:

| | `/api/ledger/summary` | `/api/finance/{month}` | by hand |
|---|---|---|---|
| Aug income | 14,263,800 | 14,263,800 | ৳87,513 + USD 450 × 122.5 = ৳1,42,638 ✓ |
| Sep expense | 4,377,983 | 4,377,983 | includes USD 12.99 at the row's snapshot 122.5, matching the Ledger's own OUT tile ✓ |
| Aug, `?currency=USD` | — | deposit 24,490 | ৳30,000 / 122.5 = $244.90 ✓ |
| `?book=persnal` | — | **422 "No such book."** ✓ | |

The round 1 High is **closed**. The round 1 Medium "second engine inside the
cockpit" is **closed** as well: carry, archive, insights, leak and quality now
all go through `amount()`/`signed()`. As a bonus, C found and fixed the carry
replay subtracting both legs of a two-leg deposit.

### Medium: the snapshot is trusted without checking its pair. Owner: B

- `modules/ledger/backend/Services/LedgerWriter.php:325-352` `snapshotRate()`
  copies the rate of **any** `fx_rate_id` the client sends, as long as it is
  the owner's or a seed row. It never checks that the rate's `base` is the
  row's currency and its `quote` is the account's.
- Both converters now treat the snapshot as "exactly this pair"
  (`Converter::convert()` with `$snapshot`). So a client that sends the
  BDT/USD row, or an AED/BDT row for a USD charge, gets a rate stored that
  converts by the wrong factor forever. Nothing downstream can detect it.
- **Fix:** in `snapshotRate()`, require `base = transaction.currency` and
  `quote = account currency` (or store the inverse when only the other
  direction matches), and refuse with a 422 otherwise. Add a test that posts a
  mismatched `fx_rate_id`.

### Low: two names for "left out for want of a rate". Owners: B and C

- The ledger summary returns `unconvertible` (`BalanceSheet.php`). The cockpit
  returns `unconverted` (`MonthCockpit.php`). The client `summary()` in
  `ledger/backend/api.js` uses `unconvertible`.
- The same flag has two spellings on the two endpoints that are meant to agree.
  Settle on one before a screen reads either.

### Low: `MonthCockpit` is now stateful, and `carry()` is public. Owner: C

- `begin()` sets `$this->fx` and `$this->currency`, and `amount()` depends on
  them. A caller that uses the public `carry()` without going through `month()`
  or `archive()` gets `$this->fx === null`. Every foreign-currency row then
  converts to `null`, counts as 0, and is flagged unconverted, with no error.
- Make `carry()` private, or have it call `begin()` itself.

### Low: a hard-coded minor-unit fallback. Owner: C

- `Converter::convert()` uses `$this->minor[$to] ?? 2`. The currency foreign
  key makes an unknown code unlikely, but CONVENTIONS.md says the minor unit
  "comes from `currencies.minor_unit`, never from a constant".
- Return `null` (not convertible) when the code is missing.

### Still open from earlier rounds

- **Round 1 Medium, `kept_minor`:** it is still `income − expense` in the
  cockpit and `income − expense − held` in the client summary. C2 builds on
  this next.
- **Round 1 Low, `tests/Unit`:** it is still missing from git, so
  `artisan test` fails in a clean checkout (A).
- **Round 2 Medium, minus zero:** A has not fixed it.
- **Round 3 High, today's row hidden:** B has not fixed it.

### Screens

Both commits are server-only and change no screen. Home and the Ledger read
the client-side summary, which already converted, so their figures do not
move. The server now agrees with them.

---

## Round 3 — `5b8c310` (Track B: type the amount on a pad in the sheet)

Author and email are correct, with no AI attribution, and every file touched
is inside Track B's ownership. This is the biggest improvement in the app so
far. The sheet now opens on a pad, Save sits in the thumb's corner, and the
system keyboard never appears. Driven in headless Chrome at 360: `+` → 1 2 0
+ 4 5 . 5 5 5 → Save stored **`amount_minor` 16555, BDT, expense**. The third
decimal was refused as designed, and the toast read "Added ৳165.55".

The numpad maths were checked in node: `12.999` → 12.99, `005` → 5,
`120+45` → 16500, `.5` → 50, and 13 nines are capped at 12 whole digits. KWD
keeps 3 places, and pressing `+` then `-` replaces the operator rather than
stacking it. The whole path is in integers.

### High: the entry you just added cannot be seen. Owner: B (B5)

- After saving, the Ledger shows a **TODAY −165.55** heading with **no row
  under it** (`r3/saved`). The row is hidden behind the stacked sticky day
  headers, and a ghost strip at the top of the list shows a clipped icon.
- DIRECTION.md §1 already names this bug. B1 now makes it the first thing the
  owner sees after every save. It confirms nothing and looks like a failed
  save.
- Pull B5's sticky-header fix forward, ahead of B2/B3.

### Medium: the fast path records "Uncategorised · Discretionary". Owner: B (B2)

- The quick-add path is `+`, digits, Save. With category moved behind
  **Details**, that path now stores `category_label` **null** and `necessity`
  **3** (Discretionary). Checked in the database for the entry above.
- The old form at least showed the dropdown, so the fast path now produces
  unusable data more reliably than before. It is fine as a step, but B2's
  category chips, where a tap saves, have to land before this is used for
  real. Until then, consider showing the top four categories as chips above
  the pad, with no ranking endpoint needed yet.

### Medium: the draft is still never written. Owner: B (B4)

- `modules/ledger/entry-sheet.js:120` calls `saveDraft(ctx)` from `onClose`.
  `shared/js/components/sheet.js:88` has already removed the sheet by then, so
  the guard `if (!form.isConnected …)` at `entry-sheet.js:633` returns every
  time.
- This bug is unchanged, as recorded in STATUS. It is logged again because the
  new sheet makes the amount the only thing typed, and that is exactly what a
  phone call now loses.

### Low: the currency on the sheet is still "BDT". Owner: B

- The amount display prefixes **BDT** in mono (`r3/sheet-open`), while every
  figure elsewhere now shows ৳ (A1).
- Show ৳ for the home currency, still as a button, so tapping it opens the
  currency picker. Keep the code for any other currency.

### Low: JPY "1.5" from a hardware keyboard becomes 15. Owner: B

- With `places = 0` the `.` is refused but the next digit is still appended,
  so `1` `.` `5` typed on a hardware keyboard gives ¥15. The on-screen `.` is
  disabled for a zero-decimal currency, so only a keyboard can reach this.
- After a refused `.`, refuse the digit that follows too, or flash the display
  to show the key was ignored.

### Visual

1. **The pad is good.**
   - Digits are in the display face, the operator column is a step darker,
     and Save is the only accent. The hierarchy is right.
   - It already has a `:active` press state (a .97 scale plus a wash) and
     uses the token radius `--r-2`, so a still screenshot undersells it.
   - The one step from competent to crafted: add a short haptic on key press
     for Android (A8's helper, off by default) and a quick tick on the
     `= ৳165` result line when the sum changes.
2. **The title bar costs 70px of the sheet for the words "New entry".**
   - The Out/In/Save/Move segment already says what the sheet is. Fold the
     title into the drag handle row, or drop it and keep the ×, and give the
     70px to the amount.
3. **Details opens upward over the amount.**
   - The amount scrolls up to the top of the sheet. The "Was it worth it?"
     chips wrap and cut **Avoidable** at the scroll edge (`r3/sheet-details`).
   - Keep the amount pinned, and put the four necessity choices on a single
     4-up segmented row as the type control does. They fit at 360 with the
     short labels (Must / Need / Want / Waste, or similar; the owner should
     choose the words).
4. **The empty amount shows a huge grey `0`.**
   - It is the largest thing on screen, and it is a placeholder. Use the same
     size at `--ink-4`, with a blinking caret after it (`@keyframes` on
     opacity, off under reduced motion), so the display reads as "type here"
     rather than "you have ৳0".

---

## Round 2 — `0b934dc` (Track A: make money fit a 360px phone)

Author and email are correct, with no AI attribution. `test-money.mjs` passes
88 assertions. `formatMoneyHTML` still works in integers only (`parts()`
divides and takes the remainder, never `abs / factor`), and the one symbol that
comes from the registry is escaped. The ৳-without-a-code rule is right and
already makes Accounts and the Ledger calmer. Every page now carries its own
screen height at 360, with no `OVERFLOW` in shoot-mobile output.

### Medium: a figure that rounds to zero keeps its minus sign. Owner: A

- `shared/js/core/money.js` `parts()` takes `negative` from the unrounded
  value, and then `minor: 'never'` rounds the whole part.
- Checked with node: `formatMoneyHTML(-40, 'BDT', {minor:'never'})` gives
  **−৳0**, and so do −49 and −1 poisha. `formatMoney(-1, 'BDT', {compact:true,
  symbol:true})` gives **−৳0** as well.
- A reversed ৳0.40 rounding line, or a day that nets to a few poisha, would
  read as "minus zero taka".
- **Fix:** take the sign from the rounded result (`whole === 0 && rest === 0`
  means no sign), and add a test for it.

### Medium: A1 acceptance is not met on the Overview. Owners: A, then C

- At 360 in the dark theme, the Overview's "This month" strip still cuts the
  third tile: **`৳43,61`** for Spent (`r2/index-1`). The tile row is still
  wider than the screen.
- The `15cqi` container scaling fixed the figure inside each tile, but not the
  strip. The strip is C2's to replace. Until then, A1's check "no figure is cut
  on Overview" fails.
- Either A widens the check to "no figure cut inside its own box", or C lands
  C2 with the three figures on one row.

### Medium: "Cash in hand" is still cut on Accounts, and hides its Default badge. Owner: C (markup), with A for `.row`

- The title element holds "Cash in hand" plus a **Default** badge. The probe
  gives `scrollWidth 148 > clientWidth 147`, so the badge is ellipsised away and
  the owner sees `Cash in hand …`. That is a 12-character name, well under A1's
  18.
- Move the badge out of the ellipsis box (onto the meta line, or as its own
  `flex: none` element), so the name keeps its width and the badge survives.

### Low: two money styles on one screen. Owner: C

- The Overview's insight cards still print **"BDT 5,000.00"** and
  **"BDT 18,000.00"** (`r2/index-2`), directly under a hero that says
  `৳2,69,513`.
- `overview-page.js` `drawInsights()` builds these strings itself. It should
  call `moneyLabel()`.

### Low: ledger day totals do not match their rows. Owner: B

- The day heading prints **`-301`** with an ASCII hyphen, no ৳, and a heavier
  weight than the row amounts under it (`−৳294`).
- It reads as a different kind of number from the rows it totals. Use
  `formatMoneyHTML(..., {code:false})` so the U+2212 minus and the weight
  match, or drop the day total on days with a single entry (B5).

### Visual (aesthetics) — what makes it look generated rather than crafted

1. **The ৳ reads as a lowercase "b" at small sizes.**
   - `.money__sym` sets it in Noto Sans Bengali Regular at 0.86em and 66%
     opacity. Next to Space Grotesk Medium digits it is thinner, smaller and
     lighter than the numbers.
   - In the hero chips (`+৳87.9k`) and on list rows (`৳12,615`), it looks like
     `b87.9k`.
   - **Fix (A):** set the symbol at the digits' weight, at full opacity in the
     figure's colour, at about 0.9em, and nudge it up with
     `vertical-align: 0.02em`. Better still, use a Bengali face that has real
     weights (see RESEARCH.md "Fonts"), so a semibold figure gets a semibold ৳.
2. **Three number faces on one screen.**
   - The hero is in Space Grotesk. SPENDABLE and HELD directly under it are in
     Plex Mono. The stat tiles are in Space Grotesk, the account rows are in
     mono, and the category legend is in mono.
   - The rule "display face for large figures, mono for columns" is right, but
     the hero's own sub-figures are not a column. **Fix (A/C):** use the
     display face for every figure in a hero or tile, and mono only in lists.
3. **Chip rows touch the screen edge.**
   - The Ledger's filter chips start at x=0: "All" sits against the left edge
     with no gutter, while everything else on the page has a 16px gutter.
   - A scrolling chip row should keep its first chip on the page gutter
     (`padding-inline: var(--s-4)` on the scroller plus `scroll-padding`).
     Owner: B (B6 replaces the row anyway).
4. **The month control still looks like selected text** (a grey filled box).
   This is A6, and it is repeated here because it is the first thing the eye
   hits on the Ledger.
5. **Every row's icon is the same coral arrow tile**, so the column carries no
   information and makes the list look like a template. This is B5's category
   glyph plus tint. It is the single biggest move from "generated" to
   "crafted" on the Ledger.
6. **Day theme:** the hero is a near-black card on a pale page. That is heavy
   but deliberate and reads well. The rest of the light theme is clean.
   Coral on white (`−৳294`) is fine for contrast at that size, and should be
   checked at small sizes once B5 shrinks the row text.

---

## Round 1 — `ea255c8` (Track C: one book at a time in the month cockpit)

The book split is right, and it fixes the ৳259,473 vs ৳88,611 disagreement for
BDT-only months. Author and email are correct, and there is no AI attribution.
`php artisan test` shows 129 passed, 484 assertions.

### High: server month totals add USD cents to BDT poisha. Owner: B (C inherits it)

- `modules/ledger/backend/Services/BalanceSheet.php:113-120` sums `amount_minor`
  over every counted row whatever its `currency`. The comment says "the client
  converts using the snapshot", but a sum that has already mixed currencies
  cannot be converted afterwards.
- In the demo data, August's personal income includes an Upwork payout of
  **USD 450.00** (`amount_minor` 45000, `currency` USD). `/api/ledger/summary`
  and, since `ea255c8`, `/api/finance/2026-08` both report income
  **8,796,300 poisha**. That is ৳87,513 of BDT plus "৳450" that is really
  $450, about ৳55,000 at the demo rate, so it is roughly a 120× under-count of
  that row. September's USD 12.99 expense is the same bug in reverse.
- `ea255c8` makes this worse in one way. `MonthCockpit::ledgerTotals()`
  (`modules/accounts/backend/Services/MonthCockpit.php`, `ledgerTotals`) now
  takes these figures from `BalanceSheet::summary()`, and the new test pins the
  cockpit **equal to** the summary. Both are wrong the same way, and the test
  now guards the wrong number.
- **Fix (B):** convert each row to the book's display currency using its
  `fx_rate` snapshot, or the rate as of `occurred_on` when there is none, the
  way `ledger/backend/api.js` `summary()` already does with `convertAndSum()`.
  Otherwise return totals per currency and never a single `*_minor` over mixed
  currencies. Then add a test with one USD row. **(C)** follows by adding a
  USD row to the "cockpit equals ledger" test.

### High: Home and the cockpit still disagree for any month with a foreign-currency row. Owner: C

- C1's acceptance says Home and the cockpit agree. Home does not read the
  server summary's total: `modules/ledger/backend/api.js:437` `summary()`
  converts row by row on the client. So for August, Home computes about ৳142k of
  income (from the code path, at the seed rate) and the cockpit shows ৳87,963. The test cannot see this, because it
  compares server with server.
- This goes away once the High above is fixed on the server and the client
  `summary()` reads the server's converted figure, not its own. Until then, C1
  is not met for months that hold USD.

### Medium: `kept_minor` means two different things. Owner: C, agree the name with B

- The cockpit sets `kept = income − expense`, with a deposit counted as kept
  (`MonthCockpit.php` `ledgerTotals`, and endpoints.md "The month").
- The client summary that Home reads sets
  `kept_minor = income − expense − held` (`ledger/backend/api.js:468`), which
  is the cockpit's `net_minor`.
- Same field name, different quantity, on the two engines that C1 exists to
  unify. C2 is about to build "left to spend" from one of them. Pick one
  meaning, and rename the other (`in_hand_minor` or `spendable_minor`).

### Medium: the cockpit still has a second engine. Owner: C

- The class comment says the month's totals come only from the ledger, so "the
  two screens cannot drift". But `carry()`, `archive()` and the month-on-month
  insight (`$this->totals($this->rowsFor(...))` in `insights()`) still sum rows
  through the cockpit's own private `totals()` (`MonthCockpit.php:564`).
- The opening balance, the archive's per-month figures and "spending up 12%"
  are therefore still computed separately from the month's headline figures.
  They agree today only because both copies share the same flaw.
- Route them through `BalanceSheet::summary()` too, or reword the comment so it
  claims less.

### Low: `?book=` accepts any string. Owner: C

- `FinanceController::book()` validates only `string|max:32`. `?book=persnal`
  returns a month of zeros with a 200, which looks like "no data" rather than a
  typo. It is scoped to `user_id`, so nothing leaks.
- Validate it against the books that exist (`in:personal,business`, or the
  owner's distinct books), and return 422 otherwise.

### Low: a fresh checkout cannot run `artisan test`. Owner: A

- `phpunit.xml` names `tests/Unit`, which is not in git because an empty
  directory is not tracked. From a clean worktree, `php artisan test` stops with
  *Test directory "…/tests/Unit" not found* before running anything.
- Commit a `tests/Unit/.gitkeep`, or drop the Unit suite from `phpunit.xml`.

### Screens

Nothing visible changed in this batch, since it is backend only. Baseline
shots of Home and the Ledger at `c0092c3` were taken for comparison.

---

## A note for anyone reviewing from a worktree

**Do not junction or symlink `vendor/` into a second worktree.**
`vendor/composer/autoload_psr4.php` resolves `$baseDir` through the real path,
so every `Hisab\*` module class loads from the tree the link points at, not
from the worktree. The server then runs the *main* tree's backend against the
worktree's frontend, and a review sees stale PHP without any error. Copy
`vendor/` and run `composer dump-autoload`. This is how round 1 first appeared
to show `ea255c8` "not working".
