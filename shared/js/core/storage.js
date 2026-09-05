/**
 * Hisab · Local storage
 *
 * Every key the product writes to a browser is declared here. That is the whole
 * point of the file: a grep for 'localStorage' anywhere else in the codebase
 * should return nothing, so there is one list of what this app leaves on a
 * device and one place to clear it.
 *
 * Storage throws more often than people expect — Safari's private mode used to
 * throw on every write, Chrome throws at quota, and an embedded webview can have
 * storage disabled entirely. Every access here is wrapped, so a device with
 * storage off degrades to "nothing is remembered between visits" instead of a
 * blank screen.
 */

const NS = 'hisab';

/** The complete list of keys. Namespaced so a shared origin cannot collide. */
export const KEYS = {
  THEME:     `${NS}:theme`,      // 'night' | 'day' | null (follow the device)
  DENSITY:   `${NS}:density`,    // 'default' | 'compact'
  HAND:      `${NS}:hand`,       // 'right' | 'left' — which side the FAB sits on
  BOOK:      `${NS}:book`,       // the active book: 'personal' | a business ULID
  CURRENCY:  `${NS}:currency`,   // the display currency for roll-ups
  PERIOD:    `${NS}:period`,     // the month being viewed, 'YYYY-MM'
  DRAFT:     `${NS}:draft`,      // an unsaved transaction, so a phone call does
                                 // not lose a half-typed entry
  LAST_SEEN: `${NS}:lastSeen`,   // for the "since you were last here" summary

  // Module data — accounts, transactions, categories — is NOT listed here. Each
  // module owns its own key under the hisab:m: prefix via moduleStore() below,
  // so adding a feature needs no edit to this file.

  // The vault's ENCRYPTED blob. Ciphertext only: the master password and every
  // derived key live in memory for the life of the tab and are never written
  // here, which is why there is no VAULT_KEY entry and never will be.
  VAULT:     `${NS}:vault`,
  VAULT_META:`${NS}:vaultMeta`,  // KDF parameters and the salt — not secret,
                                 // and needed before anything can be decrypted
};

let available = null;

/**
 * Probe once, not on every call.
 *
 * The probe writes and removes a value rather than checking for the object's
 * existence: `window.localStorage` is present and throws on access when a
 * browser has site data blocked, so a truthiness check reports it as working
 * and then every write fails.
 */
function isAvailable() {
  if (available !== null) return available;
  try {
    const probe = `${NS}:__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export const storage = {
  /**
   * Read and parse. Returns `fallback` for a missing key AND for a corrupt one
   * — a half-written JSON blob (a tab killed mid-write) should look like an
   * empty slot, not crash the boot sequence.
   */
  get(key, fallback = null) {
    if (!isAvailable()) return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  /** Returns false when the write did not happen, so a caller can say so. */
  set(key, value) {
    if (!isAvailable()) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      // Quota. Worth surfacing rather than swallowing: on this app it means the
      // ledger has outgrown local storage and needs the real backend.
      console.warn(`[storage] could not write ${key}:`, err?.name || err);
      return false;
    }
  },

  remove(key) {
    if (!isAvailable()) return;
    try { window.localStorage.removeItem(key); } catch { /* nothing to undo */ }
  },

  /**
   * Remove everything this app owns, and nothing else.
   *
   * Iterates the app's own key list rather than calling localStorage.clear(),
   * which on a shared origin would wipe another application's data too.
   */
  clearAll() {
    if (!isAvailable()) return;
    for (const key of ownedKeys()) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    }
  },

  /** For the settings screen: roughly how much has been stored, in bytes. */
  usage() {
    if (!isAvailable()) return 0;
    let bytes = 0;
    for (const key of Object.values(KEYS)) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) bytes += raw.length * 2;   // UTF-16 code units
      } catch { /* ignore */ }
    }
    return bytes;
  },

  get isAvailable() { return isAvailable(); },
};

/**
 * A namespaced store for one module.
 *
 *   const db = moduleStore('accounts');   // writes to hisab:m:accounts
 *
 * The tension this resolves: the locked rules say a module owns everything it
 * needs, but this file also exists so that there is ONE list of what the app
 * leaves on a device. If every module wrote its own localStorage key directly,
 * clearing the app's data would mean knowing every module that ever existed.
 *
 * So the prefix is owned here and the key under it is owned by the module. A
 * module needs no edit to this file, and `clearAll()` below still finds
 * everything by walking the prefix — including keys belonging to a module that
 * has since been deleted, which is exactly the case a hardcoded list misses.
 */
const MODULE_PREFIX = `${NS}:m:`;

export function moduleStore(moduleName) {
  const key = MODULE_PREFIX + moduleName;
  return {
    key,
    read(fallback = null) { return storage.get(key, fallback); },
    write(value) { return storage.set(key, value); },
    clear() { storage.remove(key); },
  };
}

/**
 * Every key this app owns, including module stores.
 *
 * Walking localStorage by prefix rather than returning the KEYS list, so a
 * module store — whose name this file deliberately does not know — is still
 * found. The try/catch is around the length read as well as the loop: an
 * iframe with storage blocked throws on the property access itself.
 */
export function ownedKeys() {
  if (!isAvailable()) return [];
  const out = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${NS}:`)) out.push(key);
    }
  } catch { return []; }
  return out;
}

/**
 * Session storage, for things that must NOT survive the tab closing.
 *
 * The vault's unlocked state is the only current use, and it is the reason this
 * exists as a separate object: an unlock that persisted to the next visit would
 * defeat the lock entirely.
 */
export const session = {
  get(key, fallback = null) {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { window.sessionStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) {
    try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};
