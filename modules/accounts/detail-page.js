/**
 * Accounts · one account
 *
 * The balance of one account and every entry that moved it, newest first,
 * with the balance after each one. The composition root for the screen: it
 * joins the account (accounts) to its entries and balance (ledger), which is
 * why it lives in a page and not in either module's api.js.
 */

import { qs, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel } from '../../shared/js/core/money.js';
import { formatDayLabel, currentPeriod, periodBounds, isWithin } from '../../shared/js/core/dates.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import { mountShell } from '../../shared/js/components/shell.js';
import * as accounts from './backend/api.js';
import * as ledger from '../ledger/backend/api.js';
import { openEntrySheet, mountCompose } from '../ledger/entry-sheet.js';
import { openAccountSheet, postAdjustment } from './account-form.js';
import { accountCard } from './account-card.js';
import { applyStyleVars } from './style-vars.js';
import { formatDate, today } from '../../shared/js/core/dates.js';

const id = new URLSearchParams(location.search).get('id');

mountShell({
  title: 'Account',
  back: 'modules/accounts/list.html',
  actions: `<button type="button" class="btn btn--icon" data-edit-account aria-label="Edit this account">${icon('edit', { class: 'icon' })}</button>`,
});

/* What the Edit button opens the form with: the account, and its derived
   balance so the form can show a statement's gap against it. */
let shown_ = { account: null, balance: 0 };
delegate(document.body, 'click', '[data-edit-account]', () => {
  if (shown_.account) openAccountSheet(shown_.account, { balance: shown_.balance });
});
mountCompose({ onSaved: () => refresh() });

for (const event of [
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.ACCOUNT_UPDATED, EVENTS.ACCOUNT_ARCHIVED,
]) on(event, () => refresh());

delegate(document.body, 'click', '[data-edit]', async (_event, button) => {
  const res = await ledger.find(button.dataset.edit);
  if (res.ok) openEntrySheet({ transaction: res.data, onSaved: () => refresh() });
});

/* A page of entries at a time. A bank account with three years behind it is
   a thousand rows, and the first screen only ever needs the last few days. */
const PAGE = 40;
let shown = PAGE;

delegate(document.body, 'click', '[data-more]', () => { shown += PAGE; refresh(); });

refresh();

async function refresh() {
  const found = id ? await accounts.find(id) : { ok: false };
  if (!found.ok) { drawMissing(); return; }
  const account = found.data;

  const [balanceRes, entryRes] = await Promise.all([
    ledger.balances({ book: account.book }),
    // Both legs: on this screen the incoming half of a transfer is the whole
    // point, and the list hides it everywhere else.
    ledger.list({ account_id: account.id, includeBothLegs: true }),
  ]);

  const balance = balanceRes.data[account.id] ?? 0;
  shown_ = { account, balance };
  drawHero(account, balance);
  drawMonth(account, entryRes.data);
  drawEntries(account, entryRes.data, balance);
}

function drawMissing() {
  qs('[data-name]').textContent = 'No such account';
  qs('[data-card]').innerHTML = '';
  qs('[data-entries]').innerHTML = `
    <li><div class="empty">
      <span class="empty__title">This account is not here</span>
      <p class="empty__text">It may belong to another sign-in, or the link is old.</p>
      <a class="btn btn--secondary btn--sm" href="list.html">All accounts</a>
    </div></li>`;
}

/* ---- The balance --------------------------------------------------------- */

function drawHero(account, balance) {
  const type = accounts.typeOf(account.type);
  document.title = `${account.name} — Hisab`;

  qs('[data-name]').textContent = account.name;

  // The account's own card, large: the same renderer as the list, so the
  // page and the list can never show it differently.
  const host = qs('[data-card]');
  host.innerHTML = accountCard(account, balance, { size: 'hero' });
  applyStyleVars(host);
  drawStatement(account, balance);

  const note = qs('[data-note]');
  note.hidden = true;
  if (type.credit && account.credit_limit_minor) {
    const available = account.credit_limit_minor - Math.abs(Math.min(0, balance));
    note.textContent = `${moneyLabel(available, account.currency)} available of ${moneyLabel(account.credit_limit_minor, account.currency)}`;
    note.hidden = false;
  } else if (balance < 0 && !type.credit) {
    note.textContent = 'Below zero. An entry is probably missing.';
    note.hidden = false;
  } else if (!accounts.isSpendable(account)) {
    note.textContent = 'Held, not spendable: kept out of what is left to spend.';
    note.hidden = false;
  }
}

/* ---- The last statement ----------------------------------------------------- */

/**
 * What the last statement said, against what the ledger says, with one tap
 * to post the difference. The statement is an input the owner typed in; the
 * balance stays the ledger's own derived figure.
 */
function drawStatement(account, balance) {
  const box = qs('[data-recon]');
  const said = account.statement_balance_minor;
  box.hidden = said == null;
  if (said == null) return;

  const gap = said - balance;
  const on = account.statement_on || today();
  const label = (v) => esc(moneyLabel(v, account.currency));
  qs('[data-recon-text]').innerHTML = gap === 0
    ? `${icon('check', { class: 'icon icon--sm' })} Matches the statement of ${esc(formatDate(on))}.`
    : `The statement of ${esc(formatDate(on))} says <strong>${label(said)}</strong>: the ledger is
       <strong>${label(Math.abs(gap))} ${gap > 0 ? 'short' : 'over'}</strong>.`;

  const button = qs('[data-recon-adjust]');
  button.hidden = gap === 0;
  button.disabled = false;
  button.textContent = `Post a ${moneyLabel(Math.abs(gap), account.currency)} adjustment`;
  button.onclick = async () => {
    button.disabled = true;
    const res = await postAdjustment(account, gap, on);
    if (!res.ok) button.disabled = false;
  };
}

/* ---- This month ---------------------------------------------------------- */

/**
 * In and out of THIS account this month, transfers included - a transfer
 * moves this account even though it is in no income or spending total.
 * Rows in another currency than the account's are left out, since the
 * account's balance cannot hold them as they stand.
 */
function drawMonth(account, rows) {
  const { from, to } = periodBounds(currentPeriod());
  let inMinor = 0;
  let outMinor = 0;

  for (const row of rows) {
    if (row.currency !== account.currency || !isWithin(row.occurred_on, from, to)) continue;
    if (row.direction === 'in') inMinor += row.amount_minor;
    else outMinor += row.amount_minor;
  }

  qs('[data-month]').hidden = !(inMinor || outMinor);
  qs('[data-month-in]').innerHTML = formatMoneyHTML(inMinor, account.currency);
  qs('[data-month-out]').innerHTML = formatMoneyHTML(outMinor, account.currency);
}

/* ---- The entries --------------------------------------------------------- */

/**
 * Newest first, grouped by day, each with the balance after it.
 *
 * The balance after a row is worked BACKWARDS from today's balance, which is
 * the ledger's own derived figure: after the newest row it is the balance
 * itself, and each older one adds back what the newer one moved. Nothing here
 * sums the account from its opening, so this cannot disagree with the figure
 * at the top.
 *
 * TODO(B5): the row markup goes when the ledger exports its row renderer;
 * the balance-after line stays, as it belongs to this screen.
 */
function drawEntries(account, rows, balance) {
  const host = qs('[data-entries]');
  qs('[data-count]').textContent = rows.length ? `${rows.length}` : '';

  if (!rows.length) {
    host.innerHTML = `
      <li><div class="empty">
        <span class="empty__title">Nothing recorded yet</span>
        <p class="empty__text">Entries paid from or into ${esc(account.name)} appear here.</p>
        <button type="button" class="btn btn--primary btn--sm" data-compose>Add an entry</button>
      </div></li>`;
    qs('[data-more]').hidden = true;
    return;
  }

  let after = balance;
  let lastDay = null;
  const out = [];

  rows.forEach((row, index) => {
    const moved = row.direction === 'in' ? row.amount_minor : -row.amount_minor;
    const balanceAfter = after;
    after -= moved;
    if (index >= shown) return;

    if (row.occurred_on !== lastDay) {
      out.push(`<li class="acc-day"><span>${esc(formatDayLabel(row.occurred_on))}</span></li>`);
      lastDay = row.occurred_on;
    }
    out.push(entryRow(row, moved, balanceAfter, account));
  });

  host.innerHTML = out.join('');
  qs('[data-more]').hidden = rows.length <= shown;
}

function entryRow(row, moved, balanceAfter, account) {
  const type = ledger.typeOf(row.type);
  const title = row.payee || row.category_label || type.label;
  const sub = [row.payee ? row.category_label : null, row.note].filter(Boolean).join(' · ') || type.label;
  // Out in ink, not red: most rows are spending, and a red list is an alarm.
  const tone = row.direction === 'in' ? ` money--${type.tone === 'hold' ? 'hold' : 'in'}` : '';

  return `
    <li>
      <button type="button" class="row acc-row" data-edit="${esc(row.id)}">
        <span class="row__glyph row__glyph--${type.tone}">${icon(type.icon, { class: 'icon' })}</span>
        <span class="row__main">
          <span class="row__title">${esc(title)}</span>
          <span class="row__sub"><span>${esc(sub)}</span></span>
        </span>
        <span class="row__end">
          <span class="money money--md${tone}">${formatMoneyHTML(moved, row.currency, { sign: 'always', minor: 'never' })}</span>
          ${row.currency === account.currency
            ? `<span class="acc-row__after money">${formatMoneyHTML(balanceAfter, account.currency, { minor: 'never' })}</span>`
            : ''}
        </span>
      </button>
    </li>`;
}
