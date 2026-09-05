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
 * Pointer events rather than touch events, so a trackpad drag and a stylus work
 * too. The gesture starts only on the grip or on a body that is already
 * scrolled to the top — otherwise dragging down inside a long form would
 * dismiss the sheet instead of scrolling it, which is the single most annoying
 * way to lose a half-typed transaction.
 */
function attachDrag(sheet, close) {
  const grip = qs('.sheet__grip', sheet);
  const body = qs('.sheet__body', sheet);
  if (!grip) return;

  let startY = 0;
  let dragging = false;

  const start = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const fromGrip = event.target.closest('.sheet__grip');
    if (!fromGrip && body.scrollTop > 0) return;
    dragging = true;
    startY = event.clientY;
    sheet.classList.add('is-dragging');
    sheet.setPointerCapture?.(event.pointerId);
  };

  const move = (event) => {
    if (!dragging) return;
    const dy = Math.max(0, event.clientY - startY);   // downward only
    sheet.style.setProperty('--drag-y', `${dy}px`);
  };

  const end = (event) => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const dy = Math.max(0, event.clientY - startY);
    sheet.style.removeProperty('--drag-y');
    // A third of the sheet's height, or any drag past 120px. A pure pixel
    // threshold dismisses a tall sheet too easily and a short one not at all.
    if (dy > Math.min(120, sheet.offsetHeight / 3)) close('drag');
  };

  grip.addEventListener('pointerdown', start);
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
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
