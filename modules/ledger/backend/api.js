/**
 * Ledger · module API
 *
 * The transaction record, and the only place in the product where a balance or
 * a period total is computed. See `endpoints.md` for the shapes and the
 * counting rules — particularly why a two-leg deposit is counted once and a
 * transfer is counted not at all.
 *
 * This module depends on `accounts` (a leg names an account) and on `fx` (a leg
 * in a foreign currency snapshots a rate). Neither of those depends on this
 * one, so the graph stays acyclic — verified by tools/module-deps.py.
 */

import { moduleStore } from '../../../shared/js/core/storage.js';
import { get, post, patch, del, hasBackend } from '../../../shared/js/core/http.js';
import { ulid } from '../../../shared/js/core/id.js';
import { today, toPeriodKey, periodBounds, isWithin } from '../../../shared/js/core/dates.js';
import { emit, EVENTS } from '../../../shared/js/core/bus.js';
import { convert, convertAndSum } from '../../../shared/js/core/money.js';
import * as accounts from '../../accounts/backend/api.js';
import * as fx from '../../fx/backend/api.js';

const store = moduleStore('ledger');

export const TYPES = [
  { key: 'expense',  label: 'Expense',  tone: 'out',  icon: 'arrow-out',  direction: 'out' },
  { key: 'income',   label: 'Income',   tone: 'in',   icon: 'arrow-in',   direction: 'in' },
  { key: 'deposit',  label: 'Deposit',  tone: 'hold', icon: 'arrow-hold', direction: 'out' },
  { key: 'transfer', label: 'Transfer', tone: 'move', icon: 'arrow-move', direction: 'out' },
];

export const typeOf = (key) => TYPES.find((t) => t.key === key) || TYPES[0];

let memo = null;

/* =========================================================================
   Reading
   ========================================================================= */

/**
 * List transactions, newest first.
 *
 * Sorted by `occurred_on` descending and then by `id` descending. The second
 * key matters: several transactions on the same day would otherwise come back
 * in insertion order, which changes as rows are edited, so the list visibly
 * reshuffles itself when nothing about it has changed. A ULID sorts by creation
 * time, so the tiebreak is stable and meaningful.
 */
export async function list(filters = {}) {
  const rows = await load();

  // Reversals, and the entries they cancel, are out of the LIST by default -
  // a ledger where every fixed typo takes three lines is one nobody can read.
  // They are never out of a TOTAL: summary() asks for them explicitly, because
  // the figures have to net rather than skip.
  const reversedIds = new Set(rows.filter((r) => r.reverses_id).map((r) => r.reverses_id));
  const standing = (row) => !row.reverses_id && !reversedIds.has(row.id);

  const out = rows
    .filter((row) => (filters.includeReversed ? true : standing(row)))
    .filter((row) => matches(row, filters));

  out.sort((a, b) => (b.occurred_on < a.occurred_on ? -1 : b.occurred_on > a.occurred_on ? 1 : (a.id < b.id ? 1 : -1)));

  const limit = filters.limit ?? 0;
  const page = limit ? out.slice(0, limit) : out;

  return { ok: true, data: page, meta: { total: out.length, has_more: limit > 0 && out.length > limit } };
}

export async function find(id) {
  const rows = await load();
  const hit = rows.find((r) => r.id === id);
  return hit ? { ok: true, data: hit } : { ok: false, reason: 'missing' };
}

/** Both legs of a paired transaction, or the single row if it is unpaired. */
export async function group(row) {
  if (!row?.group_id) return [row];
  const rows = await load();
  return rows.filter((r) => r.group_id === row.group_id);
}

function matches(row, f) {
  if (f.book && row.book !== f.book) return false;
  if (f.type && row.type !== f.type) return false;
  if (f.account_id && row.account_id !== f.account_id) return false;
  if (f.category_id && row.category_id !== f.category_id) return false;
  if (f.necessity && row.necessity !== Number(f.necessity)) return false;

  if (f.period) {
    const { from, to } = periodBounds(f.period);
    if (!isWithin(row.occurred_on, from, to)) return false;
  } else if (f.from || f.to) {
    if (!isWithin(row.occurred_on, f.from, f.to)) return false;
  }

  if (f.q) {
    // Searched across the fields a person would actually remember: who it was
    // paid to, what it was for, and which category it went in. The category is
    // matched on the SNAPSHOT stored on the row, so searching for a category's
    // old name still finds the transactions filed under it at the time.
    const needle = String(f.q).toLowerCase();
    const hay = `${row.payee || ''} ${row.note || ''} ${row.category_label || ''}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  // A transfer's second leg is hidden from the list by default: showing both
  // makes one movement of money look like two transactions, and the running
  // total appears to change twice. The account detail screen passes
  // includeBothLegs, because there the incoming leg is the whole point.
  if (!f.includeBothLegs && row.type === 'transfer' && row.direction === 'in') return false;

  return true;
}

/* =========================================================================
   Writing
   ========================================================================= */

/**
 * Create a transaction.
 *
 * Writes one leg or two, depending on the type and whether a destination
 * account was named. Both legs go in together — see the note in endpoints.md
 * about a half-applied transfer.
 */
export async function create(input) {
  const errors = await validate(input);
  if (Object.keys(errors).length) return { ok: false, reason: 'invalid', errors };

  const rows = await load();
  const stamp = new Date().toISOString();
  const type = input.type;
  const amount = Math.abs(Math.trunc(Number(input.amount_minor)));

  const source = rows.length >= 0 ? await accounts.find(input.account_id) : null;
  const sourceAccount = source?.data;

  // The FX snapshot. Taken now, stored on the row, and never recomputed —
  // reports read it back rather than re-converting at today's rate.
  const currency = String(input.currency || sourceAccount?.currency || 'BDT').toUpperCase();
  const { fx_rate, fx_as_of } = await fxSnapshot(currency, sourceAccount?.currency);

  const paired = (type === 'transfer') || (type === 'deposit' && input.to_account_id);
  const groupId = paired ? ulid() : null;

  const base = {
    group_id: groupId,
    type,
    amount_minor: amount,
    currency,
    category_id: type === 'transfer' ? null : (input.category_id || null),
    // The category NAME is snapshotted alongside the id. Renaming a category
    // must not rewrite what last year's report said, and an archived category
    // must still render its own name on the rows that used it.
    category_label: type === 'transfer' ? null : (input.category_label || null),
    necessity: type === 'expense' ? (Number(input.necessity) || 3) : null,
    method: input.method || null,
    payee: input.payee?.trim() || null,
    note: input.note?.trim() || null,
    occurred_on: input.occurred_on || today(),
    book: input.book || sourceAccount?.book || 'personal',
    fx_rate,
    fx_as_of,
    created_at: stamp,
    updated_at: stamp,
  };

  const legs = [];

  legs.push({
    ...base,
    id: ulid(),
    direction: typeOf(type).direction,
    account_id: input.account_id,
  });

  if (paired) {
    legs.push({
      ...base,
      id: ulid(),
      direction: 'in',
      account_id: input.to_account_id,
      // The destination's own currency may differ, so the incoming leg carries
      // its own converted amount. Without this, moving USD 100 into a BDT
      // account credits that account with 100 taka.
      ...(await convertLeg(amount, currency, input.to_account_id)),
    });
  }

  rows.push(...legs);
  persist(rows);
  emit(EVENTS.TRANSACTION_CREATED, legs[0]);

  if (await hasBackend()) {
    const res = await post('/ledger', {
      type, amount_minor: amount, currency,
      account_id: input.account_id, to_account_id: input.to_account_id || null,
      category_id: base.category_id, necessity: base.necessity, method: base.method,
      payee: base.payee, note: base.note, occurred_on: base.occurred_on, book: base.book,
    });
    if (!res.ok && res.reason !== 'offline') {
      // Roll back so this device does not hold a transaction the server has
      // rejected and will keep rejecting.
      persist(rows.filter((r) => !legs.some((l) => l.id === r.id)));
      return res;
    }
  }

  return { ok: true, data: legs[0] };
}

/**
 * Edit.
 *
 * An edit that changes the amount, the type or either account rewrites BOTH
 * legs. Patching one leg of a pair leaves the two disagreeing about how much
 * moved, which shows up as a balance that is wrong by the difference and has no
 * visible cause.
 */
/**
 * A mirror of one leg: same everything, opposite direction.
 *
 * The local half of the rule the server enforces. Both sides have to agree,
 * because when a backend is present this store is still written first - so if
 * the client edited in place while the server reversed, the two would hold
 * different histories of the same money and neither would be wrong enough to
 * notice.
 */
function mirrorOf(leg, reason, groupId) {
  const stamp = new Date().toISOString();

  return {
    ...leg,
    id: ulid(),
    group_id: groupId,
    reverses_id: leg.id,
    reversal_reason: reason,
    corrects_id: null,
    // The whole mechanism: every balance and total nets to nothing.
    direction: leg.direction === 'in' ? 'out' : 'in',
    // Dated TODAY, never backdated. A correction that lands in the original's
    // month changes a month already looked at, which is what the rule prevents.
    occurred_on: today(),
    created_at: stamp,
    updated_at: stamp,
  };
}

/**
 * Correct an entry.
 *
 * NOT an edit. The original is reversed and a replacement recorded beside it,
 * and all three rows survive - inherited from OppTracker, where the rule is
 * "posted is final, a mistake is corrected by a reversal, and both stay
 * visible". A ledger whose past can be rewritten cannot answer what it said
 * last month.
 */
export async function update(id, changes, reason = 'Corrected') {
  const rows = await load();
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, reason: 'missing' };

  if (row.reverses_id) {
    return { ok: false, reason: 'invalid', errors: { entry: ['A reversal cannot be corrected. Reverse it instead.'] } };
  }

  const merged = { ...row, ...changes };
  const errors = await validate({ ...merged, account_id: merged.account_id }, { editing: true });
  if (Object.keys(errors).length) return { ok: false, reason: 'invalid', errors };

  const legs = row.group_id ? rows.filter((r) => r.group_id === row.group_id) : [row];
  if (legs.some((l) => rows.some((r) => r.reverses_id === l.id))) {
    return { ok: false, reason: 'conflict', message: 'This entry was already reversed.' };
  }

  const mirrorGroup = legs.length > 1 ? ulid() : null;
  const mirrors = legs.map((leg) => mirrorOf(leg, reason, mirrorGroup));

  persist([...rows, ...mirrors]);

  // The replacement goes through create(), so it is built by exactly the same
  // code as any other entry - including the FX snapshot and the paired leg.
  const replacement = await create({
    type: merged.type,
    account_id: merged.account_id,
    to_account_id: merged.to_account_id ?? row.counter_account_id ?? null,
    amount_minor: merged.amount_minor,
    currency: merged.currency,
    category_id: merged.category_id ?? null,
    necessity: merged.necessity ?? null,
    method: merged.method ?? null,
    payee: merged.payee ?? null,
    note: merged.note ?? null,
    occurred_on: merged.occurred_on,
    book: merged.book,
  });

  if (!replacement.ok) return replacement;

  const after = await load();
  const fresh = after.find((r) => r.id === replacement.data.id);
  if (fresh) { fresh.corrects_id = row.id; persist(after); }

  emit(EVENTS.TRANSACTION_UPDATED, replacement.data);

  if (await hasBackend()) {
    const res = await patch(`/ledger/${id}`, { ...changes, reason });
    if (!res.ok && res.reason !== 'offline') return res;
  }

  return { ok: true, data: replacement.data };
}

/**
 * Reverse an entry. Nothing in this app removes a recorded one.
 *
 * `destroy` is kept as the name the UI already calls, because what it means to
 * the person has not changed - the entry stops counting - only what it leaves
 * behind has.
 */
export async function reverse(id, reason = 'Reversed') {
  const rows = await load();
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, reason: 'missing' };

  const legs = row.group_id ? rows.filter((r) => r.group_id === row.group_id) : [row];

  if (legs.some((l) => rows.some((r) => r.reverses_id === l.id))) {
    // A second mirror would take the balance the other way and read as a real
    // transaction.
    return { ok: false, reason: 'conflict', message: 'This entry was already reversed.' };
  }

  const mirrorGroup = legs.length > 1 ? ulid() : null;
  const mirrors = legs.map((leg) => mirrorOf(leg, reason, mirrorGroup));

  persist([...rows, ...mirrors]);
  emit(EVENTS.TRANSACTION_DELETED, row);

  if (await hasBackend()) {
    const res = await post(`/ledger/${id}/reverse`, { reason });
    if (!res.ok && res.reason !== 'offline') return res;
  }

  return { ok: true, data: mirrors };
}

export const destroy = reverse;

/* =========================================================================
   Derived figures — the only place these are computed
   ========================================================================= */

/**
 * Balance per account: opening + Σ(in) − Σ(out).
 *
 * Derived rather than stored, because a stored balance and a ledger disagree
 * eventually and then there are two truths with no way to tell which is right.
 *
 * Every leg counts here, including both legs of a transfer — that is the whole
 * point of a transfer, and it is exactly the case where the totals in
 * summary() must NOT count them.
 */
export async function balances({ book = null } = {}) {
  const rows = await load();
  const accountRes = await accounts.list({ book, includeArchived: true });

  const out = {};
  for (const account of accountRes.data) out[account.id] = account.opening_balance_minor || 0;

  for (const row of rows) {
    if (!(row.account_id in out)) continue;
    out[row.account_id] += row.direction === 'in' ? row.amount_minor : -row.amount_minor;
  }

  return { ok: true, data: out, meta: { as_of: today() } };
}

/** How many transactions reference an account — the accounts screen asks before deleting. */
export async function usageCount(accountId) {
  const rows = await load();
  return rows.filter((r) => r.account_id === accountId).length;
}

/**
 * One period's figures.
 *
 * The counting rules are in endpoints.md and they are the whole substance of
 * this function:
 *
 *   income  = Σ type income
 *   expense = Σ type expense
 *   held    = Σ type deposit AND direction out          (once, not both legs)
 *   transfers are excluded entirely
 *   kept    = income − expense − held  → what is still in hand
 *   savings rate = (held + kept) / income
 *
 * The savings rate counts BOTH what was deliberately put away and what was
 * simply not spent. A rate that ignored the leftover would tell someone who
 * under-spent by 20,000 taka that they saved nothing.
 */
export async function summary({ book = 'personal', period = toPeriodKey(new Date()), currency = 'BDT' } = {}) {
  // includeReversed, deliberately. The totals must NET - original, mirror and
  // replacement all counted - rather than quietly skipping the rows the list
  // hides. This has to match the server's summary exactly or the same month
  // reads differently depending on whether a backend happens to be reachable.
  const rows = (await list({ book, period, includeBothLegs: true, includeReversed: true })).data;
  const rates = await fx.rates();

  // A REVERSAL IS STILL type = expense. Summing by type alone reports a
  // corrected 45,000 expense as 94,500 spent - wrong, and plausible enough that
  // nobody would question it. The mirror subtracts.
  const signed = (set) => set.map(
    (r) => (r.reverses_id ? { ...r, amount_minor: -r.amount_minor } : r),
  );

  const income = signed(rows.filter((r) => r.type === 'income'));
  const expense = signed(rows.filter((r) => r.type === 'expense'));
  // Counted once, on the leg that takes money out of the spendable account -
  // and its mirror is the leg that puts it back, which is the `in` one. Keyed
  // on reverses_id rather than direction, because a paired deposit already has
  // one leg of each direction with no reversal involved.
  const held = signed(rows.filter(
    (r) => r.type === 'deposit'
      && (r.reverses_id ? r.direction === 'in' : r.direction === 'out'),
  ));

  const total = (set) => convertAndSum(set, currency, rates).amountMinor;
  const missing = (set) => convertAndSum(set, currency, rates).missing;

  const totalIn = total(income);
  const totalOut = total(expense);
  const totalHeld = total(held);
  const kept = totalIn - totalOut - totalHeld;

  return {
    ok: true,
    data: {
      period,
      currency,
      count: rows.length,
      income_minor: totalIn,
      expense_minor: totalOut,
      held_minor: totalHeld,
      kept_minor: kept,
      // Guarded: a month with no income divides by zero and renders NaN%,
      // which is the first thing anyone notices on a fresh install.
      savings_rate: totalIn > 0 ? ((totalHeld + kept) / totalIn) * 100 : 0,
      by_category: groupSum(expense, 'category_label', currency, rates),
      by_method: groupSum(expense, 'method', currency, rates),
      by_necessity: groupSum(expense, 'necessity', currency, rates),
      income_by_category: groupSum(income, 'category_label', currency, rates),
      unconvertible: [...new Set([...missing(income), ...missing(expense), ...missing(held)])],
    },
  };
}

/** Totals per key, biggest first — the order every breakdown is read in. */
function groupSum(rows, key, currency, rates) {
  const buckets = new Map();
  for (const row of rows) {
    const bucket = row[key] ?? 'Uncategorised';
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(row);
  }
  return [...buckets.entries()]
    .map(([name, set]) => ({ name, value: convertAndSum(set, currency, rates).amountMinor, count: set.length }))
    .sort((a, b) => b.value - a.value);
}

/** A series of period totals, for the twelve-month bar strip. */
export async function series(periods, { book = 'personal', type = 'expense', currency = 'BDT' } = {}) {
  const rates = await fx.rates();
  const rows = await load();
  return periods.map((period) => {
    const { from, to } = periodBounds(period);
    const set = rows.filter((r) => r.book === book && r.type === type
      && (type !== 'deposit' || r.direction === 'out')
      && isWithin(r.occurred_on, from, to));
    return { label: period, value: convertAndSum(set, currency, rates).amountMinor };
  });
}

/* =========================================================================
   Helpers
   ========================================================================= */

async function fxSnapshot(currency, accountCurrency) {
  if (!accountCurrency || currency === accountCurrency) return { fx_rate: null, fx_as_of: null };
  const rates = await fx.rates();
  const rate = rates[`${currency}/${accountCurrency}`];
  return {
    fx_rate: Number.isFinite(rate) ? rate : null,
    fx_as_of: await fx.asOf(currency, accountCurrency),
  };
}

/** The incoming leg's amount, in the destination account's own currency. */
async function convertLeg(amount, fromCurrency, toAccountId) {
  const res = await accounts.find(toAccountId);
  const to = res?.data;
  if (!to || to.currency === fromCurrency) return { amount_minor: amount, currency: fromCurrency };

  const rates = await fx.rates();
  const rate = rates[`${fromCurrency}/${to.currency}`];
  const converted = Number.isFinite(rate) ? convert(amount, fromCurrency, to.currency, rate) : null;

  // With no rate the leg keeps the source amount and currency rather than
  // guessing. The destination balance is then visibly in the wrong currency,
  // which is a problem someone can see and fix — unlike a silent 1:1
  // conversion, which is a problem nobody ever notices.
  if (converted === null) return { amount_minor: amount, currency: fromCurrency, fx_rate: null, fx_as_of: null };

  return { amount_minor: converted, currency: to.currency, fx_rate: rate, fx_as_of: await fx.asOf(fromCurrency, to.currency) };
}

async function validate(input, { editing = false } = {}) {
  const errors = {};

  if (!TYPES.some((t) => t.key === input.type)) errors.type = ['Choose a type.'];

  const amount = Number(input.amount_minor);
  if (!Number.isFinite(amount) || Math.trunc(amount) === 0) {
    errors.amount_minor = ['Enter an amount.'];
  } else if (!Number.isSafeInteger(Math.trunc(amount))) {
    errors.amount_minor = ['That amount is too large.'];
  }

  if (!input.account_id) errors.account_id = ['Choose an account.'];

  if (input.type === 'transfer') {
    if (!input.to_account_id) errors.to_account_id = ['Choose where the money is going.'];
    else if (input.to_account_id === input.account_id) {
      errors.to_account_id = ['Pick a different account — money cannot move to where it already is.'];
    }
  }

  if (input.occurred_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.occurred_on)) {
    errors.occurred_on = ['Enter a valid date.'];
  }

  // A future-dated transaction is allowed — a cheque written today and dated
  // next week is real — but a date beyond a year out is almost always a typo in
  // the year field, and it silently drags the ledger's range with it.
  if (input.occurred_on && input.occurred_on > shiftYear(today(), 1)) {
    errors.occurred_on = ['That date is more than a year away. Check the year.'];
  }

  if (!editing && input.account_id) {
    const res = await accounts.find(input.account_id);
    if (!res.ok) errors.account_id = ['That account no longer exists.'];
  }

  return errors;
}

function shiftYear(dateKey, n) {
  const [y, rest] = [dateKey.slice(0, 4), dateKey.slice(4)];
  return String(Number(y) + n) + rest;
}

/* ---- Storage ------------------------------------------------------------- */

async function load() {
  if (memo) return memo;

  const saved = store.read(null);
  if (Array.isArray(saved)) { memo = saved; return memo; }

  if (await hasBackend()) {
    const res = await get('/ledger', { limit: 500 });
    if (res.ok) { memo = res.data?.data || []; persist(memo); return memo; }
    if (res.reason === 'auth') { memo = []; return memo; }
  }

  // No seeded transactions. A ledger pre-filled with invented spending is
  // actively harmful: the first month's figures look real, and the first real
  // entry is buried among them.
  memo = [];
  persist(memo);
  return memo;
}

function persist(rows) {
  memo = rows;
  store.write(rows);
}

export function reset() { memo = null; store.clear(); }
