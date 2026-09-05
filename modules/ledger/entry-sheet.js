/**
 * Ledger · the entry sheet
 *
 * The most-used screen in the product: adding a transaction, one-handed, in a
 * few seconds, usually while standing somewhere. Everything about it is shaped
 * by that.
 *
 * Design decisions worth stating:
 *
 * · THE AMOUNT IS FIRST AND FOCUSED. It is the only field that is always
 *   required and always known. Asking for a category first means holding the
 *   number in your head while you scroll a list.
 * · THE TYPE PICKER RECOLOURS THE AMOUNT. Expense is coral, income mint,
 *   deposit violet. Entering an expense as income is the most common data-entry
 *   mistake in every ledger, and it is silent — the total is simply wrong. The
 *   colour makes it loud.
 * · inputmode="decimal", NOT type="number". A number input strips leading zeros
 *   while typing, accepts 'e' and '+' as valid characters, and puts spinner
 *   arrows exactly where a thumb lands.
 * · NOTHING IS SAVED UNTIL SAVE. But the half-typed state is kept in a draft,
 *   so a phone call does not lose it.
 */

import { el, qs, qsa, icon, esc, html, delegate } from '../../shared/js/core/dom.js';
import { parseAmount, formatMoney, currency as currencyOf, CURRENCIES } from '../../shared/js/core/money.js';
import { today } from '../../shared/js/core/dates.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure, toast } from '../../shared/js/components/toast.js';
import * as state from '../../shared/js/core/state.js';
import * as ledger from './backend/api.js';
import * as accounts from '../accounts/backend/api.js';
import * as categories from '../categories/backend/api.js';

/**
 * Open the entry sheet.
 *
 * @param {object} [opts]
 * @param {string} [opts.type='expense']
 * @param {object} [opts.transaction]  edit this one instead of creating
 * @param {Function} [opts.onSaved]
 */
export async function openEntrySheet(opts = {}) {
  const editing = opts.transaction || null;
  const book = state.book();

  const [accountRes, methodList] = await Promise.all([
    accounts.list({ book }),
    categories.methods(),
  ]);

  const accountRows = accountRes.data;
  if (!accountRows.length) {
    toast('Add an account first — a transaction has to come from somewhere.', {
      tone: 'warn',
      action: { label: 'Add account', onClick: () => { window.location.href = '../accounts/list.html?new=1'; } },
    });
    return;
  }

  // A draft survives the app being backgrounded mid-entry. Only restored for a
  // NEW entry: restoring it over an edit would silently overwrite the row being
  // edited with an unrelated half-typed one.
  const draft = editing ? null : storage.get(KEYS.DRAFT, null);

  const initial = editing || draft || {
    type: opts.type || 'expense',
    account_id: (await accounts.defaultFor(book))?.id || accountRows[0].id,
    occurred_on: today(),
  };

  const form = el('form', { class: 'entry stack stack--4', novalidate: true });
  form.dataset.flow = initial.type;

  const sheet = openSheet({
    title: editing ? 'Edit entry' : 'New entry',
    body: form,
    onClose: (reason) => {
      // A dismissed NEW entry keeps its draft; a saved or cancelled edit does
      // not. Keeping a draft from an edit would re-open it as a new entry.
      if (!editing && reason !== 'saved') saveDraft(form);
    },
  });

  await renderForm(form, { initial, accountRows, methodList, book, editing });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit({ form, editing, sheet, onSaved: opts.onSaved });
  });

  return sheet;
}

/* =========================================================================
   Rendering
   ========================================================================= */

async function renderForm(form, { initial, accountRows, methodList, book, editing }) {
  const type = initial.type || 'expense';
  const account = accountRows.find((a) => a.id === initial.account_id) || accountRows[0];
  const cur = initial.currency || account.currency;

  form.innerHTML = `
    <!-- Type. A radio group, so arrow keys move between the four and a screen
         reader announces "2 of 4" rather than reading four unrelated buttons. -->
    <fieldset class="fieldset">
      <legend class="sr-only">Type of entry</legend>
      <div class="choices" role="radiogroup">
        ${ledger.TYPES.map((t) => `
          <label class="choice choice--${t.tone}">
            <input type="radio" name="type" value="${t.key}"${t.key === type ? ' checked' : ''}>
            ${icon(t.icon, { class: 'icon icon--sm' })}
            <span>${esc(t.label)}</span>
          </label>`).join('')}
      </div>
    </fieldset>

    <!-- Amount. Autofocused, and the largest thing on the sheet. -->
    <div class="field">
      <label class="field__label" for="entry-amount">Amount <span class="field__req" aria-hidden="true">*</span></label>
      <div class="amount-field">
        <button type="button" class="amount-field__currency" data-currency-picker aria-label="Currency, currently ${esc(cur)}">
          ${esc(cur)}
        </button>
        <input class="amount-field__input" id="entry-amount" name="amount"
               inputmode="decimal" autocomplete="off" enterkeyhint="done"
               placeholder="0${currencyOf(cur).minorUnit ? '.' + '0'.repeat(currencyOf(cur).minorUnit) : ''}"
               value="${initial.amount_minor ? esc(formatMoney(initial.amount_minor, cur, { decimals: true })) : ''}"
               data-autofocus>
      </div>
      <p class="field__error" data-error="amount_minor" hidden></p>
    </div>

    <!-- Account, and for a transfer or a tracked deposit, the destination. -->
    <div class="field">
      <label class="field__label" for="entry-account" data-account-label>From</label>
      <select class="select" id="entry-account" name="account_id">
        ${accountOptions(accountRows, initial.account_id)}
      </select>
      <p class="field__error" data-error="account_id" hidden></p>
    </div>

    <div class="field" data-to-field hidden>
      <label class="field__label" for="entry-to">To</label>
      <select class="select" id="entry-to" name="to_account_id">
        <option value="">Somewhere not tracked here</option>
        ${accountOptions(accountRows, initial.to_account_id)}
      </select>
      <p class="field__hint" data-to-hint></p>
      <p class="field__error" data-error="to_account_id" hidden></p>
    </div>

    <!-- Category. Repopulated when the type changes, because an income
         category on an expense is how a ledger becomes unreadable. -->
    <div class="field" data-category-field>
      <label class="field__label" for="entry-category">Category</label>
      <select class="select" id="entry-category" name="category_id"></select>
    </div>

    <!-- Necessity — expenses only. There is no meaningful sense in which
         receiving a salary was avoidable. -->
    <fieldset class="fieldset" data-necessity-field hidden>
      <legend class="field__label">Was it worth it?</legend>
      <div class="choices" role="radiogroup" data-necessity-choices></div>
    </fieldset>

    <div class="grid grid--pair">
      <div class="field">
        <label class="field__label" for="entry-date">Date</label>
        <input class="input" type="date" id="entry-date" name="occurred_on"
               value="${esc(initial.occurred_on || today())}" max="${esc(nextYear())}">
        <p class="field__error" data-error="occurred_on" hidden></p>
      </div>
      <div class="field">
        <label class="field__label" for="entry-method">Paid with</label>
        <select class="select" id="entry-method" name="method">
          <option value="">—</option>
          ${methodList.map((m) => `<option value="${esc(m.key)}"${m.key === initial.method ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="entry-payee" data-payee-label>Paid to</label>
      <input class="input" id="entry-payee" name="payee" autocomplete="off"
             value="${esc(initial.payee || '')}" placeholder="Shop, person or source">
    </div>

    <div class="field">
      <label class="field__label" for="entry-note">Note</label>
      <textarea class="textarea" id="entry-note" name="note" rows="2"
                placeholder="What was this for?">${esc(initial.note || '')}</textarea>
    </div>

    <div class="form-actions">
      ${editing ? `<button type="button" class="btn btn--danger btn--keep" data-delete aria-label="Delete entry">${icon('trash', { class: 'icon' })}</button>` : ''}
      <button type="submit" class="btn btn--primary btn--lg">${editing ? 'Save changes' : 'Add entry'}</button>
    </div>
  `;

  await syncType(form, { book, initial });
  attachHandlers(form, { book, accountRows, editing });
}

function accountOptions(rows, selectedId) {
  return rows.map((a) => `
    <option value="${esc(a.id)}"${a.id === selectedId ? ' selected' : ''}>
      ${esc(a.name)} · ${esc(a.currency)}
    </option>`).join('');
}

/**
 * Everything that changes when the type changes.
 *
 * Kept in ONE function rather than scattered across four listeners, because the
 * fields that appear and disappear have to agree with each other — a visible
 * "To" field on an expense, or a necessity band on a transfer, produces a row
 * the counting rules cannot classify.
 */
async function syncType(form, { book, initial = {} } = {}) {
  const type = form.elements.type.value;
  form.dataset.flow = type;   // recolours the amount — see _forms.css

  const toField = qs('[data-to-field]', form);
  const categoryField = qs('[data-category-field]', form);
  const necessityField = qs('[data-necessity-field]', form);
  const accountLabel = qs('[data-account-label]', form);
  const payeeLabel = qs('[data-payee-label]', form);
  const toHint = qs('[data-to-hint]', form);

  const isTransfer = type === 'transfer';
  const isDeposit = type === 'deposit';
  const isIncome = type === 'income';

  toField.hidden = !(isTransfer || isDeposit);
  categoryField.hidden = isTransfer;
  necessityField.hidden = type !== 'expense';

  accountLabel.textContent = isIncome ? 'Into' : 'From';
  payeeLabel.textContent = isIncome ? 'Received from' : 'Paid to';

  if (isTransfer) {
    // A transfer must land somewhere tracked, or it is not a transfer — it is
    // money leaving, which is an expense or a deposit.
    qs('[data-to-field] option[value=""]', form).hidden = true;
    toHint.textContent = 'Both sides are recorded, so no total counts this twice.';
  } else if (isDeposit) {
    qs('[data-to-field] option[value=""]', form).hidden = false;
    toHint.textContent = 'Leave blank if the DPS or FDR is not one of your accounts here.';
  }

  if (!isTransfer) {
    const rows = await categories.list({ book, type });
    const select = form.elements.category_id;
    select.innerHTML = `<option value="">Uncategorised</option>` +
      rows.map((c) => `<option value="${esc(c.id)}" data-necessity="${c.necessity ?? ''}" data-label="${esc(c.label)}"${c.id === initial.category_id ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
  }

  if (type === 'expense') {
    const bands = await categories.necessityBands();
    const chosen = Number(initial.necessity) || 3;
    qs('[data-necessity-choices]', form).innerHTML = bands.map((b) => `
      <label class="choice choice--need-${b.band}" title="${esc(b.hint)}">
        <input type="radio" name="necessity" value="${b.band}"${b.band === chosen ? ' checked' : ''}>
        <span>${esc(b.label)}</span>
      </label>`).join('');
  }
}

function attachHandlers(form, { book, accountRows, editing }) {
  delegate(form, 'change', '[name="type"]', () => syncType(form, { book }));

  // Selecting a category sets the necessity band it usually carries — but only
  // when the person has not already chosen one. Overwriting a deliberate
  // "avoidable" with the category's default is the kind of quiet correction
  // that makes people stop trusting a form.
  delegate(form, 'change', '[name="category_id"]', (_e, select) => {
    const option = select.selectedOptions[0];
    const suggested = option?.dataset.necessity;
    if (!suggested) return;
    const current = qs('[name="necessity"]:checked', form);
    if (current && current.dataset.userSet === 'true') return;
    const target = qs(`[name="necessity"][value="${suggested}"]`, form);
    if (target) target.checked = true;
  });

  delegate(form, 'change', '[name="necessity"]', (_e, input) => { input.dataset.userSet = 'true'; });

  // The account's currency becomes the amount's currency, unless the person has
  // deliberately picked a different one.
  delegate(form, 'change', '[name="account_id"]', (_e, select) => {
    const account = accountRows.find((a) => a.id === select.value);
    const button = qs('[data-currency-picker]', form);
    if (account && button.dataset.userSet !== 'true') {
      button.textContent = account.currency;
      button.setAttribute('aria-label', `Currency, currently ${account.currency}`);
    }
  });

  delegate(form, 'click', '[data-currency-picker]', (_e, button) => openCurrencyPicker(form, button));

  if (editing) {
    delegate(form, 'click', '[data-delete]', async () => {
      const { confirmDialog } = await import('../../shared/js/components/sheet.js');
      const sure = await confirmDialog({
        title: 'Delete this entry?',
        text: 'It will be removed from every total. This cannot be undone after the next few seconds.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!sure) return;

      const res = await ledger.destroy(editing.id);
      if (!res.ok) { toastFailure(res); return; }

      form.closest('dialog')?.querySelector('[data-sheet-close]')?.click();
      toast('Entry deleted.', {
        tone: 'good',
        action: { label: 'Undo', onClick: () => ledger.restore(res.data) },
      });
    });
  }
}

/** A short currency list — the ones in use, then the rest. */
function openCurrencyPicker(form, button) {
  import('../../shared/js/components/menu.js').then(({ menu }) => {
    const items = Object.values(CURRENCIES).slice(0, 10).map((c) => ({
      label: `${c.code} — ${c.name}`,
      onClick: () => {
        button.textContent = c.code;
        button.dataset.userSet = 'true';
        button.setAttribute('aria-label', `Currency, currently ${c.code}`);
      },
    }));
    menu(button, items, { align: 'start' });
  });
}

/* =========================================================================
   Submitting
   ========================================================================= */

async function submit({ form, editing, sheet, onSaved }) {
  clearErrors(form);

  const button = qs('[type="submit"]', form);
  button.classList.add('is-busy');
  button.disabled = true;

  const code = qs('[data-currency-picker]', form).textContent.trim();
  const amount = parseAmount(form.elements.amount.value, code);

  // parseAmount returns null rather than 0 for unreadable input, precisely so
  // this check can exist. A silent zero would save a transaction that looks
  // deliberate and is wrong.
  if (amount === null || amount === 0) {
    showError(form, 'amount_minor', 'Enter an amount.');
    button.classList.remove('is-busy');
    button.disabled = false;
    form.elements.amount.focus();
    return;
  }

  const categoryOption = form.elements.category_id?.selectedOptions?.[0];

  const payload = {
    type: form.elements.type.value,
    amount_minor: amount,
    currency: code,
    account_id: form.elements.account_id.value,
    to_account_id: form.elements.to_account_id?.value || null,
    category_id: form.elements.category_id?.value || null,
    category_label: categoryOption?.dataset.label || null,
    necessity: qs('[name="necessity"]:checked', form)?.value || null,
    method: form.elements.method.value || null,
    payee: form.elements.payee.value,
    note: form.elements.note.value,
    occurred_on: form.elements.occurred_on.value,
    book: state.book(),
  };

  const res = editing ? await ledger.update(editing.id, payload) : await ledger.create(payload);

  button.classList.remove('is-busy');
  button.disabled = false;

  if (!res.ok) {
    if (res.reason === 'invalid') {
      for (const [field, messages] of Object.entries(res.errors || {})) showError(form, field, messages[0]);
      // Focus the first field that failed, so the person is not left hunting
      // for a red message somewhere below the fold on a phone.
      qs('[data-error]:not([hidden])', form)?.previousElementSibling?.querySelector('input, select')?.focus();
    } else {
      toastFailure(res, 'Could not save that entry.');
    }
    return;
  }

  storage.remove(KEYS.DRAFT);
  sheet.close('saved');

  const label = formatMoney(amount, code, { code: true });
  toastOk(editing ? `Updated ${label}.` : `Added ${label}.`);
  onSaved?.(res.data);
}

function showError(form, field, message) {
  const node = qs(`[data-error="${field}"]`, form);
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  // aria-invalid is the source of truth for the error state, so the styling and
  // the screen-reader announcement can never disagree.
  const control = form.elements[field] || form.elements[field.replace('_minor', '')];
  if (control) control.setAttribute('aria-invalid', 'true');
}

function clearErrors(form) {
  qsa('[data-error]', form).forEach((node) => { node.hidden = true; node.textContent = ''; });
  qsa('[aria-invalid]', form).forEach((node) => node.removeAttribute('aria-invalid'));
}

function saveDraft(form) {
  if (!form.isConnected) return;
  const amount = form.elements.amount?.value?.trim();
  const note = form.elements.note?.value?.trim();
  // Only worth keeping if something was actually typed. A draft holding nothing
  // but a default type would re-open every new entry pre-filled for no reason.
  if (!amount && !note) return;

  storage.set(KEYS.DRAFT, {
    type: form.elements.type.value,
    amount_minor: parseAmount(amount, qs('[data-currency-picker]', form).textContent.trim()),
    currency: qs('[data-currency-picker]', form).textContent.trim(),
    account_id: form.elements.account_id.value,
    category_id: form.elements.category_id?.value || null,
    necessity: qs('[name="necessity"]:checked', form)?.value || null,
    method: form.elements.method.value || null,
    payee: form.elements.payee.value,
    note,
    occurred_on: form.elements.occurred_on.value,
  });
}

function nextYear() {
  const d = today();
  return String(Number(d.slice(0, 4)) + 1) + d.slice(4);
}
