/**
 * Hisab · Press feedback
 *
 * Every tappable thing answers the finger within one frame: a button, chip,
 * tab or tile dips to .97, a list row draws a ripple from where it was
 * touched. Started once by main.js for the whole document, so no page wires
 * it and nothing tappable is forgotten.
 *
 * Why JavaScript and not :active: in a scrolling list Chrome on Android holds
 * :active back for about 100ms to learn whether the touch is a scroll, which
 * is exactly the delay that makes a tap feel ignored. pointerdown arrives at
 * once, and the browser sends pointercancel if the touch turns into a scroll,
 * so the press is withdrawn before anyone sees a row "pressed" by a scroll.
 *
 * The look is CSS (.is-pressed / .is-released in _animations.css), keyed on
 * classes only, so it needs no style="" (which the CSP forbids) beyond two
 * CSSOM custom properties for the ripple's origin.
 */

import { haptic } from './haptics.js';

const PRESSABLE = [
  'button:not(:disabled)', 'a[href]', '[role="button"]', 'summary',
  'label:has(> input:not(:disabled))', '[data-press]',
].join(',');

/* Holding the pressed look for at least this long means a quick tap is seen
   at all: a 40ms tap would otherwise add and remove the class in one frame. */
const MIN_PRESS = 90;

let current = null;
let pressedAt = 0;
let startX = 0;
let startY = 0;

function release(node) {
  if (!node) return;
  const wait = Math.max(0, MIN_PRESS - (performance.now() - pressedAt));
  window.setTimeout(() => {
    node.classList.remove('is-pressed');
    node.classList.add('is-released');
    // The release animation is ~220ms; the class goes with it so the next
    // press starts clean. animationend is not relied on: a node removed
    // mid-animation never sends one.
    window.setTimeout(() => node.classList.remove('is-released'), 320);
  }, wait);
}

function onDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const node = event.target.closest?.(PRESSABLE);
  if (!node || node.closest('[data-no-press]') || node.getAttribute('aria-disabled') === 'true') return;
  if (current && current !== node) release(current);
  current = node;
  pressedAt = performance.now();
  startX = event.clientX;
  startY = event.clientY;
  const box = node.getBoundingClientRect();
  node.style.setProperty('--px', `${Math.round(event.clientX - box.left)}px`);
  node.style.setProperty('--py', `${Math.round(event.clientY - box.top)}px`);
  // The ripple has to reach the far corner from wherever the finger landed.
  node.style.setProperty('--pr', `${Math.round(Math.hypot(box.width, box.height))}px`);
  node.classList.remove('is-released');
  node.classList.add('is-pressed');
}

function onMove(event) {
  if (!current) return;
  // A drag that wanders is not a press any more (a slider, a swipe).
  if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) {
    release(current);
    current = null;
  }
}

function onUp() {
  if (!current) return;
  release(current);
  current = null;
}

/**
 * Haptics on the few presses that deserve one: the +, a primary button, a
 * choice that changed. Every tap buzzing is noise; these are the moments a
 * thumb is committing to something.
 */
function onClick(event) {
  const node = event.target.closest?.('.tab--compose, .btn--primary, [data-haptic]');
  if (node) haptic(node.dataset.haptic || 'tap');
}

function onChange(event) {
  const t = event.target;
  if (t && (t.type === 'radio' || t.type === 'checkbox')) haptic('select');
}

let started = false;

/** Start press feedback for the whole document. Idempotent. */
export function initPress() {
  if (started) return;
  started = true;
  document.addEventListener('pointerdown', onDown, { passive: true, capture: true });
  document.addEventListener('pointermove', onMove, { passive: true, capture: true });
  document.addEventListener('pointerup', onUp, { passive: true, capture: true });
  document.addEventListener('pointercancel', onUp, { passive: true, capture: true });
  document.addEventListener('click', onClick, { passive: true, capture: true });
  document.addEventListener('change', onChange, { passive: true, capture: true });
  // Mobile Safari applies :active only when some touch listener exists; the
  // surface step on .row:active depends on it.
  document.addEventListener('touchstart', () => {}, { passive: true });
}
