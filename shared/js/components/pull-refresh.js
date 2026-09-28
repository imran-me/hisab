/**
 * Hisab · Pull to refresh
 *
 *   on(EVENTS.REFRESH_REQUESTED, ({ done }) => reload().finally(done));   // a page that can refresh itself
 *
 * On a list page (Home, the Ledger, Accounts, any modules/<x>/list.html),
 * pulling down from the very top draws a small dial under the header; letting
 * go past the mark asks for fresh data. A page that listens for
 * EVENTS.REFRESH_REQUESTED refreshes in place and calls `done()`; with nobody
 * listening the page is reloaded, which is always correct, only slower.
 *
 * Touch only, and only from scrollTop 0 with no sheet open, so it can never
 * steal a scroll. The browser's own pull-to-refresh is switched off on these
 * pages (overscroll-behavior in _layout.css), or both would fire.
 */

import { el, icon } from '../core/dom.js';
import { emit, hasListeners, EVENTS } from '../core/bus.js';
import { haptic } from './haptics.js';
import { currentPath } from '../core/paths.js';

const THRESHOLD = 64;   // px of pull, after resistance, that means "refresh"
const MAX = 96;

function isListPage() {
  const path = currentPath();
  return path === 'index.html' || /^modules\/[^/]+\/(?:list|insights)\.html$/.test(path);
}

export function initPullRefresh() {
  if (!isListPage() || !window.matchMedia('(pointer: coarse)').matches) return;
  document.documentElement.classList.add('has-pull');

  const dial = el('div', { class: 'pull', 'aria-hidden': 'true' });
  dial.innerHTML = icon('refresh', { class: 'icon pull__icon' }).value;
  document.body.append(dial);

  let startY = null;
  let pull = 0;
  let armed = false;
  let busy = false;

  const paint = () => {
    dial.style.setProperty('--pull', `${pull}px`);
    dial.style.setProperty('--turn', `${Math.round((pull / THRESHOLD) * 270)}deg`);
    dial.classList.toggle('is-armed', armed);
    dial.classList.toggle('is-visible', pull > 4 || busy);
  };

  const reset = () => {
    startY = null;
    pull = 0;
    armed = false;
    dial.classList.remove('is-pulling');
    paint();
  };

  document.addEventListener('touchstart', (event) => {
    if (busy || event.touches.length !== 1) return;
    if (window.scrollY > 0 || document.querySelector('dialog[open]')) return;
    if (event.target.closest('.scroll-x, [data-no-pull], input, textarea, select')) return;
    startY = event.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (startY === null) return;
    const dy = event.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { if (pull) reset(); else startY = null; return; }
    // Resistance: the dial moves at half the finger, then less, so it feels
    // like a pull on something rather than a slide.
    pull = Math.min(MAX, dy * 0.5 - Math.max(0, dy * 0.5 - THRESHOLD) * 0.5);
    const nowArmed = pull >= THRESHOLD;
    if (nowArmed !== armed) { armed = nowArmed; if (armed) haptic('drag'); }
    dial.classList.add('is-pulling');
    paint();
  }, { passive: true });

  const end = () => {
    if (startY === null) return;
    const go = armed;
    reset();
    if (!go) return;
    busy = true;
    dial.classList.add('is-busy');
    pull = THRESHOLD;
    paint();
    haptic('tap');
    const done = () => {
      busy = false;
      dial.classList.remove('is-busy');
      pull = 0;
      paint();
    };
    if (hasListeners(EVENTS.REFRESH_REQUESTED)) {
      emit(EVENTS.REFRESH_REQUESTED, { done });
      window.setTimeout(done, 8000);   // a listener that never answers must not leave the dial spinning
    } else {
      window.location.reload();
    }
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}
