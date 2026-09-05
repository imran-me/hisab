/**
 * Overview · page script
 *
 * The composition root for the home screen. It is the one file allowed to
 * import several modules' api.js at once — that is what a page IS — and it
 * holds no data logic of its own: every figure on this screen is computed in
 * the module that owns it.
 */

import { qs, qsa, render, html, raw, esc, icon, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, formatMoney, convertAndSum } from '../../shared/js/core/money.js';
import { formatDayLabel, formatPeriod, lastPeriods, currentPeriod } from '../../shared/js/core/dates.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell, periodStepper } from '../../shared/js/components/shell.js';
import { sparkline, breakdownBar, segmentColor } from '../../shared/js/components/spark.js';
import * as accounts from '../accounts/backend/api.js';
import * as ledger from '../ledger/backend/api.js';
import * as fx from '../fx/backend/api.js';
import { openEntrySheet } from '../ledger/entry-sheet.js';

mountShell({ title: 'Overview' });

qs('[data-period-slot]')?.append(periodStepper());

/** Redraw on anything that changes what this screen shows. */
for (const event of [
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.ACCOUNT_CREATED, EVENTS.ACCOUNT_UPDATED, EVENTS.ACCOUNT_ARCHIVED,
  EVENTS.PERIOD_CHANGED, EVENTS.BOOK_CHANGED, EVENTS.CURRENCY_CHANGED,
]) on(event, () => refresh());

delegate(document.body, 'click', '[data-compose]', () => openEntrySheet({ onSaved: refresh }));

refresh();

async function refresh() {
  const book = state.book();
  const display = state.currency();

  const [accountRes, balanceRes, summaryRes, recentRes, rates] = await Promise.all([
    accounts.list({ book }),
    ledger.balances({ book }),
    ledger.summary({ book, period: state.period(), currency: display }),
    ledger.list({ book, limit: 6 }),
    fx.rates(),
  ]);

  drawNetWorth(accountRes.data, balanceRes.data, rates, display);
  drawMonth(summaryRes.data, display);
  await drawTrend(book, display);
  drawAccounts(accountRes.data, balanceRes.data);
  drawRecent(recentRes.data, accountRes.data);
  drawInsights(summaryRes.data, display);
}

/* =========================================================================
   Net worth
   ========================================================================= */

function drawNetWorth(accountRows, balances, rates, display) {
  // Spendable and held are kept apart rather than summed into one figure.
  // Money in a DPS is yours, but it is not money you can spend today, and one
  // combined number is how a savings balance gets accidentally budgeted.
  const spendableRows = [];
  const heldRows = [];

  for (const account of accountRows) {
    const row = { amount_minor: balances[account.id] ?? 0, currency: account.currency };
    (accounts.isSpendable(account) ? spendableRows : heldRows).push(row);
  }

  const spendable = convertAndSum(spendableRows, display, rates);
  const held = convertAndSum(heldRows, display, rates);
  const net = spendable.amountMinor + held.amountMinor;

  const missing = [...new Set([...spendable.missing, ...held.missing])];

  const netNode = qs('[data-net]');
  netNode.innerHTML = formatMoneyHTML(net, display);
  netNode.classList.toggle('money--converted', accountRows.some((a) => a.currency !== display));

  // The note is where the honesty lives. A cross-currency roll-up is an
  // estimate; saying so costs one line and stops the figure being read as an
  // exact balance.
  const note = qs('[data-net-note]');
  const parts = [];
  if (accountRows.some((a) => a.currency !== display)) parts.push(`converted to ${display}`);
  if (missing.length) parts.push(`${missing.join(', ')} not included — no rate set`);
  note.textContent = parts.join(' · ');
  note.hidden = parts.length === 0;

  qs('[data-net-spendable]').innerHTML = formatMoneyHTML(spendable.amountMinor, display);
  qs('[data-net-held]').innerHTML = formatMoneyHTML(held.amountMinor, display);
}

/* =========================================================================
   This month
   ========================================================================= */

function drawMonth(summary, display) {
  const tiles = [
    { label: 'In',   value: summary.income_minor,  tone: 'in' },
    { label: 'Out',  value: summary.expense_minor, tone: 'out' },
    { label: 'Held', value: summary.held_minor,    tone: 'hold' },
    {
      label: 'Kept',
      value: summary.kept_minor,
      // Kept is the one figure whose sign is meaningful: a negative month means
      // more went out than came in, and it should read as bad rather than
      // simply as a smaller number.
      tone: summary.kept_minor < 0 ? 'out' : 'flat',
      note: summary.income_minor > 0 ? `${summary.savings_rate.toFixed(0)}% of income` : null,
    },
  ];

  render(qs('[data-month-stats]'), html`${raw(tiles.map((t) => `
    <div class="stat">
      <span class="stat__label">${esc(t.label)}</span>
      <span class="money money--lg money--${t.tone}">${formatMoneyHTML(t.value, display)}</span>
      ${t.note ? `<span class="stat__delta">${esc(t.note)}</span>` : ''}
    </div>`).join(''))}`);

  // The breakdown only earns its space once there is something to break down.
  const panel = qs('[data-breakdown]');
  const categories = summary.by_category.slice(0, 6);
  panel.hidden = categories.length === 0;
  if (panel.hidden) return;

  const parts = categories.map((c, i) => ({ ...c, color: segmentColor(i) }));
  qs('[data-breakdown-bar]').innerHTML = breakdownBar(parts);

  const total = summary.expense_minor || 1;
  qs('[data-breakdown-legend]').innerHTML = parts.map((p) => `
    <div class="legend__item" style="--seg-color:${p.color}">
      <span class="legend__swatch"></span>
      <span class="legend__name">${esc(p.name)}</span>
      <span class="legend__value money">${formatMoneyHTML(p.value, display, { code: false })}</span>
      <span class="legend__pct">${((p.value / total) * 100).toFixed(0)}%</span>
    </div>`).join('');
}

/**
 * Twelve months of net movement, as a sparkline beside the headline figure.
 *
 * Net rather than spending: a line of expense totals says nothing about whether
 * the months were good ones.
 */
async function drawTrend(book, display) {
  const periods = lastPeriods(12, currentPeriod());
  const [income, expense, held] = await Promise.all([
    ledger.series(periods, { book, type: 'income', currency: display }),
    ledger.series(periods, { book, type: 'expense', currency: display }),
    ledger.series(periods, { book, type: 'deposit', currency: display }),
  ]);

  const net = periods.map((_, i) => income[i].value - expense[i].value - held[i].value);
  const any = net.some((v) => v !== 0);

  const host = qs('[data-net-spark]');
  host.innerHTML = any
    ? sparkline(net, { label: `Net movement over ${periods.length} months`, width: 160, height: 44 })
    : '';
}

/* =========================================================================
   Accounts and recent entries
   ========================================================================= */

function drawAccounts(accountRows, balances) {
  qs('[data-account-count]').textContent = accountRows.length ? `${accountRows.length}` : '';

  if (!accountRows.length) {
    render(qs('[data-accounts]'), html`
      <li>${raw(emptyState({
        glyph: 'wallet',
        title: 'No accounts yet',
        text: 'An account is anywhere money sits — cash, bKash, a bank, a card, a DPS.',
        action: '<a class="btn btn--primary btn--sm" href="modules/accounts/list.html?new=1">Add an account</a>',
      }))}</li>`);
    return;
  }

  const rows = accountRows.map((account) => {
    const balance = balances[account.id] ?? 0;
    const type = accounts.typeOf(account.type);
    // A credit card's balance is normally negative and that is not a warning —
    // it is what a card is. It is coloured only when it exceeds its limit.
    const overLimit = type.credit && account.credit_limit_minor && Math.abs(balance) > account.credit_limit_minor;

    return `
      <li>
        <a class="row" href="modules/accounts/detail.html?id=${encodeURIComponent(account.id)}">
          <span class="row__glyph">${icon(type.icon, { class: 'icon' })}</span>
          <span class="row__main">
            <span class="row__title">${esc(account.name)}</span>
            <span class="row__sub">
              <span>${esc(type.label)}</span>
              ${account.number_tail ? `<span>·</span><span class="num">••${esc(account.number_tail)}</span>` : ''}
            </span>
          </span>
          <span class="row__end">
            <span class="money money--md ${balance < 0 && !type.credit ? 'money--out' : overLimit ? 'money--out' : 'money--flat'}">
              ${formatMoneyHTML(balance, account.currency)}
            </span>
          </span>
          ${icon('chevron-right', { class: 'icon icon--sm row__chev' })}
        </a>
      </li>`;
  }).join('');

  qs('[data-accounts]').innerHTML = rows;
}

function drawRecent(rows, accountRows) {
  const host = qs('[data-recent]');

  if (!rows.length) {
    host.innerHTML = `<li>${emptyState({
      glyph: 'inbox',
      title: 'Nothing recorded yet',
      text: 'Add the first entry and the figures above start meaning something.',
      action: '<button type="button" class="btn btn--primary btn--sm" data-compose>Add an entry</button>',
    })}</li>`;
    return;
  }

  const byId = new Map(accountRows.map((a) => [a.id, a]));
  let lastDay = null;

  host.innerHTML = rows.map((row) => {
    const type = ledger.typeOf(row.type);
    const account = byId.get(row.account_id);
    const dayHead = row.occurred_on !== lastDay
      ? `<li class="list-group-head"><span>${esc(formatDayLabel(row.occurred_on))}</span></li>` : '';
    lastDay = row.occurred_on;

    const sign = row.direction === 'in' ? 'always' : 'auto';
    const amount = row.direction === 'in' ? row.amount_minor : -row.amount_minor;

    return `${dayHead}
      <li>
        <button type="button" class="row" data-edit="${esc(row.id)}">
          <span class="row__glyph row__glyph--${type.tone}">${icon(type.icon, { class: 'icon' })}</span>
          <span class="row__main">
            <span class="row__title">${esc(row.payee || row.category_label || type.label)}</span>
            <span class="row__sub">
              ${row.category_label ? `<span>${esc(row.category_label)}</span><span>·</span>` : ''}
              <span>${esc(account?.name || 'Unknown account')}</span>
            </span>
          </span>
          <span class="row__end">
            <span class="money money--md money--${type.tone}">${formatMoneyHTML(amount, row.currency, { sign })}</span>
          </span>
        </button>
      </li>`;
  }).join('');
}

delegate(document.body, 'click', '[data-edit]', async (_event, button) => {
  const res = await ledger.find(button.dataset.edit);
  if (res.ok) openEntrySheet({ transaction: res.data, onSaved: refresh });
});

/* =========================================================================
   Insights
   ========================================================================= */

/**
 * Insights are generated FROM the month's figures, never from a template with
 * numbers dropped in. The difference matters: an insight that would say nothing
 * is not shown at all, rather than padded out to fill the panel.
 */
function drawInsights(summary, display) {
  const out = [];
  const money = (v) => formatMoney(v, display, { code: true });

  if (summary.count === 0) {
    qs('[data-insights]').hidden = true;
    return;
  }

  if (summary.income_minor > 0) {
    const rate = summary.savings_rate;
    if (rate >= 20) {
      out.push({ tone: 'good', icon: 'target', text: `You kept <strong>${rate.toFixed(0)}%</strong> of what came in this month — above the 20% mark that is usually called healthy.` });
    } else if (rate < 0) {
      out.push({ tone: 'bad', icon: 'alert', text: `You spent <strong>${money(Math.abs(summary.kept_minor))}</strong> more than you received. Something is being drawn down to cover it.` });
    } else {
      out.push({ tone: 'warn', icon: 'trend-down', text: `You kept <strong>${rate.toFixed(0)}%</strong> of what came in. Twenty per cent is the usual target.` });
    }
  }

  if (summary.held_minor > 0) {
    const share = summary.income_minor > 0 ? ` — ${((summary.held_minor / summary.income_minor) * 100).toFixed(0)}% of what came in` : '';
    out.push({ tone: 'hold', icon: 'arrow-hold', text: `<strong>${money(summary.held_minor)}</strong> moved into savings and investment${share}. That is taken out of spendable income, not counted as spending.` });
  }

  const top = summary.by_category[0];
  if (top && summary.expense_minor > 0) {
    const share = (top.value / summary.expense_minor) * 100;
    // Only interesting when it is genuinely dominant. "Your biggest category
    // was 12% of spending" is a sentence that tells nobody anything.
    if (share >= 25) {
      out.push({ tone: 'info', icon: 'pie', text: `<strong>${esc(top.name)}</strong> took <strong>${share.toFixed(0)}%</strong> of everything you spent — ${money(top.value)} across ${top.count} ${top.count === 1 ? 'entry' : 'entries'}.` });
    }
  }

  const avoidable = summary.by_necessity.find((n) => String(n.name) === '4');
  if (avoidable && avoidable.value > 0 && summary.expense_minor > 0) {
    const share = (avoidable.value / summary.expense_minor) * 100;
    out.push({ tone: 'bad', icon: 'alert', text: `<strong>${money(avoidable.value)}</strong> went on things you marked avoidable — ${share.toFixed(0)}% of the month's spending.` });
  }

  if (summary.unconvertible.length) {
    out.push({ tone: 'warn', icon: 'globe', text: `No exchange rate for ${esc(summary.unconvertible.join(', '))}, so those amounts are left out of the totals above. Set a rate in Settings.` });
  }

  const panel = qs('[data-insights]');
  panel.hidden = out.length === 0;
  if (panel.hidden) return;

  qs('[data-insight-list]').innerHTML = out.map((i) => `
    <div class="callout callout--${i.tone}">
      ${icon(i.icon, { class: 'icon callout__glyph' })}
      <div class="callout__body">${i.text}</div>
    </div>`).join('');
}

/* ---- Shared empty state ------------------------------------------------- */

function emptyState({ glyph, title, text, action = '' }) {
  return `
    <div class="empty">
      <span class="empty__glyph">${icon(glyph, { class: 'icon icon--lg' })}</span>
      <span class="empty__title">${esc(title)}</span>
      <p class="empty__text">${esc(text)}</p>
      ${action}
    </div>`;
}
