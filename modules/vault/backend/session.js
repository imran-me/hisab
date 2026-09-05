/**
 * Vault · session
 *
 * Holds the unlocked key for the life of the tab, and takes it away again.
 *
 * THE KEY LIVES IN A MODULE-SCOPED VARIABLE AND NOWHERE ELSE. Not in
 * localStorage, not in sessionStorage, not on window, not in a cookie. That is
 * not a stylistic preference — a module variable dies with the tab, which means
 * closing the tab is a lock, and a crash is a lock, and there is no persisted
 * copy for anything else to find.
 *
 * See ../SECURITY.md §5.
 */

import { session as sessionStore } from '../../../shared/js/core/storage.js';
import { emit, EVENTS } from '../../../shared/js/core/bus.js';
import * as crypto from './crypto.js';

/** The unwrapped DEK. Null whenever the vault is locked. */
let dek = null;

/** Auto-lock. Five minutes by default; a minute is offered in settings. */
let idleMs = 5 * 60 * 1000;
let idleTimer = null;

/** Failed attempts, kept across a reload so a refresh does not reset the delay. */
const ATTEMPTS_KEY = 'hisab:vaultAttempts';

export const isUnlocked = () => dek !== null;

/**
 * The key, for this module's api.js only.
 *
 * Not exported through the module's public surface — `api.js` imports it, and
 * nothing else may. A page that could reach the key could also log it.
 */
export function key() {
  if (!dek) throw new Error('The vault is locked.');
  touch();
  return dek;
}

/* =========================================================================
   Setting up, unlocking, locking
   ========================================================================= */

/**
 * First-time setup. Returns the header to be stored.
 *
 * The iteration count is MEASURED on this device rather than taken from the
 * constant — see crypto.calibrate(). A vault created on a laptop should not be
 * limited to what a five-year-old phone can manage.
 *
 * `iterations` overrides that measurement. Two legitimate callers: the
 * integration test, which would otherwise spend a minute deriving keys to
 * assert things that have nothing to do with the KDF, and a future settings
 * control offering a deliberately slower vault.
 */
export async function setup(password, { iterations = null } = {}) {
  const { header, dek: newDek } = await crypto.createHeader(password, { iterations });
  dek = newDek;
  clearAttempts();
  startIdleTimer();
  emit(EVENTS.VAULT_UNLOCKED);
  return header;
}

/**
 * Unlock.
 *
 * Returns `{ ok: true }`, or `{ ok: false, reason: 'wrong', waitMs }`.
 *
 * The delay before a wrong answer is returned grows with the number of failures
 * and is applied BEFORE the check, not after — otherwise the response time
 * itself distinguishes a wrong password (fast reject) from a throttled one, and
 * an attacker scripting the form simply ignores the delay.
 */
export async function unlock(password, header) {
  const attempts = readAttempts();
  const waitMs = backoffFor(attempts);
  if (waitMs > 0) await sleep(waitMs);

  const opened = await crypto.unlock(password, header);

  if (!opened) {
    const next = attempts + 1;
    writeAttempts(next);
    return { ok: false, reason: 'wrong', attempts: next, waitMs: backoffFor(next) };
  }

  dek = opened;
  clearAttempts();
  startIdleTimer();
  emit(EVENTS.VAULT_UNLOCKED);
  return { ok: true };
}

/**
 * Lock.
 *
 * Drops the key and tells every listener. Listeners are expected to clear their
 * own decrypted state — the bus event is the signal, and `api.js` clears its
 * cache on it rather than being asked to.
 */
export function lock(reason = 'manual') {
  if (!dek) return;
  dek = null;
  stopIdleTimer();
  emit(EVENTS.VAULT_LOCKED, reason);
}

/** Change the master password. Returns the new header, or null if the old one was wrong. */
export async function changePassword(oldPassword, newPassword, header) {
  const rotated = await crypto.rewrap(oldPassword, newPassword, header);
  if (!rotated) return null;

  // Re-unlock under the new password so the session continues rather than
  // dumping the person back to a lock screen immediately after they proved they
  // know both passwords.
  dek = await crypto.unlock(newPassword, rotated);
  startIdleTimer();
  return rotated;
}

/* =========================================================================
   Auto-lock
   ========================================================================= */

export function setIdleTimeout(minutes) {
  idleMs = Math.max(1, Number(minutes) || 5) * 60 * 1000;
  if (dek) startIdleTimer();
}

function startIdleTimer() {
  stopIdleTimer();
  idleTimer = window.setTimeout(() => lock('idle'), idleMs);
}

function stopIdleTimer() {
  window.clearTimeout(idleTimer);
  idleTimer = null;
}

/** Reset the countdown. Called on any real interaction with vault data. */
export function touch() {
  if (dek) startIdleTimer();
}

/**
 * Wire the automatic locks. Called once, by the vault page.
 *
 * `visibilitychange` is the important one and it is not paranoia: both iOS and
 * Android render a live thumbnail of the page into the app switcher, and on
 * Android that thumbnail is visible to anyone who picks the phone up. Locking
 * on hide means the switcher shows the lock screen.
 *
 * `pagehide` rather than `unload`: `unload` does not fire reliably on iOS when
 * a page is put into the back/forward cache, which is exactly the case where
 * the page stays alive with its key in memory.
 */
export function watch() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lock('hidden');
  });

  window.addEventListener('pagehide', () => lock('unload'));

  // Any interaction anywhere in the tab counts as activity, so reading a long
  // note does not time out mid-read. Passive listeners: these fire constantly
  // and must never block scrolling.
  for (const type of ['pointerdown', 'keydown', 'scroll']) {
    window.addEventListener(type, touch, { passive: true });
  }
}

/* =========================================================================
   Attempt throttling
   ========================================================================= */

/**
 * The delay after n failures: 0, 0, 0, 1s, 2s, 4s, 8s … capped at 30s.
 *
 * Three free attempts, because typing a long passphrase on a phone keyboard
 * goes wrong regularly and punishing the first typo makes the vault unpleasant
 * for its owner and no harder for anyone else.
 *
 * SECURITY.md §6 is explicit that this is not a real defence. An attacker with
 * the ciphertext never touches this code. It is here for the person who picks
 * up an unlocked phone.
 */
function backoffFor(attempts) {
  if (attempts < 3) return 0;
  return Math.min(30_000, 1000 * 2 ** (attempts - 3));
}

const readAttempts = () => Number(sessionStore.get(ATTEMPTS_KEY, 0)) || 0;
const writeAttempts = (n) => sessionStore.set(ATTEMPTS_KEY, n);
const clearAttempts = () => sessionStore.remove(ATTEMPTS_KEY);

export const attemptCount = readAttempts;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
