/**
 * Hisab · Month grid
 *
 * Choosing a month: a sheet with the year across the top and its twelve
 * months as a 3 × 4 grid. Reached by tapping the month name wherever one is
 * shown (the Ledger's stepper, Home's header), so the same picker answers
 * "which month" on every screen.
 *
 * Why a grid and not a list: a list of twelve names is a scroll to reach
 * March from September, and it hides the year. A grid shows the whole year in
 * one thumb's reach, and the year steps sideways.
 *
 * The future is disabled, not hidden: an empty month that looks like a bug is
 * worse than a month you can see you cannot pick yet.
 */

import { el, qs, icon, esc, delegate } from '../core/dom.js';
import * as state from '../core/state.js';
import { currentPeriod } from '../core/dates.js';
import { openSheet } from './sheet.js';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {object} [opts]
 * @param {string} [opts.value]     'YYYY-MM' to mark as chosen (default: app state)
 * @param {Function} [opts.onPick]  receives 'YYYY-MM' (default: state.setPeriod)
 * @param {string} [opts.earliest]  'YYYY-MM' before which months are disabled
 * @returns {{close: Function}}
 */
export function openMonthGrid({ value = state.period(), onPick = state.setPeriod, earliest = null } = {}) {
  const now = currentPeriod();
  let year = Number(String(value).slice(0, 4)) || Number(now.slice(0, 4));

  const body = el('div', { class: 'month-grid' });

  const render = () => {
    const nowYear = Number(now.slice(0, 4));
    body.innerHTML = `
      <div class="month-grid__year">
        <button type="button" class="btn btn--icon" data-year-step="-1" aria-label="Previous year">
          ${icon('chevron-left', { class: 'icon' })}
        </button>
        <span class="month-grid__year-label" aria-live="polite">${year}</span>
        <button type="button" class="btn btn--icon" data-year-step="1" aria-label="Next year"${year >= nowYear ? ' disabled' : ''}>
          ${icon('chevron-right', { class: 'icon' })}
        </button>
      </div>
      <div class="month-grid__months" role="group" aria-label="Months of ${year}">
        ${SHORT.map((name, i) => {
          const key = `${year}-${String(i + 1).padStart(2, '0')}`;
          const off = key > now || (earliest && key < earliest);
          const chosen = key === value;
          const isNow = key === now;
          return `<button type="button" class="month-grid__month${isNow ? ' is-now' : ''}"
                    data-month="${esc(key)}"${chosen ? ' aria-pressed="true"' : ' aria-pressed="false"'}${off ? ' disabled' : ''}>
                    ${esc(name)}
                  </button>`;
        }).join('')}
      </div>
      <button type="button" class="btn btn--ghost btn--block" data-month="${esc(now)}"${value === now ? ' hidden' : ''}>
        Back to this month
      </button>
    `;
  };

  render();

  const sheet = openSheet({ title: 'Month', body });

  delegate(body, 'click', '[data-year-step]', (_event, button) => {
    year += Number(button.dataset.yearStep);
    render();
    qs(`[data-year-step="${button.dataset.yearStep}"]`, body)?.focus({ preventScroll: true });
  });

  delegate(body, 'click', '[data-month]', (_event, button) => {
    if (button.disabled) return;
    onPick(button.dataset.month);
    sheet.close('picked');
  });

  return { close: sheet.close };
}
