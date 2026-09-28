/**
 * Hisab · Merchant and biller logos
 *
 *   import { findMerchant, merchantLogo, entryMerchant } from '…/components/merchant-logo.js';
 *
 *   findMerchant('Foodpanda order')      → the Foodpanda entry, or null
 *   entryMerchant(row)                   → the merchant a ledger entry was paid to, or null
 *   merchantLogo(merchant, 40)           → markup: its logo tile (bankLogo's tile)
 *
 * The payee is looked at first and the note second: a payee is typed on
 * purpose, a note is prose ("dinner with Robi"), so a payee's word wins.
 */

import { MERCHANTS } from '../data/merchants.js';
import { bankLogo } from './bank-logo.js';

export const merchants = MERCHANTS.map((m) => ({ ...m, kind: 'merchant', dir: 'merchants' }));

const words = (text) => ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/* Every spelling, normalised once. Longest first, so "uber eats" is tried
   before "uber" and "google play" before "google". */
const NEEDLES = merchants
  .flatMap((m) => (m.match || []).map((s) => ({ m, s: words(s) })))
  .sort((a, b) => b.s.length - a.s.length);
const EXACT = new Map(merchants.flatMap((m) => [m.name, ...(m.exact || [])].map((s) => [words(s), m])));
const VETO = new Map(merchants.map((m) => [m.id, (m.not || []).map(words)]));

/* A ledger re-renders the same forty payees on every scroll and filter; the
   answer for a text never changes, so it is worked out once. */
const cache = new Map();

/** Match one free text to a merchant. Whole words only; null when nothing fits. */
export function findMerchant(text) {
  const hay = words(text);
  if (hay.trim() === '') return null;
  if (cache.has(hay)) return cache.get(hay);
  let found = EXACT.get(hay) || null;
  if (!found) {
    for (const { m, s } of NEEDLES) {
      if (hay.includes(s) && !VETO.get(m.id).some((v) => hay.includes(v))) { found = m; break; }
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(hay, found);
  return found;
}

/** The merchant an entry was paid to or received from: its payee, then its note. */
export function entryMerchant(entry = {}) {
  return findMerchant(entry.payee) || findMerchant(entry.note);
}

/** A merchant by id, or null. */
export function merchant(id) {
  return merchants.find((m) => m.id === id) || null;
}

/** The tile for a merchant: its logo on white, or its monogram in the brand colour. */
export function merchantLogo(m, size = 40, opts = {}) {
  return bankLogo(typeof m === 'string' ? merchant(m) : m, size, opts);
}

/**
 * A row's leading circle for an entry paid to a known merchant, or '' when
 * there is none — so a row renderer needs one line:
 *
 *   const glyph = merchantGlyph(row) || `<span class="row__glyph …">…</span>`;
 *
 * The circle is the shared .row__glyph (_surfaces.css), with the logo on its
 * white disc in place of the category icon.
 */
export function merchantGlyph(entry, size = 40) {
  const m = entryMerchant(entry);
  return m ? `<span class="row__glyph row__glyph--logo">${merchantLogo(m, size)}</span>` : '';
}
