# Deploying Hisab to Hostinger

Written for hPanel (Hostinger's control panel) on shared hosting. Two phases,
because the app has two halves and only the first one exists today.

---

## Read this first — what you are actually deploying

Right now Hisab is a **complete frontend with no server**. Every screen works:
you can add accounts, record income, expenses, deposits and transfers, filter
and search the ledger, and see the month's totals and breakdowns.

**Your data is stored in your browser, on the device you enter it on.**

That has three consequences you need to know before you start using it for real:

| | |
|---|---|
| **No sync** | The ledger on your phone and the ledger on your laptop are two separate ledgers. They do not merge. |
| **Clearing site data deletes it** | "Clear browsing data", a browser reset, or an aggressive privacy setting removes everything. Safari on iOS will also evict site data on its own after roughly seven days without a visit unless the site is installed to the home screen. |
| **Nobody else can see it** | A stranger who finds the URL sees an empty app, not your ledger — their browser has their storage, not yours. |

That last point is worth stating plainly: putting this online right now does not
expose your finances. But the first two mean **install it to your home screen**
and treat Phase 1 as a trial rather than the permanent record, until Phase 2
lands.

> **Export is not built yet.** It is the next thing after the vault screens, and
> until it exists there is no way to move a Phase 1 ledger off a device. So
> either wait for it before entering months of history, or accept that early
> entries are a test run. This is stated in `docs/STATUS.md` too rather than
> being left to be discovered.

Phase 2 (the Laravel backend + MySQL) is what turns this into one ledger that
follows you across devices. Section 7 says what to set up now so that swap is
quick when it is ready.

---

## 1 · Before you start

Five things in hPanel. Ten minutes.

### 1.1 Where it lives — DONE

```
hisab.gulfrabit.com  →  /home/u239665931/domains/gulfrabit.com/public_html/hisab
```

Note what that path means: the subdomain's document root is **physically inside
gulfrabit.com's web root**. That is Hostinger's default for a subdomain and it
is fine, but it creates a second address for the same files —
`https://gulfrabit.com/hisab/` — and that address is genuinely broken:

- `404.html` uses root-absolute paths (`/shared/css/...`), because the server
  returns that one file for a missing URL at *any* depth and relative paths
  would resolve against a location that does not exist. Under `/hisab/` those
  resolve to `gulfrabit.com/shared/...` and 404.
- The web manifest's `scope` has the same constraint, so home-screen install
  misbehaves.
- **Worse: `localStorage` is keyed per origin.** A ledger entered at
  `gulfrabit.com/hisab/` is invisible at `hisab.gulfrabit.com` and vice versa.
  That looks exactly like data loss, and the vault blob has the same problem.

**This is already handled** — `.htaccess` §1 redirects any other host to
`hisab.gulfrabit.com`, preserving the path. Nothing for you to do, but if the
app ever moves, that rule has the hostname written into it in two places and
both must change together.

One consequence to be aware of: gulfrabit.com's own `.htaccess` is now a parent
of this one. Header rules merge harmlessly; rewrite rules do not inherit unless
that parent opts in. See `.htaccess` §0.1 for the symptom if it ever does.

### 1.2 Turn on SSL — this is not optional

hPanel → **Security → SSL** → install the free certificate for that subdomain,
then wait for it to show *Active*.

**The vault does not work without HTTPS.** `crypto.subtle` — the Web Crypto API
the whole vault is built on — is only exposed in a secure context. On plain
`http://` it is `undefined`, so the vault screen fails while every other page
works perfectly. That is a genuinely confusing way to discover the problem, so:
certificate first, then deploy.

### 1.3 Set the PHP version

hPanel → **Advanced → PHP Configuration** → select **PHP 8.2 or newer**.

Nothing in Phase 1 uses PHP. Do it now anyway — Laravel 12 requires 8.2+, and
finding out later that the account is pinned to 8.0 is an avoidable delay.

### 1.4 Check whether your plan has SSH and Git

hPanel → **Advanced**. Look for **SSH Access** and **Git**.

- **Git present** → use Option A below. Much better.
- **Neither** → use Option B. It works fine, it is just manual.

### 1.5 Optional but recommended — put a password on the whole site

Until Phase 2 adds real login, anyone with the URL can open the app. They see
*their* empty browser storage rather than your data, so nothing leaks — but a
private tool should not be publicly browsable.

hPanel → **Security → Password Protect Directories** → select the subdomain's
`public_html` → set a username and password.

---

## 2 · Option A — Git deployment (recommended)

### 2.1 Connect the repository

hPanel → **Advanced → Git** → **Create a new repository**:

| Field | Value |
|---|---|
| Repository | `https://github.com/imran-me/hisab.git` |
| Branch | `main` |
| Directory | `domains/gulfrabit.com/public_html/hisab` |

The repository is public, so no deploy key is needed. (If you make it private
later, hPanel shows an SSH key on this page — add it to GitHub under
**Settings → Deploy keys** on the repo.)

### 2.2 Deploy

Press **Deploy** on that same page. It clones the branch into the directory.

### 2.3 Set up one-click updates afterwards

The Git page shows a **webhook URL**. Copy it into GitHub → your repo →
**Settings → Webhooks → Add webhook**, content type `application/json`, event
`push`. After that every push to `main` deploys itself.

If you would rather deploy deliberately, skip the webhook and press **Deploy**
when you want the changes.

---

## 3 · Option B — upload the files

1. Download the repository: GitHub → **Code → Download ZIP**.
2. Unzip it locally. You will get a folder `hisab-main` — the files you need are
   *inside* it, not the folder itself.
3. hPanel → **Files → File Manager** → open
   `domains/gulfrabit.com/public_html/hisab`.
4. Delete Hostinger's `default.php` / placeholder `index.html` if present.
5. Upload the **contents** of `hisab-main` — `index.html`, `404.html`,
   `.htaccess`, `site.webmanifest`, and the `assets/`, `shared/`, `modules/`
   folders.

**Two things people get wrong here:**

- **`.htaccess` is a hidden file.** File Manager hides it by default and so does
  Windows Explorer, so it is the file that silently does not get uploaded — and
  without it there is no HTTPS redirect, no security headers and no protection
  on the internal files. In File Manager, turn on **Settings → Show hidden
  files**, and confirm it is there after uploading.
- **Do not upload `tools/` or `docs/`.** They are developer scaffolding.
  `.htaccess` blocks them anyway, which is the belt to this braces.

---

## 4 · Verify the deployment

Open each of these and check what you get. This takes two minutes and catches
every common mistake.

| URL | Expected |
|---|---|
| `http://hisab.gulfrabit.com` | **redirects to https://** — if not, `.htaccess` is missing |
| `https://hisab.gulfrabit.com` | the Overview screen, dark, with icons and a bottom tab bar |
| `https://hisab.gulfrabit.com/context.md` | **403 Forbidden** — if you see the file, `.htaccess` is missing |
| `https://hisab.gulfrabit.com/tools/qa-viewport.html` | **403 Forbidden** |
| `https://hisab.gulfrabit.com/nonsense` | the styled "Nothing here" page, not Hostinger's default 404 |
| `https://hisab.gulfrabit.com/shared/icons/sprite.svg` | XML, not a download prompt |
| `https://gulfrabit.com/hisab/` | **redirects to `hisab.gulfrabit.com`** — closes the second entrance described in §1.1 |

Then, on the Overview screen itself:

- [ ] Icons render in the tab bar and beside each account. **Blank squares mean
      the sprite is not being served correctly** — check the MIME type above.
- [ ] Text is set in IBM Plex, not a system font. If it looks like Arial, the
      `assets/fonts/` folder did not upload.
- [ ] Press **Add**, enter an amount, save. The entry appears and the month
      totals change.
- [ ] Reload the page. The entry is still there.
- [ ] Open DevTools → Console (or Safari → Develop). **It should be empty.** A
      CSP violation here means the `.htaccess` hash is stale — see §6.

### Install it to your phone

This is the part that makes it feel like an app, and on iOS it also makes the
stored data much more durable.

- **Android / Chrome:** menu → *Add to Home screen* / *Install app*
- **iOS / Safari:** Share → *Add to Home Screen*

It launches full-screen with no browser chrome, on the dark theme.

---

## 5 · Updating it later

**With Git:** push to `main`. If you set the webhook, it is already live; if not,
hPanel → Advanced → Git → **Deploy**.

**Without Git:** re-upload the changed files.

Either way: **hard-refresh once** (Ctrl+Shift+R, or on iOS close and reopen the
installed app). CSS and JS are cached for an hour by `.htaccess` §5, so a normal
refresh may serve the old file.

---

## 6 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page loads but is unstyled | `.htaccess` missing, or the `shared/` folder did not upload | Check File Manager with hidden files shown |
| Blank squares instead of icons | `sprite.svg` not served as `image/svg+xml` | Confirm `.htaccess` uploaded; run `python tools/check-sprite.py` locally |
| Text is in Arial | `assets/fonts/` missing | Re-upload that folder — it is 152 KB |
| Vault says the Web Crypto API is unavailable | The page is on `http://`, not `https://` | §1.2 — install the SSL certificate |
| Console shows a Content-Security-Policy violation on an inline script | The theme block was edited without regenerating the hash | Run `python tools/check-pages.py`, put the printed `sha256-…` into `.htaccess` |
| Redirect loop | HTTPS rule fighting a proxy | Already handled by the two-condition rule; if it persists, comment out the rewrite in `.htaccess` §1 and use hPanel's own **Force HTTPS** toggle instead |
| Everything 403s | The `Require all denied` syntax needs Apache 2.4 | Hostinger runs LiteSpeed, which supports it. If your server is older, replace with `Order allow,deny` / `Deny from all` |
| Data disappeared | Browser cleared site data, or iOS evicted it | Install to the home screen; export a backup. This is Phase 1's real limitation. |

---

## 7 · Phase 2 — preparing for the backend

Do these now and the swap is quick when the Laravel layer is ready.

### 7.1 The database — DONE

```
Database  u239665931_hisab
User      u239665931_hisab
Created   2026-09-05
```

Correctly kept separate from `u239665931_eon`, which holds the ERP and the
`eon_*` tables — different backup schedule, different blast radius, and this one
will hold the vault.

### 7.2 Still outstanding

| | |
|---|---|
| Database password | **Do not paste it here.** It goes into a `.env` created on the server. `.env` is in `.gitignore` and is never committed. |
| PHP version | hPanel → Advanced → PHP Configuration — needs to be 8.2+ |
| SSH Access? | hPanel → Advanced. Decides whether Composer runs on the server or `vendor/` is uploaded — a ~40 MB difference in deploy size |
| Cron Jobs? | hPanel → Advanced. Needed for Laravel's scheduler later |

The `.env` will be written directly on the server via File Manager or SSH, at
`/home/u239665931/domains/gulfrabit.com/hisab-app/.env` — above the web root, so
it is not reachable even if `.htaccess` were removed.

### 7.3 The directory layout Phase 2 will use

For reference, so nothing is a surprise. Laravel's front controller must be the
only PHP reachable from the web, and the framework itself must sit **above** the
document root:

```
/home/u239665931/domains/gulfrabit.com/
├── public_html/hisab/      ← document root for hisab.gulfrabit.com
│   ├── index.html              the frontend, exactly as it is today
│   ├── 404.html
│   ├── .htaccess               with §8 uncommented
│   ├── assets/  shared/  modules/
│   └── api/
│       └── index.php           Laravel's front controller, paths adjusted
│
└── hisab-app/             ← ABOVE the web root; nothing here is reachable
    ├── app/  bootstrap/  config/  database/  routes/  storage/  vendor/
    └── .env                    database credentials, APP_KEY
```

The `.htaccess` in this repository already has the `/api/*` rewrite written and
commented out, at the bottom of the file.

### 7.4 What changes for you when Phase 2 lands

Nothing about how you use it. The frontend calls `modules/<feature>/backend/api.js`
either way; those files answer from the browser today and from `/api` tomorrow,
returning the identical shape. That seam is the reason Phase 1 was worth
shipping on its own — see `shared/backend/api-contract.md`.

There will be a one-time **import your existing data** step, so nothing entered
during Phase 1 is lost — which is why export/import is being built before the
backend rather than after it.

---

## 8 · A note on backups

**Export does not exist yet.** Being direct about it because a backup section
that describes a button which is not there is worse than no section at all.

What is planned, in this order:

1. **Settings → Export** — a JSON file of every account, transaction and
   category. Next after the vault screens.
2. **Vault export** — a separate `.hisab-vault` file, encrypted with the master
   password, so it is useless to anyone who finds it. **There is no recovery for
   a forgotten master password.** That is the design, not an oversight — write
   it down somewhere physical.
3. **Import**, so a Phase 1 ledger moves into the Phase 2 database intact.

After Phase 2, hPanel → **Files → Backups** covers the database on Hostinger's
own schedule as well.
