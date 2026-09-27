/**
 * Accounts · the add / edit form
 *
 * Kind first - Cash, Bank, Mobile wallet, Card, Other - and then only the
 * fields that kind has: a bank has a branch and a routing number, a wallet a
 * provider and a number, a card a network and a statement day, cash a name.
 * Every kind has an opening balance and date, a colour and notes.
 *
 * THE CLOSING BALANCE IS NOT A BALANCE. Balances are derived from the ledger
 * and never stored (context.md). What the form takes is what the statement
 * SAID on a date. If that differs from the derived balance, the form shows
 * the gap and offers to post one adjustment entry, so the ledger - the only
 * source of the balance - comes to agree with the bank.
 */

import { qs, qsa, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { formatMoney, moneyLabel, parseAmount, CURRENCIES } from '../../shared/js/core/money.js';
import { today, formatDate } from '../../shared/js/core/dates.js';
import * as state from '../../shared/js/core/state.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure } from '../../shared/js/components/toast.js';
import * as accounts from './backend/api.js';
import * as ledger from '../ledger/backend/api.js';
import { banks, wallets, findInstitution, bankLogo, COLOURS } from './brand.js';

/** The five kinds the form starts with, and the account type each files as. */
const KINDS = [
  { key: 'cash', label: 'Cash', icon: 'cash' },
  { key: 'bank', label: 'Bank', icon: 'bank' },
  { key: 'mfs', label: 'Mobile', icon: 'mobile' },
  { key: 'card', label: 'Card', icon: 'card' },
  { key: 'other', label: 'Other', icon: 'wallet' },
];

const BANK_TYPES = [
  { key: 'savings', label: 'Savings' },
  { key: 'current', label: 'Current' },
  { key: 'salary', label: 'Salary' },
  { key: 'fdr', label: 'FDR' },
  { key: 'dps', label: 'DPS' },
];

const NETWORKS = [
  { key: 'visa', label: 'Visa' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'amex', label: 'Amex' },
  { key: 'other', label: 'Other' },
];

const OTHER_TYPES = [
  { key: 'wallet', label: 'Online wallet' },
  { key: 'savings', label: 'Savings' },
  { key: 'investment', label: 'Investment' },
];

/** Which kind an existing account belongs to. An FDR is a bank account the server files as savings. */
function kindOf(account) {
  if (!account) return 'cash';
  if (account.type === 'savings' && account.bank_account_type) return 'bank';
  if (['cash', 'bank', 'mfs', 'card'].includes(account.type)) return account.type;
  return 'other';
}

const radios = (name, list, current, extra = '') => list.map((o) => `
  <label class="choice${extra}">
    <input type="radio" name="${name}" value="${esc(o.key)}"${o.key === current ? ' checked' : ''}>
    <span>${esc(o.label)}</span>
  </label>`).join('');

const field = (id, label, input, hint = '') => `
  <div class="field">
    <label class="field__label" for="${id}">${label}</label>
    ${input}
    ${hint ? `<p class="field__hint">${hint}</p>` : ''}
    <p class="field__error" data-error="${id.replace(/^acc-/, '')}" hidden></p>
  </div>`;

const money = (minor, code) => (minor ? esc(formatMoney(minor, code, { minor: 'auto' })) : '');

/**
 * Post the one entry that brings the ledger to a statement's figure.
 *
 * An ordinary entry, so it shows in the ledger and in the month like any
 * other: the ledger stays the one source of the balance, and nothing about
 * it is hidden.
 *
 * @param {object} account
 * @param {number} gap   statement minus derived balance, in minor units
 * @param {string} on    the statement's date
 */
export function postAdjustment(account, gap, on) {
  return ledger.create({
    type: gap > 0 ? 'income' : 'expense',
    account_id: account.id,
    amount_minor: Math.abs(gap),
    currency: account.currency,
    occurred_on: on,
    payee: 'Balance adjustment',
    note: `Reconciled to the statement of ${formatDate(on)}`,
  });
}

/**
 * @param {object|null} account   an account to edit, or null for a new one
 * @param {object} [opts]
 * @param {number} [opts.balance] the derived balance, for the statement gap
 */
export async function openAccountSheet(account = null, { balance = null } = {}) {
  const editing = Boolean(account);
  // The full number is fetched for the form alone; the list never has it.
  const current = editing
    ? (await accounts.details(account.id)).data || account
    : { type: 'cash', currency: state.currency(), opening_on: today() };
  let kind = kindOf(current);

  const form = document.createElement('form');
  form.className = 'stack stack--4 acc-form';
  form.noValidate = true;

  form.innerHTML = `
    <fieldset class="fieldset">
      <legend class="field__label">What kind of account?</legend>
      <div class="acc-kinds" role="radiogroup">
        ${KINDS.map((k) => `
          <label class="acc-kind">
            <input type="radio" name="kind" value="${k.key}"${k.key === kind ? ' checked' : ''}${editing ? ' disabled' : ''}>
            ${icon(k.icon, { class: 'icon' })}
            <span>${esc(k.label)}</span>
          </label>`).join('')}
      </div>
      ${editing ? '<p class="field__hint">The kind is fixed once an account has a history.</p>' : ''}
    </fieldset>

    <div data-for="bank card" class="field acc-picker">
      <label class="field__label" for="acc-institution" data-institution-label>Bank</label>
      <div class="acc-picker__input">
        <span class="acc-picker__mark" data-picked-mark aria-hidden="true"></span>
        <input class="input" id="acc-institution" name="institution" autocomplete="off"
               value="${esc(current.institution || '')}" placeholder="Search banks, or type a name">
      </div>
      <ul class="acc-picker__list" data-picker-list hidden></ul>
    </div>

    <fieldset class="fieldset" data-for="mfs">
      <legend class="field__label">Provider</legend>
      <div class="acc-providers">
        ${wallets().map((w) => `
          <label class="acc-provider">
            <input type="radio" name="provider" value="${esc(w.name)}"${findInstitution(current.institution)?.id === w.id ? ' checked' : ''}>
            ${bankLogo(w, 36)}
            <span>${esc(w.name)}</span>
          </label>`).join('')}
      </div>
    </fieldset>

    <fieldset class="fieldset" data-for="other">
      <legend class="field__label">It is</legend>
      <div class="choices">${radios('other_type', OTHER_TYPES, ['wallet', 'savings', 'investment'].includes(current.type) ? current.type : 'wallet')}</div>
    </fieldset>

    ${field('acc-name', 'Name <span class="field__req" aria-hidden="true">*</span>',
      `<input class="input" id="acc-name" name="name" value="${esc(current.name || '')}" autocomplete="off"
              placeholder="Cash in hand, City Bank salary…">`)}

    <fieldset class="fieldset" data-for="bank">
      <legend class="field__label">Account type</legend>
      <div class="choices">${radios('bank_account_type', BANK_TYPES, current.bank_account_type || 'savings')}</div>
      <p class="field__hint" data-held-hint hidden>An FDR or a DPS is yours but not spendable today, so it is kept out of what is left to spend.</p>
    </fieldset>

    <div data-for="bank">${field('acc-branch', 'Branch', `<input class="input" id="acc-branch" name="branch" value="${esc(current.branch || '')}" autocomplete="off" placeholder="Gulshan Avenue">`)}</div>
    <div data-for="bank mfs other">${field('acc-holder', 'Account holder', `<input class="input" id="acc-holder" name="holder_name" value="${esc(current.holder_name || '')}" autocomplete="name">`)}</div>
    <div data-for="bank mfs other">${field('acc-number', '<span data-number-label>Account number</span>',
      `<input class="input" id="acc-number" name="account_number" value="${esc(current.account_number || '')}" autocomplete="off" inputmode="numeric" spellcheck="false">`,
      'Stored encrypted. Lists show only the last four digits.')}</div>
    <div data-for="bank">${field('acc-routing', 'Routing number <span class="field__hint">optional</span>',
      `<input class="input" id="acc-routing" name="routing_number" value="${esc(current.routing_number || '')}" inputmode="numeric" maxlength="16" autocomplete="off">`)}</div>

    <fieldset class="fieldset" data-for="card">
      <legend class="field__label">Network</legend>
      <div class="choices">${radios('card_network', NETWORKS, current.card_network || 'visa')}</div>
    </fieldset>
    <div class="grid grid--pair" data-for="card">
      ${field('acc-tail', 'Last 4 digits', `<input class="input" id="acc-tail" name="number_tail" value="${esc(current.number_tail || '')}" inputmode="numeric" maxlength="4" autocomplete="off">`)}
      ${field('acc-statement-day', 'Statement day', `<input class="input" id="acc-statement-day" name="statement_day" value="${esc(current.statement_day || '')}" inputmode="numeric" maxlength="2" placeholder="1–31">`)}
    </div>
    <div data-for="card">${field('acc-limit', 'Credit limit', `<input class="input" id="acc-limit" name="credit_limit" value="${money(current.credit_limit_minor, current.currency)}" inputmode="decimal" autocomplete="off">`)}</div>

    <div class="grid grid--pair">
      ${field('acc-opening', 'Opening balance', `<input class="input" id="acc-opening" name="opening" value="${money(current.opening_balance_minor, current.currency)}" inputmode="decimal" autocomplete="off" placeholder="0">`)}
      ${field('acc-opening-on', 'On', `<input class="input" id="acc-opening-on" name="opening_on" type="date" value="${esc(current.opening_on || today())}">`)}
    </div>

    <div data-for="bank card other" class="field">
      <label class="field__label" for="acc-currency">Currency</label>
      <select class="select" id="acc-currency" name="currency"${editing ? ' disabled' : ''}>
        ${Object.values(CURRENCIES).map((c) => `<option value="${c.code}"${c.code === current.currency ? ' selected' : ''}>${c.code} — ${esc(c.name)}</option>`).join('')}
      </select>
    </div>

    <fieldset class="fieldset">
      <legend class="field__label">Colour</legend>
      <div class="acc-swatches">
        ${COLOURS.map((c) => `
          <label class="acc-swatch acc-colour--${c}" title="${c}">
            <input type="radio" name="colour" value="${c}"${c === current.colour ? ' checked' : ''} aria-label="${c}">
          </label>`).join('')}
      </div>
    </fieldset>

    ${field('acc-notes', 'Notes', `<textarea class="textarea" id="acc-notes" name="notes" rows="2" maxlength="1000">${esc(current.notes || '')}</textarea>`)}

    ${editing && current.type !== 'cash' ? `
      <fieldset class="fieldset acc-reconcile">
        <legend class="field__label">Closing balance on a statement</legend>
        <div class="grid grid--pair">
          ${field('acc-statement', 'Statement says', `<input class="input" id="acc-statement" name="statement" value="${current.statement_balance_minor != null ? esc(formatMoney(current.statement_balance_minor, current.currency, { minor: 'auto' })) : ''}" inputmode="decimal" autocomplete="off">`)}
          ${field('acc-statement-on', 'On', `<input class="input" id="acc-statement-on" name="statement_on" type="date" value="${esc(current.statement_on || today())}">`)}
        </div>
        <p class="acc-reconcile__gap" data-gap hidden></p>
      </fieldset>` : ''}

    <div class="form-actions">
      <button type="submit" class="btn btn--primary btn--lg">${editing ? 'Save changes' : 'Add account'}</button>
    </div>
  `;

  const sheet = openSheet({ title: editing ? 'Edit account' : 'New account', body: form });

  /* ---- Showing only this kind's fields ---------------------------------- */
  const sync = () => {
    kind = form.elements.kind.value || kind;
    for (const node of qsa('[data-for]', form)) {
      node.hidden = !node.dataset.for.split(' ').includes(kind);
    }
    qs('[data-institution-label]', form).textContent = kind === 'card' ? 'Issuing bank' : 'Bank';
    qs('[data-number-label]', form).textContent = kind === 'mfs' ? 'Wallet number' : 'Account number';
    const bt = form.elements.bank_account_type?.value;
    qs('[data-held-hint]', form).hidden = !(kind === 'bank' && (bt === 'fdr' || bt === 'dps'));
    paintMark();
    showGap();
  };
  delegate(form, 'change', '[name="kind"], [name="bank_account_type"]', sync);

  /* ---- The bank picker -------------------------------------------------- */
  const input = form.elements.institution;
  const list = qs('[data-picker-list]', form);

  const paintMark = () => {
    const known = findInstitution(input.value);
    const mark = qs('[data-picked-mark]', form);
    mark.innerHTML = known ? bankLogo(known, 36) : '';
    mark.hidden = !known;
  };

  const search = () => {
    const q = input.value.trim().toLowerCase();
    const hits = banks().filter((b) => !q
      || [b.name, b.short, ...(b.match || [])].some((t) => String(t).toLowerCase().includes(q))).slice(0, 6);
    list.innerHTML = hits.map((b) => `
      <li><button type="button" class="acc-picker__item" data-pick="${esc(b.name)}">
        ${bankLogo(b, 36)}<span>${esc(b.name)}</span>
      </button></li>`).join('');
    list.hidden = hits.length === 0 || document.activeElement !== input;
    paintMark();
  };
  input.addEventListener('input', search);
  input.addEventListener('focus', search);
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
  delegate(list, 'click', '[data-pick]', (_e, button) => {
    input.value = button.dataset.pick;
    list.hidden = true;
    const name = form.elements.name;
    if (!name.value.trim()) name.value = button.dataset.pick;
    paintMark();
  });

  // A wallet provider names the account when it has no name yet.
  delegate(form, 'change', '[name="provider"]', (_e, radio) => {
    if (!form.elements.name.value.trim()) form.elements.name.value = radio.value;
  });

  /* ---- The statement gap ------------------------------------------------ */
  const gapNode = qs('[data-gap]', form);
  let gap = 0;
  function showGap() {
    if (!gapNode || balance === null) return;
    const said = parseAmount(form.elements.statement?.value || '', current.currency);
    gap = said === null ? 0 : said - balance;
    gapNode.hidden = said === null;
    if (said === null) return;
    gapNode.innerHTML = gap === 0
      ? `${icon('check', { class: 'icon icon--sm' })} Matches the ledger: ${esc(moneyLabel(balance, current.currency))}.`
      : `The ledger says <strong>${esc(moneyLabel(balance, current.currency))}</strong>, so it is
         <strong>${esc(moneyLabel(Math.abs(gap), current.currency))} ${gap > 0 ? 'short' : 'over'}</strong>.
         <button type="button" class="btn btn--secondary btn--sm" data-adjust>Post a ${esc(moneyLabel(Math.abs(gap), current.currency))} adjustment</button>`;
  }
  form.elements.statement?.addEventListener('input', showGap);

  delegate(form, 'click', '[data-adjust]', async (_e, button) => {
    if (!gap) return;
    button.disabled = true;
    const res = await postAdjustment(current, gap, form.elements.statement_on.value || today());
    if (!res.ok) { button.disabled = false; toastFailure(res, 'Could not post the adjustment.'); return; }
    balance += gap;
    toastOk('Adjustment posted. The ledger now matches the statement.');
    showGap();
  });

  sync();

  /* ---- Saving ----------------------------------------------------------- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    for (const node of qsa('[data-error]', form)) node.hidden = true;

    const f = form.elements;
    const currency = kind === 'mfs' || kind === 'cash' ? (current.currency || 'BDT') : f.currency.value;
    const type = kind === 'other' ? f.other_type.value : kind;
    const pick = (name) => (f[name] && !f[name].closest('[hidden]') ? f[name].value : null);

    const payload = {
      name: f.name.value,
      type,
      currency,
      book: state.book(),
      institution: kind === 'mfs' ? (form.querySelector('[name="provider"]:checked')?.value || null) : pick('institution'),
      branch: pick('branch'),
      holder_name: pick('holder_name'),
      account_number: pick('account_number'),
      bank_account_type: kind === 'bank' ? f.bank_account_type.value : null,
      routing_number: pick('routing_number'),
      card_network: kind === 'card' ? f.card_network.value : null,
      number_tail: kind === 'card' ? f.number_tail.value : undefined,
      statement_day: kind === 'card' && f.statement_day.value ? Number(f.statement_day.value) : null,
      credit_limit_minor: kind === 'card' ? (parseAmount(f.credit_limit.value, currency) ?? null) : null,
      opening_balance_minor: parseAmount(f.opening.value, currency) ?? 0,
      opening_on: f.opening_on.value || today(),
      colour: form.querySelector('[name="colour"]:checked')?.value || null,
      notes: f.notes.value,
    };
    if (f.statement && f.statement.value.trim()) {
      payload.statement_balance_minor = parseAmount(f.statement.value, currency);
      payload.statement_on = f.statement_on.value || today();
    }
    if (payload.number_tail === undefined) delete payload.number_tail;
    // A kind with no number field sends none: the server derives the tail
    // from any number it is given, and a card's typed last four must survive.
    if (payload.account_number === null) delete payload.account_number;
    if (editing) { delete payload.currency; delete payload.book; }

    const res = editing ? await accounts.update(account.id, payload) : await accounts.create(payload);

    if (!res.ok) {
      if (res.reason === 'invalid' || res.errors || res.data?.errors) {
        const errors = res.errors || res.data?.errors || {};
        for (const [name, messages] of Object.entries(errors)) {
          const key = { holder_name: 'holder', account_number: 'number', routing_number: 'routing', number_tail: 'tail', statement_day: 'statement-day', credit_limit_minor: 'limit', opening_balance_minor: 'opening' }[name] || name;
          const node = qs(`[data-error="${key}"]`, form);
          if (node) { node.textContent = messages[0]; node.hidden = false; }
        }
      } else toastFailure(res, 'Could not save the account.');
      return;
    }

    sheet.close('saved');
    toastOk(editing ? 'Account updated.' : `${payload.name.trim()} added.`);
  });
}
