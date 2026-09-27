/**
 * Ledger · the entry sheet
 *
 * The most-used screen in the product: adding a transaction, one-handed, in a
 * few seconds, usually while standing somewhere. Everything about it is shaped
 * by that. The target (docs/DIRECTION.md §3.4) is tap +, type 2-5-0, tap
 * Transport: three taps plus the digits, with nothing needed above the middle
 * of the screen. The layout is the v2 mock (§3.7.6): type → amount → account /
 * date / Details → recent → categories → pad.
 *
 * Design decisions worth stating:
 *
 * · THE AMOUNT IS FIRST, AND TYPED ON A PAD DRAWN IN THE SHEET. The display is
 *   inputmode="none", so the system keyboard never opens for it and never
 *   covers the form. See numpad.js for why it also does sums.
 * · A CATEGORY TILE SAVES. The last thing chosen is the category, so choosing
 *   it is the save: no separate confirm for the common case. Save without a
 *   category asks for one, because "Uncategorised · Discretionary" is the
 *   lazy path producing useless data.
 * · NOTHING IS PRE-SET THAT IS A JUDGEMENT. The necessity comes from the
 *   category (Rent is essential) unless the person picks one; the form never
 *   defaults it to Discretionary.
 * · EVERYTHING ELSE HAS A DEFAULT AND IS ONE TAP AWAY. The account is a pill
 *   that shows what it will use; date, payee, note and necessity sit behind
 *   Details.
 * · OUT IS PLAIN INK. Most entries are spending, and a red figure on every
 *   one of them turns the ledger into an alarm (§3.7). In, Save and Move keep
 *   their colours; Out is the ordinary case.
 */

import { el, qs, qsa, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { moneyLabel, CURRENCIES, currency as currencyOf } from '../../shared/js/core/money.js';
import { today, formatDate } from '../../shared/js/core/dates.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import { openSheet } from '../../shared/js/components/sheet.js';
import { toastOk, toastFailure, toast } from '../../shared/js/components/toast.js';
import * as state from '../../shared/js/core/state.js';
import * as ledger from './backend/api.js';
import * as accounts from '../accounts/backend/api.js';
import * as categories from '../categories/backend/api.js';
import { glyphOf } from '../categories/glyphs.js';
import { numpadMarkup, attachNumpad, bufferFor } from './numpad.js';

/** Tiles on the grid: seven categories and More, a 4 × 2 block. */
const TILES = 7;

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
  if (!editing && opts.type) initial.type = opts.type;
  if (!accountRows.some((a) => a.id === initial.account_id)) initial.account_id = accountRows[0].id;

  const form = el('form', { class: 'entry', novalidate: true });
  form.dataset.flow = initial.type || 'expense';

  const ctx = { form, book, accountRows, methodList, editing, pad: null, tiles: [], sheet: null, onSaved: opts.onSaved };

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
  const { form, accountRows, methodList, editing } = ctx;
  const type = initial.type || 'expense';
  const account = accountRows.find((a) => a.id === initial.account_id) || accountRows[0];
  const cur = initial.currency || account.currency;
  const places = currencyOf(cur).minorUnit;

  form.innerHTML = `
    <!-- Type. A radio group, so arrow keys move between the four and a screen
         reader announces "2 of 4". Short words, so all four fit at 320px. -->
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
    <p class="field__error entry__error" data-error="entry" role="alert" hidden></p>

    <!-- What will be used, as pills. Nothing here needs touching for the
         common case. -->
    <div class="entry__pills">
      <button type="button" class="entry-pill entry-pill--account" data-pick="account" aria-haspopup="menu">
        <span class="entry-pill__icon" data-account-icon></span>
        <span class="sr-only" data-account-label>From</span>
        <span class="entry-pill__value" data-account-name></span>
        ${icon('chevron-down', { class: 'icon icon--sm entry-pill__chev' })}
      </button>
      <button type="button" class="entry-pill entry-pill--account" data-pick="to" aria-haspopup="menu" hidden>
        <span class="entry-pill__label">To</span>
        <span class="entry-pill__value" data-to-name></span>
      </button>
      <button type="button" class="entry-pill" data-pick="date" aria-haspopup="menu">
        ${icon('calendar', { class: 'icon icon--sm' })}
        <span class="entry-pill__value" data-date-name></span>
      </button>
      <button type="button" class="entry-pill entry-pill--quiet" data-details-toggle
              aria-controls="entry-details" aria-expanded="${editing ? 'true' : 'false'}">
        ${icon('sliders', { class: 'icon icon--sm' })}
        <span class="entry-pill__value">Details</span>
      </button>
    </div>
    <input type="hidden" name="account_id" value="${esc(account.id)}">
    <input type="hidden" name="to_account_id" value="${esc(initial.to_account_id || initial.counter_account_id || '')}">
    <input type="hidden" name="category_id" value="${esc(initial.category_id || '')}">
    <p class="field__error entry__error" data-error="account_id" role="alert" hidden></p>
    <p class="field__error entry__error" data-error="to_account_id" role="alert" hidden></p>

    <!-- The middle of the sheet: the category tiles, or - with Details open -
         the details in their place. Only this part scrolls, so the pad never
         leaves the thumb. -->
    <div class="entry__middle">
      <div class="entry__cats" data-cats role="group" aria-label="Category — tap one to save"></div>

      <div class="entry__details stack stack--4" id="entry-details" data-details${editing ? '' : ' hidden'}>
        <div class="field" data-category-field>
          <label class="field__label" for="entry-category">Category</label>
          <select class="select" id="entry-category" data-category-select></select>
          <p class="field__error" data-error="category_id" hidden></p>
        </div>

        <!-- Necessity — expenses only, and never pre-set: until someone picks
             one, the category's own band applies. -->
        <fieldset class="fieldset" data-necessity-field hidden>
          <legend class="field__label">Was it worth it? <span class="field__hint" data-necessity-hint></span></legend>
          <div class="segment segment--need" role="radiogroup" data-necessity-choices></div>
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
    </div>

    ${numpadMarkup({ places })}
  `;

  const display = qs('#entry-amount', form);
  ctx.pad = attachNumpad(form, {
    display,
    result: qs('[data-result]', form),
    code: () => currencyCode(form),
    initial: bufferFor(initial.amount_minor, cur),
    onChange: () => ctx.draftSoon?.(),
  });

  setCurrency(ctx, cur);
  if (editing?.necessity) form.dataset.needSet = 'true';
  await syncType(ctx, initial);
  attachHandlers(ctx);

  // The sheet focused its first control before this form was filled in, so
  // the amount is focused here. inputmode=none: no keyboard comes up.
  display.focus({ preventScroll: true });
}

/** The currency the amount is being typed in. */
function currencyCode(form) {
  return qs('[data-currency-picker]', form).dataset.code;
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
  form.dataset.flow = type;   // recolours the amount — see entry-sheet.css

  const isTransfer = type === 'transfer';
  const isDeposit = type === 'deposit';
  const isIncome = type === 'income';

  qs('[data-category-field]', form).hidden = isTransfer;
  qs('[data-cats]', form).hidden = isTransfer;
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

  // A category belongs to one type; switching type drops it rather than
  // filing an income under an expense category.
  const chosen = initial.category_id ?? form.elements.category_id.value;
  form.elements.category_id.value = '';

  if (!isTransfer) {
    const [rows, frequent] = await Promise.all([
      categories.list({ book, type }),
      categories.frequent({ book, type, limit: TILES }),
    ]);
    // The type may have changed again while those were loading.
    if (form.elements.type.value !== type) return;

    ctx.categoryRows = rows;
    ctx.tiles = frequent.length ? frequent : rows.slice(0, TILES);
    if (chosen && rows.some((c) => c.id === chosen)) form.elements.category_id.value = chosen;

    drawTiles(ctx);
    qs('[data-category-select]', form).innerHTML = `<option value="">Choose a category</option>` +
      rows.map((c) => `<option value="${esc(c.id)}"${c.id === form.elements.category_id.value ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
  }

  if (type === 'expense') {
    const bands = await categories.necessityBands();
    const picked = form.dataset.needSet === 'true' ? Number(initial.necessity || qs('[name="necessity"]:checked', form)?.value) : 0;
    qs('[data-necessity-choices]', form).innerHTML = bands.map((b) => `
      <label class="segment__option segment__option--need-${b.band}" title="${esc(b.hint)}">
        <input type="radio" name="necessity" value="${b.band}"${b.band === picked ? ' checked' : ''}>
        <span>${esc(b.label)}</span>
      </label>`).join('');
    ctx.bands = bands;
    syncNecessityHint(ctx);
  }

  syncChips(ctx);
}

/**
 * The 4 × 2 tile grid: the most used categories, then More.
 *
 * The chosen category is ALWAYS on the grid, even when it is not one of the
 * seven most used - a restored draft or a correction filed under "Charity"
 * must show that it is filed under Charity - so it takes the last slot.
 */
function drawTiles(ctx) {
  const { form } = ctx;
  const chosen = form.elements.category_id.value;
  let tiles = ctx.tiles.slice(0, TILES);
  if (chosen && !tiles.some((c) => c.id === chosen)) {
    const hit = ctx.categoryRows?.find((c) => c.id === chosen);
    if (hit) tiles = [...tiles.slice(0, TILES - 1), hit];
  }

  qs('[data-cats]', form).innerHTML = tiles.map((c) => {
    const { icon: glyph, className } = glyphOf(c);
    return `
      <button type="button" class="entry-cat ${className}" data-cat="${esc(c.id)}" aria-pressed="${c.id === chosen}">
        <span class="entry-cat__glyph">${icon(glyph, { class: 'icon' })}</span>
        <span class="entry-cat__label">${esc(shortLabel(c.label))}</span>
      </button>`;
  }).join('') + `
      <button type="button" class="entry-cat entry-cat--more" data-cat-more aria-controls="entry-details">
        <span class="entry-cat__glyph">${icon('grid', { class: 'icon' })}</span>
        <span class="entry-cat__label">More</span>
      </button>`;
}

/** "Food & groceries" → "Food", so eight labels fit a 360px row at 11.5px. */
function shortLabel(label) {
  return String(label).split(/\s*[&/]\s*|\s+-\s+/)[0];
}

/** Under "Was it worth it?": which band applies if nobody picks one. */
function syncNecessityHint(ctx) {
  const { form } = ctx;
  const hint = qs('[data-necessity-hint]', form);
  if (!hint) return;
  const category = ctx.categoryRows?.find((c) => c.id === form.elements.category_id.value);
  const band = ctx.bands?.find((b) => b.band === Number(category?.necessity));
  hint.textContent = form.dataset.needSet === 'true' || !band ? '' : `· ${band.label}, from the category`;
}

/** The pills say what will be used, in words. */
function syncChips(ctx) {
  const { form, accountRows } = ctx;
  const byId = (id) => accountRows.find((a) => a.id === id);

  const account = byId(form.elements.account_id.value);
  qs('[data-account-name]', form).textContent = account?.name || 'Choose';
  qs('[data-account-icon]', form).innerHTML = icon(accounts.typeOf(account?.type).icon, { class: 'icon icon--sm' }).value;

  const to = form.elements.to_account_id.value;
  qs('[data-to-name]', form).textContent = to ? (byId(to)?.name || 'Choose') : 'Not tracked here';

  qs('[data-date-name]', form).textContent = dayName(form.elements.occurred_on.value);
}

function dayName(dateKey) {
  if (!dateKey || dateKey === today()) return 'Today';
  if (dateKey === shiftDay(today(), -1)) return 'Yesterday';
  return formatDate(dateKey);
}

function setDetails(form, open) {
  const region = qs('[data-details]', form);
  region.hidden = !open;
  // The tiles and the details share the middle of the sheet: showing both
  // would push the pad down past the thumb.
  qs('[data-cats]', form).classList.toggle('is-covered', open);
  qs('[data-details-toggle]', form).setAttribute('aria-expanded', String(open));
  if (open) region.scrollTop = 0;
}

function chooseCategory(ctx, id) {
  const { form } = ctx;
  form.elements.category_id.value = id;
  qs('[data-category-select]', form).value = id;
  qsa('[data-cat]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === id)));
  clearError(form, 'category_id');
  clearError(form, 'entry');
  syncNecessityHint(ctx);
  ctx.draftSoon?.();
}

function attachHandlers(ctx) {
  const { form, accountRows, editing } = ctx;

  delegate(form, 'change', '[name="type"]', () => syncType(ctx));

  // THE FAST PATH: a tile chooses the category and saves. When correcting an
  // entry it only chooses - a correction is a deliberate act and gets its own
  // Save - and without an amount it chooses and asks for the amount.
  delegate(form, 'click', '[data-cat]', async (_e, button) => {
    chooseCategory(ctx, button.dataset.cat);
    if (editing) return;

    // The account used last for this category, unless the person picked one:
    // the CNG comes out of cash, the electricity bill out of bKash.
    const tile = ctx.tiles.find((c) => c.id === button.dataset.cat);
    if (form.dataset.accountSet !== 'true' && tile?.last_account_id && accountRows.some((a) => a.id === tile.last_account_id)) {
      pickAccountRow(ctx, accountRows.find((a) => a.id === tile.last_account_id));
    }

    const amount = ctx.pad.value();
    if (amount === null || amount <= 0) {
      showError(form, 'amount_minor', 'Type the amount, then tap the category.');
      return;
    }
    form.requestSubmit();
  });

  delegate(form, 'click', '[data-cat-more]', () => {
    setDetails(form, true);
    const select = qs('[data-category-select]', form);
    select.focus();
    try { select.showPicker?.(); } catch { /* not allowed here: focus will do */ }
  });

  delegate(form, 'change', '[data-category-select]', (_e, select) => {
    chooseCategory(ctx, select.value);
    drawTiles(ctx);
  });

  delegate(form, 'change', '[name="necessity"]', () => { form.dataset.needSet = 'true'; syncNecessityHint(ctx); });
  delegate(form, 'change', '[name="occurred_on"]', () => syncChips(ctx));

  delegate(form, 'click', '[data-details-toggle]', () => {
    setDetails(form, qs('[data-details]', form).hidden);
  });

  delegate(form, 'click', '[data-pick="account"]', (_e, button) => {
    pickAccount(button, accountRows, form.elements.account_id.value, (account) => {
      form.dataset.accountSet = 'true';
      pickAccountRow(ctx, account);
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
          setDetails(form, true);
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

/** Set the source account, carrying the currency and the transfer's other end with it. */
function pickAccountRow(ctx, account) {
  const { form, accountRows } = ctx;
  form.elements.account_id.value = account.id;
  // The account's currency becomes the amount's currency, unless the person
  // has deliberately picked a different one.
  if (qs('[data-currency-picker]', form).dataset.userSet !== 'true') setCurrency(ctx, account.currency);
  if (form.elements.to_account_id.value === account.id) form.elements.to_account_id.value = '';
  if (form.elements.type.value === 'transfer' && !form.elements.to_account_id.value) {
    form.elements.to_account_id.value = accountRows.find((a) => a.id !== account.id)?.id || '';
  }
  syncChips(ctx);
}

function pickAccount(anchor, rows, selectedId, onPick) {
  import('../../shared/js/components/menu.js').then(({ menu }) => {
    menu(anchor, rows.map((a) => ({
      // The currency is named only when it is not the home one, the same rule
      // the formatter follows for figures.
      label: `${a.name}${a.currency && a.currency !== state.currency() ? ` · ${a.currency}` : ''}${a.id === selectedId ? '  ✓' : ''}`,
      icon: a.id ? accounts.typeOf(a.type).icon : 'arrow-hold',
      onClick: () => onPick(a),
    })), { align: 'start' });
  });
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
  const dual = qs('[data-long-key]', ctx.form);
  if (dual) dual.toggleAttribute('data-no-point', currencyOf(code).minorUnit === 0);
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

async function submit(ctx) {
  const { form, editing, sheet, onSaved, pad } = ctx;
  clearErrors(form);

  const button = qs('[data-save]', form);
  if (form.dataset.busy === 'true') return;   // a second tap while the first is in flight

  const code = currencyCode(form);
  const amount = pad.value();
  const type = form.elements.type.value;

  // null rather than 0 for an unreadable figure, precisely so this check can
  // exist. A silent zero would save a transaction that looks deliberate and is
  // wrong. A sum that comes out negative is refused the same way: the sign of
  // an entry is its type.
  if (amount === null || amount <= 0) {
    showError(form, 'amount_minor', amount === null ? 'Enter an amount.' : 'That sum is not a positive amount.');
    form.elements.amount.focus();
    return;
  }

  // A category is asked for, not defaulted. "Uncategorised" is what the lazy
  // path produces when it is allowed to, and it makes every report useless.
  // Only when there are categories to choose from: an empty set must not
  // lock the person out of recording anything.
  const categoryId = type === 'transfer' ? null : (form.elements.category_id.value || null);
  if (type !== 'transfer' && !categoryId && ctx.categoryRows?.length) {
    showError(form, 'entry', 'Tap a category to save.');
    qs('[data-cats]', form).classList.remove('is-asking');
    void qs('[data-cats]', form).offsetWidth;
    qs('[data-cats]', form).classList.add('is-asking');
    return;
  }

  form.dataset.busy = 'true';
  button.classList.add('is-busy');

  const category = ctx.categoryRows?.find((c) => c.id === categoryId);
  // Sent only when the person picked one; otherwise the category's band
  // applies, on both sides (LedgerWriter::snapshotCategory, api.js create).
  const necessity = type === 'expense' && form.dataset.needSet === 'true'
    ? (qs('[name="necessity"]:checked', form)?.value || null) : null;

  const payload = {
    type,
    amount_minor: amount,
    currency: code,
    account_id: form.elements.account_id.value,
    to_account_id: form.elements.to_account_id?.value || null,
    category_id: categoryId,
    category_label: category?.label || null,
    necessity,
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
      // An error for a field that lives behind Details opens Details, so the
      // message is not hidden in a collapsed region.
      if (errors.some(([field]) => ['occurred_on', 'category_id', 'payee', 'note', 'method'].includes(field))) setDetails(form, true);
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

  ctx.saved = true;
  storage.remove(KEYS.DRAFT);
  // A light tick under the thumb says "recorded" before the eye finds the
  // toast. Where vibrate is missing (iOS, desktop) nothing happens.
  try { navigator.vibrate?.(8); } catch { /* not allowed: fine */ }
  sheet.close('saved');

  // What was recorded, in words: the account may have been chosen for the
  // person by the category, and this is where they see which.
  const account = ctx.accountRows.find((a) => a.id === payload.account_id);
  const parts = [moneyLabel(amount, code), category?.label, account?.name].filter(Boolean);
  toastOk(`${editing ? 'Corrected' : 'Added'} ${parts.join(' · ')}.`);
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

function clearError(form, field) {
  const node = qs(`[data-error="${field}"]`, form);
  if (node) { node.hidden = true; node.textContent = ''; }
}

function clearErrors(form) {
  qsa('[data-error]', form).forEach((node) => { node.hidden = true; node.textContent = ''; });
  qsa('[aria-invalid]', form).forEach((node) => node.removeAttribute('aria-invalid'));
}

function saveDraft(ctx) {
  const { form, pad } = ctx;
  // Not after a save: a debounced write landing a moment later would bring
  // back the entry that was just recorded.
  if (!pad || ctx.saved || ctx.editing) return;
  const amount = pad.value();
  const note = form.elements.note?.value?.trim();
  const payee = form.elements.payee?.value?.trim();
  // Only worth keeping if something was actually typed. A draft holding nothing
  // but a default type would re-open every new entry pre-filled for no reason;
  // and clearing the amount clears the draft.
  if (!amount && !note && !payee) { storage.remove(KEYS.DRAFT); return; }

  storage.set(KEYS.DRAFT, {
    type: form.elements.type.value,
    amount_minor: amount,
    currency: currencyCode(form),
    account_id: form.elements.account_id.value,
    to_account_id: form.elements.to_account_id.value || null,
    category_id: form.elements.category_id.value || null,
    necessity: form.dataset.needSet === 'true' ? (qs('[name="necessity"]:checked', form)?.value || null) : null,
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
