# Status

What is built, what is not, and what has actually been executed as opposed to
merely written. `CONVENTIONS.md` requires this file: authored is not verified,
and a gap that is written down is a decision rather than an oversight.

Last updated: 2026-09-10

---

## Executed

Things that have been run, with the result.

| | |
|---|---|
| `node tools/test-money.mjs` | **66 assertions pass.** Found a parser bug where `12.999` read as 12,999 — a hundredfold error on an ordinary typo. |
| `node tools/test-crypto.mjs` | **41 assertions pass.** Round trips, tamper detection, wrong-password rejection, IV uniqueness, password rotation. KDF measured at 443 ms for 600,000 iterations on the authoring machine. |
| `python tools/check-sprite.py` | 57 symbols, all referenced names resolve. |
| `python tools/check-pages.py` | 6 pages, pre-paint block identical, CSP hash matches `.htaccess`. |
| `tools/qa-viewport.html` | **15/15 pass** — no horizontal overflow on any of the three screens at 360 / 390 / 414 / 768 / 1280. |
| Headless Chrome render | Overview, Ledger and Accounts all load with an empty console. |
| `php artisan test` | **86 tests, 276 assertions pass.** The shape of the backend: /api/ping answers in the documented envelope, the site root is not served by Laravel, an unknown API route fails as JSON rather than HTML. |
| `php artisan migrate` | Laravel's own three migrations run against **real MySQL** (MariaDB 10.4), not only the SQLite the test suite uses. |
| `hisab:owner` on an unseeded database | Creating the owner on a database that had been migrated but never seeded used to fail with a foreign-key violation naming a table nobody asked about. Owner-seeding now establishes the reference data it needs; verified against MySQL from `migrate:fresh` with no `db:seed`. |
| FX on both drivers | Seeder is idempotent (10 currencies / 10 rates after three runs) and KWD lands at `minor_unit` 3, JPY at 0. The rate write path was then re-run against **real MySQL** as well, because the bug found here only appeared on SQLite. |
| `tools/run-browser-tests.sh` | **51 + 13 + 16 + 14 assertions.** The ledger harness covers the LOCAL half of "recorded is final" — `api.js` has to reverse exactly as the server does, or the two hold different histories of the same money. |
| Browser harnesses, earlier | **51 + 13 + 14 assertions.** The settings harness exists because `--dump-dom` cannot answer its question: the page restores a preference by setting `input.checked`, which is a property, so a DOM dump looks identical whether the selector matched or not. |
| Auth in a browser | **14 assertions pass** against a real backend on one origin (`tools/serve.php`). The auth harness exists because neither the PHP suite nor curl runs `session.js` — the priming GET that fetches the CSRF cookie can only fail in a browser. |
| Signing in, end to end | Guard verified in headless Chrome: signed out **with** a server present redirects to the login screen and leaks no ledger markup; **without** one, the app opens on the Overview exactly as in Phase 1. |
| Auth over real HTTP | The whole flow against `artisan serve`: session 200 while signed out, `XSRF-TOKEN` issued, **POST without the CSRF header rejected 419**, POST with it 200, session persists, logout 204, session cleared, limiter cutting in. The session cookie carries `httponly; samesite=lax`. Done over HTTP because Laravel skips CSRF inside the test suite, so a feature test would pass whether the middleware were wired or not. |
| The rail's four dead links | **40 assertions pass.** Business, Investments, Budgets and Categories 404'd — on `python -m http.server` that is an unstyled "Error code: 404" page, which is the white screen they were reported as. Each now mounts the shell, marks itself current in the rail, and its CTA lands on a real screen; checked at 360 / 390 / 768 / 1280 with no overflow and a clean console. `check-pages.py` reports 13 pages with the pre-paint block still byte-identical and the CSP hash unchanged. |
| Navigation, by clicking | Every tab and rail link driven by `click()` rather than by navigating to a URL, because a direct load cannot fail the way a link can. All ten destinations mount. Also confirmed the failure under `file://`: **zero tabs, no header, on every page** — module imports are blocked, so nothing runs. That is the other white screen, and it is why README says to serve the folder. |
| Out / In in the header | **21 assertions pass** in headless Chrome across Ledger and Overview: the pressed button's type arrives in the sheet, the saved row carries the matching `type` and `direction`, and the bare FAB still asks for no type. Measured at 320 / 360 / 390 / 414 / 768 / 1280 — no header overflow, 44px tap targets, and the title ellipsises rather than pushes at 320. Rendered in both themes. |
| The entry draft | **Never written.** `saveDraft()` begins `if (!form.isConnected) return;` and `openSheet`'s `close()` calls `sheet.remove()` before `onClose?.(reason)`, so the form is already detached every time. Pre-existing; found while testing the buttons above, not caused by them. |
| `tools/deploy.sh` | Exercised against a simulated server on both branches — with git, and with git hidden so it takes the tarball. Only owned paths published; `.git`, `docs/` and `tools/` do not leak; a deleted file is swept; `api/` survives; a second run is a silent no-op; two concurrent runs leave one working. |

## Not executed

**PHP now runs here.** That sentence replaces the opposite one, which stood
until 2026-09-08: the machine has PHP 8.3.33 and Composer installed to a
toolchain outside the repository, matching the server's PHP version exactly, so
the Laravel layer is executed rather than authored blind. See `context.md` §3.

What has not run is anything module-specific, because none of it is written yet:
no controllers, models, services, requests or migrations beyond Laravel's own.

**The backend has never run on the server.** It has not been deployed there at
all — `composer install`, the `.env` and the `/api` rewrite are all outstanding.
Passing locally on an identical PHP version is good evidence and is not the same
thing as having run in production.

The FastAPI analytics service has not been written or run.

---

## Built

### Foundation
- Design tokens, 11 CSS partials, night and day themes
- 57-icon hand-drawn SVG sprite, stroke-only, one weight
- Self-hosted fonts, latin + Bengali subsets, 152 KB total
- JS core: money, dates, paths, storage, event bus, HTTP seam, DOM helpers, ULIDs
- Shared components: app shell, bottom sheet, dialog, menu, toast, sparkline

### Working screens
- **Overview** — net worth split into spendable and held, month totals, category
  breakdown, generated insights, accounts, recent entries
- **Ledger** — entries grouped by day with a per-day net, type filters, search,
  the entry sheet (create, edit, delete with undo)
- **Accounts** — grouped by spendable versus held, totals, create, edit,
  archive, restore, delete when unreferenced

### Module APIs on the mock seam
`fx`, `categories`, `accounts`, `ledger` — all four return the shape documented
in `shared/backend/api-contract.md`, so swapping in Laravel changes no consumer.

### Demo data
`php artisan hisab:demo` writes a few months of plausible entries — salary,
rent, a weekly shop, transport, bills, a DPS instalment, an ATM withdrawal and a
wallet top-up — so the screens have something to show. `--fresh` clears it.

That clear is the **only true delete in the product**, and it deletes every
transaction for the owner rather than just the demo ones. It exists because the
ledger is immutable: clearing demo data the ordinary way would write a reversal
for each row and bury a real ledger under hundreds of cancelled entries. It asks
first, and it is a console command with nothing reachable from the app or API.

### Ledger records (frontend)
A row now says what it IS in the history of the money — **Corrected**,
**Reversal** or **Reversed** — with the reversal's reason beside it, and a
cancelled entry struck through and dimmed rather than hidden. A **History**
toggle in the filter bar shows the corrections alongside what stands; it is a
separate axis from the type pills, so filtering to Out and then asking for
history shows the history of the Out entries rather than starting again.

### Ledger (backend) — recorded is final
Inherited from OppTracker: **a saved entry is never altered and never deleted.**
A correction reverses the original — a mirror entry, dated today, with a reason
— and records the replacement beside it; all three rows survive and stay linked.
`DELETE` reverses too. Reversing twice is refused with 409. The list shows only
what still stands, so a corrected typo is one row rather than three, while the
totals include every row and net to the right figure.

### Ledger (backend)
The transaction record; everything else is a view over it. One row is one leg.
A transfer always writes two legs sharing a `group_id`, inside one database
transaction, and deleting or editing either one rewrites the pair — a
half-applied transfer is money that left one account and arrived nowhere. The
counting rules the contract calls easy to get wrong are each covered by a test
that states the rule: a deposit is summed **once**, on its `out` leg, and is not
an expense; a transfer is in no total at all but still moves both balances.
Category names are snapshotted onto the row so a rename cannot rewrite last
year's report. `GET /api/ledger/balances` is the only place a balance is
computed.

### Accounts (backend)
Follows the contract that was already written in
`modules/accounts/backend/endpoints.md`. The client mints the ULID and the
server re-validates it as well-formed and unused. **No balance is stored and
none is returned** — balances are derived by the ledger, so exactly one thing
computes them. A credit limit is kept only on a card, one account is default per
book, and neither the currency nor the book can be changed after creation
because both would reinterpret history rather than correct it.

### Categories (backend)
Three types — `income`, `expense`, `deposit` — and `transfer` deliberately not a
fourth. Necessity bands and payment methods are shared reference data; the
categories themselves are seeded **per owner**, so renaming one is an ordinary
row update rather than a per-user override of a shared row. Duplicate names are
refused case-insensitively within a book and type, deletion is archival except
for a row nothing has referenced, and a label with no latin letters still gets a
key because the slug falls back to the id.

### FX (backend)
`currencies` and `fx_rates`. The currency table is the load-bearing one: every
amount in the product is an integer in a minor unit read from it, and it is 3
for KWD and 0 for JPY. Seeded from `modules/fx/data/rates.json` — the same file
the frontend fetches, rather than a second copy of the list. Rates keep their
history, are entered by hand rather than pulled from a provider, and a rate the
owner entered always beats the estimate shipped with the install.

### Settings
Theme, density and reaching hand. All three setters have existed in
`shared/js/core/state.js` since the design system was built — what was missing
was any way to reach them, so the theme followed the device and nobody could
override it. Theme has **three** options rather than a switch: Day, Night, and
Follow device. The third has to be selectable, because it is the only way back
once a choice is made, and it is what the CSS expresses as
`:root:not([data-theme])`.

### Signing in (frontend)
`modules/auth/login.html`, and a session gate in `main.js` built on
`shared/js/core/session.js`. The gate recognises **three** states, not two:
there is no server (Phase 1 — no login, no gate), there is a server and nobody
is signed in (redirect), or someone is. Collapsing the first two would lock
every static deployment out of itself.

### Auth (backend)
One owner, session cookie rather than a bearer token — a token has to live where
script can read it, and that is where the vault's blob already is. CSRF on every
write, login rate-limited on the email and the IP together, a deliberately
uninformative failure that also burns the same CPU when the account does not
exist, and no registration endpoint: the owner is created by `php artisan
hisab:owner`. **There is no login screen yet** — the API is complete, the UI is
not, so nothing in the app calls it.

### Vault
Complete and tested. `crypto.js` and `SECURITY.md` cover the key hierarchy; the
screens on top of them are the lock screen, the entry list, entry detail with
reveal and copy, and the editor. Plaintext never leaves the tab, and the vault
requires HTTPS — `crypto.subtle` does not exist outside a secure context.

### Deployment
`.htaccess` with HTTPS enforcement, file protection, MIME types, caching and a
hash-based CSP. `docs/DEPLOY-HOSTINGER.md`. `404.html`.

---

## Not built

Listed so a gap does not look like an oversight later.

### Next
1. **Deploying the backend**: `composer install`, the `.env`, the `/api` rewrite
   in `.htaccess` §8, and `hisab:owner` on the server. None of it has been run
   there — everything below passes locally on the same PHP version, which is
   evidence and not the same thing
2. **The vault has no server storage.** Every `/vault/*` route 404s, and the
   module now treats that as "this server does not offer vault sync" and stays
   on the device. So the vault keeps working exactly as it does today, and is
   **not** backed up anywhere when the rest of the app is
3. **Export and import** — the only way to move a Phase 1 ledger off a device,
   and the reason it comes before the backend rather than after
9. **Settings** — theme, density, currency, hand, rate entry, data management

### After that
3. **The four remaining dead nav links are gone.** Business, Investments,
   Budgets and Categories now reach real pages that state the feature is
   unwritten, on the pattern `modules/reports/insights.html` set. Every one of
   the ten rail destinations mounts the shell; nothing in the navigation 404s.
   The features behind them are still unbuilt — items 4 to 7 below
4. **Reports** — the Insights tab now reaches a real page that states the
   feature is unwritten, rather than a 404. The reports themselves are not built
4. **Business books** — separate ledgers per business, per-business profit
5. **Investments** — holdings, cost basis, partner splits, returns
6. **Budgets** — per-category budgets, savings goals, month close
7. **Categories screen** — the module works; there is no UI to edit them
8. **Laravel backend** — every module's `Controllers/`, `Models/`, `Services/`,
   `Requests/`, `Migrations/` are empty directories today
9. **FastAPI analytics sidecar** — forecasting and spend-pattern work

### Deliberately not planned
Stated so nobody looks for them:

- Bank feed import, statement reconciliation, interest accrual — see
  `modules/accounts/backend/endpoints.md`
- Recurring transactions, receipt attachments, category splits — see
  `modules/ledger/backend/endpoints.md`
- Server-side search over vault fields, and any password recovery — see
  `modules/vault/SECURITY.md`
- Multi-user or shared accounts. One owner.

---

## Known limitations of the current build

- **Data is per-browser and does not sync.** This is Phase 1 by definition, not a
  bug, but it is the thing most likely to cause real loss. Covered in the deploy
  guide.
- **No authentication.** Anyone with the URL opens the app — and sees their own
  empty storage, not your ledger. HTTP Basic auth in hPanel is the stopgap.
- **The overflow measurements were taken against an empty ledger.** A very long
  payee or a ten-digit balance in a narrow column has not been measured at 360px
  with real data in place. A stress fixture is worth adding to `qa-viewport.html`.
- **A half-typed entry is not kept.** The entry sheet promises a draft that
  survives the app being backgrounded, and the draft is never written — see
  the row in Executed. Dismissing the sheet loses whatever was typed.
- **Insights is a tab with no feature behind it.** It reaches a real page that
  says so, rather than a 404, but there are no reports yet. Every other primary
  tab is a working screen.
