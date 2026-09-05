# Status

What is built, what is not, and what has actually been executed as opposed to
merely written. `CONVENTIONS.md` requires this file: authored is not verified,
and a gap that is written down is a decision rather than an oversight.

Last updated: 2026-09-05

---

## Executed

Things that have been run, with the result.

| | |
|---|---|
| `node tools/test-money.mjs` | **66 assertions pass.** Found a parser bug where `12.999` read as 12,999 — a hundredfold error on an ordinary typo. |
| `node tools/test-crypto.mjs` | **41 assertions pass.** Round trips, tamper detection, wrong-password rejection, IV uniqueness, password rotation. KDF measured at 443 ms for 600,000 iterations on the authoring machine. |
| `python tools/check-sprite.py` | 57 symbols, all referenced names resolve. |
| `python tools/check-pages.py` | 4 pages, pre-paint block identical, CSP hash matches `.htaccess`. |
| `tools/qa-viewport.html` | **15/15 pass** — no horizontal overflow on any of the three screens at 360 / 390 / 414 / 768 / 1280. |
| Headless Chrome render | Overview, Ledger and Accounts all load with an empty console. |

## Not executed

**No PHP in this repository has ever run.** There is no PHP in this repository
yet at all, which makes that easy to say honestly today; it will stop being
trivially true the moment the Laravel layer is authored, and this section will
say so then.

The authoring machine has PHP 8.0.30 (XAMPP) and no Composer. Laravel 12 needs
PHP 8.2+. When the backend is written it will be validated for syntax shape,
PSR-4 path agreement and unused imports — not for behaviour — until it runs on a
server with the right version.

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

### Vault
Cryptography only. `crypto.js` and `SECURITY.md` are complete and tested. **There
is no vault user interface yet** — the tab exists in the navigation and leads
nowhere.

### Deployment
`.htaccess` with HTTPS enforcement, file protection, MIME types, caching and a
hash-based CSP. `docs/DEPLOY-HOSTINGER.md`. `404.html`.

---

## Not built

Listed so a gap does not look like an oversight later.

### Next
1. **Vault screens** — unlock, list, entry detail, reveal, copy, auto-lock
2. **Export and import** — the only way to move a Phase 1 ledger off a device,
   and the reason it comes before the backend rather than after
3. **Settings** — theme, density, currency, hand, rate entry, data management

### After that
4. **Reports** — the Insights tab is in the navigation and leads nowhere
5. **Business books** — separate ledgers per business, per-business profit
6. **Investments** — holdings, cost basis, partner splits, returns
7. **Budgets** — per-category budgets, savings goals, month close
8. **Categories screen** — the module works; there is no UI to edit them
9. **Laravel backend** — every module's `Controllers/`, `Models/`, `Services/`,
   `Requests/`, `Migrations/` are empty directories today
10. **FastAPI analytics sidecar** — forecasting and spend-pattern work

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
- **Insights and Vault are in the tab bar and lead nowhere.** They are wired into
  the navigation ahead of the screens existing.
