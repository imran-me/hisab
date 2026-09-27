/**
 * Month · page script
 *
 * One month, answering "where did it go, and what could I have kept?":
 * what was spent; how it built up day by day against last month; six months
 * of in against out; each category against its own recent average; the
 * necessity mix and the reclaimable slice; and the month's insights.
 *
 * Every figure comes from MonthCockpit through the accounts module's one
 * door to /api/finance (accounts/backend/api.js). This file computes nothing
 * about money beyond laying the server's figures out: running totals of the
 * per-day spend it was sent, and an average of three months it was sent.
 */

import { qs, esc } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel } from '../../shared/js/core/money.js';
import { formatPeriod, currentPeriod, shiftPeriod, daysInPeriod } from '../../shared/js/core/dates.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell } from '../../shared/js/components/shell.js';
import * as accounts from '../accounts/backend/api.js';
import { mountCompose } from '../ledger/entry-sheet.js';
import { mountPeriodTop, drawPeriodTop } from './period-top.js';
import { cumulativeChart, inOutChart } from './charts.js';
import { insightLine } from './insight-text.js';
import { applyStyleVars } from './style-vars.js';

mountShell({ title: 'Month' });
mountCompose({ onSaved: () => refresh() });
mountPeriodTop();

for (const event of [
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.PERIOD_CHANGED, EVENTS.BOOK_CHANGED, EVENTS.CURRENCY_CHANGED,
]) on(event, () => refresh());

/* ---- Formatting: everything through money.js ----------------------------- */

let currency = 'BDT';
const inline = (minor) => moneyLabel(minor, currency, { minor: 'never' });
const axis = (minor) => moneyLabel(minor, currency, { compact: true });
const row = (minor) => formatMoneyHTML(minor, currency, { minor: 'never' });
const monthName = (key) => formatPeriod(key).split(' ')[0];
const pad2 = (n) => String(n).padStart(2, '0');

refresh();

async function refresh() {
  const key = state.period();
  const book = state.book();
  currency = state.currency();

  await drawPeriodTop();

  // This month and the three before it: last month for the day-by-day line,
  // all three for each category's usual.
  const keys = [0, -1, -2, -3].map((n) => shiftPeriod(key, n));
  const [monthRes, ...priorRes] = await Promise.all(
    keys.map((k) => accounts.financeMonth(k, { book, currency })),
  );

  qs('[data-offline]').hidden = monthRes.ok;
  if (!monthRes.ok) {
    qs('[data-spent]').textContent = '—';
    for (const sel of ['[data-days-sec]', '[data-six-sec]', '[data-usual-sec]', '[data-need-sec]', '[data-notes-sec]']) {
      qs(sel).hidden = true;
    }
    return;
  }

  const month = monthRes.data;
  const prior = priorRes.map((r) => (r.ok ? r.data : null));
  const archiveRes = await accounts.financeArchive({ book, currency });

  drawHero(month, key);
  drawDays(month, prior[0], key);
  drawSix(archiveRes.ok ? archiveRes.data.months : [], key);
  drawUsual(month, prior);
  drawNeed(month);
  drawNotes(month);
}

/* ---- What was spent ------------------------------------------------------ */

function drawHero(month, key) {
  qs('[data-spent-label]').textContent = key === currentPeriod() ? 'Spent this month' : `Spent in ${monthName(key)}`;
  qs('[data-spent]').innerHTML = formatMoneyHTML(month.expense_minor, currency);

  const parts = [];
  if (month.income_minor > 0) parts.push(`${inline(month.income_minor)} in`);
  if (month.deposit_minor > 0) parts.push(`${inline(month.deposit_minor)} saved`);
  if (month.income_minor > 0) parts.push(`${Math.round(month.savings_rate)}% kept`);
  if (month.unconvertible?.length) parts.push(`${month.unconvertible.join(', ')} left out: no rate`);
  qs('[data-spent-sub]').textContent = parts.join(' · ');
}

/* ---- Day by day ------------------------------------------------------------ */

/**
 * Running spend by day, from the server's per-day totals. A reversal already
 * nets inside its day (MonthCockpit::days()), so a correction dips the line
 * rather than spiking it.
 */
function running(days, key, through) {
  const out = [];
  let sum = 0;
  for (let d = 1; d <= through; d += 1) {
    sum += days?.[`${key}-${pad2(d)}`]?.out || 0;
    out.push(sum);
  }
  return out;
}

function drawDays(month, last, key) {
  const sec = qs('[data-days-sec]');
  const total = daysInPeriod(key);
  const isNow = key === currentPeriod();
  const through = isNow ? new Date().getDate() : total;
  const lastKey = shiftPeriod(key, -1);

  const current = running(month.days, key, through);
  const previous = last ? running(last.days, lastKey, daysInPeriod(lastKey)) : [];

  sec.hidden = !(current.some(Boolean) || previous.some(Boolean));
  if (sec.hidden) return;

  qs('[data-days-now]').textContent = monthName(key);
  qs('[data-days-was]').textContent = monthName(lastKey);
  qs('[data-days-was]').hidden = !previous.length;

  const readout = qs('[data-days-readout]');
  const short = formatPeriod(key, { short: true }).split(' ')[0];

  cumulativeChart(qs('[data-days-chart]'), {
    current,
    previous,
    days: total,
    axis,
    label: `Spending built up over ${monthName(key)}: ${inline(current[current.length - 1] || 0)} by day ${current.length}`
      + (previous.length ? `, against ${inline(previous[Math.min(previous.length, current.length) - 1] || 0)} by the same day of ${monthName(lastKey)}.` : '.'),
    onPick: (i) => {
      const day = i + 1;
      const now = i < current.length
        ? `<strong>${esc(inline(current[i]))}</strong> by ${day} ${esc(short)}`
        : `${day} ${esc(short)} is still to come`;
      const was = i < previous.length ? ` · ${esc(monthName(lastKey))}: ${esc(inline(previous[i]))}` : '';
      readout.innerHTML = now + was;
    },
  });

  const rows = Array.from({ length: Math.max(total, previous.length) }, (_, i) => `
    <tr><td>${i + 1}</td>
      <td class="num">${i < current.length ? row(current[i]) : ''}</td>
      <td class="num">${i < previous.length ? row(previous[i]) : ''}</td></tr>`).join('');
  qs('[data-days-table]').innerHTML = `
    <thead><tr><th scope="col">Day</th><th scope="col" class="num">${esc(monthName(key))}</th><th scope="col" class="num">${esc(monthName(lastKey))}</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

/* ---- Six months ------------------------------------------------------------ */

function drawSix(archive, key) {
  const sec = qs('[data-six-sec]');
  // Newest first from the server; the six up to the chosen month, oldest first.
  const months = archive.filter((m) => m.month <= key).slice(0, 6).reverse();
  sec.hidden = months.length < 2;
  if (sec.hidden) return;

  const readout = qs('[data-six-readout]');
  inOutChart(qs('[data-six-chart]'), {
    months: months.map((m) => ({
      short: formatPeriod(m.month, { short: true }).split(' ')[0],
      in: m.income_minor,
      out: m.expense_minor,
    })),
    axis,
    label: `Income against spending for ${months.length} months, ${monthName(months[0].month)} to ${monthName(months[months.length - 1].month)}.`,
    onPick: (i) => {
      const m = months[i];
      const kept = m.income_minor > 0 ? ` · ${Math.round(m.savings_rate)}% kept` : '';
      readout.innerHTML = `${esc(monthName(m.month))}: <strong>${esc(inline(m.income_minor))}</strong> in, `
        + `<strong>${esc(inline(m.expense_minor))}</strong> out${esc(kept)}`;
    },
  });

  qs('[data-six-table]').innerHTML = `
    <thead><tr><th scope="col">Month</th><th scope="col" class="num">In</th><th scope="col" class="num">Out</th><th scope="col" class="num">Kept</th></tr></thead>
    <tbody>${months.slice().reverse().map((m) => `
      <tr><td>${esc(formatPeriod(m.month, { short: true }))}</td>
        <td class="num">${row(m.income_minor)}</td>
        <td class="num">${row(m.expense_minor)}</td>
        <td class="num">${m.income_minor > 0 ? `${Math.round(m.savings_rate)}%` : '—'}</td></tr>`).join('')}
    </tbody>`;
}

/* ---- Against your usual ---------------------------------------------------- */

/**
 * Each of this month's top categories against its average over the three
 * months before. Only months that had anything in them count toward the
 * average: a month before the ledger started is not a month of zero spending.
 */
function drawUsual(month, prior) {
  const sec = qs('[data-usual-sec]');
  const top = (month.sectors?.expense || []).slice(0, 6);
  sec.hidden = top.length === 0;
  if (sec.hidden) return;

  const counted = prior.filter((m) => m && m.count > 0);
  const usual = (label) => {
    if (!counted.length) return null;
    const sum = counted.reduce((n, m) => n + ((m.sectors?.expense || []).find(([l]) => l === label)?.[1] || 0), 0);
    return Math.floor(sum / counted.length);
  };

  const rows = top.map(([label, value]) => ({ label, value, avg: usual(label) }));
  const scale = Math.max(1, ...rows.flatMap((r) => [r.value, r.avg || 0]));

  qs('[data-usual]').innerHTML = rows.map((r) => {
    let delta = '';
    if (r.avg === null) delta = '';
    else if (r.avg === 0) delta = 'new';
    else {
      const change = Math.round(((r.value - r.avg) / r.avg) * 100);
      delta = change === 0 ? 'as usual' : `${change > 0 ? '+' : '−'}${Math.abs(change)}%`;
    }
    const tone = r.avg && r.value > r.avg * 1.1 ? ' is-up' : '';

    return `
      <li class="month-cat${tone}">
        <span class="month-cat__name">${esc(r.label)}</span>
        <span class="month-cat__value money">${row(r.value)}</span>
        <span class="month-cat__delta">${esc(delta)}</span>
        <span class="month-cat__bar" aria-hidden="true">
          <span class="month-cat__fill" data-vars="w:${((r.value / scale) * 100).toFixed(1)}%"></span>
          ${r.avg ? `<span class="month-cat__tick" data-vars="at:${((r.avg / scale) * 100).toFixed(1)}%"></span>` : ''}
        </span>
        ${r.avg ? `<span class="sr-only">Usual ${esc(inline(r.avg))}.</span>` : ''}
      </li>`;
  }).join('');
  applyStyleVars(qs('[data-usual]'));

  qs('[data-usual-sec] .month-sec__aside').textContent = counted.length
    ? `tick: ${counted.length}-month average`
    : 'no earlier months to compare';
}

/* ---- Was it worth it -------------------------------------------------------- */

const BANDS = [
  { band: 1, label: 'Essential' },
  { band: 2, label: 'Important' },
  { band: 3, label: 'Discretionary' },
  { band: 4, label: 'Avoidable' },
];

function drawNeed(month) {
  const sec = qs('[data-need-sec]');
  const spent = month.expense_minor || 0;
  sec.hidden = spent <= 0;
  if (sec.hidden) return;

  const rows = BANDS.map((b) => ({ label: b.label, value: month.by_need?.[b.band] || 0, band: b.band }));
  if (month.untagged_minor > 0) rows.push({ label: 'Not judged', value: month.untagged_minor, band: 0 });

  qs('[data-need]').innerHTML = rows.map((r) => `
    <li class="month-cat month-cat--band-${r.band}">
      <span class="month-cat__name">${esc(r.label)}</span>
      <span class="month-cat__value money">${row(r.value)}</span>
      <span class="month-cat__delta">${Math.round((r.value / spent) * 100)}%</span>
      <span class="month-cat__bar" aria-hidden="true">
        <span class="month-cat__fill" data-vars="w:${((r.value / spent) * 100).toFixed(1)}%"></span>
      </span>
    </li>`).join('');
  applyStyleVars(qs('[data-need]'));

  const grade = month.quality?.grade;
  qs('[data-grade]').textContent = grade ? `Spend quality ${grade}` : '';

  // The reclaimable slice: all of the avoidable and half of the
  // discretionary (MonthCockpit::leak()) - a figure a person can believe,
  // unlike "every meal out could have not happened".
  const save = qs('[data-save]');
  save.hidden = !(month.leak_minor > 0);
  if (!save.hidden) {
    qs('[data-save-figure]').innerHTML = formatMoneyHTML(month.leak_minor, currency, { minor: 'never' });
    qs('[data-save-why]').textContent = 'all of the avoidable, and half of the discretionary';
  }
}

/* ---- What the month says ---------------------------------------------------- */

function drawNotes(month) {
  const lines = (month.insights || [])
    .map((i) => insightLine(i, inline, monthName))
    .filter(Boolean)
    .slice(0, 4);

  qs('[data-notes-sec]').hidden = lines.length === 0;
  qs('[data-notes]').innerHTML = lines.map((n) => `
    <li class="month-note month-note--${n.tone}">
      <strong class="month-note__lead">${esc(n.lead)}</strong>
      <span class="month-note__text">${esc(n.text)}</span>
    </li>`).join('');
}
