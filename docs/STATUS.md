# Status

What is built, what is not, and what has actually been executed as opposed to
merely written. `CONVENTIONS.md` requires this file: authored is not verified,
and a gap that is written down is a decision rather than an oversight.

Last updated: 2026-09-08

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
| `php artisan test` | **26 tests, 81 assertions pass.** The shape of the backend: /api/ping answers in the documented envelope, the site root is not served by Laravel, an unknown API route fails as JSON rather than HTML. |
| `php artisan migrate` | Laravel's own three migrations run against **real MySQL** (MariaDB 10.4), not only the SQLite the test suite uses. |
| FX on both drivers | Seeder is idempotent (10 currencies / 10 rates after three runs) and KWD lands at `minor_unit` 3, JPY at 0. The rate write path was then re-run against **real MySQL** as well, because the bug found here only appeared on SQLite. |
| Auth over real HTTP | The whole flow against `artisan serve`: session 200 while signed out, `XSRF-TOKEN` issued, **POST without the CSRF header rejected 419**, POST with it 200, session persists, logout 204, session cleared, limiter cutting in. The session cookie carries `httponly; samesite=lax`. Done over HTTP because Laravel skips CSRF inside the test suite, so a feature test would pass whether the middleware were wired or not. |
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

### FX (backend)
`currencies` and `fx_rates`. The currency table is the load-bearing one: every
amount in the product is an integer in a minor unit read from it, and it is 3
for KWD and 0 for JPY. Seeded from `modules/fx/data/rates.json` — the same file
the frontend fetches, rather than a second copy of the list. Rates keep their
history, are entered by hand rather than pulled from a provider, and a rate the
owner entered always beats the estimate shipped with the install.

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
1. **The login screen**, and pointing a module's `api.js` at the API. The auth
   endpoints exist and are tested; nothing in the UI calls them yet
2. **Export and import** — the only way to move a Phase 1 ledger off a device,
   and the reason it comes before the backend rather than after
3. **Settings** — theme, density, currency, hand, rate entry, data management

### After that
3. **Reports** — the Insights tab now reaches a real page that states the
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
- **Insights is a tab with no feature behind it.** It reaches a real page that
  says so, rather than a 404, but there are no reports yet. Every other primary
  tab is a working screen.
