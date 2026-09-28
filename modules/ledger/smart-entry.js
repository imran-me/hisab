/**
 * Ledger · smart entry: what a note already tells us
 *
 *   suggest({ text, history, categories, memory })
 *     → { merchant, category, account_id, amount_minor, currency, source } | null
 *
 * Typing "uber" into the note should be enough to file the entry: Transport,
 * paid from the account the last Uber came out of, for about what it cost last
 * time. This is the one place that works that out, so the entry sheet only
 * asks and shows.
 *
 * In order of trust:
 *
 * 1. THE OWNER'S OWN HISTORY. The newest entry of this type whose note or
 *    payee is the same text, then one paid to the same merchant, then (while
 *    the word is still being typed, three letters in) one whose note starts
 *    with it. What they did last time beats any guess of ours: if their
 *    Foodpanda goes under Groceries, it goes under Groceries.
 * 2. THE MERCHANT'S USUAL CATEGORY (MERCHANT_CATEGORY below), resolved against
 *    the categories this book and type actually has, by key. First use of
 *    "daraz" lands in Shopping without any history at all.
 *
 * The amount comes from the per-note memory (written on every save, so it is
 * the LAST amount even when history has not been reloaded), else from the
 * matched entry. The merchant match itself is Dev A's findMerchant(), so a
 * row's logo and a suggestion never disagree about who "Uber" is.
 */

import { findMerchant, entryMerchant } from '../../shared/js/components/merchant-logo.js';
import { moduleStore } from '../../shared/js/core/storage.js';

/**
 * A merchant's usual category, as category KEYS in order of preference (the
 * seed's keys; the first one this book and type has wins). Data rather than
 * logic, so a new merchant is one line.
 */
export const MERCHANT_CATEGORY = {
  daraz: ['shopping', 'gadgets', 'clothing'],
  foodpanda: ['dining'],
  pathao: ['transport', 'logistics'],
  uber: ['transport'],
  shohoz: ['transport', 'travel'],
  chaldal: ['groceries'],
  aarong: ['clothing', 'shopping'],
  shwapno: ['groceries'],
  agora: ['groceries'],
  meenabazar: ['groceries'],
  unimart: ['groceries'],
  bata: ['clothing'],
  apex: ['clothing'],
  amazon: ['shopping', 'gadgets', 'software'],
  kfc: ['dining'],
  pizzahut: ['dining'],
  starbucks: ['dining'],
  gp: ['mobile', 'utilities'],
  robi: ['mobile', 'utilities'],
  banglalink: ['mobile', 'utilities'],
  teletalk: ['mobile', 'utilities'],
  airtel: ['mobile', 'utilities'],
  btcl: ['internet', 'utilities'],
  link3: ['internet', 'utilities'],
  amberit: ['internet', 'utilities'],
  carnival: ['internet', 'utilities'],
  desco: ['utilities', 'biz-utilities'],
  dpdc: ['utilities', 'biz-utilities'],
  titas: ['utilities', 'biz-utilities'],
  wasa: ['utilities', 'biz-utilities'],
  netflix: ['subscriptions', 'entertainment'],
  spotify: ['subscriptions', 'entertainment'],
  youtube: ['subscriptions', 'entertainment'],
  google: ['subscriptions', 'software'],
  apple: ['subscriptions', 'gadgets'],
  facebook: ['marketing', 'subscriptions'],
  meta: ['marketing', 'subscriptions'],
  biman: ['travel', 'travel-biz'],
  usbangla: ['travel', 'travel-biz'],
  novoair: ['travel', 'travel-biz'],
  emirates: ['travel', 'travel-biz'],
  qatar: ['travel', 'travel-biz'],
};

/** "  Uber  to Office! " → "uber to office": how two notes are compared. */
export function noteKey(text) {
  return String(text || '').toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * @param {object} p
 * @param {string} p.text          the note (or payee) as typed so far
 * @param {Array}  [p.history]     ledger rows of this type, newest first
 * @param {Array}  [p.categories]  the active categories for this book and type
 * @param {object} [p.memory]      noteKey → { amount_minor, currency }
 */
export function suggest({ text, history = [], categories = [], memory = {} }) {
  const key = noteKey(text);
  if (key.length < 2) return null;

  const merchant = findMerchant(text);
  const activeIds = new Set(categories.map((c) => c.id));
  const titleKey = (row) => noteKey(row.note || row.payee);

  const standing = history.filter((r) => !r.reverses_id);
  const past = standing.find((r) => titleKey(r) === key)
    || (merchant && standing.find((r) => entryMerchant(r)?.id === merchant.id))
    || (key.length >= 3 && standing.find((r) => titleKey(r).startsWith(key)))
    || null;

  let category = past?.category_id && activeIds.has(past.category_id)
    ? categories.find((c) => c.id === past.category_id) : null;
  let source = category ? 'history' : null;

  if (!category && merchant) {
    for (const k of MERCHANT_CATEGORY[merchant.id] || []) {
      category = categories.find((c) => c.key === k || c.key?.startsWith(`${k}-`));
      if (category) { source = 'merchant'; break; }
    }
  }

  const remembered = memory[key] || (past ? memory[titleKey(past)] : null);
  const amount = remembered || (past ? { amount_minor: past.amount_minor, currency: past.currency } : null);

  if (!merchant && !past && !remembered) return null;

  return {
    merchant,
    category: category || null,
    account_id: past?.account_id || remembered?.account_id || null,
    amount_minor: amount?.amount_minor || null,
    currency: amount?.currency || null,
    // What the suggestion is built from, for the words on the chip.
    source: source || (past ? 'history' : 'merchant'),
    // The text the history matched, so a prefix ("ube") can be completed.
    completes: past && titleKey(past) !== key ? (past.note || past.payee) : null,
  };
}

/* ---- The last amount per note ------------------------------------------- */

const notes = moduleStore('ledger-notes');
const MEMORY_MAX = 300;

/** noteKey → { amount_minor, currency, account_id, at }. */
export function amountMemory() {
  return notes.read({}) || {};
}

/**
 * Remember what this note cost, so "rent" or "CNG to office" arrives with its
 * usual figure next time. Oldest dropped past MEMORY_MAX, so the store cannot
 * grow without bound on a phone.
 */
export function rememberAmount(text, { amount_minor, currency, account_id = null }) {
  const key = noteKey(text);
  if (key.length < 2 || !amount_minor) return;
  const all = amountMemory();
  all[key] = { amount_minor, currency, account_id, at: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > MEMORY_MAX) {
    keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0))
      .slice(0, keys.length - MEMORY_MAX).forEach((k) => delete all[k]);
  }
  notes.write(all);
}
