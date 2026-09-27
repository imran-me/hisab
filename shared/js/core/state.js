/**
 * Hisab · App state
 *
 * The four things every screen needs to know, and nothing else:
 *
 *   book      which set of books is being viewed — 'personal', or a business id
 *   period    the month being viewed, 'YYYY-MM'
 *   currency  the currency cross-currency roll-ups are converted TO
 *   theme     night (the default) / day / system (follow the phone)
 *
 * This is NOT a store for data. Transactions, accounts and vault entries belong
 * to their modules and are fetched through those modules' api.js. Putting them
 * here would make every module depend on this file for its own data, which is
 * the shape that turns a modular app into a single global object again.
 *
 * Each setter persists and emits. A screen listens for the event rather than
 * polling, so switching the month redraws every panel that cares and nothing
 * that does not.
 */

import { storage, KEYS } from './storage.js';
import { emit, EVENTS } from './bus.js';
import { currentPeriod } from './dates.js';
import { setHomeCurrency } from './money.js';

const state = {
  book: storage.get(KEYS.BOOK, 'personal'),
  period: storage.get(KEYS.PERIOD, null) || currentPeriod(),
  currency: storage.get(KEYS.CURRENCY, 'BDT'),
  theme: storage.get(KEYS.THEME, null),
  density: storage.get(KEYS.DENSITY, 'default'),
  hand: storage.get(KEYS.HAND, 'right'),
};

/**
 * A stored period is not trusted blindly.
 *
 * Someone who last opened the app in March and returns in September should land
 * on September, not on a stale March that quietly makes every figure on the
 * dashboard look wrong. A period in the FUTURE is also rejected, which is what
 * a device with a badly set clock produces.
 */
{
  const now = currentPeriod();
  if (!/^\d{4}-\d{2}$/.test(state.period) || state.period > now) state.period = now;
}

/**
 * Night is the default (owner, 2026-09-27: dark unless told otherwise).
 *
 * "Follow the phone" is a stored choice, 'system', not the absence of one.
 * The inline pre-paint block in every page is frozen: it sets data-theme for
 * a stored 'day' or 'night' and removes it for anything else, which is what
 * lets CSS follow prefers-color-scheme. So the default is made real by
 * STORING 'night' on the first run; from the second page on, the pre-paint
 * paints night before the first frame. (The very first page ever opened on
 * a light phone paints one light frame, then this corrects it.)
 *
 * A stored null from before this rule meant "follow the device" by default,
 * not by choice, so it becomes night too.
 */
if (state.theme !== 'day' && state.theme !== 'night' && state.theme !== 'system') {
  state.theme = 'night';
  storage.set(KEYS.THEME, 'night');
}

// The display currency is the one figures are shown in without a code, so the
// formatter is told about it before any screen renders a figure.
setHomeCurrency(state.currency);

export function getState() {
  // A copy, so a caller cannot mutate the state object directly and skip the
  // persist-and-emit that every real change goes through.
  return { ...state };
}

export const book     = () => state.book;
export const period   = () => state.period;
export const currency = () => state.currency;
export const theme    = () => state.theme;

/** True when the personal book is active — the common branch in every module. */
export const isPersonal = () => state.book === 'personal';

export function setBook(value) {
  if (!value || value === state.book) return;
  state.book = value;
  storage.set(KEYS.BOOK, value);
  emit(EVENTS.BOOK_CHANGED, value);
}

export function setPeriod(value) {
  if (!/^\d{4}-\d{2}$/.test(value) || value === state.period) return;
  state.period = value;
  storage.set(KEYS.PERIOD, value);
  emit(EVENTS.PERIOD_CHANGED, value);
}

export function setCurrency(code) {
  const next = String(code || '').toUpperCase();
  if (!next || next === state.currency) return;
  state.currency = next;
  storage.set(KEYS.CURRENCY, next);
  setHomeCurrency(next);
  emit(EVENTS.CURRENCY_CHANGED, next);
}

/**
 * @param {'night'|'day'|'system'} value  'system' follows the phone; anything
 *        else unknown (null included) is treated as 'system', the one choice
 *        that can never strand someone on a theme they did not pick
 */
export function setTheme(value) {
  const next = value === 'day' || value === 'night' ? value : 'system';
  state.theme = next;
  // Always stored, 'system' included: an ABSENT key now means "never chose",
  // which is night. The pre-paint block removes data-theme for 'system', so
  // the media query takes over exactly as before.
  storage.set(KEYS.THEME, next);

  applyTheme();
  emit(EVENTS.THEME_CHANGED, next);
}

export function setDensity(value) {
  state.density = value === 'compact' ? 'compact' : 'default';
  storage.set(KEYS.DENSITY, state.density);
  applyTheme();
}

export function setHand(value) {
  state.hand = value === 'left' ? 'left' : 'right';
  storage.set(KEYS.HAND, state.hand);
  applyTheme();
}

/**
 * Push the display preferences onto <html> as attributes.
 *
 * Attributes rather than classes because the CSS selects on
 * `[data-theme="day"]` and `:root:not([data-theme])` — the second of which is
 * what lets an unset preference fall through to prefers-color-scheme. A class
 * cannot express "absent" as cleanly, and getting that wrong means a person who
 * chose night on a phone set to light gets light anyway.
 *
 * The same three attributes are written by the inline pre-paint block in every
 * page's <head>. This function is the runtime half of that pair; if one
 * changes, the other must too.
 */
export function applyTheme() {
  const root = document.documentElement;

  if (state.theme === 'day' || state.theme === 'night') root.setAttribute('data-theme', state.theme);
  else root.removeAttribute('data-theme');   // 'system': prefers-color-scheme decides

  if (state.density === 'compact') root.setAttribute('data-density', 'compact');
  else root.removeAttribute('data-density');

  if (state.hand === 'left') root.setAttribute('data-hand', 'left');
  else root.removeAttribute('data-hand');

  // The browser UI around the page — the address bar on Android, the status bar
  // in a home-screen install. Left unset, a night-mode app is framed in white.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const isDay = state.theme === 'day'
      || (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    meta.setAttribute('content', isDay ? '#F5F3EF' : '#0C0F14');   // --bg-0, per theme
  }
}
