/**
 * Home · page script
 *
 * The composition root for the home screen. It is the one file allowed to
 * import several modules' api.js at once — that is what a page IS — and it
 * holds no data logic of its own: every figure on this screen is computed in
 * the module that owns it. What is here is the arithmetic of PRESENTING them:
 * which figure is the hero, how much of the month is left, a day's pace.
 *
 * The order is the order of the question a phone user opens it with
 * (DIRECTION.md §3.3): what is left to spend, today, where I can pay from,
 * where it went.
 */

import { qs, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel, convertAndSum, minorFactor } from '../../shared/js/core/money.js';
import { formatPeriod, currentPeriod, daysInPeriod, periodProgress, today, lastPeriods } from '../../shared/js/core/dates.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { segmentColor } from '../../shared/js/components/spark.js';
import * as accounts from '../accounts/backend/api.js';
import * as ledger from '../ledger/backend/api.js';
import * as fx from '../fx/backend/api.js';
import { openEntrySheet, mountCompose, entryActions } from '../ledger/entry-sheet.js';

// The header's Out / In stay only until the tab bar's centre + lands (A2).
// Removing them first would leave Home with no way to add anything; the
// buttons already go through mountCompose(), so the switch is one line.
mountShell({ title: 'Home', actions: entryActions() });
mountCompose({ onSaved: () => refresh() });

delegate(document.body, 'click', '[data-month-open]', () => openMonthSheet());
delegate(document.body, 'click', '[data-book-toggle]', () => {
  state.setBook(state.book() === 'personal' ? 'business' : 'personal');
});

for (const event of [
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.ACCOUNT_CREATED, EVENTS.ACCOUNT_UPDATED, EVENTS.ACCOUNT_ARCHIVED,
  EVENTS.PERIOD_CHANGED, EVENTS.BOOK_CHANGED, EVENTS.CURRENCY_CHANGED,
]) on(event, () => refresh());

delegate(document.body, 'click', '[data-edit]', async (_event, button) => {
  const res = await ledger.find(button.dataset.edit);
  if (res.ok) openEntrySheet({ transaction: res.data, onSaved: refresh });
});

refresh();

async function refresh() {
  const book = state.book();
  const display = state.currency();
  const day = today();

  const [accountRes, balanceRes, summaryRes, todayRes, settingsRes] = await Promise.all([
    accounts.list({ book }),
    ledger.balances({ book }),
    ledger.summary({ book, period: state.period(), currency: display }),
    ledger.list({ book, from: day, to: day }),
    accounts.financeSettings(),
  ]);

  const summary = summaryRes.data;
  // The budget belongs to the personal book (modules/accounts/backend/
  // endpoints.md); a business book has no household spending limit.
  const budget = book === 'personal' ? (settingsRes.data?.monthly_budget_minor || 0) : 0;

  await drawTop();
  drawHero(summary, budget, display);
  await drawToday(todayRes.data, accountRes.data, display);
  drawAccounts(accountRes.data, balanceRes.data);
  drawBreakdown(summary, display);
  drawNotes(summary, budget, display);
}

/* ---- Formatting helpers --------------------------------------------------
   All three go through money.js; nothing here builds a figure by hand. */

/** A figure that stands on its own: the full amount, marked up. */
const figure = (minor, code) => formatMoneyHTML(minor, code);

/** A figure inside a sentence: the marker, whole units. */
const inline = (minor, code) => moneyLabel(minor, code, { minor: 'never' });

/* =========================================================================
   The month and the book
   ========================================================================= */

/**
 * The month name at the top, and the book pill beside it.
 *
 * The pill only switches when there is a second book to switch to: a toggle
 * that flips to an empty business book is a way to make Home look broken.
 */
async function drawTop() {
  const period = state.period();
  qs('[data-month-name]').textContent = period === currentPeriod()
    ? formatPeriod(period).split(' ')[0]
    : formatPeriod(period);

  const all = (await accounts.list({ includeArchived: false })).data;
  const hasBusiness = all.some((a) => a.book !== 'personal');
  const pill = qs('[data-book-toggle]');
  pill.disabled = !hasBusiness;
  pill.setAttribute('aria-label', hasBusiness
    ? `Book: ${state.book() === 'personal' ? 'Personal' : 'Business'}. Switch book`
    : 'Book: Personal');
  qs('[data-book-name]').textContent = state.book() === 'personal' ? 'Personal' : 'Business';
  pill.classList.toggle('is-business', state.book() !== 'personal');
}

/**
 * Twelve months to pick from, newest first, in a sheet.
 *
 * A stand-in for the header's month grid (A6, shared). When that lands this
 * sheet goes and the month name opens the shared one.
 */
function openMonthSheet() {
  const months = lastPeriods(12, currentPeriod()).slice().reverse();
  const list = document.createElement('ul');
  list.className = 'list home-months';
  list.innerHTML = months.map((p) => `
    <li><button type="button" class="row" data-pick-month="${esc(p)}"${p === state.period() ? ' aria-current="true"' : ''}>
      <span class="row__main"><span class="row__title">${esc(formatPeriod(p))}</span></span>
      ${p === state.period() ? icon('check', { class: 'icon icon--sm' }) : ''}
    </button></li>`).join('');

  const sheet = openSheet({ title: 'Month', body: list });
  delegate(list, 'click', '[data-pick-month]', (_event, button) => {
    state.setPeriod(button.dataset.pickMonth);
    sheet.close('picked');
  });
}

/* =========================================================================
   Left to spend
   ========================================================================= */

/**
 * The hero, and the arithmetic behind it.
 *
 * LEFT TO SPEND, until the owner decides otherwise (DIRECTION.md §6 q1):
 *
 *   a monthly budget is set   budget − spent
 *   no budget                 income so far − spent − saved
 *
 * A deposit is not spending, which is why it is not in the budget line: the
 * budget limits what you consume, and moving money into a DPS consumes
 * nothing. It IS in the no-budget line, because money moved into savings is
 * no longer money you can spend this month.
 */
function drawHero(summary, budget, display) {
  const period = state.period();
  const isNow = period === currentPeriod();
  const income = summary.income_minor || 0;
  const spent = summary.expense_minor || 0;
  const held = summary.held_minor || 0;

  const basis = budget > 0 ? budget : income;
  const used = budget > 0 ? spent : spent + held;
  const left = basis - used;

  const monthName = formatPeriod(period).split(' ')[0];
  const label = qs('[data-left-label]');
  label.textContent = isNow ? 'Left to spend this month' : `Left at the end of ${monthName}`;
  // The basis, for anyone who asks what "left" is measured against. Not on
  // the screen: the hero is one figure, and a line explaining it every time is
  // a line read once and then skipped forever.
  label.title = budget > 0
    ? `Your ${inline(budget, display)} budget, less what you spent`
    : 'What came in this month, less what you spent and saved';

  const node = qs('[data-left]');
  node.innerHTML = figure(left, display);
  node.classList.toggle('money--out', left < 0);

  qs('[data-pace]').innerHTML = paceLine(left, isNow, period, display, summary.count);

  // The pace bar: how much of the basis is used, against how much of the
  // month has gone. The marigold tick is today; a fill past it is spending
  // ahead of the calendar, which the bar says without changing colour.
  const meter = qs('[data-left-meter]');
  const usedNote = qs('[data-used]');
  meter.hidden = basis <= 0;
  usedNote.textContent = '';
  if (basis > 0) {
    const ratio = used / basis;
    const progress = periodProgress(period);
    meter.style.setProperty('--fill', `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%`);
    meter.classList.toggle('is-over', ratio > 1);

    const mark = qs('[data-left-today]');
    mark.hidden = !isNow;
    mark.style.setProperty('--at', `${(progress * 100).toFixed(1)}%`);

    const pct = `${Math.round(ratio * 100)}% used`;
    usedNote.textContent = isNow ? `${pct} · day ${new Date().getDate()}` : pct;
  }

  // Full figures, whole units: three thirds of 328px hold ৳1,88,611 at the
  // figure size, and a rounded ৳88.6k here would disagree with the Ledger.
  qs('[data-flow-in]').textContent = inline(income, display);
  qs('[data-flow-hold]').textContent = inline(held, display);
  qs('[data-flow-out]').textContent = inline(spent, display);
}

/**
 * "৳1,450 a day for the next 4 days", or what to say when that is not true.
 *
 * Integer division, floored: a pace rounded UP tells someone they can spend a
 * taka more a day than they have, and over a month that is the overdraft.
 */
function paceLine(left, isNow, period, display, count) {
  if (!count) return isNow ? 'Nothing recorded yet' : 'Nothing was recorded';

  if (!isNow) {
    return left >= 0
      ? `<strong>${esc(inline(left, display))}</strong> unspent`
      : `<strong class="is-over">${esc(inline(-left, display))}</strong> over`;
  }

  const daysLeft = daysInPeriod(period) - new Date().getDate() + 1;
  const days = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;

  if (left <= 0) {
    return `<strong class="is-over">${esc(inline(-left, display))} over</strong> with ${days} to go`;
  }

  // Floored to a whole unit before it is shown, so the rounding in the label
  // can never add the taka back.
  const unit = minorFactor(display);
  const perDay = Math.floor(left / daysLeft / unit) * unit;
  return daysLeft === 1
    ? `<strong>${esc(inline(left, display))}</strong> for today, the last day`
    : `<strong>${esc(inline(perDay, display))}</strong> a day for ${days}`;
}

/* =========================================================================
   Today
   ========================================================================= */

async function drawToday(rows, accountRows, display) {
  const host = qs('[data-today]');
  const total = qs('[data-today-total]');

  // Spent today: expenses only, converted, the same rule as the month's
  // "spent". A deposit made today is not spending.
  const rates = await fx.rates();
  const spent = convertAndSum(rows.filter((r) => r.type === 'expense'), display, rates).amountMinor;
  total.textContent = spent > 0 ? `${inline(spent, display)} spent` : '';

  if (!rows.length) {
    host.innerHTML = `
      <li class="home-today__empty">
        <span>Nothing yet today.</span>
        <a class="meta" href="modules/ledger/list.html">All entries</a>
      </li>`;
    return;
  }

  // Two at most, or all three when that is all there is (a "1 more" row
  // costs as much height as the entry it hides). Today is a glance, not the
  // ledger; the rest is one tap on.
  const SHOWN = rows.length === 3 ? 3 : 2;
  const byId = new Map(accountRows.map((a) => [a.id, a]));
  const more = rows.length - SHOWN;

  host.innerHTML = rows.slice(0, SHOWN).map((row) => entryRow(row, byId.get(row.account_id))).join('')
    + (more > 0 ? `
      <li><a class="row home-today__more" href="modules/ledger/list.html">
        <span class="row__main"><span class="row__title">${more} more today</span></span>
        ${icon('chevron-right', { class: 'icon icon--sm row__chev' })}
      </a></li>` : '');
}

/**
 * One entry as a row.
 *
 * Kept local until the ledger exports its own row renderer (B5), at which
 * point this goes and Home uses that one, so a row looks the same everywhere.
 */
function entryRow(row, account) {
  const type = ledger.typeOf(row.type);
  const sign = row.direction === 'in' ? 'always' : 'auto';
  const amount = row.direction === 'in' ? row.amount_minor : -row.amount_minor;

  return `
    <li>
      <button type="button" class="row" data-edit="${esc(row.id)}">
        <span class="row__glyph row__glyph--${type.tone}">${icon(type.icon, { class: 'icon' })}</span>
        <span class="row__main">
          <span class="row__title">${esc(row.payee || row.category_label || type.label)}</span>
          <span class="row__sub">
            ${row.payee && row.category_label ? `<span>${esc(row.category_label)}</span><span aria-hidden="true">·</span>` : ''}
            <span>${esc(account?.name || 'Unknown account')}</span>
          </span>
        </span>
        <span class="row__end">
          <span class="money money--md${type.tone === 'out' ? '' : ` money--${type.tone}`}">${formatMoneyHTML(amount, row.currency, { sign })}</span>
        </span>
      </button>
    </li>`;
}

/* =========================================================================
   Accounts strip
   ========================================================================= */

/**
 * Where you can pay from, as chips.
 *
 * Spendable accounts only. A DPS balance on this strip reads as money
 * available for lunch, which is the confusion the spendable / held split
 * exists to prevent. A negative balance on anything but a credit card is
 * flagged: a bKash wallet cannot really be below zero, so a negative one is a
 * missing entry, and saying so is the useful thing.
 */
function drawAccounts(accountRows, balances) {
  const host = qs('[data-accounts]');
  const spendable = accountRows.filter(accounts.isSpendable);
  qs('[data-accounts-all]').textContent = accountRows.length ? `All ${accountRows.length}` : 'All';

  if (!spendable.length) {
    host.innerHTML = `
      <li class="home-account home-account--add">
        <a href="modules/accounts/list.html?new=1">${icon('plus', { class: 'icon icon--sm' })} Add an account</a>
      </li>`;
    return;
  }

  host.innerHTML = spendable.map((account) => {
    const balance = balances[account.id] ?? 0;
    const type = accounts.typeOf(account.type);
    const flagged = balance < 0 && !type.credit;

    return `
      <li class="home-account${flagged ? ' is-negative' : ''}">
        <a href="modules/accounts/list.html#${encodeURIComponent(account.id)}">
          <span class="home-account__name">
            ${icon(type.icon, { class: 'icon icon--sm' })}
            <span>${esc(account.name)}</span>
          </span>
          <span class="money home-account__balance">${figure(balance, account.currency)}</span>
          ${flagged ? '<span class="sr-only">Below zero: an entry may be missing.</span>' : ''}
        </a>
      </li>`;
  }).join('');
}

/* =========================================================================
   Where it went
   ========================================================================= */

/**
 * A stacked bar of the top four categories and the rest, then the top three
 * as rows.
 *
 * Three rows, not six: Home has to fit about one and a half screens at 360px
 * (DIRECTION.md §3.3), and the Month screen has the full list. The bar still
 * carries the fourth and the rest, so its proportions are the whole month's.
 */
function drawBreakdown(summary, display) {
  const panel = qs('[data-breakdown]');
  const all = summary.by_category.filter((c) => c.value > 0);
  panel.hidden = all.length === 0;
  if (panel.hidden) return;

  const total = all.reduce((sum, c) => sum + c.value, 0) || 1;
  const share = (v) => (v / total) * 100;

  const bands = all.slice(0, 4).map((c, i) => ({ ...c, color: segmentColor(i) }));
  const rest = all.slice(4).reduce((sum, c) => sum + c.value, 0);
  if (rest > 0) bands.push({ name: 'Everything else', value: rest, color: 'var(--ink-4)' });

  // --seg-share is per-instance data, the one kind of value that reaches CSS
  // from JS (see .meter in _data.css).
  const bar = qs('[data-breakdown-bar]');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', bands.map((b) => `${b.name} ${Math.round(share(b.value))}%`).join(', '));
  bar.innerHTML = bands.map((b) => `
    <i style="--seg-share:${share(b.value).toFixed(2)};--seg-color:${b.color}"></i>`).join('');

  qs('[data-breakdown-legend]').innerHTML = bands.slice(0, 3).map((b) => `
    <span class="home-legend__name" style="--seg-color:${b.color}">${esc(b.name)}</span>
    <span class="home-legend__value money">${figure(b.value, display)}</span>
    <span class="home-legend__pct">${Math.round(share(b.value))}%</span>`).join('');
}

/* =========================================================================
   What the numbers say
   ========================================================================= */

/**
 * One line each, the number first.
 *
 * The old version was three paragraphs; between two errands nobody reads a
 * paragraph. The figure leads so the line can be read by its first word.
 */
function drawNotes(summary, budget, display) {
  const notes = [];
  const income = summary.income_minor || 0;
  const spent = summary.expense_minor || 0;

  if (summary.count && income > 0) {
    const rate = Math.round(summary.savings_rate);
    notes.push(rate >= 20
      ? { tone: 'in', lead: `${rate}% kept`, text: 'above the 20% mark' }
      : rate >= 0
        ? { tone: 'warn', lead: `${rate}% kept`, text: 'the usual target is 20%' }
        : { tone: 'out', lead: `${inline(spent - income, display)} more out than in`, text: 'something is being drawn down' });
  }

  // No "saved" line: Saved is already a labelled figure in the hero, and
  // repeating it here cost a row of the page's height for no new fact.

  // No "top category" line either: Where it went, directly above, already
  // leads with it.

  const avoidable = summary.by_necessity.find((n) => String(n.name) === '4');
  if (avoidable && avoidable.value > 0) {
    notes.push({ tone: 'out', lead: `${inline(avoidable.value, display)} avoidable`, text: 'by your own marking' });
  }

  if (budget > 0 && spent > budget) {
    notes.push({ tone: 'out', lead: `${inline(spent - budget, display)} over budget`, text: `of ${inline(budget, display)}` });
  }

  if (summary.unconvertible.length) {
    notes.push({ tone: 'warn', lead: summary.unconvertible.join(', '), text: 'left out: no exchange rate set' });
  }

  const panel = qs('[data-insights]');
  panel.hidden = notes.length === 0;
  qs('[data-insight-list]').innerHTML = notes.slice(0, 4).map((n) => `
    <li class="home-note home-note--${n.tone}">
      <strong class="home-note__lead">${esc(n.lead)}</strong>
      <span class="home-note__text">${esc(n.text)}</span>
    </li>`).join('');
}
