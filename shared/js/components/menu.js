/**
 * Hisab · Anchored menu
 *
 * Row actions, the sort picker, the account switcher. A popover anchored to the
 * button that opened it.
 *
 * The whole difficulty of this component is the flip. A menu opened from a row
 * near the bottom of a long list opens downward off the screen, and on a phone
 * that means the menu is simply unreachable — you cannot scroll to it because
 * it is fixed. So it is measured after being made visible and moved above the
 * trigger when it does not fit below.
 */

import { el, qs, icon, esc } from '../core/dom.js';

let openMenu = null;

/**
 * @param {HTMLElement} anchor          the button that opened it
 * @param {Array} items                 { label, icon?, danger?, onClick } or { separator: true }
 * @param {object} [opts]
 * @param {'start'|'end'} [opts.align='end']
 */
export function openMenu_(anchor, items, opts = {}) {
  closeMenu();

  const { align = 'end' } = opts;
  const menu = el('div', { class: 'menu', role: 'menu' });

  menu.innerHTML = items.map((item, i) => {
    if (item.separator) return '<div class="menu__sep" role="separator"></div>';
    return `
      <button type="button" role="menuitem" class="menu__item${item.danger ? ' menu__item--danger' : ''}" data-index="${i}">
        ${item.icon ? icon(item.icon, { class: 'icon icon--sm' }) : ''}
        <span>${esc(item.label)}</span>
      </button>`;
  }).join('');

  document.body.append(menu);

  // Measured only after it is in the DOM. getBoundingClientRect on a detached
  // node returns zeros, and positioning from zeros puts every menu in the
  // top-left corner — which looks like a CSS bug and is not one.
  const rect = anchor.getBoundingClientRect();
  const size = menu.getBoundingClientRect();
  const gap = 6;
  const margin = 8;

  const spaceBelow = window.innerHeight - rect.bottom;
  const flipUp = spaceBelow < size.height + gap + margin && rect.top > spaceBelow;

  let top = flipUp ? rect.top - size.height - gap : rect.bottom + gap;
  let left = align === 'end' ? rect.right - size.width : rect.left;

  // Clamp inside the viewport on both axes. A menu opened from a row action at
  // the far right of a 360px screen otherwise sits half off the edge.
  left = Math.max(margin, Math.min(left, window.innerWidth - size.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - size.height - margin));

  menu.style.setProperty('--menu-top', `${top}px`);
  menu.style.setProperty('--menu-left', `${left}px`);
  menu.style.setProperty('--menu-origin', flipUp ? 'bottom' : 'top');

  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    const item = items[Number(button.dataset.index)];
    closeMenu();
    item?.onClick?.();
  });

  // Keyboard. A menu that can be opened from a keyboard and not navigated from
  // one is worse than no menu, because focus is now somewhere invisible.
  menu.addEventListener('keydown', (event) => {
    const focusable = [...menu.querySelectorAll('[role="menuitem"]')];
    const at = focusable.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); focusable[(at + 1) % focusable.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusable[(at - 1 + focusable.length) % focusable.length]?.focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); closeMenu(); anchor.focus(); }
    else if (event.key === 'Tab') closeMenu();
  });

  openMenu = { menu, anchor };
  qs('[role="menuitem"]', menu)?.focus({ preventScroll: true });

  // Deferred by a frame: the click that OPENED the menu is still propagating,
  // and a listener added synchronously catches it and closes immediately.
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('scroll', closeMenu, { passive: true, capture: true });
    window.addEventListener('resize', closeMenu);
  });

  return closeMenu;
}

function onOutside(event) {
  if (!openMenu) return;
  if (openMenu.menu.contains(event.target) || openMenu.anchor.contains(event.target)) return;
  closeMenu();
}

export function closeMenu() {
  if (!openMenu) return;
  openMenu.menu.remove();
  openMenu = null;
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('scroll', closeMenu, { capture: true });
  window.removeEventListener('resize', closeMenu);
}

export { openMenu_ as menu };
