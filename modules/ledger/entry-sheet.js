/**
 * Ledger · the entry sheet
 *
 * The owner's spec, in their words: "entry will be simple: amount, type,
 * category, note, from cash or bank account". So the sheet is exactly that,
 * top to bottom, and nothing else in the default view:
 *
 *   type      Expense / Income / Transfer, in plain words
 *   amount    large, typed on the pad drawn in the sheet; red while it is an
 *             expense, green while it is income
 *   account   From (expense), To (income), From → To (transfer), with the
 *             balance it will have after this entry
 *   category  icon chips in colour circles
 *   note      one line, always visible
 *   date      a small chip, Today unless changed
 *
 * Decisions worth stating:
 *
 * · THE PAD, NOT THE SYSTEM KEYBOARD, for the amount (inputmode="none"), so
 *   nothing covers the sheet while the figure is typed. See numpad.js for the
 *   sums and the minor-unit rule.
 * · THREE TYPES ON SCREEN, FOUR IN THE LEDGER. A deposit - money moved into
 *   savings, still yours - stays a first-class type (CONVENTIONS.md), but the
 *   person does not have to know the word: a Transfer INTO a savings or
 *   investment account is recorded as a deposit, because that is what it is.
 * · A CATEGORY IS ASKED FOR, NOT DEFAULTED. Save without one points at the
 *   chips. "Uncategorised" is what the lazy path produces when allowed to.
 * · THE NECESSITY IS NEVER ASKED HERE. It comes from the category (Rent is
 *   essential), on both sides; the person can change it on the Ledger later.
 * · THE ACCOUNT IS REMEMBERED PER CATEGORY. Choosing Transport picks the
 *   account the last Transport entry came from, unless an account was chosen
 *   by hand in this sheet.
 */

import { el, qs, qsa, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { moneyLabel, CURRENCIES, currency as currencyOf } from '../../shared/js/core/money.js';
import { today, formatDate } from '../../shared/js/core/dates.js';
import { storage, KEYS, moduleStore } from '../../shared/js/core/storage.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure, toast } from '../../shared/js/components/toast.js';
import * as state from '../../shared/js/core/state.js';
import * as ledger from './backend/api.js';
import * as accounts from '../accounts/backend/api.js';
import * as categories from '../categories/backend/api.js';
import { glyphOf } from '../categories/glyphs.js';
import { numpadMarkup, attachNumpad, bufferFor } from './numpad.js';
import { pickAccount, logoFor, maskedTail } from './account-picker.js';
import { loadStyles } from './styles.js';

/** The three words on the type control, and the ledger type each writes. */
const KINDS = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
];

/** Category chips: the most used, then More. One scrolling row. */
const CHIPS = 11;

/** Recent-entry chips: one slim row. */
const RECENTS = 6;

/**
 * The account last used for each category, on this device. The server's
 * GET /categories/frequent says the same from history; this covers what was
 * entered a minute ago and the no-backend case.
 */
const prefs = moduleStore('ledger-entry');

/**
 * Only one entry sheet at a time: a double tap on + must not stack two. Set
 * BEFORE the first await, or two taps inside the load both get through.
 */
let current = null;

/**
 * Open the entry sheet.
 *
 * @param {object} [opts]
 * @param {string} [opts.type='expense']
 * @param {object} [opts.transaction]  correct this one instead of creating
 * @param {Function} [opts.onSaved]
 */
export function openEntrySheet(opts = {}) {
  if (current) return current;
  current = open(opts).then((sheet) => {
    if (!sheet) current = null;
    return sheet;
  }, (err) => { current = null; throw err; });
  return current;
}

async function open(opts) {
  const editing = opts.transaction || null;
  const book = state.book();

  const [accountRes, balanceRes] = await Promise.all([
    accounts.list({ book }),
    ledger.balances({ book }),
    loadStyles('entry-sheet.css'),
    loadStyles('row.css'),
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

  const initial = { ...(editing || draft || {
    type: opts.type || 'expense',
    account_id: (await accounts.defaultFor(book))?.id || accountRows[0].id,
    occurred_on: today(),
  }) };

  // Asking for a type is explicit — a long-press on + offering Income is
  // nothing but that request — so it beats the type a restored draft carries.
  if (!editing && opts.type) initial.type = opts.type;
  if (!accountRows.some((a) => a.id === initial.account_id)) initial.account_id = accountRows[0].id;

  const form = el('form', { class: 'entry', novalidate: true });

  const ctx = {
    form, book, accountRows, editing,
    balances: balanceRes.data || {},
    pad: null, chips: [], categoryRows: [], recents: [],
    sheet: null, onSaved: opts.onSaved,
    // A deposit being corrected keeps its type even when its destination is
    // not tracked here; see kindOf().
    wasDeposit: editing?.type === 'deposit',
  };

  const sheet = openSheet({
    title: editing ? 'Correct entry' : 'New entry',
    body: form,
    onClose: (reason) => {
      current = null;
      document.removeEventListener('visibilitychange', ctx.onHidden);
      // A dismissed NEW entry keeps its draft; a saved or cancelled edit does
      // not. Keeping a draft from an edit would re-open it as a new entry.
      if (!editing && reason !== 'saved') saveDraft(ctx);
    },
  });
  sheet.el.classList.add('sheet--entry');
  ctx.sheet = sheet;

  // THE DRAFT, written as it is typed. It used to be written only from
  // onClose, and sheet.js removes the sheet before calling onClose, so the
  // `form.isConnected` guard returned every time and no draft was ever kept.
  // Written on every change instead (debounced), and at once when the page is
  // hidden - a phone call, a switch to bKash to check a balance - because a
  // hidden tab may be killed without any further event.
  if (!editing) {
    let timer = 0;
    ctx.draftSoon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => saveDraft(ctx), 250); };
    ctx.onHidden = () => { if (document.visibilityState === 'hidden') saveDraft(ctx); };
    document.addEventListener('visibilitychange', ctx.onHidden);
    form.addEventListener('input', () => ctx.draftSoon());
    form.addEventListener('change', () => ctx.draftSoon());
  }

  await renderForm(ctx, initial);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(ctx);
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
  const launch = (type) => openEntrySheet({ type: ledger.TYPES.some((t) => t.key === type) ? type : undefined, onSaved });

  const stopBus = on(EVENTS.COMPOSE, (payload) => launch(typeof payload === 'string' ? payload : payload?.type));

  const stopClicks = delegate(document.body, 'click', '[data-compose]', (_event, button) => launch(button.dataset.compose || undefined));

  const params = new URLSearchParams(location.search);
  if (params.has('compose')) {
    launch(params.get('compose'));
    // Taken out of the address, or a reload - or the back button from the next
    // page - opens the sheet again over an entry that was already saved.
    params.delete('compose');
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }

  return () => { stopBus(); stopClicks?.(); };
}

/* =========================================================================
   Rendering
   ========================================================================= */

async function renderForm(ctx, initial) {
  const { form, accountRows } = ctx;
  // A deposit is shown as the Transfer it looks like to the person.
  const kind = initial.type === 'deposit' ? 'transfer' : (initial.type || 'expense');
  const account = accountRows.find((a) => a.id === initial.account_id) || accountRows[0];
  const cur = initial.currency || account.currency;
  const places = currencyOf(cur).minorUnit;

  form.dataset.flow = kind;
  form.innerHTML = `
    <!-- Type. A radio group, so arrow keys move between the three and a screen
         reader announces "2 of 3". -->
    <fieldset class="fieldset entry__types">
      <legend class="sr-only">Type of entry</legend>
      <div class="segment" role="radiogroup">
        ${KINDS.map((k) => `
          <label class="segment__option segment__option--${k.key}">
            <input type="radio" name="kind" value="${k.key}"${k.key === kind ? ' checked' : ''}>
            <span>${k.label}</span>
          </label>`).join('')}
      </div>
    </fieldset>

    <!-- The amount: the largest type in the app. The ৳ is a button, because
         it is also the currency picker. inputmode="none": the pad is the
         keyboard. -->
    <div class="entry__amount">
      <button type="button" class="entry__currency" data-currency-picker data-code="${esc(cur)}"></button>
      <input class="entry__display" id="entry-amount" name="amount"
             inputmode="none" autocomplete="off" spellcheck="false"
             aria-label="Amount" placeholder="0" data-autofocus>
    </div>
    <p class="entry__sum" data-result aria-live="polite" hidden></p>
    <p class="field__error entry__error" data-error="amount_minor" role="alert" hidden></p>

    <!-- The account, with what it will hold after this entry. -->
    <div class="entry__accounts" data-accounts></div>
    <p class="field__error entry__error" data-error="account_id" role="alert" hidden></p>
    <p class="field__error entry__error" data-error="to_account_id" role="alert" hidden></p>

    <!-- Category: icon chips in colour circles, one scrolling row. -->
    <div class="entry__cats" data-cats role="radiogroup" aria-label="Category"></div>
    <p class="field__error entry__error" data-error="category_id" role="alert" hidden></p>
    <p class="field__error entry__error" data-error="entry" role="alert" hidden></p>

    <!-- The note, always visible, and the date as a small chip beside it. -->
    <div class="entry__note-row">
      <label class="sr-only" for="entry-note">Note</label>
      <input class="entry__note" id="entry-note" name="note" autocomplete="off"
             enterkeyhint="done" maxlength="2000" placeholder="Add a note"
             value="${esc(initial.note || '')}">
      <button type="button" class="entry__date" data-pick-date aria-haspopup="menu">
        ${icon('calendar', { class: 'icon icon--sm' })}<span data-date-name></span>
      </button>
      <input type="date" class="entry__date-input" name="occurred_on" tabindex="-1" aria-label="Date"
             value="${esc(initial.occurred_on || today())}" max="${esc(nextYear())}">
    </div>
    <p class="field__error entry__error" data-error="occurred_on" role="alert" hidden></p>

    <!-- Repeat a recent entry: one slim row, only when there is history. -->
    <div class="entry__recents" data-recents role="group" aria-label="Repeat a recent entry" hidden></div>

    <input type="hidden" name="account_id" value="${esc(account.id)}">
    <input type="hidden" name="to_account_id" value="${esc(initial.to_account_id || initial.counter_account_id || '')}">
    <input type="hidden" name="category_id" value="${esc(initial.category_id || '')}">
    <!-- Carried, not shown: a correction or a repeat keeps the payee and the
         method it had, and a correction keeps its necessity. -->
    <input type="hidden" name="payee" value="${esc(initial.payee || '')}">
    <input type="hidden" name="method" value="${esc(initial.method || '')}">
    <input type="hidden" name="necessity" value="${esc(ctx.editing?.necessity || '')}">

    ${ctx.editing ? `
      <button type="button" class="entry__reverse" data-delete>
        ${icon('trash', { class: 'icon icon--sm' })}<span>Reverse this entry instead</span>
      </button>` : ''}

    ${numpadMarkup({ places })}
  `;

  ctx.pad = attachNumpad(form, {
    display: qs('#entry-amount', form),
    result: qs('[data-result]', form),
    code: () => currencyCode(form),
    initial: bufferFor(initial.amount_minor, cur),
    onChange: () => { syncAccounts(ctx); ctx.draftSoon?.(); },
  });

  setCurrency(ctx, cur);
  await syncKind(ctx, initial);
  attachHandlers(ctx);

  // The sheet focused its first control before this form was filled in, so
  // the amount is focused here. inputmode=none: no keyboard comes up.
  qs('#entry-amount', form).focus({ preventScroll: true });
}

/** The currency the amount is being typed in. */
function currencyCode(form) {
  return qs('[data-currency-picker]', form).dataset.code;
}

/**
 * The ledger type this entry will be written as.
 *
 * A Transfer into a savings or investment account is a DEPOSIT: money out of
 * what can be spent that is still yours. Recording it as a transfer would
 * leave the savings figures at zero however much was put away. A deposit
 * being corrected stays one, even when its destination is not tracked here.
 */
function kindOf(ctx) {
  const { form, accountRows } = ctx;
  const kind = form.elements.kind.value;
  if (kind !== 'transfer') return kind;
  const to = accountRows.find((a) => a.id === form.elements.to_account_id.value);
  if (to && !accounts.isSpendable(to)) return 'deposit';
  if (!to && ctx.wasDeposit) return 'deposit';
  return 'transfer';
}

/** Everything that changes with the type, in one place. */
async function syncKind(ctx, initial = {}) {
  const { form, book, accountRows } = ctx;
  const kind = form.elements.kind.value;
  form.dataset.flow = kind;   // recolours the amount — see entry-sheet.css

  const isTransfer = kind === 'transfer';

  // A transfer must land somewhere, so it gets a default destination rather
  // than a blank one the person has to notice.
  const to = form.elements.to_account_id;
  if (isTransfer && !ctx.wasDeposit && (!to.value || to.value === form.elements.account_id.value)) {
    to.value = accountRows.find((a) => a.id !== form.elements.account_id.value && accounts.isSpendable(a))?.id
      || accountRows.find((a) => a.id !== form.elements.account_id.value)?.id || '';
  }
  if (!isTransfer) to.value = '';

  qs('[data-cats]', form).hidden = isTransfer;

  // A category belongs to one type; switching type drops it rather than
  // filing an income under an expense category.
  const chosen = initial.category_id ?? form.elements.category_id.value;
  form.elements.category_id.value = '';

  if (!isTransfer) {
    const [rows, frequent] = await Promise.all([
      categories.list({ book, type: kind }),
      categories.frequent({ book, type: kind, limit: CHIPS }),
    ]);
    if (form.elements.kind.value !== kind) return;   // changed again meanwhile

    ctx.categoryRows = rows;
    ctx.chips = frequent.length ? frequent : rows.slice(0, CHIPS);
    if (chosen && rows.some((c) => c.id === chosen)) form.elements.category_id.value = chosen;
    drawChips(ctx);
  } else {
    ctx.categoryRows = [];
  }

  await drawRecents(ctx, kind);
  syncAccounts(ctx);
  syncDate(ctx);
}

/**
 * The account card(s): From for an expense, To for income, From → To for a
 * transfer. Each shows the logo, the name, the masked number, and the balance
 * it will have once this entry is saved - the one figure that tells you
 * whether you can afford it.
 */
function syncAccounts(ctx) {
  const { form, accountRows, balances } = ctx;
  const kind = form.elements.kind.value;
  const amount = ctx.pad?.value() || 0;
  const code = currencyCode(form);
  const from = accountRows.find((a) => a.id === form.elements.account_id.value);
  const to = accountRows.find((a) => a.id === form.elements.to_account_id.value);

  const card = (account, role, label, sign) => {
    if (!account) {
      return `
        <button type="button" class="acct-card" data-pick="${role}">
          ${logoFor(null)}
          <span class="acct-card__main">
            <span class="acct-card__label">${esc(label)}</span>
            <span class="acct-card__name">Not tracked here</span>
          </span>
        </button>`;
    }
    const now = balances[account.id];
    // After this entry - only when the figure is in the account's own
    // currency; a dollar charge on a taka card is converted on save, and a
    // guess here would be a different number from the one the ledger shows.
    const after = now !== undefined && account.currency === code && amount > 0 ? now + sign * amount : null;
    return `
      <button type="button" class="acct-card" data-pick="${role}" aria-haspopup="dialog">
        ${logoFor(account)}
        <span class="acct-card__main">
          <span class="acct-card__label">${esc(label)}${maskedTail(account) ? ` <span class="acct-card__tail">${esc(maskedTail(account))}</span>` : ''}</span>
          <span class="acct-card__name">${esc(account.name)}</span>
          ${now === undefined ? '' : `<span class="acct-card__pair-after${(after ?? now) < 0 ? ' is-negative' : ''}">${esc(moneyLabel(after ?? now, account.currency, { minor: 'never' }))}</span>`}
        </span>
        <span class="acct-card__balance">
          ${now === undefined ? '' : after === null
            ? `<span class="acct-card__now${now < 0 ? ' is-negative' : ''}">${esc(moneyLabel(now, account.currency, { minor: 'never' }))}</span>`
            : `<span class="acct-card__was">${esc(moneyLabel(now, account.currency, { minor: 'never' }))}</span>
               <span class="acct-card__after${after < 0 ? ' is-negative' : ''}">${esc(moneyLabel(after, account.currency, { minor: 'never' }))}</span>`}
        </span>
        ${icon('chevron-down', { class: 'icon icon--sm acct-card__chev' })}
      </button>`;
  };

  const host = qs('[data-accounts]', form);
  host.classList.toggle('is-pair', kind === 'transfer');
  if (kind === 'expense') host.innerHTML = card(from, 'from', 'From', -1);
  else if (kind === 'income') host.innerHTML = card(from, 'from', 'To', 1);
  else {
    host.innerHTML = card(from, 'from', 'From', -1)
      + `<span class="entry__arrow" aria-hidden="true">${icon('arrow-move', { class: 'icon icon--sm' })}</span>`
      + card(to, 'to', 'To', 1);
  }
}

/** The category chips: circles in each category's own colour, then More. */
function drawChips(ctx) {
  const { form } = ctx;
  const chosen = form.elements.category_id.value;
  let chips = ctx.chips.slice(0, CHIPS);
  // The chosen category is always on the row - a draft or a correction filed
  // under Charity must show that it is filed under Charity.
  if (chosen && !chips.some((c) => c.id === chosen)) {
    const hit = ctx.categoryRows.find((c) => c.id === chosen);
    if (hit) chips = [hit, ...chips.slice(0, CHIPS - 1)];
  }
  ctx.shown = chips;

  qs('[data-cats]', form).innerHTML = chips.map((c) => {
    const { icon: glyph, className } = glyphOf(c);
    return `
      <button type="button" class="entry-cat ${className}" role="radio" data-cat="${esc(c.id)}" aria-checked="${c.id === chosen}">
        <span class="entry-cat__glyph">${icon(glyph, { class: 'icon' })}</span>
        <span class="entry-cat__label">${esc(shortLabel(c.label))}</span>
      </button>`;
  }).join('') + `
      <button type="button" class="entry-cat entry-cat--more" data-cat-more aria-haspopup="menu">
        <span class="entry-cat__glyph">${icon('grid', { class: 'icon' })}</span>
        <span class="entry-cat__label">More</span>
      </button>`;
}

/** "Food & groceries" → "Food", so a chip's label fits under its circle. */
function shortLabel(label) {
  return String(label || '').split(/\s*[&/]\s*|\s+-\s+/)[0];
}

/**
 * The recent strip: the last few DISTINCT entries of this type, newest
 * first, told apart by payee + category + account - what "the same thing
 * again" means. Built from the rows the ledger already holds; no request.
 */
async function drawRecents(ctx, kind) {
  const { form, editing, book } = ctx;
  const host = qs('[data-recents]', form);
  if (editing || kind === 'transfer') { host.hidden = true; return; }

  const rows = (await ledger.list({ book, type: kind })).data;
  if (form.elements.kind.value !== kind) return;

  const seen = new Set();
  const picks = [];
  for (const row of rows) {
    const key = `${(row.payee || row.note || '').toLowerCase()}|${row.category_id || ''}|${row.account_id}`;
    if (seen.has(key) || !(row.payee || row.note || row.category_label)) continue;
    seen.add(key);
    picks.push(row);
    if (picks.length >= RECENTS) break;
  }
  ctx.recents = picks;

  host.innerHTML = `<span class="entry__recents-label">Again?</span>` + picks.map((row, i) => `
    <button type="button" class="entry-recent" data-recent="${i}">
      <span class="entry-recent__name">${esc(row.payee || row.note || shortLabel(row.category_label))}</span>
      <span class="entry-recent__amount">${esc(moneyLabel(row.amount_minor, row.currency, { minor: 'never' }))}</span>
    </button>`).join('');
  host.hidden = picks.length === 0;
}

/** Fill the sheet from a recent entry, with the amount selected. */
function repeatEntry(ctx, row) {
  const { form, accountRows } = ctx;
  const account = accountRows.find((a) => a.id === row.account_id);
  if (account) { form.dataset.accountSet = 'true'; setAccount(ctx, 'from', account); }
  if (row.currency && row.currency !== currencyCode(form)) {
    qs('[data-currency-picker]', form).dataset.userSet = 'true';
    setCurrency(ctx, row.currency);
  }
  form.elements.payee.value = row.payee || '';
  form.elements.method.value = row.method || '';
  form.elements.note.value = row.note || '';
  if (row.category_id) chooseCategory(ctx, row.category_id, { auto: false });
  ctx.pad.set(row.amount_minor);
  syncAccounts(ctx);
  qs('#entry-amount', form).focus({ preventScroll: true });
}

function syncDate(ctx) {
  const value = ctx.form.elements.occurred_on.value;
  qs('[data-date-name]', ctx.form).textContent = dayName(value);
  qs('[data-pick-date]', ctx.form).classList.toggle('is-set', Boolean(value) && value !== today());
}

function dayName(dateKey) {
  if (!dateKey || dateKey === today()) return 'Today';
  if (dateKey === shiftDay(today(), -1)) return 'Yesterday';
  return formatDate(dateKey);
}

function chooseCategory(ctx, id, { auto = true } = {}) {
  const { form, accountRows } = ctx;
  form.elements.category_id.value = id;
  drawChips(ctx);
  clearError(form, 'category_id');
  clearError(form, 'entry');

  // The account used last for this category, unless one was chosen by hand:
  // the CNG comes out of cash, the electricity bill out of bKash.
  if (auto && form.dataset.accountSet !== 'true') {
    const remembered = prefs.read({})[id]
      || ctx.chips.find((c) => c.id === id)?.last_account_id;
    const account = accountRows.find((a) => a.id === remembered);
    if (account && account.id !== form.elements.account_id.value) {
      setAccount(ctx, 'from', account);
      qs('.acct-card', form)?.classList.add('is-switched');
    }
  }
  ctx.draftSoon?.();
}

/** Set one end of the entry, carrying the currency and the other end with it. */
function setAccount(ctx, role, account) {
  const { form, accountRows } = ctx;
  if (role === 'to') {
    form.elements.to_account_id.value = account.id;
  } else {
    form.elements.account_id.value = account.id;
    // The account's currency becomes the amount's currency, unless the person
    // has deliberately picked a different one.
    if (qs('[data-currency-picker]', form).dataset.userSet !== 'true') setCurrency(ctx, account.currency);
    if (form.elements.to_account_id.value === account.id) {
      form.elements.to_account_id.value = form.elements.kind.value === 'transfer'
        ? (accountRows.find((a) => a.id !== account.id)?.id || '') : '';
    }
  }
  syncAccounts(ctx);
}

function attachHandlers(ctx) {
  const { form, accountRows, editing } = ctx;

  delegate(form, 'change', '[name="kind"]', () => syncKind(ctx));

  delegate(form, 'click', '[data-cat]', (_e, button) => chooseCategory(ctx, button.dataset.cat));

  delegate(form, 'click', '[data-cat-more]', (_e, button) => {
    import('../../shared/js/components/menu.js').then(({ menu }) => {
      menu(button, ctx.categoryRows.map((c) => ({
        label: c.label,
        icon: glyphOf(c).icon,
        onClick: () => chooseCategory(ctx, c.id),
      })), { align: 'end' });
    });
  });

  delegate(form, 'click', '[data-recent]', (_e, button) => {
    const row = ctx.recents?.[Number(button.dataset.recent)];
    if (row) repeatEntry(ctx, row);
  });

  delegate(form, 'click', '[data-pick]', async (_e, button) => {
    const role = button.dataset.pick;
    const kind = form.elements.kind.value;
    const other = role === 'to' ? form.elements.account_id.value : form.elements.to_account_id.value;
    const rows = kind === 'transfer' ? accountRows.filter((a) => a.id !== other) : accountRows;
    const title = role === 'to' ? 'Move to' : kind === 'income' ? 'Received into' : kind === 'transfer' ? 'Move from' : 'Pay from';

    const picked = await pickAccount({
      title,
      rows,
      balances: ctx.balances,
      selectedId: role === 'to' ? form.elements.to_account_id.value : form.elements.account_id.value,
      allowUntracked: role === 'to' && ctx.wasDeposit,
    });
    if (!picked) return;
    if (role === 'from') form.dataset.accountSet = 'true';
    setAccount(ctx, role, picked);
    ctx.draftSoon?.();
  });

  delegate(form, 'click', '[data-pick-date]', (_e, button) => {
    import('../../shared/js/components/menu.js').then(({ menu }) => {
      const set = (value) => { form.elements.occurred_on.value = value; syncDate(ctx); ctx.draftSoon?.(); };
      menu(button, [
        { label: 'Today', icon: 'calendar', onClick: () => set(today()) },
        { label: 'Yesterday', icon: 'calendar', onClick: () => set(shiftDay(today(), -1)) },
        { label: 'Another day…', icon: 'calendar', onClick: () => {
          const input = form.elements.occurred_on;
          try { input.showPicker(); } catch { input.focus(); }
        } },
      ], { align: 'end' });
    });
  });
  form.elements.occurred_on.addEventListener('change', () => syncDate(ctx));

  // Enter in the note is "done", not "submit": the keyboard goes away and the
  // pad is back, with Save where the thumb is.
  form.elements.note.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); form.elements.note.blur(); }
  });

  delegate(form, 'click', '[data-currency-picker]', (_e, button) => openCurrencyPicker(ctx, button));

  if (editing) {
    delegate(form, 'click', '[data-delete]', async () => {
      const { confirmDialog } = await import('../../shared/js/components/sheet.js');
      // Nothing is deleted: a reversing entry is recorded, the two cancel to
      // nothing, and both stay in the history.
      const sure = await confirmDialog({
        title: 'Reverse this entry?',
        text: 'A reversing entry is recorded today and the two cancel out. Both stay in the history, so the ledger still shows what happened.',
        confirmLabel: 'Reverse',
        danger: true,
      });
      if (!sure) return;

      const res = await ledger.reverse(editing.id);
      if (!res.ok) { toastFailure(res); return; }

      ctx.sheet.close('saved');
      toast('Entry reversed.', { tone: 'good' });
    });
  }
}

/**
 * The currency button shows what A1's formatter shows for that currency: ৳
 * for the home currency, the code for any other. It carries the code itself in
 * data-code, because the symbol alone is not an identifier.
 */
function setCurrency(ctx, code) {
  const button = qs('[data-currency-picker]', ctx.form);
  button.dataset.code = code;
  const mark = moneyLabel(0, code).replace(/[\d.,\s−+-]/g, '') || code;
  button.textContent = mark;
  button.classList.toggle('is-code', mark.length > 1);
  button.setAttribute('aria-label', `Currency, ${currencyOf(code).name || code}. Change`);
  // A new minor unit changes what the pad may type — JPY has no point.
  qs('[data-long-key]', ctx.form)?.toggleAttribute('data-no-point', currencyOf(code).minorUnit === 0);
  ctx.pad?.refresh();
}

/** A short currency list. */
function openCurrencyPicker(ctx, button) {
  import('../../shared/js/components/menu.js').then(({ menu }) => {
    const items = Object.values(CURRENCIES).slice(0, 10).map((c) => ({
      label: `${c.code} — ${c.name}`,
      onClick: () => {
        button.dataset.userSet = 'true';
        setCurrency(ctx, c.code);
        syncAccounts(ctx);
      },
    }));
    menu(button, items, { align: 'start' });
  });
}

/* =========================================================================
   Submitting
   ========================================================================= */

async function submit(ctx) {
  const { form, editing, sheet, onSaved, pad } = ctx;
  clearErrors(form);
  if (form.dataset.busy === 'true') return;   // a second tap while the first is in flight

  const code = currencyCode(form);
  const amount = pad.value();
  const type = kindOf(ctx);

  // null rather than 0 for an unreadable figure, precisely so this check can
  // exist. A sum that comes out negative is refused the same way: the sign of
  // an entry is its type.
  if (amount === null || amount <= 0) {
    showError(form, 'amount_minor', amount === null ? 'Type the amount.' : 'That sum is not a positive amount.');
    nudge(qs('#entry-amount', form));
    return;
  }

  // A category is asked for, not defaulted - but only when there are some to
  // choose from, or an empty set would lock the person out of recording.
  const categoryId = type === 'transfer' ? null : (form.elements.category_id.value || null);
  if (type !== 'transfer' && !categoryId && ctx.categoryRows.length) {
    showError(form, 'entry', 'Pick a category.');
    nudge(qs('[data-cats]', form));
    return;
  }

  const button = qs('[data-save]', form);
  form.dataset.busy = 'true';
  button.classList.add('is-busy');

  const category = ctx.categoryRows.find((c) => c.id === categoryId);
  const payload = {
    type,
    amount_minor: amount,
    currency: code,
    account_id: form.elements.account_id.value,
    to_account_id: (type === 'transfer' || type === 'deposit') ? (form.elements.to_account_id.value || null) : null,
    category_id: categoryId,
    category_label: category?.label || null,
    // Only a correction carries one - the band the entry already had. A new
    // entry takes its category's band, on both sides.
    necessity: type === 'expense' && editing ? (form.elements.necessity.value || null) : null,
    method: form.elements.method.value || null,
    payee: form.elements.payee.value,
    note: form.elements.note.value,
    occurred_on: form.elements.occurred_on.value || today(),
    book: state.book(),
  };

  const res = editing ? await ledger.update(editing.id, payload) : await ledger.create(payload);

  form.dataset.busy = 'false';
  button.classList.remove('is-busy');

  if (!res.ok) {
    if (res.reason === 'invalid') {
      const errors = Object.entries(res.errors || {});
      for (const [field, messages] of errors) showError(form, field, messages[0]);
      if (!errors.some(([field]) => qs(`[data-error="${field}"]`, form))) {
        showError(form, 'entry', errors[0]?.[1]?.[0] || 'Could not save that entry.');
      }
    } else {
      toastFailure(res, 'Could not save that entry.');
    }
    return;
  }

  ctx.saved = true;
  storage.remove(KEYS.DRAFT);
  if (categoryId) prefs.write({ ...prefs.read({}), [categoryId]: payload.account_id });

  // THE SAVE, felt: a tick under the thumb, the Save key turns into a check
  // and the figure drops into the account it came from, then the sheet goes.
  // 420ms in all - long enough to register, short enough never to wait for.
  try { navigator.vibrate?.(8); } catch { /* not allowed: fine */ }
  await celebrate(form);
  sheet.close('saved');

  const account = ctx.accountRows.find((a) => a.id === payload.account_id);
  const parts = [moneyLabel(amount, code), category?.label, account?.name].filter(Boolean);
  toastOk(`${editing ? 'Corrected' : 'Saved'} ${parts.join(' · ')}.`);
  onSaved?.(res.data);
}

/** The save animation. Resolves when it has played (at once without motion). */
function celebrate(form) {
  form.classList.add('is-saved');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise((resolve) => window.setTimeout(resolve, reduced ? 120 : 420));
}

/** A short shake on whatever needs attention. */
function nudge(node) {
  if (!node) return;
  node.classList.remove('is-nudged');
  void node.offsetWidth;   // restart the animation on a second nudge
  node.classList.add('is-nudged');
}

function showError(form, field, message) {
  const node = qs(`[data-error="${field}"]`, form);
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
}

function clearError(form, field) {
  const node = qs(`[data-error="${field}"]`, form);
  if (node) { node.hidden = true; node.textContent = ''; }
}

function clearErrors(form) {
  qsa('[data-error]', form).forEach((node) => { node.hidden = true; node.textContent = ''; });
}

function saveDraft(ctx) {
  const { form, pad } = ctx;
  // Not after a save: a debounced write landing a moment later would bring
  // back the entry that was just recorded.
  if (!pad || ctx.saved || ctx.editing) return;
  const amount = pad.value();
  const note = form.elements.note?.value?.trim();
  // Only worth keeping if something was actually typed; clearing the amount
  // and the note clears the draft.
  if (!amount && !note) { storage.remove(KEYS.DRAFT); return; }

  storage.set(KEYS.DRAFT, {
    type: kindOf(ctx),
    amount_minor: amount,
    currency: currencyCode(form),
    account_id: form.elements.account_id.value,
    to_account_id: form.elements.to_account_id.value || null,
    category_id: form.elements.category_id.value || null,
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
