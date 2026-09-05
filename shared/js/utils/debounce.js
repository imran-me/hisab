/**
 * Hisab · debounce and throttle
 */

/**
 * Run `fn` only once the calls have stopped for `wait` ms.
 *
 * Used on search input. A search that re-renders four hundred rows on every
 * keystroke drops characters on a mid-range phone, because the keypress and the
 * render compete for the same thread.
 *
 * The returned function carries `.cancel()`, which matters more than it looks:
 * a debounced handler on a component that is torn down mid-wait would otherwise
 * fire against a detached DOM a quarter of a second later.
 */
export function debounce(fn, wait = 200) {
  let timer = null;
  const debounced = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => window.clearTimeout(timer);
  /** Run now, cancelling the pending call — for a form submit that should not
   *  wait out the debounce it just interrupted. */
  debounced.flush = (...args) => { window.clearTimeout(timer); fn(...args); };
  return debounced;
}

/**
 * Run `fn` at most once per animation frame.
 *
 * For scroll and resize handlers. Not a time-based throttle: the useful unit
 * for anything that writes a style is the frame, and a 16ms timer drifts
 * against the frame clock so some frames get two calls and some get none.
 */
export function onFrame(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}
