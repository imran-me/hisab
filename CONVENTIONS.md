# How code is written in Hisab

Two parts: **the locked rules** (non-negotiable), and **the conventions applied on
top of them** — the habits that keep the output consistent.

Hand this file to any developer who joins the project. It is the whole briefing.

---

## Part 1 — Locked rules

1. **Frontend = plain, structured HTML.** Semantic + ARIA. No client-side
   templating engine, no SPA framework, no build step.
2. **Styling = CSS.** Design tokens in `shared/css/partials/_variables.css` are
   the single source of truth. No hex, radius or shadow is written anywhere else.
3. **Effects, animation, motion and state-driven visuals = JS.**
4. **Backend = Laravel (PHP) for the system of record, Python for analysis and
   tooling.** Python never owns data; it reads and computes.
5. **Module-wise vertical slices.** Every feature is ONE folder holding
   everything it needs — markup, styles, JS, controllers, routes, models,
   migrations, docs.
6. **No view-only page.** Every screen either performs work or is deleted. A page
   that only renders a fixture is unfinished, not a milestone.
7. **No single-file code.** No 9,000-line `app.js`. A file does one job and its
   name says which.
8. **Mobile is the primary target.** 360px is the design width; the desktop
   layout is the enhancement, not the other way round.

### The module test

> Deleting a module folder must cleanly remove that feature and break nothing
> else.

In practice: a module is named from **exactly two** places outside its own folder
— `composer.json` (PSR-4) and `bootstrap/providers.php`. `tools/module-deps.py`
verifies it. If a third reference appears, something leaked.

### The three styling layers

| Layer | Owns |
|---|---|
| **Tokens** (`_variables.css`) | colour, type, spacing, radius, elevation, motion |
| **Shared partials** | any *named, reused component* — button, card, field, sheet |
| **Module CSS** | layout and behaviour unique to that one feature |

Promote to a shared partial on the third repeat. Never reach for an inline
`style` attribute.

---

## Part 2 — Conventions on top

### Money

- **Stored as an integer in the currency's minor unit, never a float.**
  `amount_minor` + `currency_code`, never `amount`.
  Poisha for BDT, fils for AED, cents for USD — the `currencies.minor_unit`
  column says how many decimal places to shift, because the answer is 2 for USD,
  3 for KWD and **0 for JPY**. A hardcoded `/100` is a bug waiting for the first
  dinar.
- Formatting is presentation only, produced by `formatMoney()` on the frontend
  and `Money::format()` on the backend — never by string concatenation at a call
  site.
- **Never sum two currencies.** A total across currencies exists only as a
  *converted* figure, and a converted figure always carries the rate and the
  as-of date that produced it. See `modules/fx/backend/endpoints.md`.

### The client never sets a derived figure

- Balances, running totals, profit, savings rate, share value — all recomputed
  server-side. Request classes have **no field** for them: absent, not
  validated-and-ignored, so one cannot be smuggled in by accident.
- A ledger that trusts a posted balance is a ledger that can be edited into
  anything.

### The four transaction types — and why a deposit is not an expense

Inherited from OppTracker's finance model, kept because it was right:

| Type | Meaning | Effect on "what I have left" |
|---|---|---|
| `income` | money that came in | + |
| `expense` | money that is gone | − |
| `deposit` | money moved into savings, DPS, FDR, shares | − from spendable, **still yours** |
| `transfer` | money moved between two of your own accounts | 0 net, two legs |

Counting a deposit as an expense makes saving money look like spending it and
suppresses every savings figure on the dashboard. This distinction is
load-bearing; do not collapse it into "outflow".

### Double-entry where it matters

A `transfer` writes **two legs** against one `transfer_group_id`, and the pair is
written inside a database transaction — never one leg and then the other. A
half-applied transfer is money that has left one account and arrived nowhere.

### Snapshot vs read-through — decide deliberately

| | Behaviour | Why |
|---|---|---|
| **Transaction lines** | snapshot the category name and the FX rate | renaming a category must not rewrite last year's report |
| **Account balances** | derived, never stored | a stored balance and a ledger will disagree, and then you have two truths |
| **Investment holdings** | snapshot cost basis, read-through market value | what you paid is history; what it is worth is today |
| **Vault entries** | opaque ciphertext | the server has nothing to read through to |

### Rules live in data, not in PHP

Categories, currencies, FX rates, payment methods, necessity bands, budget
periods — database tables with a seeder. A category list hardcoded in a constant
means a deployment every time your spending habits change.

### Security defaults

- **Public keys are ULIDs or slugs**, never auto-increment ids, in URLs and
  payloads.
- **404, not 403**, for someone else's resource. Confirming that an id exists is
  itself information.
- **Resolve through the owner** — `$user->transactions()->where(...)->firstOrFail()`
  — never fetch by id and then compare. One forgotten check in the second style
  and any user reads another's ledger.
- **Generic auth failures.** Never distinguish "no such account" from "wrong
  password". When the account is missing, still run a hash comparison so the
  response *time* does not leak existence either.
- **The vault is zero-knowledge.** The plaintext of a secret never exists outside
  the browser tab that decrypted it, is never logged, never validated
  field-by-field server-side, and never appears in a URL. See
  `modules/vault/SECURITY.md`.
- Rate-limit anything guessable (login, vault unlock, TOTP) far below the app
  default, and lock the vault on an idle timer.

### Structure

- **Thin controllers.** HTTP shaping only. Every rule lives in a `Service`.
- **Validation in FormRequests**, never in a controller.
- **`endpoints.md` is written before the controller**, and the mock
  `backend/api.js` returns the identical shape — so swapping the mock for the
  real one changes no consumer.
- **One door per module.** `modules/<feature>/backend/api.js` is the only path
  between the UI and that module's data. No page-level JS calls an endpoint or
  reads storage directly.
- **One source of truth per rule.** If a figure is computed in two places, one of
  them is already wrong.
- Dependencies are **one-way and cycle-free** — verified by `tools/module-deps.py`.

### Comments explain *why*, never *what*

```js
// minor_unit comes from the currency row, not a constant 2: KWD has three
// decimal places and JPY has none, so a hardcoded /100 silently multiplies a
// Kuwaiti figure by ten and divides a Japanese one by a hundred.
```

Anything surprising gets a sentence. Anything obvious gets none.

### Verify by running, not by reading

- Render the page and look at it, at 360 / 390 / 768 / 1280.
- Measure overflow with `tools/qa-viewport.html`; never eyeball it — headless
  Chrome clamps its viewport, so a `--window-size=360` screenshot is a wider
  render cropped, and it *looks* broken when nothing is.
- Run the tool after a change; grep misses files that build their paths from
  parts.
- Check the assumption before acting on it.

### Honesty in reporting

- **Say what has not been executed.** `docs/STATUS.md` records exactly which
  layers have run and which have only been authored. Authored is not verified.
- **Record what is NOT built** under a "Not built" heading in each module's
  `endpoints.md`, rather than letting a gap look like an oversight later.
- **Say when a bug was pre-existing**, and prove it.

### The workflow per item

1. Read the surrounding code first.
2. Write the contract (`endpoints.md`) before the implementation.
3. Build it.
4. Verify: render, measure at 360/390/768/1280, check the console, run the
   validators in `tools/`.
5. Update `context.md` — decision log, change log, checkbox.
6. Commit that item **alone**, with a message explaining the *why*.
7. Only then start the next one.

---

## One-line summary

**Build it as a vertical slice, keep money in integer minor units, never trust the
client with a derived figure, keep the vault's plaintext in the browser, comment
the reasoning, and prove it by running it.**
