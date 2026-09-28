/**
 * Budgets · page script
 *
 * "How much is left in my budgets, and at what pace?" One ring for all of
 * them at the top, then each budget most-used first, then every other
 * expense category with a one-tap "Set" at the server's round suggestion.
 *
 * Every figure is the server's (GET /api/budgets through ./backend/api.js).
 * This file lays them out; the only arithmetic is the share of the month
 * gone, for the tick on the rings.
 */

import { qs, esc, icon, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel } from '../../shared/js/core/money.js';
import { currentPeriod, periodProgress, formatPeriod } from '../../shared/js/core/dates.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { mountCompose } from '../ledger/entry-sheet.js';
import { glyphOf } from '../categories/glyphs.js';
import { mountPeriodTop, drawPeriodTop } from '../reports/period-top.js';
import * as budgets from './backend/api.js';
import { ring, animateRings, percent } from './ring.js';
import { openBudgetSheet, setSuggested } from './budget-sheet.js';
import { goalCard, animateGoals, openGoalSheet } from './goals.js';

mountShell({ title: 'Budgets' });
mountCompose({ onSaved: () => refresh() });
mountPeriodTop();

for (const event of [
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.PERIOD_CHANGED, EVENTS.BOOK_CHANGED, EVENTS.CURRENCY_CHANGED,
]) on(event, () => refresh());

/** Unbudgeted categories shown before "Show N more". */
const OFFERS = 5;

let data = null;
let showAll = false;

const figure = (minor, code) => formatMoneyHTML(minor, code, { minor: 'never', direction: false });
const label = (minor, code) => moneyLabel(minor, code, { minor: 'never' });
const byId = (id) => data?.rows.find((r) => r.category_id === id);

delegate(document.body, 'click', '[data-budget]', (_e, node) => {
  const row = byId(node.dataset.budget);
  if (row) openBudgetSheet(row, data, { onSaved: refresh });
});

delegate(document.body, 'click', '[data-budget-set]', (event, node) => {
  event.stopPropagation();
  const row = byId(node.dataset.budgetSet);
  if (row) setSuggested(row, { onSaved: refresh });
});

qs('[data-offer-more]').addEventListener('click', () => { showAll = !showAll; drawOffers(); });

let goalRows = [];
qs('[data-goal-new]').addEventListener('click', () => openGoalSheet(null, { onSaved: refresh }));
delegate(document.body, 'click', '[data-goal]', (_e, node) => {
  const goal = goalRows.find((g) => g.id === node.dataset.goal);
  if (goal) openGoalSheet(goal, { onSaved: refresh });
});

refresh();

async function refresh() {
  await drawPeriodTop();
  const res = await budgets.month({ month: state.period(), book: state.book(), currency: state.currency() });
  if (!res.ok) return;

  data = res.data;
  const offline = Boolean(res.meta?.offline);
  qs('[data-offline]').hidden = !offline;
  qs('[data-hero]').hidden = offline;
  if (offline) return;

  drawHero();
  drawBudgeted();
  drawOffers();
  drawGoals(await budgets.goals());
}

/* ---- Goals --------------------------------------------------------------- */

function drawGoals(res) {
  const sec = qs('[data-goals-sec]');
  sec.hidden = !res.ok || Boolean(res.meta?.offline);
  if (sec.hidden) return;
  goalRows = res.data.goals;
  const host = qs('[data-goals]');
  host.innerHTML = goalRows.length
    ? goalRows.map(goalCard).join('')
    : `<li class="goal-empty">Save towards something: Umrah, an emergency fund, a car. Link a DPS or an FDR and it fills itself.</li>`;
  animateGoals(host);
}

/** Today's share of the month, for the tick; none for a month not in progress. */
function todayShare() {
  return data.month === currentPeriod() ? periodProgress(data.month) : null;
}

/* ---- The hero: every budget as one ring --------------------------------- */

function drawHero() {
  const t = data.totals;
  const code = data.currency;
  const dial = qs('[data-hero-dial]');
  const left = qs('[data-hero-left]');
  const pace = qs('[data-hero-pace]');
  const meta = qs('[data-hero-meta]');
  const name = formatPeriod(data.month).split(' ')[0];

  if (!t.count) {
    dial.innerHTML = `${ring(0, null, { size: 104, stroke: 10 })}<span class="bud-dial__pct">0<small>budgets</small></span>`;
    qs('[data-hero-label]').textContent = 'No budgets yet';
    left.innerHTML = '';
    pace.textContent = 'Tap Set on a category below. The amount offered is what it usually costs, rounded up.';
    meta.textContent = '';
    return;
  }

  dial.innerHTML = `${ring(t.ratio, t.state, { size: 104, stroke: 10, today: todayShare() })}
    <span class="bud-dial__pct bud-tone--${t.state}">${esc(percent(t.ratio))}<small>used</small></span>`;
  dial.setAttribute('role', 'img');
  dial.setAttribute('aria-label', `${percent(t.ratio)} of your budgets used`);

  // The room left in the budgets still under their limit, and the overrun
  // in the others, SIDE BY SIDE. Netting them (the old hero) let ৳3,071 of
  // overrun silently eat ৳4,141 of room and read "৳1,070 left" (review
  // round 7, M8): money over in Dining is not taken back out of Groceries.
  const plural = (n) => `${n} ${n === 1 ? 'budget' : 'budgets'}`;
  qs('[data-hero-label]').textContent = !t.under
    ? 'Every budget is over'
    : data.is_current ? `Left in ${plural(t.under)}` : `Left in ${plural(t.under)} at the end of ${name}`;
  left.innerHTML = figure(t.under ? t.headroom_minor : t.overrun_minor, code);
  left.classList.toggle('is-over', !t.under);

  pace.innerHTML = [
    data.is_current && t.under && t.headroom_per_day_minor !== null
      ? `<strong>${esc(label(t.headroom_per_day_minor, code))}</strong> a day for ${data.days_left} ${data.days_left === 1 ? 'day' : 'days'}`
      : '',
    t.over && t.under ? `<span class="bud-tone--over">${esc(label(t.overrun_minor, code))} over in ${plural(t.over)}</span>` : '',
  ].filter(Boolean).join('<br>');

  meta.textContent = `${label(t.spent_minor, code)} spent of ${label(t.budgeted_minor, code)}`;

  animateRings(dial);
}

/* ---- Budgets ------------------------------------------------------------- */

function drawBudgeted() {
  const rows = data.rows.filter((r) => r.budget);
  const sec = qs('[data-budgeted-sec]');
  sec.hidden = rows.length === 0;
  if (!rows.length) return;

  qs('[data-budgeted-aside]').textContent = data.is_current ? `${data.days_left} ${data.days_left === 1 ? 'day' : 'days'} left` : '';

  const today = todayShare();
  const host = qs('[data-budgeted]');
  host.innerHTML = rows.map((r) => {
    const code = r.currency;
    const over = r.left_minor < 0;
    const leftText = over ? `${label(-r.left_minor, code)} over` : `${label(r.left_minor, code)} left`;
    const day = r.per_day_minor !== null && !over ? `${label(r.per_day_minor, code)}/day` : null;

    return `
      <li>
        <button type="button" class="row bud-row" data-budget="${esc(r.category_id)}"
                aria-label="${esc(`${r.label}: ${leftText}${day ? `, ${day}` : ''}. Change the budget`)}">
          <span class="bud-dial">${ring(r.ratio, r.state, { size: 44, stroke: 4.5, today })}<span class="bud-dial__pct">${esc(percent(r.ratio))}</span></span>
          <span class="row__main">
            <span class="row__title">${esc(r.label)}</span>
            <span class="row__sub">
              <span class="bud-left bud-tone--${r.state}">${esc(leftText)}</span>
              ${day ? `<span aria-hidden="true">·</span><span>${esc(day)}</span>` : ''}
            </span>
          </span>
          <span class="row__end">
            <span class="money money--md">${figure(r.spent_minor, code)}</span>
            <span class="bud-row__of">of ${esc(label(r.budget.amount_minor, code))}</span>
          </span>
        </button>
      </li>`;
  }).join('');

  animateRings(host);
}

/* ---- Not budgeted yet ---------------------------------------------------- */

function drawOffers() {
  const all = data.rows.filter((r) => !r.budget);
  const sec = qs('[data-offer-sec]');
  sec.hidden = all.length === 0;
  if (!all.length) return;

  // The ones with a history first: a category that has cost nothing in four
  // months has nothing to suggest, and would only push the useful ones down.
  const useful = all.filter((r) => r.suggested_minor > 0);
  const quiet = all.filter((r) => r.suggested_minor <= 0);
  const shown = showAll ? [...useful, ...quiet] : useful.slice(0, OFFERS);
  const hidden = all.length - shown.length;

  qs('[data-offer-title]').textContent = data.rows.some((r) => r.budget) ? 'Not budgeted yet' : 'Set a budget';

  qs('[data-offer]').innerHTML = shown.map((r) => {
    const g = glyphOf(r);
    const code = r.currency;
    // Short on purpose: the name keeps its width, and this line has about
    // 26 characters at 360px before it would be cut.
    const sub = [
      r.spent_minor > 0 ? `${label(r.spent_minor, code)} now` : 'None yet',
      r.average_minor > 0 ? `usual ${label(r.average_minor, code)}` : null,
    ].filter(Boolean);

    return `
      <li class="bud-offer">
        <button type="button" class="row" data-budget="${esc(r.category_id)}" aria-label="${esc(`Set a budget for ${r.label}`)}">
          <span class="row__glyph ${g.className}">${icon(g.icon, { class: 'icon' })}</span>
          <span class="row__main">
            <span class="row__title">${esc(r.label)}</span>
            <span class="row__sub"><span>${esc(sub.join(' · '))}</span></span>
          </span>
        </button>
        ${r.suggested_minor > 0 ? `
          <button type="button" class="bud-set" data-budget-set="${esc(r.category_id)}"
                  aria-label="${esc(`Set ${r.label} to ${label(r.suggested_minor, code)} a month`)}">
            ${icon('plus', { class: 'icon icon--sm' })}${esc(label(r.suggested_minor, code))}
          </button>` : ''}
      </li>`;
  }).join('');

  const more = qs('[data-offer-more]');
  more.hidden = hidden <= 0 && !showAll;
  more.textContent = showAll ? 'Show fewer' : `Show ${hidden} more ${hidden === 1 ? 'category' : 'categories'}`;
}
