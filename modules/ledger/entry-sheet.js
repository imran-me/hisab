/**
 * Ledger · the entry sheet
 *
 * The most-used screen in the product: adding a transaction, one-handed, in a
 * few seconds, usually while standing somewhere. Everything about it is shaped
 * by that. The target (docs/DIRECTION.md §3.4) is tap +, type 2-5-0, save:
 * three taps plus the digits, with nothing needed above the middle of the
 * screen.
 *
 * Design decisions worth stating:
 *
 * · THE AMOUNT IS FIRST, AND TYPED ON A PAD DRAWN IN THE SHEET. The display is
 *   inputmode="none", so the system keyboard never opens for it and never
 *   covers the form. See numpad.js for why it also does sums.
 * · THE TYPE PICKER RECOLOURS THE AMOUNT. Expense is coral, income mint,
 *   deposit violet. Entering an expense as income is the most common data-entry
 *   mistake in every ledger, and it is silent — the total is simply wrong. The
 *   colour makes it loud.
 * · EVERYTHING ELSE HAS A DEFAULT AND IS ONE TAP AWAY. The account is a chip
 *   that shows what it will use; date, payee, note and necessity sit behind
 *   Details. A field nobody has to touch is a field that cannot slow anyone
 *   down.
 * · NOTHING IS SAVED UNTIL SAVE. But the half-typed state is kept in a draft,
 *   so a phone call does not lose it.
 */

import { el, qs, qsa, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { moneyLabel, CURRENCIES } from '../../shared/js/core/money.js';
import { today, formatDate } from '../../shared/js/core/dates.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure, toast } from '../../shared/js/components/toast.js';
import * as state from '../../shared/js/core/state.js';
import * as ledger from './backend/api.js';
import * as accounts from '../accounts/backend/api.js';
import * as categories from '../categories/backend/api.js';
import { numpadMarkup, attachNumpad, bufferFor } from './numpad.js';

/**
 * The sheet's stylesheet, loaded once on first open and awaited, so the sheet
 * never paints unstyled for a frame. Resolved against this file rather than the
 * page, because the sheet opens from pages in other folders.
 */
let styles = null;
function ensureStyles() {
  if (!styles) {
    styles = new Promise((resolve) => {
      const link = el('link', { rel: 'stylesheet', href: new URL('./entry-sheet.css', import.meta.url).href });
      link.addEventListener('load', resolve);
      link.addEventListener('error', resolve);   // unstyled beats no sheet at all
      document.head.append(link);
    });
  }
  return styles;
}

/** Only one entry sheet at a time: a double tap on + must not stack two. */
let current = null;

/**
 * Open the entry sheet.
 *
 * @param {object} [opts]
 * @param {string} [opts.type='expense']
 * @param {object} [opts.transaction]  correct this one instead of creating
 * @param {Function} [opts.onSaved]
 */
export async function openEntrySheet(opts = {}) {
  if (current) return current;

  const editing = opts.transaction || null;
  const book = state.book();

  const [accountRes, methodList] = await Promise.all([
    accounts.list({ book }),
    categories.methods(),
    ensureStyles(),
  ]);

  const accountRows = accountRes.data;
  if (!accountRows.length) {
    toast('Add an account first — a transaction has to come from somewhere.', {
      tone: 'warn',
      action: { label: 'Add account', onClick: () => { window.location.href = '../accounts/list.html?new=1'; } },
    });
    return null;
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

  // Asking for a type is explicit — a long-press on + offering In is nothing
  // but that request — so it beats the type a restored draft happens to carry.
  // The half-typed amount is kept; what is not kept is the abandoned draft
  // quietly turning a press of In into an expense.
  if (!editing && opts.type) initial.type = opts.type;
  if (!accountRows.some((a) => a.id === initial.account_id)) initial.account_id = accountRows[0].id;

  const form = el('form', { class: 'entry', novalidate: true });
  form.dataset.flow = initial.type || 'expense';

  const ctx = { form, book, accountRows, methodList, editing, pad: null };

  const sheet = openSheet({
    title: editing ? 'Correct entry' : 'New entry',
    body: form,
    onClose: (reason) => {
      current = null;
      // A dismissed NEW entry keeps its draft; a saved or cancelled edit does
      // not. Keeping a draft from an edit would re-open it as a new entry.
      if (!editing && reason !== 'saved') saveDraft(ctx);
    },
  });
  sheet.el.classList.add('sheet--entry');
  current = sheet;

  await renderForm(ctx, initial);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit({ ...ctx, sheet, onSaved: opts.onSaved });
  });

  return sheet;
}

/**
 * Wire this page's "add an entry" requests to the sheet.
 *
 * Every screen that can add an entry calls this once instead of wiring its own
 * buttons, so there is one answer to "what does + do" rather than one per page.
 * It listens for three things:
 *
 * · EVENTS.COMPOSE on the bus — the tab bar's + (docs/DIRECTION.md A2). The
 *   payload may name a type: a string, or { type }.
 * · ?compose=1 in the URL — the + on a page that has no listener falls back to
 *   the Ledger with this, and so does the home-screen shortcut. ?compose=income
 *   names a type.
 * · any [data-compose] button on the page, e.g. an empty state's "Add an entry".
 *
 * @param {object} [opts]
 * @param {Function} [opts.onSaved]  receives the saved row
 * @returns {Function} stops listening
 */
export function mountCompose({ onSaved } = {}) {
  const open = (type) => openEntrySheet({ type: ledger.TYPES.some((t) => t.key === type) ? type : undefined, onSaved });

  // EVENTS.COMPOSE is added to the bus by the shell track; until it lands, the
  // same string is used here so the two meet without a coordinated release.
  const stopBus = on(EVENTS.COMPOSE || 'compose:requested', (payload) => open(typeof payload === 'string' ? payload : payload?.type));

  const stopClicks = delegate(document.body, 'click', '[data-compose]', (_event, button) => open(button.dataset.compose || undefined));

  const params = new URLSearchParams(location.search);
  if (params.has('compose')) {
    open(params.get('compose'));
    // Taken out of the address, or a reload - or the back button from the next
    // page - opens the sheet again over an entry that was already saved.
    params.delete('compose');
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }

  return () => { stopBus(); stopClicks?.(); };
}

/**
 * The header's two direct-entry buttons: Out and In.
 *
 * DEPRECATED — the tab bar's + replaces them (docs/DIRECTION.md §3.2). The
 * Ledger no longer uses this. It stays exported only until the Overview moves
 * to mountCompose(), so that page does not break in between; delete it then.
 */
export function entryActions() {
  return `
    <button type="button" class="btn btn--flow-out" data-compose="expense" aria-label="Add an expense">
      ${icon('arrow-out', { class: 'icon icon--sm' })}<span>Out</span>
    </button>
    <button type="button" class="btn btn--flow-in" data-compose="income" aria-label="Add income">
      ${icon('arrow-in', { class: 'icon icon--sm' })}<span>In</span>
    </button>`;
}

/* =========================================================================
   Rendering
   ========================================================================= */

async function renderForm(ctx, initial) {
  const { form, accountRows, methodList, editing } = ctx;
  const type = initial.type || 'expense';
  const account = accountRows.find((a) => a.id === initial.account_id) || accountRows[0];
  const cur = initial.currency || account.currency;
  const places = CURRENCIES[cur]?.minorUnit ?? 2;

  form.innerHTML = `
    <!-- Type. A radio group, so arrow keys move between the four and a screen
         reader announces "2 of 4". Short words, so all four fit at 320px
         without truncating to "Expe…". -->
    <fieldset class="fieldset entry__types">
      <legend class="sr-only">Type of entry</legend>
      <div class="segment" role="radiogroup">
        ${ledger.TYPES.map((t) => `
          <label class="segment__option segment__option--${t.tone}">
            <input type="radio" name="type" value="${t.key}"${t.key === type ? ' checked' : ''} aria-label="${esc(t.label)}">
            <span>${esc(t.short)}</span>
          </label>`).join('')}
      </div>
    </fieldset>

    <!-- The amount. The largest type in the app, coloured by the type above.
         inputmode="none": the pad below is the keyboard. -->
    <div class="entry__amount">
      <button type="button" class="entry__currency" data-currency-picker aria-label="Currency, currently ${esc(cur)}">${esc(cur)}</button>
      <input class="entry__display" id="entry-amount" name="amount"
             inputmode="none" autocomplete="off" spellcheck="false"
             aria-label="Amount" placeholder="0" data-autofocus>
    </div>
    <p class="entry__result" data-result aria-live="polite" hidden></p>
    <p class="field__error" data-error="amount_minor" hidden></p>
    <p class="field__error" data-error="entry" hidden></p>

    <!-- Details: optional, and collapsed. It sits ABOVE the chip row so that
         opening it grows the sheet upward and leaves the pad where the thumb
         already is. -->
    <div class="entry__details stack stack--4" id="entry-details" data-details${editing ? '' : ' hidden'}>
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

      ${editing ? `
        <button type="button" class="btn btn--danger btn--block" data-delete>
          ${icon('trash', { class: 'icon icon--sm' })}<span>Reverse this entry</span>
        </button>` : ''}
    </div>

    <!-- What will be used, as chips: each shows its current value and a tap
         changes it. Nothing here needs touching for the common case. -->
    <div class="entry__picks">
      <button type="button" class="entry-chip" data-pick="account" aria-haspopup="menu">
        <span class="entry-chip__label" data-account-label>From</span>
        <span class="entry-chip__value" data-account-name></span>
      </button>
      <button type="button" class="entry-chip" data-pick="to" aria-haspopup="menu" hidden>
        <span class="entry-chip__label">To</span>
        <span class="entry-chip__value" data-to-name></span>
      </button>
      <button type="button" class="entry-chip" data-pick="date" aria-haspopup="menu">
        <span class="entry-chip__value" data-date-name></span>
      </button>
      <button type="button" class="entry-chip entry-chip--toggle" data-details-toggle
              aria-controls="entry-details" aria-expanded="${editing ? 'true' : 'false'}">
        <span class="entry-chip__value">Details</span>
        ${icon('chevron-up', { class: 'icon icon--sm' })}
      </button>
    </div>
    <input type="hidden" name="account_id" value="${esc(account.id)}">
    <input type="hidden" name="to_account_id" value="${esc(initial.to_account_id || initial.counter_account_id || '')}">
    <p class="field__error" data-error="account_id" hidden></p>
    <p class="field__error" data-error="to_account_id" hidden></p>

    ${numpadMarkup({ places })}
  `;

  const display = qs('#entry-amount', form);
  ctx.pad = attachNumpad(form, {
    display,
    result: qs('[data-result]', form),
    code: () => currencyCode(form),
    initial: bufferFor(initial.amount_minor, cur),
  });

  await syncType(ctx, initial);
  syncChips(ctx);
  attachHandlers(ctx);

  // The sheet focused its first control before this form was filled in, so
  // the amount is focused here. inputmode=none: no keyboard comes up.
  display.focus({ preventScroll: true });
}

/** The currency the amount is being typed in. */
function currencyCode(form) {
  return qs('[data-currency-picker]', form).textContent.trim();
}

/**
 * Everything that changes when the type changes.
 *
 * Kept in ONE function rather than scattered across four listeners, because the
 * fields that appear and disappear have to agree with each other — a visible
 * "To" on an expense, or a necessity band on a transfer, produces a row the
 * counting rules cannot classify.
 */
async function syncType(ctx, initial = {}) {
  const { form, book, accountRows } = ctx;
  const type = form.elements.type.value;
  form.dataset.flow = type;   // recolours the amount — see ledger.css

  const isTransfer = type === 'transfer';
  const isDeposit = type === 'deposit';
  const isIncome = type === 'income';

  qs('[data-category-field]', form).hidden = isTransfer;
  qs('[data-necessity-field]', form).hidden = type !== 'expense';
  qs('[data-pick="to"]', form).hidden = !(isTransfer || isDeposit);
  qs('[data-account-label]', form).textContent = isIncome ? 'Into' : 'From';
  qs('[data-payee-label]', form).textContent = isIncome ? 'Received from' : 'Paid to';

  // A transfer must land somewhere tracked, or it is not a transfer — it is
  // money leaving, which is an expense or a deposit. So it gets a default
  // destination rather than a blank one the person has to notice.
  const to = form.elements.to_account_id;
  if (isTransfer && (!to.value || to.value === form.elements.account_id.value)) {
    to.value = accountRows.find((a) => a.id !== form.elements.account_id.value)?.id || '';
  }
  if (!isTransfer && !isDeposit) to.value = '';

  if (!isTransfer) {
    const rows = await categories.list({ book, type });
    const select = form.elements.category_id;
    const chosen = initial.category_id ?? select.value;
    select.innerHTML = `<option value="">Uncategorised</option>` +
      rows.map((c) => `<option value="${esc(c.id)}" data-necessity="${c.necessity ?? ''}" data-label="${esc(c.label)}"${c.id === chosen ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
  }

  if (type === 'expense') {
    const bands = await categories.necessityBands();
    const suggested = Number(form.elements.category_id?.selectedOptions?.[0]?.dataset.necessity) || 0;
    const chosen = Number(initial.necessity) || suggested || 3;
    qs('[data-necessity-choices]', form).innerHTML = bands.map((b) => `
      <label class="choice choice--need-${b.band}" title="${esc(b.hint)}">
        <input type="radio" name="necessity" value="${b.band}"${b.band === chosen ? ' checked' : ''}>
        <span>${esc(b.label)}</span>
      </label>`).join('');
  }

  syncChips(ctx);
}

/** The chip row says what will be used, in words. */
function syncChips(ctx) {
  const { form, accountRows } = ctx;
  const byId = (id) => accountRows.find((a) => a.id === id);

  qs('[data-account-name]', form).textContent = byId(form.elements.account_id.value)?.name || 'Choose';

  const to = form.elements.to_account_id.value;
  qs('[data-to-name]', form).textContent = to ? (byId(to)?.name || 'Choose') : 'Not tracked here';

  qs('[data-date-name]', form).textContent = dayName(form.elements.occurred_on.value);
}

function dayName(dateKey) {
  if (!dateKey || dateKey === today()) return 'Today';
  if (dateKey === shiftDay(today(), -1)) return 'Yesterday';
  return formatDate(dateKey);
}

function attachHandlers(ctx) {
  const { form, accountRows, editing } = ctx;

  delegate(form, 'change', '[name="type"]', () => syncType(ctx));

  // Selecting a category sets the necessity band it usually carries — but only
  // when the person has not already chosen one. Overwriting a deliberate
  // "avoidable" with the category's default is the kind of quiet correction
  // that makes people stop trusting a form.
  delegate(form, 'change', '[name="category_id"]', (_e, select) => {
    const suggested = select.selectedOptions[0]?.dataset.necessity;
    if (!suggested) return;
    if (form.dataset.needSet === 'true') return;
    const target = qs(`[name="necessity"][value="${suggested}"]`, form);
    if (target) target.checked = true;
  });

  delegate(form, 'change', '[name="necessity"]', () => { form.dataset.needSet = 'true'; });
  delegate(form, 'change', '[name="occurred_on"]', () => syncChips(ctx));

  delegate(form, 'click', '[data-details-toggle]', (_e, button) => {
    const region = qs('[data-details]', form);
    region.hidden = !region.hidden;
    button.setAttribute('aria-expanded', String(!region.hidden));
    if (!region.hidden) region.scrollTop = 0;
  });

  delegate(form, 'click', '[data-pick="account"]', (_e, button) => {
    pickAccount(button, accountRows, form.elements.account_id.value, (account) => {
      form.elements.account_id.value = account.id;
      // The account's currency becomes the amount's currency, unless the
      // person has deliberately picked a different one.
      const currencyButton = qs('[data-currency-picker]', form);
      if (currencyButton.dataset.userSet !== 'true') setCurrency(ctx, account.currency);
      if (form.elements.to_account_id.value === account.id) form.elements.to_account_id.value = '';
      if (form.elements.type.value === 'transfer' && !form.elements.to_account_id.value) {
        form.elements.to_account_id.value = accountRows.find((a) => a.id !== account.id)?.id || '';
      }
      syncChips(ctx);
    });
  });

  delegate(form, 'click', '[data-pick="to"]', (_e, button) => {
    const from = form.elements.account_id.value;
    const options = accountRows.filter((a) => a.id !== from);
    const untracked = form.elements.type.value === 'deposit'
      ? [{ id: '', name: 'Not tracked here' }] : [];
    pickAccount(button, [...options, ...untracked], form.elements.to_account_id.value, (account) => {
      form.elements.to_account_id.value = account.id;
      syncChips(ctx);
    });
  });

  delegate(form, 'click', '[data-pick="date"]', (_e, button) => {
    import('../../shared/js/components/menu.js').then(({ menu }) => {
      const set = (value) => { form.elements.occurred_on.value = value; syncChips(ctx); };
      menu(button, [
        { label: 'Today', icon: 'calendar', onClick: () => set(today()) },
        { label: 'Yesterday', icon: 'calendar', onClick: () => set(shiftDay(today(), -1)) },
        { label: 'Another day…', icon: 'calendar', onClick: () => {
          const region = qs('[data-details]', form);
          region.hidden = false;
          qs('[data-details-toggle]', form).setAttribute('aria-expanded', 'true');
          const input = form.elements.occurred_on;
          input.focus();
          try { input.showPicker?.(); } catch { /* not allowed here: the focused field will do */ }
        } },
      ], { align: 'start' });
    });
  });

  delegate(form, 'click', '[data-currency-picker]', (_e, button) => openCurrencyPicker(ctx, button));

  if (editing) {
    delegate(form, 'click', '[data-delete]', async () => {
      const { confirmDialog } = await import('../../shared/js/components/sheet.js');
      // The wording changed with the rule. Nothing is deleted: a reversing
      // entry is recorded, the two cancel to nothing, and both stay in the
      // history. Saying "delete" would promise something the ledger no longer
      // does - and there is no Undo below for the same reason, because the
      // reversal is itself a recorded entry rather than a pending action.
      const sure = await confirmDialog({
        title: 'Reverse this entry?',
        text: 'A reversing entry is recorded today and the two cancel out. Both stay in the history, so the ledger still shows what happened.',
        confirmLabel: 'Reverse',
        danger: true,
      });
      if (!sure) return;

      const res = await ledger.reverse(editing.id);
      if (!res.ok) { toastFailure(res); return; }

      form.closest('dialog')?.querySelector('[data-sheet-close]')?.click();
      toast('Entry reversed.', { tone: 'good' });
    });
  }
}

function pickAccount(anchor, rows, selectedId, onPick) {
  import('../../shared/js/components/menu.js').then(({ menu }) => {
    menu(anchor, rows.map((a) => ({
      label: a.id === selectedId ? `${a.name}  ✓` : (a.currency && a.currency !== 'BDT' ? `${a.name} · ${a.currency}` : a.name),
      icon: a.id ? accounts.typeOf(a.type).icon : 'arrow-hold',
      onClick: () => onPick(a),
    })), { align: 'start' });
  });
}

function setCurrency(ctx, code) {
  const button = qs('[data-currency-picker]', ctx.form);
  button.textContent = code;
  button.setAttribute('aria-label', `Currency, currently ${code}`);
  // A new minor unit changes what the pad may type — JPY has no decimal key.
  const dot = qs('[data-key="."]', ctx.form);
  if (dot) dot.disabled = (CURRENCIES[code]?.minorUnit ?? 2) === 0;
  ctx.pad?.refresh();
}

/** A short currency list — the ones in use, then the rest. */
function openCurrencyPicker(ctx, button) {
  import('../../shared/js/components/menu.js').then(({ menu }) => {
    const items = Object.values(CURRENCIES).slice(0, 10).map((c) => ({
      label: `${c.code} — ${c.name}`,
      onClick: () => {
        button.dataset.userSet = 'true';
        setCurrency(ctx, c.code);
      },
    }));
    menu(button, items, { align: 'start' });
  });
}

/* =========================================================================
   Submitting
   ========================================================================= */

async function submit({ form, editing, sheet, onSaved, pad }) {
  clearErrors(form);

  const button = qs('[data-save]', form);
  if (button.disabled) return;   // a second tap while the first is in flight
  button.classList.add('is-busy');
  button.disabled = true;

  const code = currencyCode(form);
  const amount = pad.value();

  // null rather than 0 for an unreadable figure, precisely so this check can
  // exist. A silent zero would save a transaction that looks deliberate and is
  // wrong. A sum that comes out negative is refused the same way: the sign of
  // an entry is its type.
  if (amount === null || amount <= 0) {
    showError(form, 'amount_minor', amount === null ? 'Enter an amount.' : 'That sum is not a positive amount.');
    button.classList.remove('is-busy');
    button.disabled = false;
    form.elements.amount.focus();
    return;
  }

  const categoryOption = form.elements.category_id?.selectedOptions?.[0];
  const type = form.elements.type.value;

  const payload = {
    type,
    amount_minor: amount,
    currency: code,
    account_id: form.elements.account_id.value,
    to_account_id: form.elements.to_account_id?.value || null,
    category_id: type === 'transfer' ? null : (form.elements.category_id?.value || null),
    category_label: categoryOption?.dataset.label || null,
    necessity: type === 'expense' ? (qs('[name="necessity"]:checked', form)?.value || null) : null,
    method: form.elements.method.value || null,
    payee: form.elements.payee.value,
    note: form.elements.note.value,
    occurred_on: form.elements.occurred_on.value || today(),
    book: state.book(),
  };

  const res = editing ? await ledger.update(editing.id, payload) : await ledger.create(payload);

  button.classList.remove('is-busy');
  button.disabled = false;

  if (!res.ok) {
    if (res.reason === 'invalid') {
      const errors = Object.entries(res.errors || {});
      for (const [field, messages] of errors) showError(form, field, messages[0]);
      // An error for a field that lives behind Details opens Details, so the
      // message is not hidden in a collapsed region.
      const hidden = errors.some(([field]) => ['occurred_on', 'category_id', 'payee', 'note', 'method'].includes(field));
      if (hidden) qs('[data-details]', form).hidden = false;
      // A field with no error slot of its own still gets a message, rather than
      // the save silently doing nothing.
      if (!errors.some(([field]) => qs(`[data-error="${field}"]`, form))) {
        showError(form, 'entry', errors[0]?.[1]?.[0] || 'Could not save that entry.');
      }
    } else {
      toastFailure(res, 'Could not save that entry.');
    }
    return;
  }

  storage.remove(KEYS.DRAFT);
  // A light tick under the thumb says "recorded" before the eye finds the
  // toast. Where vibrate is missing (iOS, desktop) nothing happens.
  try { navigator.vibrate?.(8); } catch { /* not allowed: fine */ }
  sheet.close('saved');

  const label = moneyLabel(amount, code);
  toastOk(editing ? `Corrected to ${label}.` : `Added ${label}.`);
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
  if (control?.setAttribute) control.setAttribute('aria-invalid', 'true');
}

function clearErrors(form) {
  qsa('[data-error]', form).forEach((node) => { node.hidden = true; node.textContent = ''; });
  qsa('[aria-invalid]', form).forEach((node) => node.removeAttribute('aria-invalid'));
}

function saveDraft({ form, pad }) {
  if (!form.isConnected || !pad) return;
  const amount = pad.value();
  const note = form.elements.note?.value?.trim();
  // Only worth keeping if something was actually typed. A draft holding nothing
  // but a default type would re-open every new entry pre-filled for no reason.
  if (!amount && !note) return;

  storage.set(KEYS.DRAFT, {
    type: form.elements.type.value,
    amount_minor: amount,
    currency: currencyCode(form),
    account_id: form.elements.account_id.value,
    to_account_id: form.elements.to_account_id.value || null,
    category_id: form.elements.category_id?.value || null,
    necessity: qs('[name="necessity"]:checked', form)?.value || null,
    method: form.elements.method.value || null,
    payee: form.elements.payee.value,
    note,
    occurred_on: form.elements.occurred_on.value,
  });
}

function shiftDay(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextYear() {
  const d = today();
  return String(Number(d.slice(0, 4)) + 1) + d.slice(4);
}
