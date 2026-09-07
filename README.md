# Hisab

*হিসাব — the account, the reckoning.*

Two systems under one roof, built for one owner and used mostly from a phone.

**Accounts** — the complete money picture, not just an expense list. Personal and
business books kept separately, cash in and out across every account, profit,
investments and shares, in any currency, with a converted roll-up.

**Vault** — cards, bank accounts, site logins, API keys and secure notes,
encrypted so that the server can never read any of it.

---

## Running it

No build step. No dependencies. Serve the folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

**Serve it — do not double-click `index.html`.** Under `file://`, ES module
imports and `fetch()` behave differently and the Web Crypto API the vault needs
is unavailable entirely. The app warns about this once in the console.

`localhost` counts as a secure context, so everything including the vault works
in development. In production it must be **https** — see below.

### The backend

The API is Laravel 13 and needs PHP 8.3+ with Composer. This machine's XAMPP PHP
is 8.0, so a separate toolchain lives at `D:\My Lab\.toolchain` — outside the
repository, off the PATH, leaving XAMPP untouched. It pins **PHP 8.3.33**, which
is the exact version Hostinger runs, so local and deployed behaviour differ by
hosting rather than by interpreter.

```bash
PHP="D:/My Lab/.toolchain/php83/php.exe"
"$PHP" "D:/My Lab/.toolchain/composer.phar" install
cp .env.example .env && "$PHP" artisan key:generate
"$PHP" artisan migrate
"$PHP" artisan serve            # http://127.0.0.1:8000/api/ping
"$PHP" artisan test
```

`vendor/` is not committed — 83 MB of it — so `composer install` is the first
step on any machine, the server included.

The frontend does not need any of this. It answers from browser storage until a
module's `api.js` is pointed at the API, which is the entire reason Phase 1 could
ship on its own.

### Tests and checks

```bash
node tools/test-money.mjs        # 66 assertions — money parsing, formatting, FX
node tools/test-crypto.mjs       # 41 assertions — the vault's encryption
python tools/check-sprite.py     # the icon sprite, and every name that uses it
python tools/check-pages.py      # page contract, and the CSP hash
```

And in a browser, because some things are only visible when rendered:

```
http://localhost:8000/tools/qa-viewport.html          # overflow at real widths
http://localhost:8000/tools/shot.html?url=../index.html&w=360,390
```

---

## Structure

```
hisab/
├── index.html            the overview
├── 404.html
├── .htaccess             HTTPS, file protection, MIME, caching, CSP
│
├── shared/               everything used by more than one module
│   ├── css/              tokens + 11 partials; no hex is written elsewhere
│   ├── js/core/          money, dates, storage, bus, http, dom, ids
│   ├── js/components/    shell, sheet, menu, toast, sparkline
│   ├── icons/sprite.svg  57 icons, one stroke weight
│   └── backend/          the API contract every module follows
│
├── modules/              one folder per feature, deletable
│   └── <feature>/
│       ├── *.html            its screens
│       ├── *-page.js         the page scripts
│       ├── <feature>.css     only what is unique to it
│       ├── data/             seed data as JSON, not as constants in code
│       └── backend/
│           ├── endpoints.md  the contract, written before the code
│           ├── api.js        the ONLY door between the UI and this data
│           ├── Controllers/ Models/ Services/ Requests/ Migrations/
│           └── routes.php
│
├── tools/                validators, QA harnesses, deploy.sh (not deployed)
└── docs/                 deployment and status (not deployed)
```

### The module test

> Deleting a module folder must cleanly remove that feature and break nothing
> else.

A module is named from exactly two places outside its own folder —
`composer.json` and `bootstrap/providers.php`.

---

## The rules

Read `CONVENTIONS.md` before writing any code here. It is the whole briefing,
and the reasoning matters more than the rules:

- **Money is an integer in the currency's minor unit.** Never a float. The number
  of decimal places comes from the currency row, never a constant — it is 2 for
  USD, 3 for KWD and 0 for JPY, so a hardcoded `/100` multiplies a Kuwaiti figure
  by ten.
- **`deposit` is not a kind of expense.** Money moved into savings is taken out
  of spendable income without being counted as spending. Folding it in makes
  saving look like spending and suppresses every savings figure.
- **Balances are derived, never stored.** A stored balance and a ledger disagree
  eventually, and then there are two truths.
- **A transfer writes two legs in one write.** A half-applied transfer is money
  that has left one account and arrived nowhere.
- **The client never sets a derived figure.** Request classes have no field for
  a balance or a total — absent, not validated-and-ignored.
- **The vault's plaintext never leaves the browser tab.**
- **Comments explain why, never what.**
- **Verify by running.** Six real bugs in this repository were invisible to every
  file search and appeared the moment something was rendered or executed.

---

## Status

`docs/STATUS.md` is the honest version: what has been executed, what has only
been authored, and what is deliberately not planned.

In short — the frontend works and is tested; the Laravel backend and the vault
screens are not written yet; the app currently stores data in the browser.

## Deploying

`docs/DEPLOY-HOSTINGER.md`.

One thing that will not be obvious otherwise: **the vault requires HTTPS**.
`crypto.subtle` is only exposed in a secure context, so on plain http the vault
fails while every other screen works.

---

Built by Md Imran Hossain.
