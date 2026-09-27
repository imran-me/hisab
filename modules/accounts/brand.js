/**
 * Accounts · how an account looks: its institution's mark and its colour
 *
 * The banks and wallets the form offers, each with a short mark and the
 * colour it usually wears, come from data/institutions.json. The colour is a
 * token NAME (Account::COLOURS), mapped to a palette token in accounts.css, so
 * nothing here writes a hex and the theme still decides the shade.
 *
 * A stand-in for Dev A's shared institutions list and bankLogo(): when those
 * land, markFor() returns their logo and the monogram stays as the fallback.
 */

import { siteURL } from '../../shared/js/core/paths.js';

export const COLOURS = ['marigold', 'green', 'violet', 'blue', 'rose', 'teal', 'orange', 'slate'];

let catalogue = null;

/** @returns {Promise<{banks: object[], wallets: object[]}>} */
export async function institutions() {
  if (catalogue) return catalogue;
  try {
    catalogue = await fetch(siteURL('modules/accounts/data/institutions.json')).then((r) => r.json());
  } catch {
    catalogue = { banks: [], wallets: [] };
  }
  return catalogue;
}

/** Up to five letters from a name: "Dutch-Bangla Bank" -> "DBB", "bKash" -> "bK". */
export function monogram(name) {
  const words = String(name || '').replace(/\b(bank|ltd|limited|plc)\b/gi, '').trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '·';
  if (words.length === 1) return words[0].slice(0, 2);
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}

/** The catalogue entry for an institution name, if it is one we know. */
export function lookup(cat, name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return [...cat.banks, ...cat.wallets].find((i) => i.name.toLowerCase() === key) || null;
}

/**
 * The mark and colour an account wears: its own colour when one was chosen,
 * else its institution's, else one by type.
 */
export function brandFor(cat, account) {
  const known = lookup(cat, account.institution);
  const byType = { cash: 'green', bank: 'blue', mfs: 'rose', card: 'slate', wallet: 'teal', savings: 'violet', investment: 'marigold' };
  return {
    mark: known?.mark || monogram(account.institution || account.name),
    colour: COLOURS.includes(account.colour) ? account.colour : (known?.colour || byType[account.type] || 'slate'),
  };
}
