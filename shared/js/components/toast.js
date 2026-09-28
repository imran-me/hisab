/**
 * Hisab · Toast
 *
 * Transient confirmation. Three rules it follows:
 *
 * 1. A toast is never the only place an outcome appears. The list already
 *    changed; the toast says so for the person who was looking elsewhere.
 * 2. It is announced through the shared live region, so a confirmation is not
 *    silent for a screen-reader user.
 * 3. It never covers the tab bar. See --tabbar-h in the stack's offset.
 */

import { el, announce, afterTransition, icon, esc } from '../core/dom.js';
import { haptic } from './haptics.js';

let stack = null;

function ensureStack() {
  if (stack && document.body.contains(stack)) return stack;
  stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'off' });
    // aria-live is 'off' on the container on purpose: announce() owns the
    // announcement. A live region here as well would read every toast twice.
    document.body.append(stack);
  }
  return stack;
}

const GLYPH = { good: 'check', bad: 'alert', warn: 'alert', info: 'info' };

/**
 * @param {string} message
 * @param {object} [opts]
 * @param {'good'|'bad'|'warn'|'info'} [opts.tone='info']
 * @param {number} [opts.duration]        ms; 0 keeps it until dismissed
 * @param {{label:string, onClick:Function}} [opts.action]  e.g. Undo
 */
export function toast(message, opts = {}) {
  const { tone = 'info', action = null } = opts;

  // A destructive action's Undo needs longer than a "Saved" does — six seconds
  // is roughly how long it takes to notice a mistake and reach for the button.
  const duration = opts.duration ?? (action ? 6000 : 3200);

  const node = el('div', { class: `toast toast--${tone}` });
  node.innerHTML = `
    ${icon(GLYPH[tone] || 'info', { class: 'icon toast__glyph' })}
    <div class="toast__body">${esc(message)}</div>
  `;

  if (action) {
    const button = el('button', { type: 'button', class: 'btn btn--ghost btn--sm toast__action' }, action.label);
    button.addEventListener('click', () => {
      // Dismissed before the callback runs: an Undo handler that re-renders the
      // list would otherwise leave this toast sitting over the restored row.
      dismiss(node);
      action.onClick();
    });
    node.append(button);
  }

  const close = el('button', {
    type: 'button',
    class: 'btn btn--icon btn--sm toast__close',
    'aria-label': 'Dismiss',
  });
  close.innerHTML = icon('close', { class: 'icon icon--sm' }).value;
  close.addEventListener('click', () => dismiss(node));
  node.append(close);

  // A toast with an action shows its time running out: a thin bar that
  // empties, so "Undo" is visibly a window that closes, not a button that
  // might still be there in a minute.
  if (action && duration > 0) {
    const bar = el('span', { class: 'toast__timer', 'aria-hidden': 'true' });
    bar.style.setProperty('--toast-life', `${duration}ms`);
    node.append(bar);
  }

  ensureStack().append(node);
  announce(message, { assertive: tone === 'bad' });
  if (tone === 'good') haptic('success');
  else if (tone === 'bad') haptic('error');

  swipeAway(node);

  if (duration > 0) {
    let timer = window.setTimeout(() => dismiss(node), duration);
    // Hovering or focusing pauses the countdown. Without this, a toast with an
    // Undo button can time out under the pointer that is reaching for it.
    const hold = () => { window.clearTimeout(timer); node.classList.add('is-held'); };
    const resume = () => { node.classList.remove('is-held'); timer = window.setTimeout(() => dismiss(node), 2000); };
    node.addEventListener('pointerenter', hold);
    node.addEventListener('focusin', hold);
    node.addEventListener('pointerleave', resume);
    node.addEventListener('focusout', resume);
  }

  return () => dismiss(node);
}

/**
 * A toast whose one job is to offer Undo.
 *
 *   toastUndo('Entry reversed', () => api.restore(id));
 *
 * Six seconds, a draining timer bar, and the Undo runs at most once.
 */
export function toastUndo(message, onUndo, opts = {}) {
  let used = false;
  return toast(message, {
    tone: 'good',
    ...opts,
    action: { label: opts.label || 'Undo', onClick: () => { if (used) return; used = true; haptic('tap'); onUndo?.(); } },
  });
}

/* Swipe a toast sideways (or down) to dismiss it: a toast over the thumb's
   next target should go with a flick, not by aiming at its 32px ×. */
function swipeAway(node) {
  let x0 = null;
  let y0 = 0;
  let dx = 0;
  node.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    x0 = event.clientX; y0 = event.clientY; dx = 0;
    node.setPointerCapture?.(event.pointerId);
    node.classList.add('is-dragging');
  });
  node.addEventListener('pointermove', (event) => {
    if (x0 === null) return;
    dx = event.clientX - x0;
    const dy = Math.max(0, event.clientY - y0);
    const d = Math.abs(dx) > dy ? dx : dy;
    node.style.setProperty('--swipe-x', `${Math.abs(dx) > dy ? dx : 0}px`);
    node.style.setProperty('--swipe-y', `${Math.abs(dx) > dy ? 0 : dy}px`);
    node.style.setProperty('--swipe-k', String(Math.min(1, Math.abs(d) / 160)));
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    node.classList.remove('is-dragging');
    const k = Number(node.style.getPropertyValue('--swipe-k') || 0);
    if (k > 0.45) { dismiss(node); return; }
    node.style.setProperty('--swipe-x', '0px');
    node.style.setProperty('--swipe-y', '0px');
    node.style.setProperty('--swipe-k', '0');
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
}

async function dismiss(node) {
  if (!node.isConnected || node.classList.contains('is-leaving')) return;
  node.classList.add('is-leaving');
  await afterTransition(node, 400);
  node.remove();
}

export const toastOk = (m, o) => toast(m, { ...o, tone: 'good' });
export const toastError = (m, o) => toast(m, { ...o, tone: 'bad' });
export const toastWarn = (m, o) => toast(m, { ...o, tone: 'warn' });

/**
 * The standard message for a failed api.js call.
 *
 * Centralised so every module says the same thing for the same failure, and so
 * the wording for 'offline' never implies data was lost when it was queued.
 */
export function toastFailure(result, fallback = 'Something went wrong.') {
  switch (result?.reason) {
    case 'offline': return toastWarn('You are offline. Saved on this device and will sync later.');
    case 'auth':    return toastError('Your session expired. Sign in again.');
    case 'stale':   return toastError('This page went stale. Reload and try again.');
    case 'rate':    return toastWarn('Too many attempts. Wait a moment and try again.');
    case 'missing': return toastError('That record no longer exists.');
    case 'invalid': return toastError(result.message || 'Check the highlighted fields.');
    default:        return toastError(fallback);
  }
}
