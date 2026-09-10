/**
 * Ledger · list page
 *
 * Every entry for the selected month, grouped by day, filterable by type and
 * searchable. The list is the product's main reading surface, so the details
 * that matter here are about scanning: sticky day headings, a running total per
 * day, and amounts that align on the decimal.
 */

import { qs, qsa, icon, esc, delegate, announce } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, formatMoney, convertAndSum } from '../../shared/js/core/money.js';
import { formatDayLabel } from '../../shared/js/core/dates.js';
import { debounce } from '../../shared/js/utils/debounce.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell, periodStepper } from '../../shared/js/components/shell.js';
import * as ledger from './backend/api.js';
import * as accounts from '../accounts/backend/api.js';
import * as fx from '../fx/backend/api.js';
import { openEntrySheet, entryActions } from './entry-sheet.js';

mountShell({ title: 'Ledger', actions: entryActions() });
qs('[data-period-slot]')?.append(periodStepper());

const filters = { type: '', q: '', includeReversed: false };

/* The compose action can be reached from the app shortcut on a phone's home
   screen, which lands here with ?compose=1. */
if (new URLSearchParams(location.search).get('compose')) {
  openEntrySheet({ onSaved: refresh });
}

/* One handler for three buttons. The FAB carries a bare data-compose and so
   asks for no particular type; the header's Out and In name one. */
delegate(document.body, 'click', '[data-compose]', (_event, button) => {
  openEntrySheet({ type: button.dataset.compose || undefined, onSaved: refresh });
});

delegate(document.body, 'click', '[data-type]', (_event, button) => {
  filters.type = button.dataset.type;
  qsa('[data-type]').forEach((b) => b.classList.toggle('is-active', b === button));
  refresh();
});

/* History: show the corrections as well as what stands.
   Deliberately NOT one of the type pills, and it does not clear them - it is a
   different axis. Filtering to Out and then asking for history should show the
   history of the Out entries, not start again. */
qs('[data-show-history]')?.addEventListener('click', (event) => {
  const button = event.currentTarget;
  filters.includeReversed = !filters.includeReversed;
  button.setAttribute('aria-pressed', String(filters.includeReversed));
  button.classList.toggle('is-active', filters.includeReversed);
  refresh();
});

qs('[data-search-toggle]')?.addEventListener('click', (event) => {
  const field = qs('[data-search-field]');
  const open = field.hidden;
  field.hidden = !open;
  event.currentTarget.setAttribute('aria-expanded', String(open));
  if (open) qs('[data-search]').focus();
  else { filters.q = ''; qs('[data-search]').value = ''; refresh(); }
});

/* Debounced, because a search that re-renders four hundred rows on every
   keystroke drops characters on a mid-range phone. 220ms is below the point
   where the delay is noticeable and above the point where it fires per letter. */
qs('[data-search]')?.addEventListener('input', debounce((event) => {
  filters.q = event.target.value.trim();
  refresh();
}, 220));

delegate(document.body, 'click', '[data-edit]', async (_event, button) => {
  const res = await ledger.find(button.dataset.edit);
  if (res.ok) openEntrySheet({ transaction: res.data, onSaved: refresh });
});

for (const event of [
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.PERIOD_CHANGED, EVENTS.BOOK_CHANGED, EVENTS.CURRENCY_CHANGED,
]) on(event, () => refresh());

refresh();

async function refresh() {
  const book = state.book();
  const period = state.period();
  const display = state.currency();

  const [listRes, accountRes, summaryRes, rates] = await Promise.all([
    ledger.list({
      book, period,
      type: filters.type || undefined,
      q: filters.q || undefined,
      includeReversed: filters.includeReversed || undefined,
    }),
    accounts.list({ book, includeArchived: true }),
    ledger.summary({ book, period, currency: display }),
    fx.rates(),
  ]);

  drawTotals(summaryRes.data, display);
  drawList(listRes.data, accountRes.data, display, rates);

  // Announced rather than left silent: a screen-reader user filtering a list
  // gets no feedback at all from the list simply changing underneath them.
  if (filters.q) announce(`${listRes.data.length} ${listRes.data.length === 1 ? 'entry' : 'entries'} found`);
}

function drawTotals(summary, display) {
  qs('[data-totals]').innerHTML = `
    <div class="grid grid--pair">
      <div class="stat">
        <span class="stat__label">In</span>
        <span class="money money--lg money--in">${formatMoneyHTML(summary.income_minor, display)}</span>
      </div>
      <div class="stat">
        <span class="stat__label">Out</span>
        <span class="money money--lg money--out">${formatMoneyHTML(summary.expense_minor, display)}</span>
      </div>
    </div>`;
}

function drawList(rows, accountRows, display, rates) {
  const host = qs('[data-list]');

  if (!rows.length) {
    host.innerHTML = `<li>
      <div class="empty">
        <span class="empty__glyph">${icon(filters.q ? 'search' : 'inbox', { class: 'icon icon--lg' })}</span>
        <span class="empty__title">${filters.q ? 'Nothing matched' : 'No entries this month'}</span>
        <p class="empty__text">${filters.q
          ? esc(`Nothing here matches “${filters.q}”. Payee, note and category are searched.`)
          : 'Add the first one and the totals above start meaning something.'}</p>
        ${filters.q ? '' : '<button type="button" class="btn btn--primary btn--sm" data-compose>Add an entry</button>'}
      </div></li>`;
    return;
  }

  const byId = new Map(accountRows.map((a) => [a.id, a]));

  // Which of these rows has been cancelled. Derived once per render rather than
  // per row: entryRow() is called for every visible entry, and a scan inside it
  // would be quadratic on a busy month.
  const reversedIds = new Set(rows.filter((r) => r.reverses_id).map((r) => r.reverses_id));

  // Grouped by day, with the day's net beside the heading. The net is what
  // makes a day heading worth its row — "Sat 5 Sep" alone is a divider, "Sat 5
  // Sep −2,450" is information.
  const days = new Map();
  for (const row of rows) {
    if (!days.has(row.occurred_on)) days.set(row.occurred_on, []);
    days.get(row.occurred_on).push(row);
  }

  host.innerHTML = [...days.entries()].map(([day, dayRows]) => {
    // Transfers are excluded from the day's net for the same reason they are
    // excluded from the month's: they are not income and not spending, and
    // including them would show a net movement on a day when nothing changed.
    const counted = dayRows.filter((r) => r.type !== 'transfer');
    const net = convertAndSum(
      counted.map((r) => ({ amount_minor: r.direction === 'in' ? r.amount_minor : -r.amount_minor, currency: r.currency })),
      display,
      rates,
    ).amountMinor;

    return `
      <li class="list-group-head">
        <span>${esc(formatDayLabel(day))}</span>
        <span class="money money--sm ${net < 0 ? 'money--out' : net > 0 ? 'money--in' : 'money--flat'}">
          ${formatMoneyHTML(net, display, { sign: 'always', code: false })}
        </span>
      </li>
      ${dayRows.map((row) => entryRow(row, byId, reversedIds)).join('')}`;
  }).join('');
}

function entryRow(row, byId, reversedIds) {
  const type = ledger.typeOf(row.type);
  const account = byId.get(row.account_id);
  const amount = row.direction === 'in' ? row.amount_minor : -row.amount_minor;

  // The necessity band is shown only where it means something — on an expense.
  const band = row.type === 'expense' && row.necessity
    ? `<span class="chip chip--need-${row.necessity}">${esc(bandLabel(row.necessity))}</span>` : '';

  // What this row IS, in the history of the money — the part that makes a
  // corrected ledger readable rather than merely honest. Without it the
  // History view is three near-identical rows and no way to tell which is
  // which.
  const isReversal = Boolean(row.reverses_id);
  const wasReversed = reversedIds.has(row.id);
  const isReplacement = Boolean(row.corrects_id);

  const mark = isReversal
    ? '<span class="chip chip--warn">Reversal</span>'
    : wasReversed
      ? '<span class="chip">Reversed</span>'
      : isReplacement
        ? '<span class="chip chip--in">Corrected</span>'
        : '';

  // The reason belongs beside the row it explains. A reason nobody sees next to
  // the entry may as well not have been asked for.
  const why = isReversal && row.reversal_reason
    ? `<span aria-hidden="true">·</span><span>${esc(row.reversal_reason)}</span>` : '';

  // A cancelled entry is struck through and dimmed: it is still part of the
  // record, and it no longer counts. Saying that visually is cheaper than
  // explaining it.
  const stateClass = (isReversal || wasReversed) ? ' row--void' : '';

  return `
    <li>
      <button type="button" class="row${stateClass}" data-edit="${esc(row.id)}">
        <span class="row__glyph row__glyph--${type.tone}">${icon(type.icon, { class: 'icon' })}</span>
        <span class="row__main">
          <span class="row__title">${esc(row.payee || row.category_label || type.label)}</span>
          <span class="row__sub">
            ${row.category_label ? `<span>${esc(row.category_label)}</span><span aria-hidden="true">·</span>` : ''}
            <span>${esc(account?.name || 'Unknown account')}</span>
            ${why}
          </span>
        </span>
        <span class="row__end">
          <span class="money money--md money--${type.tone}">${formatMoneyHTML(amount, row.currency, { sign: 'always' })}</span>
          ${mark || band}
        </span>
      </button>
    </li>`;
}

/* The band labels live in the categories module's seed data, but rendering a
   chip cannot wait on an async read inside a loop over four hundred rows. The
   four are stable and ordered; the label here is presentation of a number the
   row already carries. */
function bandLabel(band) {
  return ['', 'Essential', 'Important', 'Discretionary', 'Avoidable'][band] || '';
}
