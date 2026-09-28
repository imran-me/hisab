/**
 * Budgets · savings goals
 *
 *   goalCard()       one goal: its icon, a bar to the target, saved of
 *                    target, and one line that answers "will I make it?"
 *   openGoalSheet()  make or change a goal: name, target, by when, and what
 *                    feeds it (a DPS / FDR / savings account, or a deposit
 *                    category). Progress is never typed: it is the ledger's.
 */

import { qs, qsa, esc, icon, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel, parseAmount, formatMoney } from '../../shared/js/core/money.js';
import { formatPeriod } from '../../shared/js/core/dates.js';
import { openSheet, confirmDialog } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure } from '../../shared/js/components/toast.js';
import { accountLogo } from '../../shared/js/components/bank-logo.js';
import * as accounts from '../accounts/backend/api.js';
import * as categories from '../categories/backend/api.js';
import * as budgets from './backend/api.js';

const ICONS = ['target', 'globe', 'home', 'shield-lock', 'card', 'coins', 'trend-up', 'users'];
const label = (minor, code) => moneyLabel(minor, code, { minor: 'never' });

/** The one line under a goal's bar, in the order a person asks. */
function verdict(g) {
  const c = g.currency;
  switch (g.state) {
    case 'achieved': return { tone: 'in', text: 'Reached. Well done.' };
    case 'unlinked': return { tone: 'muted', text: 'Link an account or a deposit category to track it' };
    case 'on_track': return { tone: 'in', text: `On track · ${label(g.needed_per_month_minor, c)}/month needed` };
    case 'behind': return {
      tone: 'warn',
      text: `Needs ${label(g.needed_per_month_minor, c)}/month · going in ${label(g.recent_per_month_minor, c)}`,
    };
    default: return {
      tone: 'muted',
      text: g.eta ? `At ${label(g.recent_per_month_minor, c)}/month: ${formatPeriod(g.eta, { short: true })}` : 'No date set',
    };
  }
}

export function goalCard(g) {
  const v = verdict(g);
  const pct = Math.min(100, Math.round(g.ratio * 100));
  const link = g.account ? g.account.name : g.category_id ? 'Deposits' : null;
  const when = g.target_on ? `by ${formatPeriod(g.target_on.slice(0, 7), { short: true })}` : null;
  return `
    <li>
      <button type="button" class="goal" data-goal="${esc(g.id)}"
              aria-label="${esc(`${g.name}: ${label(g.saved_minor, g.currency)} of ${label(g.target_minor, g.currency)}. ${v.text}`)}">
        <span class="goal__glyph goal__glyph--${g.state}">${icon(g.icon || 'target', { class: 'icon' })}</span>
        <span class="goal__main">
          <span class="goal__top">
            <span class="goal__name">${esc(g.name)}</span>
            <span class="goal__pct">${pct}%</span>
          </span>
          <span class="goal__bar" role="presentation"><i class="goal__fill goal__fill--${g.state}" data-goal-fill="${pct}"></i></span>
          <span class="goal__figs">
            <span class="money">${formatMoneyHTML(g.saved_minor, g.currency, { minor: 'never', type: 'deposit' })}</span>
            <span class="goal__of">of ${esc(label(g.target_minor, g.currency))}${when ? ` · ${esc(when)}` : ''}${link ? ` · ${esc(link)}` : ''}</span>
          </span>
          <span class="goal__verdict goal__verdict--${v.tone}">${esc(v.text)}</span>
        </span>
      </button>
    </li>`;
}

/** Grow each bar from empty once it is in the page (CSSOM, so the CSP allows it). */
export function animateGoals(root) {
  const bars = [...root.querySelectorAll('[data-goal-fill]')];
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const bar of bars) bar.style.setProperty('--goal-fill', `${bar.dataset.goalFill}%`);
  }));
}

/**
 * @param {object|null} goal   a goal from GET /api/goals, or null for a new one
 * @param {object} [opts]
 * @param {Function} [opts.onSaved]
 */
export async function openGoalSheet(goal = null, { onSaved } = {}) {
  const code = goal?.currency || 'BDT';
  const [accRes, catRes] = await Promise.all([
    accounts.list({ book: 'personal' }),
    categories.list({ book: 'personal', type: 'deposit' }),
  ]);
  // What can feed a goal: money you hold (DPS, FDR, savings, an investment),
  // or the deposit categories money is saved under.
  const held = (accRes.data || []).filter((a) => !accounts.isSpendable(a) && a.type !== 'dues');
  const cats = catRes.data || [];
  let link = goal?.account ? `a:${goal.account.id}` : goal?.category_id ? `c:${goal.category_id}` : '';
  let chosenIcon = goal?.icon || 'target';

  const body = `
    <form class="goal-form" data-goal-form novalidate>
      <label class="field">
        <span class="field__label">Name</span>
        <input class="input" name="name" maxlength="80" autocomplete="off" placeholder="Umrah, emergency fund, a car" value="${esc(goal?.name || '')}" data-autofocus>
      </label>

      <div class="goal-form__icons" role="group" aria-label="Icon">
        ${ICONS.map((i) => `<button type="button" class="goal-icon" data-icon="${i}" aria-pressed="${i === chosenIcon}" aria-label="${i}">${icon(i, { class: 'icon' })}</button>`).join('')}
      </div>

      <div class="goal-form__pair">
        <label class="field">
          <span class="field__label">Target</span>
          <span class="amount-field">
            <span class="amount-field__currency">৳</span>
            <input class="amount-field__input" name="target" inputmode="decimal" autocomplete="off" placeholder="0"
                   value="${goal ? esc(formatMoney(goal.target_minor, code, { minor: 'auto' })) : ''}">
          </span>
        </label>
        <label class="field">
          <span class="field__label">By</span>
          <input class="input" type="month" name="target_on" value="${esc(goal?.target_on?.slice(0, 7) || '')}">
        </label>
      </div>

      <div class="field">
        <span class="field__label">What counts towards it</span>
        <div class="goal-links" role="radiogroup" aria-label="What counts towards it">
          ${held.map((a) => `
            <button type="button" class="goal-link" role="radio" data-link="a:${esc(a.id)}" aria-checked="${link === `a:${a.id}`}">
              ${accountLogo(a, 24)}<span><strong>${esc(a.name)}</strong><small>its balance</small></span>
            </button>`).join('')}
          ${cats.map((c) => `
            <button type="button" class="goal-link" role="radio" data-link="c:${esc(c.id)}" aria-checked="${link === `c:${c.id}`}">
              <span class="goal-link__tag">${icon('arrow-hold', { class: 'icon icon--sm' })}</span><span><strong>${esc(c.label)}</strong><small>deposits from now</small></span>
            </button>`).join('')}
        </div>
      </div>

      <p class="goal-form__hint" data-goal-hint></p>
      <div class="goal-form__actions">
        ${goal ? '<button type="button" class="btn btn--ghost" data-goal-remove>Delete</button>' : ''}
        <button type="submit" class="btn btn--primary btn--block">${goal ? 'Save' : 'Add goal'}</button>
      </div>
    </form>`;

  const sheet = openSheet({ title: goal ? goal.name : 'New goal', body });
  const form = qs('[data-goal-form]', sheet.el);

  // "৳12,500 a month" as the target and the date change: the question a goal
  // is set to answer, before it is even saved.
  const hint = () => {
    const target = parseAmount(form.elements.target.value, code);
    const month = form.elements.target_on.value;
    const node = qs('[data-goal-hint]', form);
    if (!target || !month) { node.textContent = ''; return; }
    const now = new Date();
    const [y, m] = month.split('-').map(Number);
    const months = Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1);
    const saved = goal?.saved_minor || 0;
    const per = Math.ceil(Math.max(0, target - saved) / months);
    node.textContent = `${label(per, code)} a month for ${months} ${months === 1 ? 'month' : 'months'}.`;
  };
  hint();
  form.elements.target.addEventListener('input', hint);
  form.elements.target_on.addEventListener('input', hint);

  delegate(form, 'click', '[data-icon]', (_e, b) => {
    chosenIcon = b.dataset.icon;
    qsa('[data-icon]', form).forEach((n) => n.setAttribute('aria-pressed', String(n === b)));
  });
  delegate(form, 'click', '[data-link]', (_e, b) => {
    link = link === b.dataset.link ? '' : b.dataset.link;
    qsa('[data-link]', form).forEach((n) => n.setAttribute('aria-checked', String(n.dataset.link === link)));
  });

  qs('[data-goal-remove]', form)?.addEventListener('click', async () => {
    const sure = await confirmDialog({
      title: `Delete ${goal.name}?`, text: 'The money stays where it is. Only the goal goes.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!sure) return;
    const res = await budgets.removeGoal(goal.id);
    if (!res.ok) { toastFailure(res, 'Could not delete the goal.'); return; }
    sheet.close('removed');
    onSaved?.();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const target = parseAmount(form.elements.target.value, code);
    if (!name) { form.elements.name.focus(); return; }
    if (!target || target <= 0) { form.elements.target.focus(); return; }

    const month = form.elements.target_on.value;
    const res = await budgets.saveGoal(goal?.id || null, {
      name, target_minor: target, icon: chosenIcon,
      target_on: month ? `${month}-01` : null,
      account_id: link.startsWith('a:') ? link.slice(2) : null,
      category_id: link.startsWith('c:') ? link.slice(2) : null,
    });
    if (!res.ok) { toastFailure(res, 'Could not save the goal.'); return; }
    sheet.close('saved');
    toastOk(goal ? `${name} saved` : `${name}: ${label(target, code)} goal added`);
    onSaved?.();
  });
}
