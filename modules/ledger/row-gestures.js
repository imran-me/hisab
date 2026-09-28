/**
 * Ledger · swipe and long-press on entry rows
 *
 *   attachRowGestures(listElement, { onRepeat, onReverse, onMenu })
 *
 * Swipe a row RIGHT to repeat it today, LEFT to reverse it. Hold a row (or
 * right-click it) for the menu: Edit, Repeat, Reverse, Copy amount. A swipe is
 * never the only way to do anything (DIRECTION §3.6): the menu and the entry
 * sheet offer the same actions.
 *
 * What makes it feel like a phone and not a web page:
 *
 * · THE ROW FOLLOWS THE FINGER 1:1 up to the point where the action arms, and
 *   past it with resistance (a third of the movement), so the edge is felt.
 * · ONE TICK when the action arms (the shared haptics, so the Settings switch
 *   turns it off), and the icon under the row grows as it arms.
 * · IT SPRINGS BACK on release, on --ease-snap, which overshoots a little and
 *   settles. Under prefers-reduced-motion it simply returns.
 * · THE DIRECTION IS DECIDED IN THE FIRST 10px. A mostly vertical start is a
 *   scroll and the row lets go at once; `touch-action: pan-y` on the row
 *   leaves vertical scrolling to the browser so it is never janky.
 * · A SWIPE OR A HOLD IS NOT A TAP. The click that follows either is swallowed,
 *   so releasing a swipe never also opens the entry.
 *
 * Rows are the `.entry-row` buttons row.js draws (their `data-edit` carries
 * the id). A void row - a reversal, or an entry already reversed - does not
 * swipe; it still has the menu, for Copy amount.
 */

import { icon } from '../../shared/js/core/dom.js';
import { haptic } from '../../shared/js/components/haptics.js';

const ARM_AT = 0.28;        // share of the row's width at which the action arms
const ARM_MIN = 84;         // ... but never less than this many px
const DECIDE = 10;          // px of movement before the direction is decided
const HOLD_MS = 460;        // how long a still finger is a long-press

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} host   the list; rows inside it may be redrawn freely
 * @param {object} handlers
 * @param {(id: string, row: HTMLElement) => void} handlers.onRepeat
 * @param {(id: string, row: HTMLElement) => Promise<boolean>|void} handlers.onReverse
 *        resolves true when the row should collapse (the reversal happened)
 * @param {(id: string, row: HTMLElement) => void} handlers.onMenu
 * @returns {Function} detach
 */
export function attachRowGestures(host, { onRepeat, onReverse, onMenu }) {
  host.classList.add('swipe-list');
  let g = null;               // the gesture in progress
  let swallowClick = null;    // the row whose next click is not a tap

  const rowOf = (target) => target.closest?.('.entry-row[data-edit]');

  function onDown(event) {
    if (event.button > 0 || g) return;
    const row = rowOf(event.target);
    if (!row || !host.contains(row)) return;

    g = {
      row,
      id: row.dataset.edit,
      pointer: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      dx: 0,
      mode: 'pending',         // pending → swipe | scroll | held
      armed: 0,                // -1 reverse, +1 repeat, 0 none
      width: row.offsetWidth,
      canSwipe: !row.classList.contains('row--void'),
      holdTimer: 0,
    };

    // A long-press is for a finger or a pen; a mouse has a right button.
    if (event.pointerType !== 'mouse') {
      g.holdTimer = window.setTimeout(() => {
        if (!g || g.mode !== 'pending') return;
        g.mode = 'held';
        haptic('tap');
        row.classList.add('is-held');
        swallowClick = row;
        onMenu?.(g.id, row);
      }, HOLD_MS);
    }
  }

  function onMove(event) {
    if (!g || event.pointerId !== g.pointer) return;
    const dx = event.clientX - g.x0;
    const dy = event.clientY - g.y0;

    if (g.mode === 'pending') {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      window.clearTimeout(g.holdTimer);
      if (!g.canSwipe || Math.abs(dy) > Math.abs(dx) * 0.8) { end(false); return; }
      g.mode = 'swipe';
      begin(g);
      try { g.row.setPointerCapture(g.pointer); } catch { /* released already */ }
    }
    if (g.mode !== 'swipe') return;

    event.preventDefault();
    const limit = Math.max(ARM_MIN, g.width * ARM_AT);
    // 1:1 to the arming point, then a third of the movement: the edge is felt.
    const over = Math.abs(dx) - limit;
    const x = over > 0 ? Math.sign(dx) * (limit + over / 3) : dx;
    g.dx = dx;
    g.row.style.transform = `translate3d(${x}px, 0, 0)`;

    const armed = Math.abs(dx) >= limit ? Math.sign(dx) : 0;
    if (armed !== g.armed) {
      g.armed = armed;
      if (armed) haptic('drag');
      g.under.classList.toggle('is-armed', armed !== 0);
    }
    g.under.dataset.side = dx > 0 ? 'repeat' : 'reverse';
  }

  function onUp(event) {
    if (!g || event.pointerId !== g.pointer) return;
    window.clearTimeout(g.holdTimer);
    if (g.mode === 'held') { g.row.classList.remove('is-held'); g = null; return; }
    end(g.mode === 'swipe');
  }

  function onCancel(event) {
    if (!g || event.pointerId !== g.pointer) return;
    window.clearTimeout(g.holdTimer);
    g.row.classList.remove('is-held');
    // A cancelled swipe still has to spring home; it just does nothing.
    end(g.mode === 'swipe', { cancelled: true });
  }

  /** The layer under the row that says what letting go will do. */
  function begin(state) {
    const li = state.row.parentElement;
    li.classList.add('swipe-host');
    let under = li.querySelector(':scope > .swipe-under');
    if (!under) {
      under = document.createElement('div');
      under.className = 'swipe-under';
      under.setAttribute('aria-hidden', 'true');
      under.innerHTML = `
        <span class="swipe-under__act swipe-under__act--repeat">${icon('refresh')}<span>Repeat today</span></span>
        <span class="swipe-under__act swipe-under__act--reverse"><span>Reverse</span>${icon('trash')}</span>`;
      li.prepend(under);
    }
    state.under = under;
    state.row.classList.add('is-swiping');
    swallowClick = state.row;
  }

  function end(wasSwipe, { cancelled = false } = {}) {
    const state = g;
    g = null;
    if (!state) return;
    if (!wasSwipe) {
      // A swipe that never started is a tap (or a scroll): the click is real.
      if (swallowClick === state.row && state.mode !== 'held') swallowClick = null;
      return;
    }

    const { row, armed, id } = state;
    const action = cancelled ? 0 : armed;
    springBack(row, state.under);
    if (action > 0) onRepeat?.(id, row);
    if (action < 0) onReverse?.(id, row);
  }

  function onClickCapture(event) {
    const row = rowOf(event.target);
    if (row && row === swallowClick) {
      event.preventDefault();
      event.stopPropagation();
    }
    swallowClick = null;
  }

  /* A right-click is the mouse's long-press. On a phone the browser's own
     long-press also fires contextmenu; it is refused so the system menu (copy
     link, select text) never opens over ours. */
  function onContext(event) {
    const row = rowOf(event.target);
    if (!row || !host.contains(row)) return;
    event.preventDefault();
    if (event.pointerType === 'mouse' || event.button === 2 || !('ontouchstart' in window)) {
      if (g?.mode === 'held') return;
      onMenu?.(row.dataset.edit, row);
    }
  }

  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove, { passive: false });
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onCancel);
  // Capture can be lost without a pointercancel (the page scrolled from under
  // the finger, a system gesture). The row must not stay pushed aside.
  // Only the ROW losing it counts: taking capture onto the row makes the child
  // that held the touch's implicit capture lose it first, and that is not an
  // end.
  const onLost = (event) => { if (g && event.target === g.row && g.mode === 'swipe') onCancel(event); };
  host.addEventListener('lostpointercapture', onLost);
  host.addEventListener('click', onClickCapture, true);
  host.addEventListener('contextmenu', onContext);

  return () => {
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerup', onUp);
    host.removeEventListener('pointercancel', onCancel);
    host.removeEventListener('lostpointercapture', onLost);
    host.removeEventListener('click', onClickCapture, true);
    host.removeEventListener('contextmenu', onContext);
  };
}

/**
 * The row returns home on a spring: --ease-snap overshoots a few px and
 * settles. The layer under it is removed once it has.
 */
function springBack(row, under) {
  row.classList.remove('is-swiping');
  row.classList.add('is-springing');
  row.style.transform = '';
  const done = () => {
    row.classList.remove('is-springing');
    under?.classList.remove('is-armed');
    under?.parentElement?.classList.remove('swipe-host');
    under?.remove();
  };
  if (reducedMotion()) { done(); return; }
  row.addEventListener('transitionend', done, { once: true });
  window.setTimeout(done, 600);   // no transition fired (display changed): still clean up
}

/**
 * Collapse a row out of the list - the reversed entry leaving. Resolves when
 * it has gone, so the caller can redraw without the list jumping first.
 */
export function collapseRow(row) {
  const li = row?.closest('li');
  if (!li) return Promise.resolve();
  if (reducedMotion()) { li.style.opacity = '0'; return new Promise((r) => window.setTimeout(r, 120)); }
  li.style.height = `${li.offsetHeight}px`;
  li.classList.add('is-collapsing');
  // Two frames: the fixed height has to be painted before it can transition.
  requestAnimationFrame(() => requestAnimationFrame(() => { li.style.height = '0px'; }));
  return new Promise((resolve) => {
    li.addEventListener('transitionend', () => resolve(), { once: true });
    window.setTimeout(resolve, 420);
  });
}
