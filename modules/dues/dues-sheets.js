/**
 * Dues · the two sheets
 *
 *   openRecordSheet   lend, borrow, or record a repayment: who, how much,
 *                     from or into which account. One Save writes the ledger
 *                     transfer and the due together on the server.
 *   openPersonSheet   one person: what is owed, every entry with the
 *                     balance after it, Settle in one tap, a reminder date,
 *                     and a prepared reminder for the phone's share sheet.
 */

import { qs, qsa, esc, icon, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel, parseAmount } from '../../shared/js/core/money.js';
import { today, formatDate, toDateKey } from '../../shared/js/core/dates.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure } from '../../shared/js/components/toast.js';
import { accountLogo } from '../../shared/js/components/bank-logo.js';
import * as accounts from '../accounts/backend/api.js';
import * as dues from './backend/api.js';

const CODE = 'BDT';
const label = (minor) => moneyLabel(minor, CODE, { minor: 'never' });
const figure = (minor) => formatMoneyHTML(minor, CODE, { minor: 'never', direction: false });

/** Initials for the avatar: "Rahim (cousin)" → "RC", "Karim bhai" → "KB". */
export function initials(name) {
  const words = String(name).replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words[1]?.[0] || '')).toUpperCase();
}

/** A stable tint per person, from the category tints, so Rahim stays blue. */
const TINTS = ['transport', 'food', 'home', 'shopping', 'mobile', 'health', 'dining', 'utilities'];
export function tintOf(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `cat-${TINTS[h % TINTS.length]}`;
}

/** What a balance means, in words: "Owes you", "You owe", "Settled". */
export function stateText(p) {
  return p.state === 'owes_you' ? 'Owes you' : p.state === 'you_owe' ? 'You owe' : 'Settled';
}

/** Accounts money can come from or go into: spendable, this book, in taka. */
async function payAccounts(book) {
  const res = await accounts.list({ book });
  return (res.data || []).filter((a) => accounts.isSpendable(a) && a.currency === CODE);
}

/* =========================================================================
   Record a due
   ========================================================================= */

/**
 * @param {object} opts
 * @param {string} [opts.kind='lent']
 * @param {object|null} [opts.person]  preselected person
 * @param {Array} [opts.people]        everyone, for the chips
 * @param {string} [opts.book='personal']
 * @param {Function} [opts.onSaved]
 */
export async function openRecordSheet({ kind = 'lent', person = null, people = [], book = 'personal', onSaved } = {}) {
  const payFrom = await payAccounts(book);
  const fallback = payFrom.find((a) => a.is_default) || payFrom[0];
  let chosenKind = kind;
  let chosenPerson = person?.id || null;
  let chosenAccount = fallback?.id || null;

  const kindButtons = Object.entries(dues.KINDS).map(([key, k]) => `
    <button type="button" class="dues-kind" data-kind="${key}" data-tone="${k.tone}" aria-pressed="${key === kind}">${esc(k.verb)}</button>`).join('');

  const personChips = people.map((p) => `
    <button type="button" class="dues-chip" data-person="${esc(p.id)}" aria-pressed="${p.id === chosenPerson}">
      <span class="dues-avatar ${tintOf(p.name)}" aria-hidden="true">${esc(initials(p.name))}</span>${esc(p.name)}
    </button>`).join('');

  const accountChips = payFrom.map((a) => `
    <button type="button" class="dues-chip" data-account="${esc(a.id)}" aria-pressed="${a.id === chosenAccount}">
      ${accountLogo(a, 22)}${esc(a.name)}
    </button>`).join('');

  const body = `
    <form class="dues-form" data-dues-form novalidate>
      <div class="dues-kinds" role="group" aria-label="What happened">${kindButtons}</div>

      <div class="field">
        <span class="field__label">Who</span>
        ${people.length ? `<div class="dues-chips" role="group" aria-label="People">${personChips}</div>` : ''}
        <input class="input" data-new-name placeholder="${people.length ? 'Or a new name' : 'Name'}" autocomplete="off" maxlength="80"${person ? ' hidden' : ''}>
      </div>

      <label class="field">
        <span class="field__label">Amount</span>
        <span class="amount-field">
          <span class="amount-field__currency">৳</span>
          <input class="amount-field__input" data-amount inputmode="decimal" autocomplete="off" placeholder="0" data-autofocus>
        </span>
      </label>

      <div class="field">
        <span class="field__label" data-account-label>From</span>
        ${payFrom.length
          ? `<div class="dues-chips" role="group" aria-label="Account">${accountChips}</div>`
          : '<p class="dues-hint">Add a taka account first: a due is money moving from or into one.</p>'}
      </div>

      <div class="dues-row2">
        <label class="field">
          <span class="field__label">Date</span>
          <input class="input" type="date" data-date value="${esc(today())}" max="${esc(today())}">
        </label>
        <label class="field">
          <span class="field__label">Note</span>
          <input class="input" data-note maxlength="500" autocomplete="off" placeholder="Optional">
        </label>
      </div>

      <p class="dues-hint" data-effect></p>
      <button type="submit" class="btn btn--primary btn--block" data-save>Save</button>
    </form>`;

  const sheet = openSheet({ title: person ? person.name : 'Lend or borrow', body });
  const form = qs('[data-dues-form]', sheet.el);
  const nameInput = qs('[data-new-name]', form);
  const amountInput = qs('[data-amount]', form);

  // The line that says what Save will do to the money, so "Borrowed" can
  // never be mistaken for "Lent" on a phone in a hurry.
  const paint = () => {
    const k = dues.KINDS[chosenKind];
    const out = k.sign > 0;
    qs('[data-account-label]', form).textContent = out ? 'Paid from' : 'Received into';
    const named = people.find((p) => p.id === chosenPerson)?.name || nameInput.value.trim();
    const acct = payFrom.find((a) => a.id === chosenAccount)?.name || 'an account';
    const amount = parseAmount(amountInput.value, CODE);
    const sum = amount > 0 ? label(amount) : 'the money';
    // "They" when nobody is chosen yet, so the sentence still reads right.
    const subj = named || 'They';
    const obj = named || 'them';
    const owes = named ? 'owes' : 'owe';
    qs('[data-effect]', form).textContent = out
      ? `${sum} leaves ${acct}. ${chosenKind === 'lent' ? `${subj} ${owes} you more` : `You owe ${obj} less`}. Not counted as spending.`
      : `${sum} arrives in ${acct}. ${chosenKind === 'borrowed' ? `You owe ${obj} more` : `${subj} ${owes} you less`}. Not counted as income.`;
  };
  paint();

  delegate(form, 'click', '[data-kind]', (_e, b) => {
    chosenKind = b.dataset.kind;
    qsa('[data-kind]', form).forEach((n) => n.setAttribute('aria-pressed', String(n === b)));
    paint();
  });
  delegate(form, 'click', '[data-person]', (_e, b) => {
    chosenPerson = chosenPerson === b.dataset.person ? null : b.dataset.person;
    qsa('[data-person]', form).forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.person === chosenPerson)));
    nameInput.hidden = Boolean(chosenPerson);
    paint();
  });
  delegate(form, 'click', '[data-account]', (_e, b) => {
    chosenAccount = b.dataset.account;
    qsa('[data-account]', form).forEach((n) => n.setAttribute('aria-pressed', String(n === b)));
    paint();
  });
  nameInput.addEventListener('input', paint);
  amountInput.addEventListener('input', paint);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = parseAmount(amountInput.value, CODE);
    if (!amount || amount <= 0) { amountInput.focus(); return; }
    if (!chosenAccount) return;

    let id = chosenPerson;
    if (!id) {
      const name = nameInput.value.trim();
      if (!name) { nameInput.hidden = false; nameInput.focus(); return; }
      const made = await dues.addPerson({ name, book });
      if (!made.ok) { toastFailure(made, 'Could not add that person.'); return; }
      id = made.data.id;
    }

    qs('[data-save]', form).disabled = true;
    const res = await dues.record(id, {
      kind: chosenKind, amount_minor: amount, account_id: chosenAccount,
      occurred_on: qs('[data-date]', form).value || today(), note: qs('[data-note]', form).value.trim(),
    });
    qs('[data-save]', form).disabled = false;
    if (!res.ok) { toastFailure(res, 'Could not record that.'); return; }

    sheet.close('saved');
    const p = res.data.person;
    toastOk(p.state === 'settled' ? `${p.name}: all settled` : `${p.name}: ${stateText(p).toLowerCase()} ${label(Math.abs(p.balance_minor))}`);
    onSaved?.(p);
  });
}

/* =========================================================================
   One person
   ========================================================================= */

/** Quick reminder dates: tomorrow, a week, the 1st of next month. */
function remindChoices() {
  const at = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return toDateKey(d); };
  const first = new Date(); first.setMonth(first.getMonth() + 1, 1);
  return [['Tomorrow', at(1)], ['In a week', at(7)], ['1st', toDateKey(first)]];
}

/** The message a reminder hands to the phone. Polite, with the figure and the date. */
function reminderText(p, since) {
  const amount = label(Math.abs(p.balance_minor));
  return p.state === 'owes_you'
    ? `Assalamu alaikum ${p.name.replace(/\s*\(.*\)\s*/, '')}, a gentle reminder about the ${amount}${since ? ` from ${formatDate(since)}` : ''}. Whenever it suits you. Thank you!`
    : `Assalamu alaikum ${p.name.replace(/\s*\(.*\)\s*/, '')}, I have not forgotten the ${amount} I owe you. I will send it soon.`;
}

export async function openPersonSheet(personId, { book = 'personal', people = [], onChanged } = {}) {
  const res = await dues.person(personId);
  if (!res.ok) { toastFailure(res, 'Could not open that person.'); return; }
  const { person: p, entries } = res.data;
  const payFrom = await payAccounts(book);
  const byId = new Map((await accounts.list({ book, includeArchived: true })).data.map((a) => [a.id, a]));
  const settleInto = payFrom.find((a) => a.is_default) || payFrom[0];
  const oldest = [...entries].reverse().find((e) => !e.reversed && (e.kind === 'lent' || e.kind === 'borrowed'))?.occurred_on;

  const tone = p.state === 'owes_you' ? 'dues-owed' : p.state === 'you_owe' ? 'dues-owe' : 'dues-zero';
  const caption = p.state === 'settled'
    ? 'All settled. Nothing is owed either way.'
    : `${p.state === 'owes_you' ? 'Owes you' : 'You owe'}${p.last_on ? ` · last ${formatDate(p.last_on)}` : ''}${p.remind_on ? ` · remind ${formatDate(p.remind_on)}` : ''}`;

  const rows = entries.map((e) => {
    const k = dues.KINDS[e.kind];
    const acct = byId.get(e.account_id);
    return `
      <li class="${e.reversed ? 'is-reversed' : ''}">
        <button type="button" class="row" ${e.reversed ? 'disabled' : `data-entry="${esc(e.id)}"`}
                aria-label="${esc(`${k.verb} ${label(e.amount_minor)} on ${formatDate(e.occurred_on)}${e.reversed ? ', undone' : '. Change or undo'}`)}">
          <span class="row__glyph row__glyph--${k.tone}">${icon(k.sign > 0 ? 'arrow-out' : 'arrow-in', { class: 'icon' })}</span>
          <span class="row__main">
            <span class="row__title">${esc(k.verb)}${e.note ? ` · ${esc(e.note)}` : ''}</span>
            <span class="row__sub"><span>${esc(formatDate(e.occurred_on))}</span>${acct ? `<span aria-hidden="true">·</span><span>${esc(acct.name)}</span>` : ''}${e.reversed ? '<span aria-hidden="true">·</span><span>reversed</span>' : ''}</span>
          </span>
          <span class="row__end">
            <span class="money money--md">${formatMoneyHTML(k.sign > 0 ? -e.amount_minor : e.amount_minor, CODE, { minor: 'never', sign: 'always' })}</span>
            <span class="meta">bal ${esc(label(e.balance_after_minor))}</span>
          </span>
        </button>
      </li>`;
  }).join('');

  const body = `
    <div class="dues-card">
      <div>
        <div class="dues-card__balance money ${tone}">${figure(Math.abs(p.balance_minor))}</div>
        <p class="dues-card__caption">${esc(caption)}</p>
      </div>

      <div class="dues-card__actions">
        ${p.state !== 'settled' && settleInto ? `
          <button type="button" class="btn btn--primary btn--block" data-settle>
            ${icon('check', { class: 'icon icon--sm' })}
            <span>${esc(p.state === 'owes_you' ? `Got it all back · ${label(p.balance_minor)}` : `Paid it all back · ${label(-p.balance_minor)}`)}</span>
          </button>` : ''}
        <button type="button" class="btn btn--secondary" data-more="${p.state === 'you_owe' ? 'borrowed' : 'lent'}">${p.state === 'you_owe' ? 'Borrow more' : 'Lend more'}</button>
        <button type="button" class="btn btn--secondary" data-more="${p.state === 'you_owe' ? 'paid_back' : 'got_back'}">Part payment</button>
        ${p.state !== 'settled' ? `<button type="button" class="btn btn--ghost btn--block" data-share>${icon('link', { class: 'icon icon--sm' })}<span>Send a reminder</span></button>` : ''}
      </div>

      ${p.state !== 'settled' ? `
        <div class="field">
          <span class="field__label">Remind me</span>
          <div class="dues-chips" role="group" aria-label="Remind me">
            ${remindChoices().map(([name, date]) => `<button type="button" class="dues-chip dues-chip--text" data-remind="${date}" aria-pressed="${p.remind_on === date}">${esc(name)}</button>`).join('')}
            ${p.remind_on ? '<button type="button" class="dues-chip dues-chip--text" data-remind="">No reminder</button>' : ''}
          </div>
        </div>` : ''}

      <div class="card card--flush"><ul class="list dues-entries">${rows}</ul></div>
    </div>`;

  const sheet = openSheet({ title: p.name, body });
  const root = sheet.el;

  qs('[data-settle]', root)?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const done = await dues.settle(p.id, { account_id: settleInto.id, occurred_on: today() });
    if (!done.ok) { event.currentTarget.disabled = false; toastFailure(done, 'Could not settle.'); return; }
    sheet.close('settled');
    toastOk(`${p.name}: settled, recorded in ${settleInto.name}`);
    onChanged?.();
  });

  delegate(root, 'click', '[data-more]', (_e, b) => {
    sheet.close('more');
    openRecordSheet({ kind: b.dataset.more, person: p, people, book, onSaved: () => onChanged?.() });
  });

  delegate(root, 'click', '[data-remind]', async (_e, b) => {
    const done = await dues.updatePerson(p.id, { remind_on: b.dataset.remind || null });
    if (!done.ok) { toastFailure(done, 'Could not set the reminder.'); return; }
    qsa('[data-remind]', root).forEach((n) => n.setAttribute('aria-pressed', String(n === b && Boolean(b.dataset.remind))));
    toastOk(b.dataset.remind ? `Reminder set for ${formatDate(b.dataset.remind)}` : 'Reminder cleared');
    onChanged?.();
  });

  // Change or undo one entry. The ONLY way to correct a due: the Ledger
  // refuses a Dues leg, because a correction there left the person's balance
  // behind (review round 8, H4).
  delegate(root, 'click', '[data-entry]', (_e, b) => {
    const entry = entries.find((x) => x.id === b.dataset.entry);
    if (!entry) return;
    sheet.close('entry');
    openEntryEdit(p, entry, { onChanged });
  });

  qs('[data-share]', root)?.addEventListener('click', async () => {
    const text = reminderText(p, oldest);
    // The phone's own share sheet (WhatsApp, SMS, Messenger) when there is
    // one; otherwise the text goes to the clipboard to paste anywhere.
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toastOk('Reminder copied. Paste it into a message.');
    } catch { /* the person closed the share sheet: nothing to report */ }
  });
}

/**
 * One due, changed or undone. Change reverses the old transfer and records
 * the new one in a single request; Undo reverses it and keeps the entry as
 * history. Either way both balances - the account's and the person's - move
 * together, because the server does both in one transaction.
 */
function openEntryEdit(person, entry, { onChanged } = {}) {
  const k = dues.KINDS[entry.kind];
  const body = `
    <form class="dues-form" data-entry-form novalidate>
      <p class="dues-hint">${esc(k.verb)} on ${esc(formatDate(entry.occurred_on))}${entry.note ? ` · ${esc(entry.note)}` : ''}</p>
      <label class="field">
        <span class="field__label">Amount</span>
        <span class="amount-field">
          <span class="amount-field__currency">৳</span>
          <input class="amount-field__input" data-amount inputmode="decimal" autocomplete="off" data-autofocus
                 value="${esc(label(entry.amount_minor).replace(/[^0-9.,]/g, ''))}">
        </span>
      </label>
      <p class="dues-hint">The old entry is reversed and the new amount recorded, so the Ledger keeps the trail.</p>
      <div class="dues-card__actions">
        <button type="button" class="btn btn--secondary" data-undo>Undo it</button>
        <button type="submit" class="btn btn--primary">Change amount</button>
      </div>
    </form>`;

  const sheet = openSheet({ title: person.name, body });
  const form = qs('[data-entry-form]', sheet.el);
  const input = qs('[data-amount]', form);
  input.select?.();

  const done = (message) => { sheet.close('saved'); toastOk(message); onChanged?.(); };

  qs('[data-undo]', form).addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const res = await dues.undoEntry(entry.id);
    if (!res.ok) { event.currentTarget.disabled = false; toastFailure(res, 'Could not undo that.'); return; }
    done(`${k.verb} ${label(entry.amount_minor)} undone`);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = parseAmount(input.value, CODE);
    if (!amount || amount <= 0) { input.focus(); return; }
    if (amount === entry.amount_minor) { sheet.close('same'); return; }
    const res = await dues.changeEntry(entry.id, amount);
    if (!res.ok) { toastFailure(res, 'Could not change that.'); return; }
    done(`Changed to ${label(amount)}`);
  });
}
