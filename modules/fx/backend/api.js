/**
 * FX · module API
 *
 * Currencies and the rates between them. Every other module asks this one to
 * convert; none of them holds a rate.
 *
 * WHAT A RATE IS HERE: `rate` is the number of TARGET major units per one
 * SOURCE major unit — the direction people quote ("the dollar is at 122.50").
 * `as_of` is the date it was true. Both are snapshotted onto a transaction at
 * the moment it is saved, and reports read the snapshot rather than re-fetching
 * — converting last year's total at today's rate silently rewrites history.
 */

import { moduleStore } from '../../../shared/js/core/storage.js';
import { get, hasBackend } from '../../../shared/js/core/http.js';
import { siteURL } from '../../../shared/js/core/paths.js';
import { registerCurrencies, CURRENCIES } from '../../../shared/js/core/money.js';
import { today } from '../../../shared/js/core/dates.js';
import { emit, EVENTS } from '../../../shared/js/core/bus.js';

const store = moduleStore('fx');

/** Rates are cached for a day. A rate that is a few hours stale is fine; one
 *  that is a month stale quietly misstates every roll-up on the dashboard. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let memo = null;

/**
 * The rate table, as { 'USD/BDT': 122.5, … }.
 *
 * Reciprocals are filled in, so storing one direction is enough — but only when
 * the reverse is absent. A quoted reverse rate is not the reciprocal of the
 * forward one (there is a spread), and overwriting a real quote with 1/x would
 * lose that.
 */
export async function rates() {
  if (memo) return memo;

  const cached = store.read(null);
  const fresh = cached && (Date.now() - (cached.fetched_at || 0)) < MAX_AGE_MS;
  if (fresh) { memo = expand(cached.rates); return memo; }

  let table = null;

  if (await hasBackend()) {
    const res = await get('/fx/rates');
    // A failure here is not fatal — a stale table is far better than no
    // conversion at all, which would blank every cross-currency figure.
    if (res.ok) table = toTable(res.data?.data || []);
  }

  if (!table) {
    // The seed. Present so a fresh install can convert on day one, and marked
    // in the UI as an estimate until a real rate arrives — see asOf() below.
    try {
      const seed = await fetch(siteURL('modules/fx/data/rates.json')).then((r) => r.json());
      registerCurrencies(seed.currencies || []);
      table = toTable(seed.rates || []);
      memo = expand(table);
      return memo;
    } catch {
      // No seed either (offline, first run, file:// with fetch blocked).
      // An empty table is honest: convertAndSum() will report every foreign
      // currency as unconvertible rather than inventing a rate of 1.
      memo = {};
      return memo;
    }
  }

  store.write({ rates: table, fetched_at: Date.now() });
  memo = expand(table);
  return memo;
}

function toTable(rows) {
  const table = {};
  for (const row of rows) {
    if (!row?.base || !row?.quote || !Number.isFinite(Number(row.rate))) continue;
    table[`${row.base}/${row.quote}`] = { rate: Number(row.rate), as_of: row.as_of || null };
  }
  return table;
}

function expand(table) {
  const out = {};
  for (const [pair, entry] of Object.entries(table || {})) {
    out[pair] = entry.rate ?? entry;
  }
  // Reciprocals, and only where the reverse is genuinely absent.
  for (const [pair, entry] of Object.entries(table || {})) {
    const [base, quote] = pair.split('/');
    const reverse = `${quote}/${base}`;
    if (out[reverse] === undefined) {
      const rate = entry.rate ?? entry;
      if (rate > 0) out[reverse] = 1 / rate;
    }
  }
  // Identity, so a caller need not special-case same-currency conversion.
  for (const code of Object.keys(CURRENCIES)) out[`${code}/${code}`] = 1;
  return out;
}

/** The as-of date for a pair, for the tooltip on a converted figure. */
export async function asOf(base, quote) {
  const cached = store.read(null);
  const entry = cached?.rates?.[`${base}/${quote}`];
  return entry?.as_of || null;
}

/**
 * Record a rate by hand.
 *
 * Rates are entered manually by default rather than pulled from a provider.
 * That is deliberate: an automatic feed is one more thing that can be down, one
 * more third party told which currencies a private ledger holds, and a source
 * of silent drift in historical figures. Someone converting a salary once a
 * month is better served by the rate they actually got.
 */
export async function setRate(base, quote, rate, as_of = today()) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: 'invalid', errors: { rate: ['Enter a rate greater than zero.'] } };
  }

  const cached = store.read({ rates: {}, fetched_at: 0 });
  cached.rates[`${base}/${quote}`] = { rate: value, as_of };
  // Deliberately does NOT write the reciprocal: expand() derives it, and
  // storing both would mean two rows to keep in step for one fact.
  cached.fetched_at = Date.now();
  store.write(cached);
  memo = null;

  emit(EVENTS.CURRENCY_CHANGED, quote);
  return { ok: true, data: { base, quote, rate: value, as_of } };
}

/** Drop the cache, so the next read re-fetches. For the settings screen. */
export function invalidate() { memo = null; store.clear(); }
