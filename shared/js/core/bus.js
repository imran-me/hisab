/**
 * Hisab · Event bus
 *
 * How modules talk without importing each other.
 *
 * The dashboard needs to redraw when a transaction is saved from the ledger's
 * sheet. Without a bus, either the dashboard imports the ledger (and the module
 * test fails — deleting the ledger folder would break the dashboard) or the
 * ledger imports the dashboard (same problem the other way round). With a bus,
 * both import only this file, the dependency graph stays acyclic, and
 * tools/module-deps.py can prove it.
 *
 * Events are named '<noun>:<past-tense verb>' — 'transaction:created',
 * 'vault:locked'. Past tense because an event announces something that has
 * already happened; a listener cannot prevent it, only respond.
 */

/** Every event name the product emits. A typo becomes an import error here. */
export const EVENTS = {
  // Ledger
  TRANSACTION_CREATED: 'transaction:created',
  TRANSACTION_UPDATED: 'transaction:updated',
  TRANSACTION_DELETED: 'transaction:deleted',

  // Accounts
  ACCOUNT_CREATED: 'account:created',
  ACCOUNT_UPDATED: 'account:updated',
  ACCOUNT_ARCHIVED: 'account:archived',

  // The frame
  BOOK_CHANGED:     'book:changed',      // personal <-> a business
  PERIOD_CHANGED:   'period:changed',    // the month being viewed
  CURRENCY_CHANGED: 'currency:changed',  // the display currency
  THEME_CHANGED:    'theme:changed',

  // Vault. Note there is no 'vault:decrypted' with a payload — plaintext never
  // travels on the bus, because a bus is a broadcast and every listener would
  // receive it.
  VAULT_UNLOCKED: 'vault:unlocked',
  VAULT_LOCKED:   'vault:locked',
  VAULT_CHANGED:  'vault:changed',

  // Connectivity
  ONLINE:  'net:online',
  OFFLINE: 'net:offline',
  SYNCED:  'net:synced',
};

const listeners = new Map();

/**
 * Subscribe. Returns an unsubscribe function — returned rather than requiring a
 * matching off(fn) call, because the caller then cannot lose the reference and
 * leak the listener, which is the usual way these accumulate.
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/** Fire once, then unsubscribe. */
export function once(event, handler) {
  const stop = on(event, (payload) => { stop(); handler(payload); });
  return stop;
}

/**
 * Publish.
 *
 * A throwing listener is caught and logged rather than allowed to propagate.
 * Without that, one broken panel on the dashboard stops every other subscriber
 * after it in the set from ever being called — and which ones those are depends
 * on registration order, so the resulting bug is intermittent and looks
 * unrelated to the panel that actually threw.
 *
 * Iterating a copy of the set matters too: a handler that unsubscribes itself
 * while the set is being iterated would otherwise skip the next handler.
 */
export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[bus] listener for "${event}" threw:`, err);
    }
  }
}

/** For tests and for the lock screen, which drops every subscription it made. */
export function clear(event) {
  if (event) listeners.delete(event);
  else listeners.clear();
}
