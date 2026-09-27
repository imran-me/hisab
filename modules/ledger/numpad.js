/**
 * Ledger · the in-sheet number pad
 *
 * Drawn buttons rather than the system keyboard, for three reasons that all
 * come from standing at a shop counter with one hand free:
 *
 * · The system keyboard covers half the sheet, including the button you need
 *   next. These keys sit where the thumb already is and cover nothing.
 * · It can do sums. "120+45" is how a rickshaw with a detour is actually
 *   remembered, and making someone add it up in their head is how a ledger
 *   ends up wrong by exactly the detour.
 * · It enforces the currency's minor unit AS YOU TYPE. A third decimal in taka
 *   cannot be keyed at all, rather than being keyed and then silently
 *   truncated on save.
 *
 * The maths is integer minor units throughout. Each operand is parsed by
 * money.js's parseAmount on its own and the results are summed as integers, so
 * "0.1+0.2" is 30 poisha and not 30.000000000000004 of anything.
 */

import { qs, delegate, icon } from '../../shared/js/core/dom.js';
import { parseAmount, formatMoney, currency as currencyOf } from '../../shared/js/core/money.js';

/** Twelve digits of whole part is 999 billion — past that it is a typo. */
const MAX_WHOLE_DIGITS = 12;

/** Our own minus sign in the buffer is ASCII; U+2212 is only for display. */
const OPS = ['+', '-'];

/* =========================================================================
   The maths — pure functions, no DOM, so they can be tested on their own
   ========================================================================= */

/** The operand currently being typed: everything after the last operator. */
function lastOperand(buffer) {
  const at = Math.max(buffer.lastIndexOf('+'), buffer.lastIndexOf('-'));
  return buffer.slice(at + 1);
}

/**
 * Apply one key to the buffer and return the new buffer.
 *
 * Refused keys return the buffer unchanged rather than throwing: a key that
 * does nothing is the right feedback for "that cannot be typed here".
 *
 * @param {string} buffer   e.g. '120+45'
 * @param {string} key      '0'-'9', '00', '.', '+', '-', 'back', 'clear'
 * @param {number} places   the currency's minor unit (2 for BDT, 0 for JPY)
 */
export function press(buffer, key, places) {
  const operand = lastOperand(buffer);
  const last = buffer.slice(-1);

  if (key === 'clear') return '';
  if (key === 'back') return buffer.slice(0, -1);

  if (OPS.includes(key)) {
    // Nothing to add to yet. A leading minus would be a negative amount, and
    // the sign of an entry is its TYPE, not its figure.
    if (!buffer) return buffer;
    // Pressing + after − means the person changed their mind: replace, do not
    // stack. '12+-5' is not a sum anyone meant.
    if (OPS.includes(last) || last === '.') return buffer.slice(0, -1) + key;
    return buffer + key;
  }

  if (key === '.') {
    if (places === 0 || operand.includes('.')) return buffer;
    return buffer + (operand === '' ? '0.' : '.');
  }

  if (/^\d+$/.test(key)) {
    const [whole, frac] = operand.split('.');
    if (frac !== undefined) {
      // The minor unit, enforced here and not on save. 12.99 then a 9 is
      // refused, which is what makes '12.999' impossible rather than rounded.
      const room = places - frac.length;
      if (room <= 0) return buffer;
      return buffer + key.slice(0, room);
    }
    // No leading zeros: '0' then '5' is 5, and '00' on nothing is nothing.
    if (whole === '0') return buffer.slice(0, -1) + (key.replace(/^0+/, '') || '0');
    if (whole === '' && /^0+$/.test(key)) return buffer + '0';
    if (whole.length + key.length > MAX_WHOLE_DIGITS) return buffer;
    return buffer + key;
  }

  return buffer;
}

/**
 * The buffer's value in integer minor units, or null if it cannot be read.
 *
 * A trailing operator is ignored ('120+' is 120), because the person is
 * mid-thought and the figure shown under the display should not flicker to
 * "invalid" every time they reach for the next number.
 */
export function evaluate(buffer, code) {
  const text = buffer.replace(/[+-]$/, '');
  if (!text) return null;

  const parts = text.match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  for (const part of parts) {
    const sign = part[0] === '-' ? -1 : 1;
    const minor = parseAmount(part.replace(/^[+-]/, ''), code);
    if (minor === null) return null;
    total += sign * minor;
  }
  return Number.isSafeInteger(total) ? total : null;
}

/** True when the buffer is a sum rather than a single figure. */
export function isExpression(buffer) {
  return /\d[+-]\d/.test(buffer);
}

/**
 * The buffer for a known amount — the inverse of evaluate(), used when an
 * entry is re-opened or a recent one is repeated.
 */
export function bufferFor(minor, code) {
  if (!minor) return '';
  const places = currencyOf(code).minorUnit;
  const factor = 10 ** places;
  const whole = String(Math.floor(Math.abs(minor) / factor));
  const rest = Math.abs(minor) % factor;
  if (!rest) return whole;
  return `${whole}.${String(rest).padStart(places, '0').replace(/0+$/, '')}`;
}

/**
 * The buffer as a person reads it: digit grouping per operand, a real minus
 * sign, and space around the operators.
 */
export function pretty(buffer, code) {
  return buffer.replace(/[^+-]+|[+-]/g, (token) => {
    if (token === '+') return ' + ';
    if (token === '-') return ' − ';
    const [whole, frac] = token.split('.');
    const grouped = whole
      ? formatMoney(Number(whole) * 10 ** currencyOf(code).minorUnit, code, { decimals: false })
      : '';
    return frac === undefined ? grouped : `${grouped || '0'}.${frac}`;
  });
}

/* =========================================================================
   The pad itself
   ========================================================================= */

/**
 * The markup: one 4 × 4 grid, as in the v2 mock (DIRECTION §3.7.6). Digits in
 * the order every phone dialler uses; +, − and a tall Save in the action
 * column; 00, 0 and ⌫ on the bottom row.
 *
 * The action keys are placed by column in the CSS and the rest flow into the
 * cells left over, so the "reaching hand" setting moves the action column —
 * and Save with it — to the thumb's side without reordering the digits.
 *
 * There is no separate decimal key: most entries here are whole taka, and a
 * fifth column would push the pad up past the middle of the screen. A
 * long-press on 00 types the point (its corner shows "·"), and so does "." on
 * a hardware keyboard. A currency with no minor unit has no point at all.
 */
export function numpadMarkup({ places = 2 } = {}) {
  const digit = (d) => `<button type="button" class="numpad__key" data-key="${d}">${d}</button>`;
  return `
    <div class="numpad" data-numpad>
      ${['1', '2', '3'].map(digit).join('')}
      <button type="button" class="numpad__key numpad__key--op numpad__key--plus" data-key="+" aria-label="Plus">+</button>
      ${['4', '5', '6'].map(digit).join('')}
      <button type="button" class="numpad__key numpad__key--op numpad__key--minus" data-key="-" aria-label="Minus">−</button>
      ${['7', '8', '9'].map(digit).join('')}
      <button type="submit" class="numpad__key numpad__key--save" data-save>Save</button>
      <button type="button" class="numpad__key numpad__key--dual" data-key="00" data-long-key="."${places ? '' : ' data-no-point'}
              aria-label="Double zero. Hold for a decimal point.">00</button>
      ${digit('0')}
      <button type="button" class="numpad__key numpad__key--op numpad__key--back" data-key="back" aria-label="Delete last digit">${icon('backspace', { class: 'icon' })}</button>
    </div>`;
}

/** How long a press on 00 has to last to become a decimal point. */
const HOLD_MS = 420;

/**
 * Wire a pad to its display.
 *
 * The display shows the RESULT in the big figure and the sum that made it on
 * the line underneath ("370", then "250 + 120"), because the big figure is
 * what gets saved.
 *
 * @param {HTMLFormElement} form
 * @param {object} opts
 * @param {HTMLInputElement} opts.display   inputmode="none" — the big figure
 * @param {HTMLElement} opts.result         the "250 + 120" line under it
 * @param {() => string} opts.code          the currency, read on every key
 * @param {string} [opts.initial]           a starting buffer
 * @param {Function} [opts.onChange]        receives the buffer
 */
export function attachNumpad(form, { display, result, code, initial = '', onChange }) {
  let buffer = initial;
  // A repeated or re-opened amount is SELECTED: the first digit replaces it
  // rather than appending to it, the same as a selected field would.
  let replaceNext = Boolean(initial);
  // A point typed in a currency that has none. The digit after it is refused
  // too: ¥1.5 is a typo, and silently reading it as ¥15 is a tenfold error.
  let pointRefused = false;

  const render = () => {
    const cur = code();
    const value = evaluate(buffer, cur);
    const sum = isExpression(buffer);

    display.value = sum && value !== null ? pretty(bufferFor(Math.abs(value), cur), cur) : pretty(buffer, cur);
    display.classList.toggle('is-negative', sum && value !== null && value <= 0);

    // Shrinks in steps as the figure grows, so it never scrolls sideways.
    const length = display.value.length;
    display.style.setProperty('--len', String(Math.max(1, length)));
    if (length > 11) display.dataset.size = 's';
    else if (length > 8) display.dataset.size = 'm';
    else delete display.dataset.size;
    display.classList.toggle('is-selected', replaceNext && Boolean(buffer));

    if (sum) {
      result.textContent = value !== null && value <= 0 ? `${pretty(buffer, cur)} is not a positive amount` : pretty(buffer, cur);
      result.hidden = false;
    } else {
      result.hidden = true;
      result.textContent = '';
    }
    onChange?.(buffer);
  };

  const refuse = () => {
    display.classList.remove('is-refused');
    // Reflow, so a second refusal in a row restarts the shake.
    void display.offsetWidth;
    display.classList.add('is-refused');
  };

  const apply = (key) => {
    const places = currencyOf(code()).minorUnit;
    if (key === '.' && places === 0) { pointRefused = true; refuse(); return; }
    if (pointRefused && /^\d+$/.test(key)) { refuse(); return; }
    pointRefused = false;

    if (replaceNext && key !== 'back' && !OPS.includes(key)) buffer = '';
    if (replaceNext && key === 'back') buffer = '';
    replaceNext = false;
    const next = press(buffer, key, places);
    if (next === buffer && key !== 'back' && key !== 'clear') refuse();
    buffer = next;
    render();
  };

  const pad = qs('[data-numpad]', form);

  // Long-press on 00 for the point. The click that follows the hold is
  // swallowed, or the hold would type ".00".
  let holdTimer = 0;
  let held = false;
  pad.addEventListener('pointerdown', (event) => {
    const key = event.target.closest('[data-long-key]');
    if (!key || key.hasAttribute('data-no-point')) return;
    held = false;
    holdTimer = window.setTimeout(() => {
      held = true;
      apply(key.dataset.longKey);
      try { navigator.vibrate?.(6); } catch { /* not allowed: fine */ }
    }, HOLD_MS);
  });
  const cancelHold = () => window.clearTimeout(holdTimer);
  pad.addEventListener('pointerup', cancelHold);
  pad.addEventListener('pointercancel', cancelHold);
  pad.addEventListener('pointerleave', cancelHold);
  pad.addEventListener('contextmenu', (event) => { if (event.target.closest('[data-long-key]')) event.preventDefault(); });

  delegate(pad, 'click', '[data-key]', (_event, button) => {
    if (held) { held = false; return; }
    apply(button.dataset.key);
    // Focus stays on the display, so a hardware keyboard keeps working after a
    // tap and a screen reader hears the new figure.
    display.focus({ preventScroll: true });
  });

  // A hardware keyboard, on a desktop or a phone with one attached. Every key
  // goes through the same apply() as the pad, so the two cannot disagree about
  // what is typeable.
  display.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const map = { Backspace: 'back', Delete: 'clear', ',': null };
    let key = event.key in map ? map[event.key] : event.key;
    if (key === '−') key = '-';
    if (key === 'Enter') return;           // the form's submit handles it
    if (key && (/^\d$/.test(key) || key === '.' || OPS.includes(key) || key === 'back' || key === 'clear')) {
      event.preventDefault();
      apply(key);
    } else if (event.key.length === 1) {
      event.preventDefault();              // a letter is not an amount
    }
  });

  // Nothing reaches the value except through press(). beforeinput covers the
  // paths keydown does not: autofill, IME composition, drag and drop.
  display.addEventListener('beforeinput', (event) => event.preventDefault());

  display.addEventListener('paste', (event) => {
    event.preventDefault();
    const minor = parseAmount(event.clipboardData?.getData('text') ?? '', code());
    if (minor !== null && minor > 0) { buffer = bufferFor(minor, code()); replaceNext = false; render(); }
  });

  display.addEventListener('animationend', () => display.classList.remove('is-refused'));

  render();

  return {
    /** Integer minor units, or null. */
    value: () => evaluate(buffer, code()),
    buffer: () => buffer,
    /** Replace the amount and select it, so the next digit overwrites it. */
    set(minor) { buffer = bufferFor(minor, code()); replaceNext = Boolean(buffer); render(); },
    refresh: render,
  };
}
