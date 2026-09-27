/**
 * Reports · the month and the book, at the top of a screen
 *
 * Home and Month open on the same line: the month everything below is about
 * (tap it for the shared year grid) and the book (tap to switch, when there
 * is a second one). One implementation for both screens, so they cannot
 * drift.
 *
 * The markup it expects:
 *
 *   <div class="period-top">
 *     <button class="period-top__month" data-month-open><span data-month-name></span>…</button>
 *     <button class="period-top__book" data-book-toggle disabled><span data-book-name></span></button>
 *   </div>
 */

import { qs, delegate } from '../../shared/js/core/dom.js';
import { formatPeriod, currentPeriod } from '../../shared/js/core/dates.js';
import * as state from '../../shared/js/core/state.js';
import { openMonthGrid } from '../../shared/js/components/month-grid.js';
import * as accounts from '../accounts/backend/api.js';

let wired = false;

/** Wire the two controls. Once per page; state changes emit their own events. */
export function mountPeriodTop() {
  if (wired) return;
  wired = true;
  // The shared picker (A6): the whole year as a grid, the future disabled.
  delegate(document.body, 'click', '[data-month-open]', () => openMonthGrid());
  delegate(document.body, 'click', '[data-book-toggle]', () => {
    state.setBook(state.book() === 'personal' ? 'business' : 'personal');
  });
}

/**
 * Paint the month name and the book pill for the current state.
 *
 * The pill only switches when there is a second book to switch to: a toggle
 * that flips to an empty business book is a way to make a screen look broken.
 */
export async function drawPeriodTop() {
  const period = state.period();
  const name = qs('[data-month-name]');
  if (name) {
    name.textContent = period === currentPeriod() ? formatPeriod(period).split(' ')[0] : formatPeriod(period);
  }

  const pill = qs('[data-book-toggle]');
  if (!pill) return;

  const all = (await accounts.list({ includeArchived: false })).data;
  const hasBusiness = all.some((a) => a.book !== 'personal');
  const label = state.book() === 'personal' ? 'Personal' : 'Business';

  pill.disabled = !hasBusiness;
  pill.setAttribute('aria-label', hasBusiness ? `Book: ${label}. Switch book` : `Book: ${label}`);
  pill.classList.toggle('is-business', state.book() !== 'personal');
  qs('[data-book-name]', pill).textContent = label;
}
