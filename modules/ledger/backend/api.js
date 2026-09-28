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
import * as categories from '../../categories/backend/api.js';

const store = moduleStore('ledger');

// `short` is the word on the entry sheet's segmented control: four of them
// have to fit one row at 320px without truncating to 'Expe…'.
export const TYPES = [
  { key: 'expense',  label: 'Expense',  short: 'Out',  tone: 'out',  icon: 'arrow-out',  direction: 'out' },
  { key: 'income',   label: 'Income',   short: 'In',   tone: 'in',   icon: 'arrow-in',   direction: 'in' },
  { key: 'deposit',  label: 'Deposit',  short: 'Save', tone: 'hold', icon: 'arrow-hold', direction: 'out' },
  { key: 'transfer', label: 'Transfer', short: 'Move', tone: 'move', icon: 'arrow-move', direction: 'out' },
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
  return record(input, { sync: true });
}

/**
 * Build the legs, write them locally, and - when `sync` - send them.
 *
 * update() calls this with sync:false. It used to call create(), which POSTed
 * the replacement as an ordinary new entry, and then PATCHed the original,
 * which on the server reverses it AND records its own replacement. Every
 * correction therefore left the server holding the new amount TWICE - once
 * corrected, once as a stray entry nothing pointed at - and every total
 * counted it twice. The local replacement is built here; the server builds its
 * own from the PATCH.
 */
async function record(input, { sync }) {
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
    // Filled in below from the category itself. Left null here rather than
    // taken from the caller: the label and the band are FACTS ABOUT THE
    // CATEGORY, and accepting them from whoever is writing the row is how a
    // transaction ends up filed under a name its category never had.
    category_label: null,
    necessity: null,
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

  // THE SNAPSHOT. The server does exactly this in LedgerWriter::snapshotCategory,
  // and the two have to agree or the same entry reads differently depending on
  // which side wrote it.
  //
  // It was missing here, and the symptom was not an error: every row rendered
  // its category as "—" and its necessity as Discretionary, because the label
  // was whatever the caller happened to pass (usually nothing) and the band
  // fell back to a default of 3. House rent came out discretionary.
  //
  // Snapshotted rather than read through, per CONVENTIONS.md: renaming a
  // category must not rewrite last year's report, and an archived one must
  // still render its own name on the rows that used it.
  if (base.category_id) {
    const category = await categories.find(base.category_id);

    if (category) {
      base.category_label = category.label;
      // The band comes FROM the category unless the caller overrode it, so a
      // row filed under Rent is essential without anyone re-stating it.
      base.necessity = type === 'expense'
        ? (Number(input.necessity) || category.necessity || 3)
        : null;
    } else {
      // A category that is not ours, or gone. Dropped rather than stored: an id
      // pointing at nothing is worse than no id at all.
      base.category_id = null;
    }
  }

  if (type === 'expense' && base.necessity === null) base.necessity = Number(input.necessity) || 3;

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
  if (!sync) return { ok: true, data: legs[0] };
  emit(EVENTS.TRANSACTION_CREATED, legs[0]);

  if (await hasBackend()) {
    const res = await post('/ledger', {
      // The source leg's own ULID, so the row this device holds and the row
      // the server holds are the same row. Without it, reversing or undoing
      // an entry in the same session sent an id the server had never seen.
      // A retry of the same POST is refused as a duplicate id, not recorded
      // twice.
      id: legs[0].id,
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
  const replacement = await record({
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
  }, { sync: false });

  if (!replacement.ok) { persist(rows.filter((r) => !mirrors.includes(r))); return replacement; }

  const after = await load();
  const fresh = after.find((r) => r.id === replacement.data.id);
  if (fresh) { fresh.corrects_id = row.id; persist(after); }

  emit(EVENTS.TRANSACTION_UPDATED, replacement.data);

  if (await hasBackend()) {
    const res = await patch(`/ledger/${id}`, { ...changes, reason });
    if (!res.ok && res.reason !== 'offline') {
      // Refused by the server: this device must not keep a correction the
      // server does not have.
      persist(after.filter((r) => !mirrors.includes(r) && r.id !== replacement.data.id));
      return res;
    }
    // The server minted its own ids for the mirror and the replacement. The
    // next read takes them, so a later reversal names a row the server knows.
    if (res.ok) memo = null;
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
    if (!res.ok && res.reason !== 'offline') {
      // Refused (a 409 because the server already holds a reversal, say): the
      // local mirror goes, or this device shows a cancellation the server
      // does not have.
      persist(rows);
      return res;
    }
    // The server minted its own ids for the mirrors; take them on next read.
    if (res.ok) memo = null;
  }

  return { ok: true, data: mirrors };
}

export const destroy = reverse;

/**
 * Record an entry again: the same money, the same accounts, the same
 * category, the same words - on another day (today, unless told otherwise).
 *
 * The swipe-right on a Ledger row, and the Undo after a reversal (which
 * records the entry again on its own date rather than reversing the
 * reversal: a reversed reversal leaves the original marked as reversed, so it
 * could never be reversed a second time, and the list would keep hiding it).
 *
 * Built from the SOURCE leg of a pair - the one that carries the meaning -
 * and the other leg's account, so a transfer repeats as a transfer, not as
 * two unrelated movements.
 *
 * @param {string} id
 * @param {object} [opts]
 * @param {string} [opts.occurred_on]  YYYY-MM-DD, default today
 */
export async function repeat(id, { occurred_on = today() } = {}) {
  const rows = await load();
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, reason: 'missing' };
  if (row.reverses_id) {
    return { ok: false, reason: 'invalid', errors: { entry: ['A reversal is not an entry to repeat.'] } };
  }

  const legs = row.group_id ? rows.filter((r) => r.group_id === row.group_id && !r.reverses_id) : [row];
  const source = legs.find((l) => l.direction === typeOf(l.type).direction) || row;
  const other = legs.find((l) => l !== source);

  return create({
    type: source.type,
    amount_minor: source.amount_minor,
    currency: source.currency,
    account_id: source.account_id,
    to_account_id: other?.account_id || source.counter_account_id || null,
    category_id: source.category_id || null,
    // A band the owner set by hand on the original stays with the copy.
    necessity: source.type === 'expense' ? (source.necessity || null) : null,
    method: source.method || null,
    payee: source.payee || null,
    note: source.note || null,
    occurred_on,
    book: source.book,
  });
}

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
  const currencyOf = {};
  for (const account of accountRes.data) {
    out[account.id] = account.opening_balance_minor || 0;
    currencyOf[account.id] = account.currency;
  }

  // A row in another currency than its account - a USD 12.99 charge on a taka
  // card - is converted into the account's currency before it moves the
  // balance. It used to be added as it stood, moving the card by ৳12.99. The
  // same rule as BalanceSheet::balances(): the row's snapshot (which is
  // exactly its currency → its account's) when present, else the current
  // rate; with no rate the row is left out and its currency named.
  let rates = null;
  const unconverted = new Set();

  for (const row of rows) {
    if (!(row.account_id in out)) continue;
    let value = row.amount_minor;
    const to = currencyOf[row.account_id];

    if (to && row.currency && row.currency !== to) {
      const snapshot = Number(row.fx_rate);
      if (Number.isFinite(snapshot) && snapshot > 0) {
        value = convert(row.amount_minor, row.currency, to, snapshot);
      } else {
        rates ??= await fx.rates();
        const res = convertAndSum([row], to, rates);
        value = res.missing.length ? null : res.amountMinor;
      }
      if (value === null) { unconverted.add(row.currency); continue; }
    }

    out[row.account_id] += row.direction === 'in' ? value : -value;
  }

  return { ok: true, data: out, meta: { as_of: today(), unconverted: [...unconverted] } };
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
 *   spendable = income − expense − held  → what is still in hand
 *   savings rate = (held + spendable) / income
 *
 * `spendable_minor`, the server's name for the same figure (BalanceSheet and
 * the month cockpit). It was `kept_minor` here, which the cockpit uses for
 * income − spent - one name for two figures is how two screens disagree.
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
  const accountCurrency = await accountCurrencies();

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

  const total = (set) => sumIn(set, currency, rates, accountCurrency).amountMinor;
  const missing = (set) => sumIn(set, currency, rates, accountCurrency).missing;

  const totalIn = total(income);
  const totalOut = total(expense);
  const totalHeld = total(held);
  const spendable = totalIn - totalOut - totalHeld;

  return {
    ok: true,
    data: {
      period,
      currency,
      count: rows.length,
      income_minor: totalIn,
      expense_minor: totalOut,
      held_minor: totalHeld,
      spendable_minor: spendable,
      // Guarded: a month with no income divides by zero and renders NaN%,
      // which is the first thing anyone notices on a fresh install.
      savings_rate: totalIn > 0 ? ((totalHeld + spendable) / totalIn) * 100 : 0,
      by_category: groupSum(expense, 'category_label', currency, rates, accountCurrency),
      by_method: groupSum(expense, 'method', currency, rates, accountCurrency),
      by_necessity: groupSum(expense, 'necessity', currency, rates, accountCurrency),
      income_by_category: groupSum(income, 'category_label', currency, rates, accountCurrency),
      unconvertible: [...new Set([...missing(income), ...missing(expense), ...missing(held)])],
    },
  };
}

/** Totals per key, biggest first — the order every breakdown is read in. */
function groupSum(rows, key, currency, rates, accountCurrency) {
  const buckets = new Map();
  for (const row of rows) {
    const bucket = row[key] ?? 'Uncategorised';
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(row);
  }
  return [...buckets.entries()]
    .map(([name, set]) => ({ name, value: sumIn(set, currency, rates, accountCurrency).amountMinor, count: set.length }))
    .sort((a, b) => b.value - a.value);
}

/** A series of period totals, for the twelve-month bar strip. */
export async function series(periods, { book = 'personal', type = 'expense', currency = 'BDT' } = {}) {
  const rates = await fx.rates();
  const rows = await load();
  const accountCurrency = await accountCurrencies();
  return periods.map((period) => {
    const { from, to } = periodBounds(period);
    // The same counting as summary(): a reversal mirror SUBTRACTS (it is still
    // type = expense, so it used to be added and a corrected month read
    // high), and a deposit counts once, on its out leg - or, for a mirror, its
    // in leg.
    const set = rows
      .filter((r) => r.book === book && r.type === type && isWithin(r.occurred_on, from, to))
      .filter((r) => type !== 'deposit' || (r.reverses_id ? r.direction === 'in' : r.direction === 'out'))
      .map((r) => (r.reverses_id ? { ...r, amount_minor: -r.amount_minor } : r));
    return { label: period, value: sumIn(set, currency, rates, accountCurrency).amountMinor };
  });
}

/** account id → its currency, for reading a row's snapshot. */
async function accountCurrencies() {
  const res = await accounts.list({ includeArchived: true });
  return Object.fromEntries((res.data || []).map((a) => [a.id, a.currency]));
}

/**
 * Sum rows into one currency, converting each row first.
 *
 * The row's own snapshot when it converts into the target - it is the rate
 * the money moved at, and the rule the server follows (BalanceSheet via the
 * fx Converter). A snapshot is the rate from the row's currency to its
 * ACCOUNT's, so it applies only when that account is in the target currency.
 * Otherwise today's rate: the browser holds no rate history, which is the one
 * place it can still differ from the server's as-of rate. A row with no rate
 * is named in `missing`, never counted one to one.
 */
function sumIn(rows, currency, rates, accountCurrency = {}) {
  let total = 0;
  const missing = new Set();
  for (const row of rows) {
    const minor = Math.trunc(row.amount_minor || 0);
    if (row.currency === currency) { total += minor; continue; }

    const snapshot = Number(row.fx_rate);
    const rate = accountCurrency[row.account_id] === currency && Number.isFinite(snapshot) && snapshot > 0
      ? snapshot
      : rates?.[`${row.currency}/${currency}`];

    const value = Number.isFinite(rate) ? convert(minor, row.currency, currency, rate) : null;
    if (value === null) { missing.add(row.currency); continue; }
    total += value;
  }
  return { amountMinor: total, currency, missing: [...missing] };
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

/**
 * Every row, once per page.
 *
 * The in-flight read is shared, not only the finished one. The Ledger asks for
 * the list and the summary in parallel, and the entry sheet asks for recents:
 * with only the value memoised each started its own paged read, so a page
 * fetched the whole ledger two or three times from a server that answers one
 * request at a time.
 */
let loading = null;

function load() {
  if (memo) return Promise.resolve(memo);
  loading ??= readAll().finally(() => { loading = null; });
  return loading;
}

async function readAll() {
  // THE SERVER IS THE SOURCE OF TRUTH WHEN THERE IS ONE.
  //
  // This used to read local storage first and return it if anything was there,
  // which made the backend unreachable in practice: a browser that had ever
  // used the app in Phase 1 held an array - very often an EMPTY one - and an
  // empty array is a perfectly good answer, so the server was never asked. The
  // app wrote entries to the server and then showed a ledger of nothing, with
  // Settings reporting 94 entries three lines above it.
  //
  // Order matters more than the fetch: server, then the local copy as an
  // OFFLINE CACHE, then the seed. A 401 still stops here rather than falling
  // through - api-contract.md §1 - because answering "not signed in" with this
  // device's data is how one person sees another's ledger.
  if (await hasBackend()) {
    // PAGED, not one large request.
    //
    // This asked for limit=500. The server caps a page at 200 and rejects
    // anything larger with a 422 - so the fetch failed, load() fell through to
    // local storage, and the app showed an empty ledger while the server held
    // ninety-four entries. Nothing surfaced the 422: a failed read is
    // indistinguishable from an empty ledger unless someone looks.
    //
    // include_reversed, so the local copy holds the same rows the server does.
    // Without them the totals cannot net a correction to zero, and a corrected
    // entry would count twice on this device and once on every other.
    const PAGE = 200;
    const rows = [];
    let cursor = null;

    for (let page = 0; page < 50; page += 1) {
      const res = await get('/ledger', {
        limit: PAGE,
        include_reversed: 1,
        after: cursor || undefined,
      });

      if (!res.ok) {
        if (res.reason === 'auth') { memo = []; return memo; }
        // A partial read is worse than a stale one: half a ledger produces
        // totals that look plausible and are wrong. Fall through to the cache.
        rows.length = 0;
        break;
      }

      rows.push(...(res.data?.data || []));

      cursor = res.data?.meta?.next_cursor || null;
      if (!res.data?.meta?.has_more || !cursor) {
        memo = rows;
        persist(memo);
        return memo;
      }
    }
    // Anything else - offline, a 500 - falls through to whatever was last
    // cached, which is better than an empty screen.
  }

  const saved = store.read(null);
  if (Array.isArray(saved)) { memo = saved; return memo; }

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
