/**
 * Hisab · App shell
 *
 * Renders the header, the phone tab bar and the desktop rail from ONE
 * destination list. The two navigations are separate elements — a phone shows
 * the tab bar and hides the rail, and vice versa — but they are generated from
 * the same source, so a route cannot exist in one and be missing from the
 * other.
 *
 * They are NOT the same element moved by JS on resize. Moving a focused node
 * between containers drops focus and makes a screen reader re-announce the
 * whole navigation, which happens on every rotation of a phone.
 *
 * The phone bar is  Home · Ledger · [ + ] · Accounts · More  (DIRECTION §3.2).
 * + is the only way to add an entry; More opens a sheet, not a page.
 */

import { el, qs, icon, esc, delegate } from '../core/dom.js';
import { siteURL, currentPath } from '../core/paths.js';
import { on, emit, hasListeners, EVENTS } from '../core/bus.js';
import * as state from '../core/state.js';
import { formatPeriod, shiftPeriod, currentPeriod } from '../core/dates.js';
import { session, signOut } from '../core/session.js';
import { openSheet } from './sheet.js';
import { menu } from './menu.js';
import { toast } from './toast.js';
import { openMonthGrid } from './month-grid.js';

// Re-exported so a page that shows a month name can open the same picker
// from the shell it already imports.
export { openMonthGrid };

/**
 * The destinations on the phone tab bar, either side of +.
 *
 * Four plus + is the ceiling, not a coincidence: a sixth slot makes each
 * target narrower than a thumb at 360px.
 *
 * `match` is a prefix rather than an exact path, so a detail page inside a
 * module keeps that module's tab lit.
 */
export const PRIMARY = [
  { id: 'overview',  label: 'Home',     icon: 'home',   href: 'index.html',                 match: 'index.html' },
  { id: 'ledger',    label: 'Ledger',   icon: 'list',   href: 'modules/ledger/list.html',   match: 'modules/ledger/' },
  { id: 'accounts',  label: 'Accounts', icon: 'wallet', href: 'modules/accounts/list.html', match: 'modules/accounts/' },
];

/**
 * Everything else: the More sheet on a phone, the lower group of the rail.
 *
 * ONLY DESTINATIONS THAT ARE BUILT. A page that says "not built yet" is not
 * listed, so nobody taps into a dead end. A track that ships a destination
 * adds its own single line here (DIRECTION §4, the one shared exception) —
 * Month, Business, Investments, Budgets and Categories arrive that way.
 */
export const SECONDARY = [
  { id: 'vault',     label: 'Vault',    icon: 'shield-lock', href: 'modules/vault/list.html',     match: 'modules/vault/',    note: 'Cards, logins, keys — encrypted' },
  { id: 'settings',  label: 'Settings', icon: 'sliders',     href: 'modules/settings/index.html', match: 'modules/settings/', note: 'Theme, currency, demo data' },
];

/** The four entry types + can open, in the order the long-press menu lists them. */
const COMPOSE_TYPES = [
  { type: 'expense',  label: 'Out — an expense',   icon: 'arrow-out' },
  { type: 'income',   label: 'In — income',        icon: 'arrow-in' },
  { type: 'deposit',  label: 'Save — a deposit',   icon: 'arrow-hold' },
  { type: 'transfer', label: 'Move — a transfer',  icon: 'arrow-move' },
];

/** Which destination the current page belongs to. */
function activeId(path = currentPath()) {
  const all = [...PRIMARY, ...SECONDARY];
  // Longest match wins, so 'modules/ledger/' beats a bare 'index.html' for a
  // page that happens to be modules/ledger/index.html.
  const hit = all
    .filter((d) => path === d.match || path.startsWith(d.match))
    .sort((a, b) => b.match.length - a.match.length)[0];
  return hit?.id ?? null;
}

function navLink(dest, current) {
  const isCurrent = dest.id === current;
  return `
    <a class="tab" href="${esc(siteURL(dest.href))}"${isCurrent ? ' aria-current="page"' : ''}>
      ${icon(dest.icon, { class: 'icon icon--lg' })}
      <span class="tab__label">${esc(dest.label)}</span>
    </a>`;
}

/**
 * The raised + in the middle of the bar. A button, not a link: what it does
 * depends on the page (open the sheet here, or go to the Ledger to open it).
 */
function composeButton({ rail = false } = {}) {
  return `
    <button type="button" class="${rail ? 'tab tab--compose-rail' : 'tab tab--compose'}" data-shell-compose
            aria-label="Add an entry" aria-haspopup="menu" aria-describedby="compose-hint">
      <span class="tab__plus">${icon('plus', { class: 'icon icon--lg' })}</span>
      ${rail ? '<span class="tab__label">Add an entry</span>' : ''}
    </button>`;
}

function moreButton(current) {
  const inMore = SECONDARY.some((d) => d.id === current);
  return `
    <button type="button" class="tab" data-shell-more aria-haspopup="dialog"${inMore ? ' data-current' : ''}>
      ${icon('dots', { class: 'icon icon--lg' })}
      <span class="tab__label">More</span>
    </button>`;
}

/**
 * Build the shell into the page.
 *
 * The page's own markup provides three empty landmarks — <header class="app-header">,
 * <nav class="app-rail">, <nav class="tabbar"> — and this fills them. They are
 * in the HTML rather than created here so that the page still has its landmark
 * structure with JavaScript disabled, and so the grid does not reflow when the
 * script arrives.
 */
export function mountShell({ title, back = null, actions = '' } = {}) {
  const current = activeId();

  const header = qs('.app-header');
  if (header) {
    header.innerHTML = `
      <div class="app-header__lead">
        ${back
          ? `<a class="btn btn--icon" href="${esc(siteURL(back))}" aria-label="Back">${icon('chevron-left', { class: 'icon' })}</a>`
          : `<a class="wordmark" href="${esc(siteURL('index.html'))}" aria-label="Hisab, home">Hisa<span class="wordmark__b">b</span></a>`}
      </div>
      <h1 class="app-header__title">${esc(title || '')}</h1>
      <div class="app-header__actions">${actions}</div>
      <div class="app-header__progress" aria-hidden="true"></div>
    `;
    attachScrollProgress(header);
  }

  const [home, ledger, accounts] = PRIMARY;
  const tabbar = qs('.tabbar');
  if (tabbar) {
    tabbar.innerHTML = `
      ${navLink(home, current)}
      ${navLink(ledger, current)}
      ${composeButton()}
      ${navLink(accounts, current)}
      ${moreButton(current)}
      <span class="sr-only" id="compose-hint">Hold for income, a deposit or a transfer.</span>
    `;
    tabbar.setAttribute('aria-label', 'Primary');
  }

  const rail = qs('.app-rail');
  if (rail) {
    rail.innerHTML = `
      <div class="rail__head">
        <a class="wordmark" href="${esc(siteURL('index.html'))}">Hisa<span class="wordmark__b">b</span></a>
      </div>
      ${composeButton({ rail: true })}
      ${PRIMARY.map((d) => navLink(d, current)).join('')}
      <div class="rail__group">
        <div class="label rail__group-label">More</div>
        ${SECONDARY.map((d) => navLink(d, current)).join('')}
      </div>
    `;
    rail.setAttribute('aria-label', 'Sections');
  }

  wireCompose();
  wireMore();
}

/* =========================================================================
   + — ask for an entry sheet
   ========================================================================= */

/**
 * Ask whoever owns the entry sheet on this page to open it.
 *
 * Three ways it can be answered, in order:
 *
 * 1. Something listens for EVENTS.COMPOSE (the ledger's mountCompose()).
 * 2. The page still has its own compose trigger from before the bar existed
 *    ([data-compose], the old header Out/In and floating Add). It is clicked,
 *    so + works on those pages today. This bridge goes once B1 and C2 have
 *    moved every page to mountCompose().
 * 3. Nothing on this page can open the sheet: go to the Ledger and ask there
 *    (?compose=<type>).
 */
export function compose(type = 'expense') {
  if (hasListeners(EVENTS.COMPOSE)) {
    emit(EVENTS.COMPOSE, { type });
    return;
  }

  const legacy = document.querySelector(`[data-compose="${type}"]`)
    || (type === 'expense' ? document.querySelector('[data-compose="expense"], [data-compose=""]') : null);
  if (legacy) { legacy.click(); return; }

  const url = new URL(siteURL('modules/ledger/list.html'));
  // ?compose=<type>: the ledger's mountCompose() reads the type from it, and
  // treats any value that is not a type (the home-screen shortcut's '1') as
  // the default.
  url.searchParams.set('compose', type);
  window.location.assign(url.href);
}

/**
 * Tap: an expense, the common case by a distance. Hold (or drag upward off
 * the button): the other three types. The hold is never the only way — the
 * sheet itself has the Out / In / Save / Move switch.
 */
function wireCompose() {
  const HOLD_MS = 420;

  for (const button of document.querySelectorAll('[data-shell-compose]')) {
    let timer = null;
    let startY = 0;
    let held = false;

    const offerTypes = () => {
      held = true;
      window.clearTimeout(timer);
      navigator.vibrate?.(8);
      // Anchored to the raised square, not the slot, so the menu opens above
      // the + rather than over it.
      menu(qs('.tab__plus', button) || button, COMPOSE_TYPES.map((t) => ({
        label: t.label, icon: t.icon, onClick: () => compose(t.type),
      })), { align: 'center' });
    };

    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      held = false;
      startY = event.clientY;
      timer = window.setTimeout(offerTypes, HOLD_MS);
    });
    button.addEventListener('pointermove', (event) => {
      if (timer && !held && startY - event.clientY > 24) offerTypes();
    });
    const cancel = () => { window.clearTimeout(timer); timer = null; };
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('pointerleave', cancel);

    // A long press on Android also raises the context menu; it has nothing to
    // offer on a button.
    button.addEventListener('contextmenu', (event) => event.preventDefault());

    button.addEventListener('click', (event) => {
      // The click that ends a hold must not ALSO open an expense.
      if (held) { held = false; event.preventDefault(); return; }
      compose('expense');
    });
  }
}

/* =========================================================================
   More — a sheet, not a page
   ========================================================================= */

function wireMore() {
  const button = qs('[data-shell-more]');
  if (!button) return;
  button.addEventListener('click', openMore);
}

export function openMore() {
  const current = activeId();
  const body = el('div', { class: 'more' });
  body.innerHTML = `
    <ul class="list more__list">
      ${SECONDARY.map((d) => `
        <li>
          <a class="row" href="${esc(siteURL(d.href))}"${d.id === current ? ' aria-current="page"' : ''}>
            <span class="row__glyph${d.id === 'vault' ? ' row__glyph--vault' : ''}">${icon(d.icon, { class: 'icon' })}</span>
            <span class="row__main">
              <span class="row__title">${esc(d.label)}</span>
              ${d.note ? `<span class="row__sub"><span>${esc(d.note)}</span></span>` : ''}
            </span>
            ${icon('chevron-right', { class: 'icon icon--sm row__chev' })}
          </a>
        </li>`).join('')}
    </ul>
    <div class="more__account" data-more-account hidden>
      <span class="more__who">
        <span class="label">Signed in</span>
        <span class="more__email" data-more-email></span>
      </span>
      <button type="button" class="btn btn--secondary btn--sm" data-more-sign-out>Sign out</button>
    </div>
  `;

  openSheet({ title: 'More', body });

  // The account block fills in when the session answers. Hidden until then,
  // and hidden for good on a device with no server behind it — there is
  // nothing to sign out of.
  session().then((s) => {
    if (!s.authenticated) return;
    qs('[data-more-email]', body).textContent = s.user?.email ?? '';
    qs('[data-more-account]', body).hidden = false;
  }).catch(() => {});

  qs('[data-more-sign-out]', body).addEventListener('click', async () => {
    const res = await signOut();
    if (!res.ok && res.reason !== 'offline') {
      toast('Could not sign out. Try again.');
      return;
    }
    // replace(), not assign(): Back after signing out must not return to a
    // page rendered while signed in.
    window.location.replace(siteURL('modules/auth/login.html'));
  });
}

/**
 * The 2px rule along the header's bottom edge.
 *
 * On a long transaction list this is the only indication of position once the
 * scrollbar auto-hides. Written to a custom property rather than to style.width
 * so the CSS owns the appearance.
 *
 * Throttled through requestAnimationFrame: a scroll listener that writes a
 * style on every event forces layout on every frame of a flick, which is
 * exactly when it is most visible.
 */
function attachScrollProgress(header) {
  const bar = qs('.app-header__progress', header);
  if (!bar) return;

  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    // A page shorter than the viewport has no progress to report, and dividing
    // by zero would paint a full bar on every short page.
    const pct = max > 40 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    header.style.setProperty('--scroll-progress', `${pct}%`);
  };

  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });

  update();
}

/**
 * The month stepper used at the top of the Ledger, and anywhere else a screen
 * is "one month of something".
 *
 * ‹  September 2026 ⌄  ›   — the arrows step, the name opens the month grid,
 * and a horizontal swipe across the stepper steps too (left = next month,
 * the way a page turns). The arrows stay: a swipe is never the only way.
 *
 * Returns a node rather than writing to a container, so the caller decides
 * where it goes. It reads and writes app state directly, which is the one thing
 * every screen showing it agrees on.
 */
export function periodStepper() {
  const node = el('div', { class: 'period-stepper' });

  const render = () => {
    const p = state.period();
    const atNow = p >= currentPeriod();
    node.innerHTML = `
      <button type="button" class="btn btn--icon" data-step="-1" aria-label="Previous month">
        ${icon('chevron-left', { class: 'icon' })}
      </button>
      <button type="button" class="period-stepper__label" data-open-picker aria-haspopup="dialog" aria-label="${esc(formatPeriod(p))}, choose a month">
        <span>${esc(formatPeriod(p))}</span>
        ${icon('chevron-down', { class: 'icon icon--sm' })}
      </button>
      <button type="button" class="btn btn--icon" data-step="1" aria-label="Next month"${atNow ? ' disabled' : ''}>
        ${icon('chevron-right', { class: 'icon' })}
      </button>
    `;
  };

  render();

  const step = (n) => {
    const next = shiftPeriod(state.period(), n);
    // Never step into the future. There is nothing there, and an empty month
    // that looks like a bug is worse than a disabled button.
    if (next > currentPeriod()) return;
    state.setPeriod(next);
  };

  delegate(node, 'click', '[data-step]', (_event, button) => step(Number(button.dataset.step)));
  delegate(node, 'click', '[data-open-picker]', () => openMonthGrid());
  attachSwipe(node, step);

  on(EVENTS.PERIOD_CHANGED, render);
  return node;
}

/**
 * A horizontal swipe on `node` calls step(+1) or step(-1).
 *
 * Only a swipe that is clearly sideways counts (48px across, and more across
 * than down), so a vertical scroll that starts on the stepper still scrolls.
 * touch-action: pan-y in the CSS hands the vertical axis to the browser and
 * keeps the horizontal one for this.
 */
export function attachSwipe(node, step) {
  let x0 = null;
  let y0 = 0;

  node.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    x0 = event.clientX;
    y0 = event.clientY;
  });

  const end = (event) => {
    if (x0 === null) return;
    const dx = event.clientX - x0;
    const dy = event.clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    step(dx < 0 ? 1 : -1);
  };

  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', () => { x0 = null; });
}
