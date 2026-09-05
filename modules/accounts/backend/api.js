/**
 * Accounts · module API
 *
 * The one door between the accounts UI and accounts data. See
 * `endpoints.md` for the shapes and `shared/backend/api-contract.md` for the
 * rules every module's api.js follows.
 *
 * This module does NOT compute balances. A balance is a sum over the ledger,
 * and it is computed in exactly one place — `modules/ledger`. Doing it here as
 * well would be a second implementation of the same figure, and two
 * implementations of one figure means one of them is already wrong.
 */

import { moduleStore } from '../../../shared/js/core/storage.js';
import { get, post, patch, del, hasBackend } from '../../../shared/js/core/http.js';
import { siteURL } from '../../../shared/js/core/paths.js';
import { ulid, isUlid } from '../../../shared/js/core/id.js';
import { today } from '../../../shared/js/core/dates.js';
import { emit, EVENTS } from '../../../shared/js/core/bus.js';

const store = moduleStore('accounts');

/** The account types, and what each one changes. See endpoints.md §type. */
export const TYPES = [
  { key: 'cash',       label: 'Cash',        icon: 'cash',   spendable: true },
  { key: 'bank',       label: 'Bank',        icon: 'bank',   spendable: true },
  { key: 'mfs',        label: 'Mobile money',icon: 'mobile', spendable: true },
  { key: 'card',       label: 'Credit card', icon: 'card',   spendable: true,  credit: true },
  { key: 'wallet',     label: 'Wallet',      icon: 'wallet', spendable: true },
  { key: 'savings',    label: 'Savings',     icon: 'coins',  spendable: false },
  { key: 'investment', label: 'Investment',  icon: 'trend-up', spendable: false },
];

export const typeOf = (key) => TYPES.find((t) => t.key === key) || TYPES[0];

/** Money in a DPS is yours but is not money you can spend today. */
export const isSpendable = (account) => typeOf(account.type).spendable;

let memo = null;

/**
 * List accounts.
 *
 * Ordered by sort_order then name, and archived accounts are excluded unless
 * asked for — an archived account must still resolve by id, because years of
 * transactions point at it, but it has no business in a picker.
 */
export async function list({ book = null, includeArchived = false } = {}) {
  const rows = await load();
  let out = rows;
  if (book) out = out.filter((a) => a.book === book);
  if (!includeArchived) out = out.filter((a) => !a.archived_at);
  return {
    ok: true,
    data: out.slice().sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name)),
    meta: { total: out.length },
  };
}

/** One account. Archived ones resolve — a historical row still points here. */
export async function find(id) {
  const rows = await load();
  const hit = rows.find((a) => a.id === id);
  return hit ? { ok: true, data: hit } : { ok: false, reason: 'missing' };
}

/** The default account for new entries in a book, or the first spendable one. */
export async function defaultFor(book) {
  const res = await list({ book });
  return res.data.find((a) => a.is_default) || res.data.find(isSpendable) || res.data[0] || null;
}

export async function create(input) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false, reason: 'invalid', errors };

  const rows = await load();
  const book = input.book || 'personal';

  const row = {
    // Minted here, not by the server. A transaction entered offline can then
    // reference this account immediately, with no temporary id to reconcile.
    id: ulid(),
    name: String(input.name).trim(),
    type: input.type || 'cash',
    currency: String(input.currency || 'BDT').toUpperCase(),
    book,
    opening_balance_minor: Math.trunc(Number(input.opening_balance_minor) || 0),
    opening_on: input.opening_on || today(),
    institution: input.institution?.trim() || null,
    // Only the last four digits are ever stored. A full account number is a
    // secret, and a secret belongs in the vault, not in a list that renders
    // unmasked on the accounts screen.
    number_tail: tail(input.number_tail),
    credit_limit_minor: input.type === 'card' ? (Math.trunc(Number(input.credit_limit_minor) || 0) || null) : null,
    // The first account in a book becomes its default, so the entry sheet
    // always has something selected and never opens with an empty picker.
    is_default: !rows.some((a) => a.book === book && !a.archived_at),
    sort_order: rows.filter((a) => a.book === book).length,
    archived_at: null,
    created_at: new Date().toISOString(),
  };

  rows.push(row);
  persist(rows);
  emit(EVENTS.ACCOUNT_CREATED, row);

  if (await hasBackend()) {
    const res = await post('/accounts', row);
    // A validation failure from the server is authoritative and the local row
    // is rolled back — otherwise this device would hold an account the server
    // has never heard of and will reject again on every sync.
    if (!res.ok && res.reason !== 'offline') {
      persist(rows.filter((a) => a.id !== row.id));
      return res;
    }
  }
  return { ok: true, data: row };
}

export async function update(id, changes) {
  const rows = await load();
  const row = rows.find((a) => a.id === id);
  if (!row) return { ok: false, reason: 'missing' };

  const merged = { ...row, ...changes };
  const errors = validate(merged, { existing: row });
  if (Object.keys(errors).length) return { ok: false, reason: 'invalid', errors };

  // The currency is immutable once set. Changing it would reinterpret every
  // amount already recorded against the account — 1,200 taka silently becoming
  // 1,200 dirhams — with no way to tell which rows were which.
  if (changes.currency && changes.currency !== row.currency) {
    return { ok: false, reason: 'invalid', errors: { currency: ['An account’s currency cannot be changed. Create a new account instead.'] } };
  }

  // Likewise the book: a business account becoming personal is a drawing, which
  // is a transaction, not a relabelling.
  if (changes.book && changes.book !== row.book) {
    return { ok: false, reason: 'invalid', errors: { book: ['Move money with a transfer instead of moving the account between books.'] } };
  }

  Object.assign(row, {
    name: merged.name?.trim() || row.name,
    type: merged.type,
    institution: merged.institution?.trim() || null,
    number_tail: tail(merged.number_tail),
    credit_limit_minor: merged.type === 'card' ? (Math.trunc(Number(merged.credit_limit_minor) || 0) || null) : null,
    opening_balance_minor: Math.trunc(Number(merged.opening_balance_minor) || 0),
    opening_on: merged.opening_on || row.opening_on,
  });

  persist(rows);
  emit(EVENTS.ACCOUNT_UPDATED, row);

  if (await hasBackend()) {
    const res = await patch(`/accounts/${id}`, changes);
    if (!res.ok && res.reason !== 'offline') return res;
  }
  return { ok: true, data: row };
}

/** Exactly one default per book. */
export async function makeDefault(id) {
  const rows = await load();
  const row = rows.find((a) => a.id === id);
  if (!row) return { ok: false, reason: 'missing' };

  for (const a of rows) if (a.book === row.book) a.is_default = (a.id === id);
  persist(rows);
  emit(EVENTS.ACCOUNT_UPDATED, row);

  if (await hasBackend()) await patch(`/accounts/${id}`, { is_default: true });
  return { ok: true, data: row };
}

export async function archive(id) {
  const rows = await load();
  const row = rows.find((a) => a.id === id);
  if (!row) return { ok: false, reason: 'missing' };

  row.archived_at = new Date().toISOString();
  row.is_default = false;

  // The book must not be left with no default, or the entry sheet opens with an
  // empty account picker and the first transaction of the day cannot be saved.
  if (!rows.some((a) => a.book === row.book && !a.archived_at && a.is_default)) {
    const next = rows.find((a) => a.book === row.book && !a.archived_at);
    if (next) next.is_default = true;
  }

  persist(rows);
  emit(EVENTS.ACCOUNT_ARCHIVED, row);

  if (await hasBackend()) {
    const res = await patch(`/accounts/${id}`, { archived: true });
    if (!res.ok && res.reason !== 'offline') return res;
  }
  return { ok: true, data: row };
}

export async function restore(id) {
  const rows = await load();
  const row = rows.find((a) => a.id === id);
  if (!row) return { ok: false, reason: 'missing' };
  row.archived_at = null;
  persist(rows);
  emit(EVENTS.ACCOUNT_UPDATED, row);
  return { ok: true, data: row };
}

/**
 * Hard delete — only for an account that has never been referenced.
 *
 * `usageCount` is passed in by the caller rather than looked up here, because
 * counting transactions means reading the ledger, and accounts importing ledger
 * would make the dependency graph cyclic. The accounts page owns that
 * composition; see modules/accounts/list-page.js.
 */
export async function destroy(id, usageCount = 0) {
  if (usageCount > 0) {
    return { ok: false, reason: 'conflict', message: `${usageCount} transaction${usageCount === 1 ? '' : 's'} reference this account. Archive it instead.` };
  }
  const rows = await load();
  const next = rows.filter((a) => a.id !== id);
  if (next.length === rows.length) return { ok: false, reason: 'missing' };

  persist(next);
  emit(EVENTS.ACCOUNT_ARCHIVED, { id });

  if (await hasBackend()) {
    const res = await del(`/accounts/${id}`);
    if (!res.ok && res.reason !== 'offline') return res;
  }
  return { ok: true, data: null };
}

export async function reorder(orderedIds) {
  const rows = await load();
  orderedIds.forEach((id, i) => {
    const row = rows.find((a) => a.id === id);
    if (row) row.sort_order = i;
  });
  persist(rows);
  if (await hasBackend()) await patch('/accounts/reorder', { ids: orderedIds });
  return { ok: true, data: null };
}

/* ---- Validation ---------------------------------------------------------- */

function validate(input, { existing = null } = {}) {
  const errors = {};
  const name = String(input.name || '').trim();

  if (!name) errors.name = ['Give the account a name.'];
  else if (name.length > 60) errors.name = ['Keep the name under 60 characters.'];

  if (!TYPES.some((t) => t.key === input.type)) errors.type = ['Choose an account type.'];
  if (!/^[A-Z]{3}$/.test(String(input.currency || '').toUpperCase())) errors.currency = ['Choose a currency.'];

  if (input.id && !isUlid(input.id) && !existing) errors.id = ['Malformed id.'];

  const opening = Number(input.opening_balance_minor);
  if (input.opening_balance_minor !== undefined && !Number.isFinite(opening)) {
    errors.opening_balance_minor = ['Enter a number, or leave it blank for zero.'];
  }

  if (input.type === 'card' && input.credit_limit_minor != null) {
    const limit = Number(input.credit_limit_minor);
    if (!Number.isFinite(limit) || limit < 0) errors.credit_limit_minor = ['A credit limit cannot be negative.'];
  }

  return errors;
}

/** Last four digits only — everything else about a card number is a secret. */
function tail(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}

/* ---- Storage ------------------------------------------------------------- */

async function load() {
  if (memo) return memo;

  const saved = store.read(null);
  if (Array.isArray(saved)) { memo = saved; return memo; }

  if (await hasBackend()) {
    const res = await get('/accounts');
    if (res.ok) { memo = res.data?.data || []; persist(memo); return memo; }
    // A 401 must NOT fall through to the seed — see api-contract.md §1.
    if (res.reason === 'auth') { memo = []; return memo; }
  }

  // First run with no backend: a small starting set, so the app is usable
  // immediately rather than opening on an empty screen with a form.
  try {
    const seed = await fetch(siteURL('modules/accounts/data/seed.json')).then((r) => r.json());
    memo = (seed.accounts || []).map((a, i) => ({
      ...a,
      id: ulid(),
      sort_order: i,
      archived_at: null,
      created_at: new Date().toISOString(),
    }));
  } catch {
    memo = [];
  }
  persist(memo);
  return memo;
}

function persist(rows) {
  memo = rows;
  store.write(rows);
}

/** For the settings screen's "start over". */
export function reset() { memo = null; store.clear(); }
