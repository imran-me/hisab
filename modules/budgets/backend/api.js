/**
 * Budgets · module API
 *
 * The one door between any screen and budget data. Shapes are in
 * `endpoints.md`, returned unchanged.
 *
 * SERVER-ONLY, deliberately, like the month cockpit: what a budget has used
 * is the ledger's spending summed by the server's rule, and a browser copy of
 * that rule would be the second implementation CONVENTIONS.md warns about.
 * With no server there is nowhere a budget could have been set, so the answer
 * is "none" rather than a failure, and Home simply shows no rings.
 */

import { get, put, del, hasBackend } from '../../../shared/js/core/http.js';
import { currentPeriod } from '../../../shared/js/core/dates.js';
import { emit } from '../../../shared/js/core/bus.js';

/** This module's own event: a budget was set or removed. Payload { category_id }. */
export const BUDGET_CHANGED = 'budget:changed';

/** Tones for the three states: green, amber, red - the owner's rule. */
export const STATES = {
  ok:   { tone: 'in',     label: 'On track' },
  warn: { tone: 'warn',   label: 'Close to the limit' },
  over: { tone: 'danger', label: 'Over' },
};

const EMPTY = (month, book, currency) => ({
  month, book, currency, days_in_month: 0, days_left: 0, is_current: false,
  totals: { budgeted_minor: 0, spent_minor: 0, left_minor: null, per_day_minor: null, ratio: null, state: null, count: 0, over: 0 },
  rows: [], other_minor: 0, unconvertible: [],
});

/** One month of budgets for one book: every expense category, budgeted first. */
export async function month({ month = currentPeriod(), book = 'personal', currency = 'BDT' } = {}) {
  if (!(await hasBackend())) return { ok: true, data: EMPTY(month, book, currency), meta: { offline: true } };
  const res = await get('/budgets', { month, book, currency });
  if (!res.ok) return res.reason === 'auth' ? res : { ok: true, data: EMPTY(month, book, currency), meta: { offline: true } };
  return { ok: true, data: res.data?.data };
}

/** Set (or replace) a category's monthly limit. */
export async function set(categoryId, amountMinor, currency = 'BDT') {
  if (!(await hasBackend())) return { ok: false, reason: 'offline' };
  const res = await put(`/budgets/${encodeURIComponent(categoryId)}`, { amount_minor: Math.trunc(amountMinor), currency });
  if (res.ok) emit(BUDGET_CHANGED, { category_id: categoryId });
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

export async function remove(categoryId) {
  if (!(await hasBackend())) return { ok: false, reason: 'offline' };
  const res = await del(`/budgets/${encodeURIComponent(categoryId)}`);
  if (res.ok) emit(BUDGET_CHANGED, { category_id: categoryId });
  return res.ok ? { ok: true, data: null } : res;
}
