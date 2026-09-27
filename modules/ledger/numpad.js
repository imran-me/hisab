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

import { qs, delegate } from '../../shared/js/core/dom.js';
import { parseAmount, formatMoney, moneyLabel, currency as currencyOf } from '../../shared/js/core/money.js';

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
 * The markup: a 3 × 4 digit block and a column of actions beside it. Two
 * blocks rather than one 4 × 4 grid so the "reaching hand" setting can put the
 * action column on the thumb's side by reversing one flex row, without moving
 * the digits out of the order every phone dialler uses.
 *
 * The last action key is the form's submit button, and it is the one the
 * thumb rests nearest to.
 */
export function numpadMarkup({ places = 2, submitLabel = 'Save' } = {}) {
  const digit = (d) => `<button type="button" class="numpad__key" data-key="${d}">${d}</button>`;
  return `
    <div class="numpad" data-numpad>
      <div class="numpad__digits">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit).join('')}
        <button type="button" class="numpad__key" data-key="."${places ? '' : ' disabled'} aria-label="Decimal point">.</button>
        ${digit('0')}
        ${digit('00')}
      </div>
      <div class="numpad__ops">
        <button type="button" class="numpad__key numpad__key--op" data-key="back" aria-label="Delete last digit">⌫</button>
        <button type="button" class="numpad__key numpad__key--op" data-key="-" aria-label="Minus">−</button>
        <button type="button" class="numpad__key numpad__key--op" data-key="+" aria-label="Plus">+</button>
        <button type="submit" class="numpad__key numpad__key--save" data-save>${submitLabel}</button>
      </div>
    </div>`;
}

/**
 * Wire a pad to its display.
 *
 * @param {HTMLFormElement} form
 * @param {object} opts
 * @param {HTMLInputElement} opts.display   inputmode="none" — shows the sum
 * @param {HTMLElement} opts.result         the "= ৳165" line under it
 * @param {() => string} opts.code          the currency, read on every key
 * @param {string} [opts.initial]           a starting buffer
 * @param {Function} [opts.onChange]        receives the buffer
 */
export function attachNumpad(form, { display, result, code, initial = '', onChange }) {
  let buffer = initial;
  // A repeated or re-opened amount is SELECTED: the first digit replaces it
  // rather than appending to it, the same as a selected field would.
  let replaceNext = Boolean(initial);

  const render = () => {
    const cur = code();
    display.value = pretty(buffer, cur);
    // Shrinks in steps as a sum grows, so it never scrolls sideways out of view.
    const length = display.value.length;
    if (length > 13) display.dataset.size = 's';
    else if (length > 9) display.dataset.size = 'm';
    else delete display.dataset.size;
    display.classList.toggle('is-selected', replaceNext && Boolean(buffer));
    const value = evaluate(buffer, cur);
    if (isExpression(buffer) && value !== null) {
      result.textContent = value > 0 ? `= ${moneyLabel(value, cur)}` : '= not a positive amount';
      result.hidden = false;
    } else {
      result.hidden = true;
      result.textContent = '';
    }
    onChange?.(buffer);
  };

  const apply = (key) => {
    const places = currencyOf(code()).minorUnit;
    if (replaceNext && key !== 'back' && !OPS.includes(key)) buffer = '';
    if (replaceNext && key === 'back') buffer = '';
    replaceNext = false;
    buffer = press(buffer, key, places);
    render();
  };

  delegate(qs('[data-numpad]', form), 'click', '[data-key]', (_event, button) => {
    apply(button.dataset.key);
    // Focus stays on the display, so a hardware keyboard keeps working after a
    // tap and a screen reader hears the new figure.
    display.focus({ preventScroll: true });
  });

  // A hardware keyboard, on a desktop or a phone with one attached. Every key
  // goes through the same press() as the pad, so the two cannot disagree about
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
