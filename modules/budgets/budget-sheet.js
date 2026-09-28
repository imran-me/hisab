/**
 * Budgets · set one category's limit
 *
 * Opened from a ring on Home, a row on the Budgets screen, or a category in
 * Where it went. The amount starts at the current budget, or at the
 * server's round suggestion when there is none, so the common case - accept
 * the suggestion - is the Save button and nothing else.
 *
 * As the amount changes, one line says what it would mean this month: what
 * would be left and at what pace. The figures come from the row the server
 * sent (spent, days left); the sheet does subtraction, not accounting.
 */

import { qs, esc, delegate } from '../../shared/js/core/dom.js';
import { moneyLabel, parseAmount, formatMoney, minorFactor } from '../../shared/js/core/money.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure } from '../../shared/js/components/toast.js';
import * as budgets from './backend/api.js';

const label = (minor, code) => moneyLabel(minor, code, { minor: 'never' });

/**
 * @param {object} row          one row of GET /api/budgets
 * @param {object} month        the response's month fields (days_left, is_current)
 * @param {object} [opts]
 * @param {Function} [opts.onSaved]
 */
export function openBudgetSheet(row, month, { onSaved } = {}) {
  const code = row.budget?.currency || row.currency || 'BDT';
  const start = row.budget?.amount_minor || row.suggested_minor || 0;

  // The quick picks, each a figure the person has seen before: the round
  // suggestion, last month, their usual. Duplicates collapse.
  const picks = [
    ['Suggested', row.suggested_minor],
    ['Last month', row.last_month_minor],
    ['Usual', row.average_minor],
  ].filter(([, v]) => v > 0)
    .filter(([, v], i, all) => all.findIndex(([, w]) => w === v) === i);

  const body = `
    <form class="bud-sheet" data-bud-form novalidate>
      <p class="bud-sheet__spent">
        <strong>${esc(label(row.spent_minor, row.currency))}</strong> spent this month${row.average_minor > 0 ? ` · usually ${esc(label(row.average_minor, row.currency))}` : ''}
      </p>

      <label class="field">
        <span class="field__label">Monthly limit</span>
        <span class="amount-field">
          <span class="amount-field__currency">${esc(code === 'BDT' ? '৳' : code)}</span>
          <input class="amount-field__input" data-bud-amount inputmode="decimal" autocomplete="off"
                 value="${esc(start ? formatMoney(start, code, { minor: 'auto' }) : '')}" aria-describedby="bud-preview" data-autofocus>
        </span>
      </label>

      ${picks.length ? `
        <div class="bud-sheet__picks" role="group" aria-label="Quick amounts">
          ${picks.map(([name, v]) => `
            <button type="button" class="bud-pick" data-bud-pick="${v}">
              <span class="bud-pick__name">${esc(name)}</span>
              <span class="bud-pick__value">${esc(label(v, code))}</span>
            </button>`).join('')}
        </div>` : ''}

      <p class="bud-sheet__preview" id="bud-preview" data-bud-preview aria-live="polite"></p>

      <div class="bud-sheet__actions">
        ${row.budget ? '<button type="button" class="btn btn--ghost" data-bud-remove>Remove</button>' : ''}
        <button type="submit" class="btn btn--primary btn--block">${row.budget ? 'Save' : 'Set budget'}</button>
      </div>
    </form>`;

  const sheet = openSheet({ title: `${row.label}`, body });
  const form = qs('[data-bud-form]', sheet.el);
  const input = qs('[data-bud-amount]', form);
  const preview = qs('[data-bud-preview]', form);

  const read = () => parseAmount(input.value, code);

  const paint = () => {
    const amount = read();
    preview.classList.remove('is-over', 'is-warn');
    if (!amount || amount <= 0) { preview.textContent = 'Enter the most you want to spend on this in a month.'; return; }

    const left = amount - row.spent_minor;
    const ratio = row.spent_minor / amount;
    preview.classList.toggle('is-over', ratio >= 1);
    preview.classList.toggle('is-warn', ratio >= 0.75 && ratio < 1);

    if (!month.is_current) {
      preview.textContent = left >= 0 ? `${label(left, code)} would have been left.` : `${label(-left, code)} over.`;
      return;
    }
    if (left <= 0) { preview.textContent = `Already ${label(-left, code)} over this month.`; return; }

    const days = Math.max(1, month.days_left);
    const unit = minorFactor(code);
    const perDay = Math.floor(left / days / unit) * unit;
    preview.textContent = `${label(left, code)} left, ${label(perDay, code)}/day for ${days} ${days === 1 ? 'day' : 'days'}.`;
  };

  paint();
  input.addEventListener('input', paint);
  input.select?.();

  delegate(form, 'click', '[data-bud-pick]', (_e, button) => {
    input.value = formatMoney(Number(button.dataset.budPick), code, { minor: 'auto' });
    paint();
  });

  qs('[data-bud-remove]', form)?.addEventListener('click', async () => {
    const res = await budgets.remove(row.category_id);
    if (!res.ok) { toastFailure(res, 'Could not remove the budget.'); return; }
    sheet.close('removed');
    toastOk(`${row.label}: budget removed`);
    onSaved?.();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = read();
    if (!amount || amount <= 0) { input.focus(); paint(); return; }

    const res = await budgets.set(row.category_id, amount, code);
    if (!res.ok) { toastFailure(res, 'Could not save the budget.'); return; }
    sheet.close('saved');
    toastOk(`${row.label}: ${label(amount, code)} a month`);
    onSaved?.();
  });

  return sheet;
}

/**
 * The one-tap path: set the suggestion without opening anything, with Undo.
 */
export async function setSuggested(row, { onSaved } = {}) {
  const code = row.currency || 'BDT';
  const res = await budgets.set(row.category_id, row.suggested_minor, code);
  if (!res.ok) { toastFailure(res, 'Could not set the budget.'); return; }
  onSaved?.();
  toastOk(`${row.label}: ${label(row.suggested_minor, code)} a month`, {
    action: { label: 'Undo', onClick: async () => { await budgets.remove(row.category_id); onSaved?.(); } },
  });
}
