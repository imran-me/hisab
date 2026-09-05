/**
 * Accounts · list page
 *
 * The composition root for the accounts screen. It imports BOTH the accounts
 * api and the ledger api — accounts owns the records, ledger owns the balances,
 * and this page is the only thing that needs both. Doing the join here rather
 * than inside either module is what keeps the dependency graph acyclic.
 */

import { qs, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, formatMoney, parseAmount, convertAndSum, CURRENCIES } from '../../shared/js/core/money.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { openSheet, confirmDialog } from '../../shared/js/components/sheet.js';
import { menu } from '../../shared/js/components/menu.js';
import { toastOk, toastFailure, toast } from '../../shared/js/components/toast.js';
import * as accounts from './backend/api.js';
import * as ledger from '../ledger/backend/api.js';
import * as fx from '../fx/backend/api.js';

mountShell({ title: 'Accounts' });

/* The overview's empty state links here with ?new=1 so "Add an account" lands
   on the form rather than on an empty list with a button on it. */
if (new URLSearchParams(location.search).get('new')) openAccountSheet();

delegate(document.body, 'click', '[data-new-account]', () => openAccountSheet());
delegate(document.body, 'click', '[data-account-menu]', (event, button) => {
  event.preventDefault();
  event.stopPropagation();
  openRowMenu(button);
});

for (const event of [
  EVENTS.ACCOUNT_CREATED, EVENTS.ACCOUNT_UPDATED, EVENTS.ACCOUNT_ARCHIVED,
  EVENTS.TRANSACTION_CREATED, EVENTS.TRANSACTION_UPDATED, EVENTS.TRANSACTION_DELETED,
  EVENTS.BOOK_CHANGED, EVENTS.CURRENCY_CHANGED,
]) on(event, () => refresh());

refresh();

async function refresh() {
  const book = state.book();
  const display = state.currency();

  const [liveRes, allRes, balanceRes, rates] = await Promise.all([
    accounts.list({ book }),
    accounts.list({ book, includeArchived: true }),
    ledger.balances({ book }),
    fx.rates(),
  ]);

  const live = liveRes.data;
  const archived = allRes.data.filter((a) => a.archived_at);
  const balances = balanceRes.data;

  const spendable = live.filter(accounts.isSpendable);
  const held = live.filter((a) => !accounts.isSpendable(a));

  drawTotals({ spendable, held, balances, rates, display });

  drawGroup(qs('[data-spendable]'), spendable, balances, {
    empty: {
      glyph: 'wallet',
      title: 'No spendable accounts',
      text: 'Cash, bKash, a bank account, a card — anywhere money sits that you can spend from.',
      action: '<button type="button" class="btn btn--primary btn--sm" data-new-account>Add an account</button>',
    },
  });

  qs('[data-held-section]').hidden = held.length === 0;
  if (held.length) drawGroup(qs('[data-held]'), held, balances, {});

  qs('[data-archived-section]').hidden = archived.length === 0;
  if (archived.length) drawGroup(qs('[data-archived]'), archived, balances, { archived: true });
}

function drawTotals({ spendable, held, balances, rates, display }) {
  const rows = (set) => set.map((a) => ({ amount_minor: balances[a.id] ?? 0, currency: a.currency }));

  const s = convertAndSum(rows(spendable), display, rates);
  const h = convertAndSum(rows(held), display, rates);

  qs('[data-total-spendable]').innerHTML = formatMoneyHTML(s.amountMinor, display);
  qs('[data-total-held]').innerHTML = formatMoneyHTML(h.amountMinor, display);
  qs('[data-count-spendable]').textContent = `${spendable.length} ${spendable.length === 1 ? 'account' : 'accounts'}`;
  qs('[data-count-held]').textContent = `${held.length} ${held.length === 1 ? 'account' : 'accounts'}`;

  // The honesty line. A cross-currency total is an estimate and a currency with
  // no rate is genuinely excluded — saying both costs one line and prevents the
  // figure being read as exact.
  const missing = [...new Set([...s.missing, ...h.missing])];
  const parts = [];
  const mixed = [...spendable, ...held].some((a) => a.currency !== display);
  if (mixed) parts.push(`converted to ${display}`);
  if (missing.length) parts.push(`${missing.join(', ')} excluded — no rate set`);

  const note = qs('[data-totals-note]');
  note.textContent = parts.join(' · ');
  note.hidden = parts.length === 0;
}

function drawGroup(host, rows, balances, { empty = null, archived = false } = {}) {
  if (!rows.length && empty) {
    host.innerHTML = `<li>
      <div class="empty">
        <span class="empty__glyph">${icon(empty.glyph, { class: 'icon icon--lg' })}</span>
        <span class="empty__title">${esc(empty.title)}</span>
        <p class="empty__text">${esc(empty.text)}</p>
        ${empty.action || ''}
      </div></li>`;
    return;
  }

  host.innerHTML = rows.map((account) => {
    const type = accounts.typeOf(account.type);
    const balance = balances[account.id] ?? 0;

    // A credit card's balance is normally negative, and that is not a warning —
    // it is what a card is. It is coloured only when it is over its limit.
    const overLimit = type.credit && account.credit_limit_minor && Math.abs(balance) > account.credit_limit_minor;
    const tone = overLimit ? 'money--out' : (balance < 0 && !type.credit) ? 'money--out' : 'money--flat';

    const available = type.credit && account.credit_limit_minor
      ? account.credit_limit_minor - Math.abs(Math.min(0, balance))
      : null;

    return `
      <li${archived ? ' class="is-archived"' : ''}>
        <div class="row row--static">
          <span class="row__glyph">${icon(type.icon, { class: 'icon' })}</span>
          <span class="row__main">
            <span class="row__title">
              ${esc(account.name)}
              ${account.is_default ? '<span class="chip">Default</span>' : ''}
            </span>
            <span class="row__sub">
              <span>${esc(type.label)}</span>
              ${account.institution ? `<span aria-hidden="true">·</span><span>${esc(account.institution)}</span>` : ''}
              ${account.number_tail ? `<span aria-hidden="true">·</span><span class="num">••${esc(account.number_tail)}</span>` : ''}
            </span>
          </span>
          <span class="row__end">
            <span class="money money--md ${tone}">${formatMoneyHTML(balance, account.currency)}</span>
            ${available !== null ? `<span class="meta">${esc(formatMoney(available, account.currency))} available</span>` : ''}
          </span>
          <button type="button" class="btn btn--icon btn--sm" data-account-menu="${esc(account.id)}"
                  aria-label="Actions for ${esc(account.name)}">
            ${icon('more', { class: 'icon' })}
          </button>
        </div>
      </li>`;
  }).join('');
}

/* =========================================================================
   Row actions
   ========================================================================= */

async function openRowMenu(button) {
  const id = button.dataset.accountMenu;
  const res = await accounts.find(id);
  if (!res.ok) return;
  const account = res.data;

  const items = [];

  if (account.archived_at) {
    items.push({ label: 'Restore', icon: 'refresh', onClick: async () => { await accounts.restore(id); toastOk('Restored.'); } });
  } else {
    items.push({ label: 'Edit', icon: 'edit', onClick: () => openAccountSheet(account) });
    if (!account.is_default) {
      items.push({ label: 'Make default', icon: 'check', onClick: async () => { await accounts.makeDefault(id); toastOk(`${account.name} is now the default.`); } });
    }
    items.push({ separator: true });
    items.push({ label: 'Archive', icon: 'inbox', onClick: () => archiveAccount(account) });
  }

  // Deleting is offered only when it is genuinely possible. Showing a Delete
  // that always answers "you cannot" is worse than not showing it: the count is
  // known here, so the menu can simply tell the truth.
  const uses = await ledger.usageCount(id);
  if (uses === 0) {
    items.push({
      label: 'Delete',
      icon: 'trash',
      danger: true,
      onClick: async () => {
        const sure = await confirmDialog({
          title: `Delete ${account.name}?`,
          text: 'Nothing has been recorded against it, so nothing is lost. This cannot be undone.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!sure) return;
        const out = await accounts.destroy(id, 0);
        if (out.ok) toastOk('Account deleted.'); else toastFailure(out);
      },
    });
  }

  menu(button, items);
}

async function archiveAccount(account) {
  const uses = await ledger.usageCount(account.id);
  const sure = await confirmDialog({
    title: `Archive ${account.name}?`,
    text: uses
      ? `It disappears from the pickers. The ${uses} ${uses === 1 ? 'entry' : 'entries'} recorded against it stay exactly as they are.`
      : 'It disappears from the pickers. You can restore it at any time.',
    confirmLabel: 'Archive',
  });
  if (!sure) return;

  const res = await accounts.archive(account.id);
  if (!res.ok) { toastFailure(res); return; }
  toast(`${account.name} archived.`, {
    tone: 'good',
    action: { label: 'Undo', onClick: () => accounts.restore(account.id) },
  });
}

/* =========================================================================
   The account form
   ========================================================================= */

function openAccountSheet(account = null) {
  const editing = Boolean(account);
  const form = document.createElement('form');
  form.className = 'stack stack--4';
  form.noValidate = true;

  const current = account || { type: 'cash', currency: state.currency() };

  form.innerHTML = `
    <div class="field">
      <label class="field__label" for="acc-name">Name <span class="field__req" aria-hidden="true">*</span></label>
      <input class="input" id="acc-name" name="name" value="${esc(current.name || '')}"
             placeholder="Cash in hand, bKash, City Bank…" autocomplete="off" data-autofocus>
      <p class="field__error" data-error="name" hidden></p>
    </div>

    <fieldset class="fieldset">
      <legend class="field__label">Type</legend>
      <div class="choices" role="radiogroup">
        ${accounts.TYPES.map((t) => `
          <label class="choice">
            <input type="radio" name="type" value="${t.key}"${t.key === current.type ? ' checked' : ''}>
            ${icon(t.icon, { class: 'icon icon--sm' })}
            <span>${esc(t.label)}</span>
          </label>`).join('')}
      </div>
      <p class="field__hint" data-type-hint></p>
    </fieldset>

    <div class="grid grid--pair">
      <div class="field">
        <label class="field__label" for="acc-currency">Currency</label>
        <select class="select" id="acc-currency" name="currency"${editing ? ' disabled' : ''}>
          ${Object.values(CURRENCIES).map((c) => `
            <option value="${c.code}"${c.code === current.currency ? ' selected' : ''}>${c.code} — ${esc(c.name)}</option>`).join('')}
        </select>
        ${editing ? '<p class="field__hint">Fixed once set — changing it would reinterpret every amount already recorded.</p>' : ''}
      </div>

      <div class="field">
        <label class="field__label" for="acc-opening">Opening balance</label>
        <input class="input" id="acc-opening" name="opening" inputmode="decimal" autocomplete="off"
               value="${current.opening_balance_minor ? esc(formatMoney(current.opening_balance_minor, current.currency)) : ''}"
               placeholder="0">
        <p class="field__hint">What was in it before you started recording.</p>
      </div>
    </div>

    <div class="grid grid--pair">
      <div class="field">
        <label class="field__label" for="acc-institution">Bank or provider</label>
        <input class="input" id="acc-institution" name="institution" autocomplete="off"
               value="${esc(current.institution || '')}" placeholder="Optional">
      </div>
      <div class="field">
        <label class="field__label" for="acc-tail">Last 4 digits</label>
        <input class="input" id="acc-tail" name="number_tail" inputmode="numeric" maxlength="4"
               value="${esc(current.number_tail || '')}" placeholder="Optional">
        <p class="field__hint">Only four. A full number belongs in the vault.</p>
      </div>
    </div>

    <div class="field" data-limit-field${current.type === 'card' ? '' : ' hidden'}>
      <label class="field__label" for="acc-limit">Credit limit</label>
      <input class="input" id="acc-limit" name="credit_limit" inputmode="decimal" autocomplete="off"
             value="${current.credit_limit_minor ? esc(formatMoney(current.credit_limit_minor, current.currency)) : ''}">
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn--primary btn--lg">${editing ? 'Save changes' : 'Add account'}</button>
    </div>
  `;

  const sheet = openSheet({ title: editing ? 'Edit account' : 'New account', body: form });

  const hints = {
    savings: 'Kept out of the spendable total — money here is yours but is not money you can spend today.',
    investment: 'Kept out of the spendable total, and its value is tracked separately from its cost.',
    card: 'The balance runs negative; a credit limit turns it into an “available” figure.',
  };

  const syncType = () => {
    const type = form.elements.type.value;
    qs('[data-limit-field]', form).hidden = type !== 'card';
    qs('[data-type-hint]', form).textContent = hints[type] || '';
  };
  syncType();
  delegate(form, 'change', '[name="type"]', syncType);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const currency = form.elements.currency.value;
    const payload = {
      name: form.elements.name.value,
      type: form.elements.type.value,
      currency,
      book: state.book(),
      opening_balance_minor: parseAmount(form.elements.opening.value, currency) ?? 0,
      institution: form.elements.institution.value,
      number_tail: form.elements.number_tail.value,
      credit_limit_minor: parseAmount(form.elements.credit_limit.value, currency) ?? null,
    };

    const res = editing ? await accounts.update(account.id, payload) : await accounts.create(payload);

    if (!res.ok) {
      if (res.reason === 'invalid') {
        for (const [field, messages] of Object.entries(res.errors || {})) {
          const node = qs(`[data-error="${field}"]`, form);
          if (node) { node.textContent = messages[0]; node.hidden = false; }
        }
      } else toastFailure(res, 'Could not save the account.');
      return;
    }

    sheet.close('saved');
    toastOk(editing ? 'Account updated.' : `${payload.name} added.`);
  });
}
