/**
 * Accounts · list page
 *
 * The composition root for the accounts screen. It imports BOTH the accounts
 * api and the ledger api — accounts owns the records, ledger owns the balances,
 * and this page is the only thing that needs both. Doing the join here rather
 * than inside either module is what keeps the dependency graph acyclic.
 */

import { qs, icon, esc, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel, convertAndSum } from '../../shared/js/core/money.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { confirmDialog } from '../../shared/js/components/sheet.js';
import { menu } from '../../shared/js/components/menu.js';
import { toastOk, toastFailure, toast } from '../../shared/js/components/toast.js';
import * as accounts from './backend/api.js';
import * as ledger from '../ledger/backend/api.js';
import * as fx from '../fx/backend/api.js';
import { openAccountSheet } from './account-form.js';
import { accountCard } from './account-card.js';
import { applyStyleVars } from './style-vars.js';

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

  // Net worth is the two parts added AFTER each was converted, so it can
  // never disagree with the split printed directly under it.
  qs('[data-total-net]').innerHTML = formatMoneyHTML(s.amountMinor + h.amountMinor, display);
  qs('[data-total-spendable]').innerHTML = formatMoneyHTML(s.amountMinor, display);
  qs('[data-total-held]').innerHTML = formatMoneyHTML(h.amountMinor, display);
  qs('[data-count-spendable]').textContent = `· ${spendable.length}`;
  qs('[data-count-held]').textContent = `· ${held.length}`;

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

function drawGroup(host, rows, balances, { empty = null } = {}) {
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

  // Each account as its card, with its actions button over the card's top
  // corner - beside the link, never inside it, so "…" never navigates.
  host.innerHTML = rows.map((account) => `
    <li class="acc-cards__item">
      ${accountCard(account, balances[account.id] ?? 0, { href: `detail.html?id=${encodeURIComponent(account.id)}` })}
      ${accounts.isSystem(account) ? '' : `
      <button type="button" class="acc-cards__menu" data-account-menu="${esc(account.id)}"
              aria-label="Actions for ${esc(account.name)}">
        ${icon('more', { class: 'icon' })}
      </button>`}
    </li>`).join('');
  applyStyleVars(host);
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
    items.push({
      label: 'Edit', icon: 'edit',
      onClick: async () => openAccountSheet(account, { balance: (await ledger.balances({ book: account.book })).data[id] ?? 0 }),
    });
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
