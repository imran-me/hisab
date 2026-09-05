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
 */

import { el, qs, icon, esc, delegate } from '../core/dom.js';
import { siteURL, currentPath } from '../core/paths.js';
import { on, EVENTS } from '../core/bus.js';
import * as state from '../core/state.js';
import { formatPeriod, shiftPeriod, currentPeriod } from '../core/dates.js';

/**
 * The five destinations on the phone tab bar.
 *
 * Five is the ceiling, not a coincidence: a sixth makes each target narrower
 * than a thumb at 360px. Everything else lives in the rail on a wide screen and
 * under Settings on a phone.
 *
 * `match` is a prefix rather than an exact path, so a detail page inside a
 * module keeps that module's tab lit.
 */
export const PRIMARY = [
  { id: 'overview',  label: 'Overview', icon: 'grid',        href: 'index.html',                        match: 'index.html' },
  { id: 'ledger',    label: 'Ledger',   icon: 'list',        href: 'modules/ledger/list.html',          match: 'modules/ledger/' },
  { id: 'accounts',  label: 'Accounts', icon: 'wallet',      href: 'modules/accounts/list.html',        match: 'modules/accounts/' },
  { id: 'insights',  label: 'Insights', icon: 'chart',       href: 'modules/reports/insights.html',     match: 'modules/reports/' },
  { id: 'vault',     label: 'Vault',    icon: 'shield-lock', href: 'modules/vault/list.html',           match: 'modules/vault/' },
];

/** Everything else. Rail-only on a wide screen; reachable from Settings on a phone. */
export const SECONDARY = [
  { id: 'business',    label: 'Business',   icon: 'briefcase', href: 'modules/business/list.html',      match: 'modules/business/' },
  { id: 'investments', label: 'Investments',icon: 'trend-up',  href: 'modules/investments/list.html',   match: 'modules/investments/' },
  { id: 'budgets',     label: 'Budgets',    icon: 'target',    href: 'modules/budgets/list.html',       match: 'modules/budgets/' },
  { id: 'categories',  label: 'Categories', icon: 'tag',       href: 'modules/categories/list.html',    match: 'modules/categories/' },
  { id: 'settings',    label: 'Settings',   icon: 'sliders',   href: 'modules/settings/index.html',     match: 'modules/settings/' },
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

function navLink(dest, current, { withLabel = true } = {}) {
  const isCurrent = dest.id === current;
  return `
    <a class="tab" href="${esc(siteURL(dest.href))}"${isCurrent ? ' aria-current="page"' : ''}>
      ${icon(dest.icon, { class: 'icon icon--lg' })}
      ${withLabel ? `<span class="tab__label">${esc(dest.label)}</span>` : ''}
    </a>`;
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

  const tabbar = qs('.tabbar');
  if (tabbar) {
    tabbar.innerHTML = PRIMARY.map((d) => navLink(d, current)).join('');
    tabbar.setAttribute('aria-label', 'Primary');
  }

  const rail = qs('.app-rail');
  if (rail) {
    rail.innerHTML = `
      <div class="rail__head">
        <a class="wordmark" href="${esc(siteURL('index.html'))}">Hisa<span class="wordmark__b">b</span></a>
      </div>
      ${PRIMARY.map((d) => navLink(d, current)).join('')}
      <div class="rail__group">
        <div class="label rail__group-label">More</div>
        ${SECONDARY.map((d) => navLink(d, current)).join('')}
      </div>
    `;
    rail.setAttribute('aria-label', 'Sections');
  }
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
 * The month stepper used at the top of the ledger, the dashboard and reports.
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
      <button type="button" class="btn btn--icon btn--sm" data-step="-1" aria-label="Previous month">
        ${icon('chevron-left', { class: 'icon' })}
      </button>
      <button type="button" class="period-stepper__label" data-open-picker>
        ${esc(formatPeriod(p))}
      </button>
      <button type="button" class="btn btn--icon btn--sm" data-step="1" aria-label="Next month"${atNow ? ' disabled' : ''}>
        ${icon('chevron-right', { class: 'icon' })}
      </button>
    `;
  };

  render();

  delegate(node, 'click', '[data-step]', (_event, button) => {
    const next = shiftPeriod(state.period(), Number(button.dataset.step));
    // Never step into the future. There is nothing there, and an empty month
    // that looks like a bug is worse than a disabled button.
    if (next > currentPeriod()) return;
    state.setPeriod(next);
  });

  on(EVENTS.PERIOD_CHANGED, render);
  return node;
}
