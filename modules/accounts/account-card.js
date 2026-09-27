/**
 * Accounts · an account drawn as its card
 *
 * Every account is printed like the card or passbook it stands for: the
 * bank's colour, its tile, the masked number, the branch, and the balance.
 * One renderer for the list (compact) and the account page (hero), so the
 * two can never show an account differently.
 *
 * Markup only, and no style="" (the CSP blocks it): the card's colours ride
 * on data-vars and the caller runs applyStyleVars() after inserting it.
 */

import { esc, icon } from '../../shared/js/core/dom.js';
import { formatMoneyHTML } from '../../shared/js/core/money.js';
import * as accounts from './backend/api.js';
import { cardLook, bankLogo } from './brand.js';

const BANK_TYPE = { savings: 'Savings', current: 'Current', salary: 'Salary', fdr: 'FDR', dps: 'DPS' };
const NETWORK = { visa: 'VISA', mastercard: 'Mastercard', amex: 'AMEX', unionpay: 'UnionPay', other: 'Card' };

/** "•••• •••• 6789" for an account number, "•••• 4417" for a card. */
export function maskedNumber(account) {
  if (!account.number_tail) return '';
  return account.type === 'card' ? `•••• ${account.number_tail}` : `•••• •••• ${account.number_tail}`;
}

/** What the card says it is, top right. */
function kindLabel(account, type) {
  if (account.type === 'card') return NETWORK[account.card_network] || 'Card';
  if (account.bank_account_type) return BANK_TYPE[account.bank_account_type] || type.label;
  return type.label;
}

/**
 * @param {object} account
 * @param {number} balance     the ledger's derived balance, in the account's currency
 * @param {object} [opts]
 * @param {'list'|'hero'} [opts.size='list']
 * @param {string} [opts.href] makes the card a link
 */
export function accountCard(account, balance, { size = 'list', href = null } = {}) {
  const type = accounts.typeOf(account.type);
  const look = cardLook(account);
  const generic = look.inst.kind === 'generic';
  const issuer = generic ? (account.institution || type.label) : look.inst.name;
  const kind = kindLabel(account, type);
  const below = balance < 0 && !type.credit;
  const available = type.credit && account.credit_limit_minor
    ? account.credit_limit_minor - Math.abs(Math.min(0, balance)) : null;

  const tag = href ? 'a' : 'div';
  const hrefAttr = href ? ` href="${esc(href)}"` : '';

  return `
    <${tag} class="acc-card acc-card--${size}${account.archived_at ? ' is-archived' : ''}${below ? ' is-below' : ''}"${hrefAttr}
       data-vars="${esc(look.vars)}">
      <span class="acc-card__sheen" aria-hidden="true"></span>
      <span class="acc-card__top">
        <span class="acc-card__logo">${bankLogo(look.inst, size === 'hero' ? 40 : 32)}</span>
        <span class="acc-card__issuer">
          <span class="acc-card__bank">${esc(issuer)}</span>
          ${account.branch ? `<span class="acc-card__branch">${esc(account.branch)}</span>` : ''}
        </span>
        ${kind.toLowerCase() !== issuer.toLowerCase() ? `<span class="acc-card__kind">${esc(kind)}</span>` : ''}
      </span>
      ${maskedNumber(account) ? `<span class="acc-card__number" aria-label="Number ending ${esc(account.number_tail)}">${esc(maskedNumber(account))}</span>` : ''}
      <span class="acc-card__foot">
        <span class="acc-card__who">
          <span class="acc-card__name">${esc(account.name)}</span>
          <span class="acc-card__meta">
            ${account.holder_name ? `<span>${esc(account.holder_name)}</span>` : ''}
            ${account.is_default ? `<span class="acc-card__pill">${icon('check', { class: 'icon icon--xs' })}Default</span>` : ''}
            ${below ? '<span class="acc-card__pill acc-card__pill--warn">Below zero</span>' : ''}
            ${account.archived_at ? '<span class="acc-card__pill">Archived</span>' : ''}
          </span>
        </span>
        <span class="acc-card__balance">
          <span class="acc-card__balance-label">${available !== null ? 'Used' : 'Balance'}</span>
          <span class="acc-card__figure money">${formatMoneyHTML(balance, account.currency, { minor: size === 'hero' ? 'auto' : 'never' })}</span>
          ${available !== null ? `<span class="acc-card__balance-label">${formatMoneyHTML(available, account.currency, { minor: 'never' })} left</span>` : ''}
        </span>
      </span>
    </${tag}>`;
}
