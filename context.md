# Hisab — project context

The working memory of this repository. Anyone picking the project up reads this
file first, then `CONVENTIONS.md`, then the module they are about to touch.

---

## 1. What Hisab is

Two systems under one roof, for one owner (Md Imran Hossain), used mostly from a
phone.

**A. Accounts** — the complete money picture, not just an expense list:

- personal expenses and income
- business expenses and income, kept in separate books
- cash in / cash out across every account (cash, bKash, Nagad, Rocket, bank,
  card, wallet)
- profit — per business, per period
- investments and shares — cost basis, holdings, partner splits, returns
- every account in one place, in any currency, with a converted roll-up

**B. Vault** — the sensitive-information manager:

- cards, bank accounts, site logins, API keys, documents, secure notes
- encrypted so that the server can never read any of it

The name: *hisab* (হিসাব) — the account, the reckoning.

---

## 2. Locked rules (standing instructions — never re-litigated)

1. Frontend is HTML + CSS + JS. No framework, no build step.
2. Backend is Laravel (PHP). Python does analysis and tooling only.
3. Module-wise vertical slices — one folder per feature, deletable.
4. No view-only pages. No single-file code dumps.
5. Ultra-professional standard: readable, editable, handover-ready.
6. Futuristic, dense, instrument-panel visual language — and it must not read as
   generated. See §4.
7. Mobile first, 360px design width.
8. Every commit is authored as **Md Imran Hossain <rabitgulf@gmail.com>** with no
   AI attribution anywhere — not in commit messages, not in trailers, not in
   file headers.

---

## 3. Decisions taken, and why

Newest first. A decision recorded here is not re-argued; it is superseded by a
new dated entry if it turns out to be wrong.

### 2026-09-05 — Vault uses two layers of encryption, not one

Client-side envelope encryption (WebCrypto, AES-256-GCM, key derived from the
master password) **inside** a server-side encrypted column (Laravel `Crypt`, app
key). Neither layer alone is enough for what this stores.

- Client-side alone: a stolen database yields ciphertext, but the app key is not
  involved, so an attacker with the DB can grind offline against the master
  password with no second factor.
- Server-side alone: the server can read every secret, so a compromised host or a
  careless log statement leaks the whole vault at once.
- Both: the DB alone is useless without the app key, and the app key alone is
  useless without the master password, which the server never receives.

The cost is accepted: **no server-side search or sort on secret fields**, and a
forgotten master password is unrecoverable by design. Search runs in the browser
over the decrypted set; a blind index over a keyed HMAC of the title is the
escape hatch if that ever gets slow, and it is deliberately not built yet.

### 2026-09-05 — Money is an integer in the currency's minor unit

Not a float, not a decimal string. `amount_minor` (BIGINT) plus `currency_code`.
The number of decimal places comes from `currencies.minor_unit`, never from a
constant — 2 for USD, 3 for KWD, 0 for JPY. Rounding drift across a year of a
ledger is an accounting problem, not a cosmetic one.

### 2026-09-05 — Full multi-currency, not BDT-only

Every account and every transaction carries a currency. Cross-currency totals
exist only as *converted* figures, and a converted figure always carries the rate
and the as-of date that produced it, snapshotted onto the row. Reporting last
year's total with today's rate silently rewrites history.

### 2026-09-05 — `deposit` stays a first-class transaction type

Carried over from OppTracker. Money moved into savings, DPS, FDR or shares is
taken out of *spendable* income without being counted as spending. Collapsing it
into "expense" makes saving look like spending and suppresses every savings
figure on the dashboard.

### 2026-09-05 — Account balances are derived, never stored

A stored balance and a ledger will disagree eventually, and then there are two
truths and no way to tell which is right. Balances are summed from transactions,
with a `balance_snapshots` table available purely as a performance cache that can
be dropped and rebuilt without losing information.

### 2026-09-05 — Python is a sidecar, never the system of record

`tools/` holds validators that run at authoring time (no runtime dependency).
`services/analytics/` is a FastAPI service Laravel calls for forecasting and
spend-pattern work. Laravel must degrade gracefully when the service is absent,
because plain shared hosting cannot run a long-lived process — the analytics
panels show a "not connected" state rather than erroring.

### 2026-09-05 — Structure and conventions are inherited from GulfRabit

Same module layout, same `endpoints.md`-before-controller discipline, same
`backend/api.js` mock seam, same token-driven CSS. The domain model is seeded
from OppTracker's finance section (`FIN_DEFAULTS`, the necessity bands, the month
close), which was the right model trapped in a 9,000-line file.

---

## 4. The visual language

The brief is "futuristic, heavy future tech, professional — must not look like it
was generated". Those are different requirements and the third one is the hard
one, because the generated look is a specific set of habits:

**Avoided on purpose:** violet-to-blue gradients as the primary identity;
frosted-glass cards floating on a blurred blob background; `border-radius: 24px`
on everything; Inter at three weights and nothing else; emoji standing in for
icons; a centred hero with gradient display text; drop shadows doing the work
that a hairline should do.

**Used instead:**

- **Instrument-panel density.** This is a tool you read numbers off, so it is
  laid out like an instrument, not like a marketing page. Tight 4px rhythm on a
  hard 8px grid, hairline rules instead of shadows, real tabular figures.
- **A near-black canvas with a blue cast**, not neutral grey and not pure black —
  `#06080B`. Surfaces step up in luminance, never in shadow.
- **One signal colour with meaning, not decoration.** Mint (`--flow-in`) is money
  arriving, coral (`--flow-out`) is money leaving, violet (`--flow-hold`) is money
  held, azure (`--flow-biz`) is the business book. A colour on this screen always
  means something; nothing is tinted for taste.
- **IBM Plex Sans / IBM Plex Mono / Space Grotesk.** Engineered rather than
  friendly, and specifically not the default sans everything else uses. Every
  figure is set in the mono at `font-variant-numeric: tabular-nums` so columns of
  money align on the decimal.
- **A hand-drawn SVG sprite** (`shared/icons/sprite.svg`), stroked on the same
  1.5px weight as the hairlines, so the icons belong to the same drawing as the
  rules and the borders.
- **Radii of 4–10px**, never pill-shaped except on true chips.
- **Motion that reports state**, not motion that decorates: a value that changed
  ticks; a sheet that opens tracks the finger; nothing floats or pulses for
  atmosphere. All of it behind `prefers-reduced-motion`.

---

## 5. Module map

Status is one of: `planned`, `frontend` (running on the mock seam), `backend`
(Laravel layer authored), `done` (both, verified).

| Module | Owns | Status |
|---|---|---|
| `shell` | app frame — header, tab bar, navigation, theme, toasts | frontend |
| `auth` | sign-in, session, lock screen | planned |
| `fx` | currencies, minor units, rates, conversion | frontend |
| `accounts` | the accounts themselves — cash, bank, MFS, card, wallet | frontend |
| `ledger` | transactions: income, expense, deposit, transfer | planned |
| `categories` | category tree, methods, necessity bands | planned |
| `business` | business books, per-business P&L | planned |
| `investments` | holdings, shares, partners, cost basis, returns | planned |
| `budgets` | budgets, savings goals, month close | planned |
| `reports` | dashboards, insights, exports | planned |
| `vault` | encrypted secrets | planned |
| `settings` | preferences, backup, import/export | planned |

---

## 6. Change log

Newest first. One entry per committed item.

### 2026-09-05

- Repository initialised at `D:\My Lab\hisab`, remote
  `github.com/imran-me/hisab`, author Md Imran Hossain.
- `CONVENTIONS.md`, `context.md` written before any code, so the rules exist
  before there is anything to break them.

---

## 7. What has NOT been executed

Honesty section — see `docs/STATUS.md` for the live version. As of the first
commit: no PHP in this repository has ever run. The authoring machine has PHP
8.0.30 (XAMPP) and no Composer; Laravel 12 needs PHP 8.2+. The Laravel layer is
authored against the documented contract and validated by `tools/php-check.py`,
which checks syntax shape, PSR-4 path agreement and unused imports — not
behaviour. This is stated again in `docs/STATUS.md` and in every commit that
touches PHP.
