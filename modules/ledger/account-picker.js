/**
 * Ledger · choosing an account
 *
 * "From cash or bank account" is one of the five things an entry is (the
 * owner's own spec), so the account gets a real picker rather than a menu of
 * names: a sheet grouped the way money is actually held - Cash, Bank, Mobile
 * wallet, Card - where each row shows the logo, the name, the masked number
 * and what is in it right now.
 *
 * The logo is a monogram for now: the initials of the institution (or the
 * account's name) on a disc tinted by the kind of account. Track A is adding
 * a shared bankLogo(); when it lands, logoFor() is the one function that
 * changes.
 */

import { el, esc, icon, delegate } from '../../shared/js/core/dom.js';
import { moneyLabel } from '../../shared/js/core/money.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import * as accounts from '../accounts/backend/api.js';

/** The four groups the owner named, in that order, then everything else. */
const GROUPS = [
  { key: 'cash', label: 'Cash', types: ['cash'] },
  { key: 'bank', label: 'Bank', types: ['bank'] },
  { key: 'mfs', label: 'Mobile wallet', types: ['mfs', 'wallet'] },
  { key: 'card', label: 'Card', types: ['card'] },
  { key: 'held', label: 'Savings & investments', types: ['savings', 'investment'] },
];

/**
 * A small round logo for an account.
 *
 * @param {object} account
 * @param {object} [opts]
 * @param {'sm'|'md'} [opts.size='md']
 */
export function logoFor(account, { size = 'md' } = {}) {
  if (!account?.id) {
    return `<span class="acct-logo acct-logo--${size} acct-logo--none" aria-hidden="true">${icon('arrow-hold', { class: 'icon icon--sm' })}</span>`;
  }
  const source = (account.institution || account.name || '?').trim();
  // Two letters from two words ("Dutch-Bangla" → DB, "Cash in hand" → CI),
  // or the first two of one word ("bKash" → BK). Letters only: a digit in a
  // monogram reads as a balance.
  const words = source.split(/[\s\-_/&.]+/).filter((w) => /\p{L}/u.test(w));
  const letters = words.length > 1
    ? words[0][0] + words[1][0]
    : (words[0] || source).replace(/[^\p{L}]/gu, '').slice(0, 2);
  return `<span class="acct-logo acct-logo--${size} acct-logo--${esc(account.type || 'cash')}" aria-hidden="true">${esc(letters.toUpperCase() || '?')}</span>`;
}

/** "•• 4521", or nothing when no tail is stored. Only the tail ever is. */
export function maskedTail(account) {
  return account?.number_tail ? `•• ${account.number_tail}` : '';
}

/**
 * Open the picker.
 *
 * @param {object} opts
 * @param {string} opts.title             "Pay from", "Received into", "Move to"
 * @param {Array} opts.rows               accounts to offer
 * @param {Object<string,number>} opts.balances  id → minor, in the account's currency
 * @param {string} [opts.selectedId]
 * @param {boolean} [opts.allowUntracked] offer "Not tracked here" (a deposit to a DPS held elsewhere)
 * @returns {Promise<object|null>} the chosen account, `{ id: '' }` for untracked, or null
 */
export function pickAccount({ title, rows, balances = {}, selectedId = null, allowUntracked = false }) {
  return new Promise((resolve) => {
    let chosen = null;

    const groups = GROUPS
      .map((g) => ({ ...g, rows: rows.filter((a) => g.types.includes(a.type)) }))
      .filter((g) => g.rows.length);
    const known = new Set(GROUPS.flatMap((g) => g.types));
    const other = rows.filter((a) => !known.has(a.type));
    if (other.length) groups.push({ key: 'other', label: 'Other', rows: other });

    const body = el('div', { class: 'acct-pick' });
    body.innerHTML = groups.map((g) => `
      <section class="acct-pick__group" aria-label="${esc(g.label)}">
        <h3 class="acct-pick__head">${esc(g.label)}</h3>
        <ul class="acct-pick__list" role="list">
          ${g.rows.map((a) => `
            <li>
              <button type="button" class="acct-pick__row" data-account="${esc(a.id)}" aria-pressed="${a.id === selectedId}">
                ${logoFor(a)}
                <span class="acct-pick__main">
                  <span class="acct-pick__name">${esc(a.name)}</span>
                  <span class="acct-pick__meta">${esc([a.institution && a.institution !== a.name ? a.institution : null, maskedTail(a)].filter(Boolean).join(' · ') || accounts.typeOf(a.type).label)}</span>
                </span>
                <span class="acct-pick__balance${(balances[a.id] ?? 0) < 0 ? ' is-negative' : ''}">${a.id in balances ? esc(moneyLabel(balances[a.id], a.currency, { minor: 'never' })) : ''}</span>
                ${a.id === selectedId ? `<span class="acct-pick__tick">${icon('check', { class: 'icon icon--sm' })}</span>` : ''}
              </button>
            </li>`).join('')}
        </ul>
      </section>`).join('') + (allowUntracked ? `
      <button type="button" class="acct-pick__row acct-pick__row--untracked" data-account="">
        ${logoFor(null)}
        <span class="acct-pick__main">
          <span class="acct-pick__name">Not tracked here</span>
          <span class="acct-pick__meta">A DPS or FDR that is not one of your accounts</span>
        </span>
      </button>` : '');

    const sheet = openSheet({
      title,
      body,
      onClose: () => resolve(chosen),
    });
    sheet.el.classList.add('sheet--picker');

    delegate(body, 'click', '[data-account]', (_e, button) => {
      const id = button.dataset.account;
      chosen = id ? rows.find((a) => a.id === id) || null : { id: '', name: 'Not tracked here' };
      sheet.close('picked');
    });
  });
}
