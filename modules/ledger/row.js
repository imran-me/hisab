/**
 * Ledger · one entry as a row
 *
 * THE row renderer. The Ledger, Home's Today list and an account's detail
 * screen all draw entries with this, so an entry looks the same wherever it
 * is (C's request; DIRECTION §3.3). The owner's rule for a row: the expense
 * amount red, income green, a category icon in a colour circle, and the
 * account's logo.
 *
 * Usage:
 *
 *   const look = await rowLook();                 // accounts + categories, once per render
 *   host.innerHTML = rows.map((r) => entryRowHTML(r, look)).join('');
 *
 * `rowLook()` resolves the lookups a row needs so that rendering four hundred
 * rows is four hundred string builds, not four hundred awaits.
 */

import { esc, icon } from '../../shared/js/core/dom.js';
import { formatMoneyHTML } from '../../shared/js/core/money.js';
import * as state from '../../shared/js/core/state.js';
import * as ledger from './backend/api.js';
import * as accounts from '../accounts/backend/api.js';
import * as categories from '../categories/backend/api.js';
import { glyphOf } from '../categories/glyphs.js';
import { logoFor } from './account-picker.js';
import { loadStyles } from './styles.js';

/**
 * What a list of rows needs to know, fetched once.
 *
 * @param {object} [opts]
 * @param {Array} [opts.rows]  the rows about to be drawn, so the set of
 *                             reversed entries is worked out once
 */
export async function rowLook({ rows = [], book = state.book() } = {}) {
  const [accountRes, cats] = await Promise.all([
    accounts.list({ book, includeArchived: true }),
    Promise.all(['expense', 'income', 'deposit'].map((type) => categories.list({ book, type, includeArchived: true }))),
    loadStyles('row.css'),
  ]);
  return {
    accounts: new Map(accountRes.data.map((a) => [a.id, a])),
    categories: new Map(cats.flat().map((c) => [c.id, c])),
    reversed: new Set(rows.filter((r) => r.reverses_id).map((r) => r.reverses_id)),
  };
}

/**
 * One entry, as a `<li>` holding a button (`data-edit` carries the id).
 *
 * @param {object} row
 * @param {object} look          from rowLook()
 * @param {object} [opts]
 * @param {boolean} [opts.showAccount=true]  false on an account's own screen
 * @param {string} [opts.after]  markup for a line under the amount (a running balance)
 * @param {string} [opts.cells]  extra markup for the wide-screen columns (the Ledger's)
 */
export function entryRowHTML(row, look, { showAccount = true, after = '', cells = '' } = {}) {
  const type = ledger.typeOf(row.type);
  const account = look.accounts.get(row.account_id);
  const category = row.category_id ? look.categories.get(row.category_id) : null;
  const amount = row.direction === 'in' ? row.amount_minor : -row.amount_minor;

  // What this row IS in the history of the money: without it, the History
  // view is three near-identical rows and no way to tell which is which.
  const isReversal = Boolean(row.reverses_id);
  const wasReversed = look.reversed.has(row.id);
  const mark = isReversal
    ? '<span class="chip chip--warn">Reversal</span>'
    : wasReversed ? '<span class="chip">Reversed</span>'
      : row.corrects_id ? '<span class="chip chip--in">Corrected</span>' : '';

  // The circle: the category's own colour and glyph. An entry with no category
  // (a transfer) shows its type's glyph on the neutral tint.
  const { icon: glyph, className } = category ? glyphOf(category) : { icon: type.icon, className: '' };

  const title = row.payee || row.note || row.category_label || type.label;
  const sub = [
    (row.payee || row.note) && row.category_label ? `<span>${esc(row.category_label)}</span>` : '',
    showAccount && account
      ? `<span class="entry-row__account">${logoFor(account, { size: 'sm' })}<span>${esc(account.name)}</span></span>`
      : '',
    isReversal && row.reversal_reason ? `<span>${esc(row.reversal_reason)}</span>` : '',
  ].filter(Boolean).join('<span aria-hidden="true">·</span>');

  // A reversal mirror is still type "expense", but it puts money BACK, so it
  // is coloured by its sign, not its type.
  const money = formatMoneyHTML(amount, row.currency, {
    sign: 'always',
    minor: 'never',
    ...(isReversal ? {} : { type: row.type }),
  });

  return `
    <li>
      <button type="button" class="row row--ledger entry-row${isReversal || wasReversed ? ' row--void' : ''}" data-edit="${esc(row.id)}">
        <span class="row__glyph ${className}">${icon(glyph, { class: 'icon' })}</span>
        <span class="row__main">
          <span class="row__title">${esc(title)}</span>
          <span class="row__sub">${sub || `<span>${esc(type.label)}</span>`}</span>
        </span>
        ${cells}
        <span class="row__end">
          <span class="money money--md">${money}</span>
          ${after}
          ${mark ? `<span class="row__end-mark">${mark}</span>` : ''}
        </span>
      </button>
    </li>`;
}
