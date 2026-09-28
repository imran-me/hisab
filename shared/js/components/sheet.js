/**
 * Hisab · Bottom sheet
 *
 * The primary way anything is created or edited on a phone. Built on <dialog>
 * with showModal(), which gives four things that are genuinely hard to
 * reproduce by hand and are wrong in most hand-rolled modals:
 *
 *   · a real focus trap, including into and out of shadow content
 *   · Escape handling that respects nesting
 *   · inert-ing of the rest of the page for assistive technology
 *   · top-layer stacking, so it is not positioned against a transformed
 *     ancestor — the bug that eventually breaks every fixed-position modal
 *
 * What is added on top: drag-to-dismiss, body scroll locking that actually
 * works on iOS, and returning focus to whatever opened it.
 */

import { el, icon, esc, afterTransition, qs } from '../core/dom.js';
import { haptic } from './haptics.js';

/** Set while a sheet is open, so nested opens do not each lock the body. */
let openCount = 0;
let scrollY = 0;

function lockBody() {
  if (openCount > 0) { openCount += 1; return; }
  openCount = 1;
  scrollY = window.scrollY;
  // position:fixed on the body is the only thing that reliably stops iOS
  // Safari scrolling the page behind an overlay. overflow:hidden alone does
  // not, and body{touch-action:none} kills scrolling inside the sheet too.
  document.documentElement.style.setProperty('--scroll-lock-top', `-${scrollY}px`);
  document.body.classList.add('is-locked');
}

function unlockBody() {
  openCount = Math.max(0, openCount - 1);
  if (openCount > 0) return;
  document.body.classList.remove('is-locked');
  document.documentElement.style.removeProperty('--scroll-lock-top');
  // Instant, not smooth: an animated scroll back to where you were reads as
  // the page jumping on its own after the sheet has already gone.
  window.scrollTo({ top: scrollY, behavior: 'instant' });
}

/**
 * Open a sheet.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string|Node} opts.body        markup string (already escaped) or a node
 * @param {boolean} [opts.dismissible=true]  false for a step that must be finished
 * @param {Function} [opts.onOpen]       receives the sheet element
 * @param {Function} [opts.onClose]      receives the close reason
 * @returns {{el: HTMLDialogElement, close: Function}}
 */
export function openSheet(opts) {
  const { title, body, dismissible = true, onOpen, onClose } = opts;

  const opener = document.activeElement;

  const sheet = el('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
  sheet.innerHTML = `
    ${dismissible ? '<div class="sheet__grip" aria-hidden="true"></div>' : ''}
    <header class="sheet__head">
      <h2 class="sheet__title" id="sheet-title">${esc(title)}</h2>
      ${dismissible ? `<button type="button" class="btn btn--icon btn--sm" data-sheet-close aria-label="Close">${icon('close', { class: 'icon' })}</button>` : ''}
    </header>
    <div class="sheet__body"></div>
  `;

  const bodyHost = qs('.sheet__body', sheet);
  if (body instanceof Node) bodyHost.append(body);
  else if (body && body.__raw) bodyHost.innerHTML = body.value;
  else bodyHost.innerHTML = String(body ?? '');

  document.body.append(sheet);

  let closing = false;
  async function close(reason = 'dismissed') {
    if (closing) return;
    closing = true;
    sheet.classList.add('is-closing');
    // A <dialog> stops rendering the instant close() is called, so it would
    // vanish rather than animate. The class drives the exit animation and the
    // element is only closed once that has finished.
    await afterTransition(sheet, 400);
    untrackKeyboard();
    sheet.close();
    sheet.remove();
    unlockBody();
    // Focus goes back where it came from. Without this, dismissing a sheet
    // leaves focus on <body> and the next Tab starts from the top of the page.
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    onClose?.(reason);
  }

  sheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-sheet-close]')) { close('closed'); return; }
    // A click on the dialog element itself — as opposed to on its contents —
    // is a click on the backdrop, because the padding is on inner elements.
    if (dismissible && event.target === sheet) close('backdrop');
  });

  sheet.addEventListener('cancel', (event) => {
    // Escape. Prevented and re-routed through close() so the exit animation and
    // the focus restore both still happen.
    event.preventDefault();
    if (dismissible) close('escape');
  });

  lockBody();
  sheet.showModal();
  if (dismissible) attachDrag(sheet, close);
  const untrackKeyboard = trackKeyboard(sheet);

  // Focus the first real control rather than letting the browser land on the
  // close button, which is the first tabbable node and the least useful one.
  const first = sheet.querySelector('[data-autofocus], input:not([type=hidden]), select, textarea');
  if (first) first.focus({ preventScroll: true });

  onOpen?.(sheet);
  return { el: sheet, close };
}

/**
 * Drag the sheet down to dismiss.
 *
 * The sheet follows the finger 1:1 and the scrim fades with it. Let go past a
 * third of the sheet (or 120px), or flick it down, and it carries on down and
 * closes; let go short of that and it springs back (DIRECTION §3.6). Crossing
 * the line gives one haptic tick, so a thumb knows before it lets go.
 *
 * Where the drag can start:
 *   · the grip and the header: always (touch-action: none, pointer events);
 *   · the body: only when it is scrolled to the top and the finger moves
 *     DOWN, and never from a field. Otherwise dragging down in a long form
 *     would close it instead of scrolling it, which is the single most
 *     annoying way to lose a half-typed transaction. The body needs touch
 *     events, not pointer events: the browser claims a pointer the moment the
 *     body might scroll, and a non-passive touchmove is the only way to keep
 *     the gesture.
 *
 * The drag moves the sheet with the `translate` property, not `transform`,
 * because the open animation's fill holds `transform` and would override it.
 */
function attachDrag(sheet, close) {
  const grip = qs('.sheet__grip', sheet);
  const head = qs('.sheet__head', sheet);
  const body = qs('.sheet__body', sheet);
  if (!grip) return;

  let startY = 0;
  let dy = 0;
  let dragging = false;
  let armed = false;
  let samples = [];

  const limit = () => Math.min(120, sheet.offsetHeight / 3);

  const begin = (y) => {
    dragging = true;
    startY = y;
    dy = 0;
    armed = false;
    samples = [[performance.now(), y]];
    sheet.classList.add('is-dragging');
  };

  const follow = (y) => {
    const raw = y - startY;
    // Upward is a small rubber band, not a movement: the sheet has nowhere
    // to go up to, and saying so is better than ignoring the finger.
    dy = raw >= 0 ? raw : Math.max(-14, raw * 0.2);
    sheet.style.setProperty('--drag-y', `${dy}px`);
    sheet.style.setProperty('--drag-k', String(Math.max(0, Math.min(1, dy / (sheet.offsetHeight || 1)))));
    samples.push([performance.now(), y]);
    if (samples.length > 5) samples.shift();
    const nowArmed = dy > limit();
    if (nowArmed !== armed) { armed = nowArmed; if (armed) haptic('drag'); }
  };

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const [t0, y0] = samples[0];
    const [t1, y1] = samples[samples.length - 1];
    const velocity = (y1 - y0) / Math.max(1, t1 - t0);   // px per ms, down is positive
    if (dy > limit() || (velocity > 0.6 && dy > 24)) {
      close('drag');   // --drag-y stays where it is: the exit carries on from the finger
      return;
    }
    sheet.style.setProperty('--drag-y', '0px');
    sheet.style.setProperty('--drag-k', '0');
  };

  /* Grip and header: pointer events, the gesture is ours outright. */
  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    begin(event.clientY);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  for (const zone of [grip, head]) {
    if (!zone) continue;
    zone.addEventListener('pointerdown', onPointerDown);
    zone.addEventListener('pointermove', (event) => { if (dragging) follow(event.clientY); });
    zone.addEventListener('pointerup', finish);
    zone.addEventListener('pointercancel', finish);
  }

  /* The body: touch, and only a downward pull from the top. */
  let touchY = null;
  body.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || body.scrollTop > 0) { touchY = null; return; }
    if (event.target.closest('input, select, textarea, [contenteditable], .scroll-x, [data-no-drag]')) { touchY = null; return; }
    touchY = event.touches[0].clientY;
  }, { passive: true });
  body.addEventListener('touchmove', (event) => {
    if (touchY === null) return;
    const y = event.touches[0].clientY;
    if (!dragging) {
      if (y < touchY || body.scrollTop > 0) { touchY = null; return; }
      if (y - touchY < 6) return;
      begin(touchY);
    }
    event.preventDefault();   // the page is not to scroll or bounce under a drag
    follow(y);
  }, { passive: false });
  body.addEventListener('touchend', () => { touchY = null; finish(); });
  body.addEventListener('touchcancel', () => { touchY = null; finish(); });
}

/**
 * Keep a sheet above the on-screen keyboard.
 *
 * Chrome on Android resizes only the VISUAL viewport when the keyboard opens,
 * so a sheet fixed to the bottom of the layout viewport sits under the keys,
 * Save button and all. visualViewport says how much of the screen is left;
 * the gap becomes --kb, which lifts the sheet and shortens its cap.
 */
function trackKeyboard(sheet) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const update = () => {
    const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    sheet.style.setProperty('--kb', `${Math.round(gap)}px`);
    sheet.classList.toggle('has-keyboard', gap > 80);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}

/**
 * A confirm dialog that resolves to true or false.
 *
 * Not dismissible by the backdrop when destructive: confirming a delete must be
 * a deliberate act, and a stray tap outside is not one.
 */
export function confirmDialog({ title, text, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const dialog = el('dialog', { class: 'dialog' });
    dialog.innerHTML = `
      <h2 class="dialog__title">${esc(title)}</h2>
      <p class="dialog__text">${esc(text)}</p>
      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" data-act="cancel">${esc(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="confirm">${esc(confirmLabel)}</button>
      </div>
    `;
    document.body.append(dialog);

    const settle = (value) => {
      dialog.close();
      dialog.remove();
      unlockBody();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      resolve(value);
    };

    dialog.addEventListener('click', (event) => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act) settle(act === 'confirm');
      else if (!danger && event.target === dialog) settle(false);
    });

    dialog.addEventListener('cancel', (event) => { event.preventDefault(); settle(false); });

    lockBody();
    dialog.showModal();
    // Cancel is focused, not confirm — so a reflexive Enter on a destructive
    // dialog does nothing rather than deleting something.
    qs('[data-act="cancel"]', dialog).focus({ preventScroll: true });
  });
}
