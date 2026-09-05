/**
 * Hisab · Boot
 *
 * Loaded by every page as `<script type="module" src="…/shared/js/main.js">`.
 * It does the work that is the same on every screen and then gets out of the
 * way; a page's own module script does the rest.
 *
 * What is deliberately NOT here: any data fetching, any module import. A page
 * that shows only accounts must not pay for the ledger's code, and this file is
 * the one place where that would quietly stop being true.
 */

import { siteURL, IS_FILE_PROTOCOL } from './core/paths.js';
import { applyTheme } from './core/state.js';
import { on, EVENTS } from './core/bus.js';
import { toastWarn } from './components/toast.js';

/**
 * Where the icon sprite lives, resolved once and read by dom.js's icon().
 *
 * A global rather than an import because icon() is called from inside template
 * strings all over the product and threading a base URL through every call site
 * would be noise on every one of them.
 */
window.HISAB_SPRITE = siteURL('shared/icons/sprite.svg');

/* The pre-paint block in each page's <head> has already set these attributes;
   this re-applies them from the same state module so the two can never drift,
   and so a preference changed in another tab is picked up on navigation. */
applyTheme();

/* Following the device when no explicit preference is stored. Without this
   listener, someone whose phone switches to dark at sunset keeps the day theme
   until they navigate. */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.hasAttribute('data-theme')) applyTheme();
});

/* Reveal-on-scroll. One observer for the whole page rather than one per
   element, and it unobserves after revealing — an element that has arrived has
   nothing left to watch for. */
function initReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    // No observer: show everything immediately. The animation is an
    // enhancement, and the content must never depend on it.
    targets.forEach((node) => node.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  }, {
    // A negative bottom margin means an element reveals slightly BEFORE it
    // reaches the fold, so it has finished animating by the time it is fully
    // in view rather than animating under the reader's eye.
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.05,
  });

  targets.forEach((node) => observer.observe(node));
}

/**
 * The compose button retracts while scrolling down and returns when scrolling
 * stops or reverses, so it never covers the row you are reading toward.
 *
 * The 40px threshold exists because a scroll of a few pixels — which is what a
 * finger resting on a list produces — should not move it at all.
 */
function initFab() {
  const fab = document.querySelector('.fab');
  if (!fab) return;

  let lastY = window.scrollY;
  let idle = null;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const delta = y - lastY;

    if (delta > 40 && y > 120) { fab.classList.add('is-tucked'); lastY = y; }
    else if (delta < -40) { fab.classList.remove('is-tucked'); lastY = y; }

    window.clearTimeout(idle);
    idle = window.setTimeout(() => fab.classList.remove('is-tucked'), 400);
  }, { passive: true });
}

/**
 * Connectivity, reported once rather than per failed request.
 *
 * The wording matters: nothing is lost when offline, it is queued, and a
 * message that implies otherwise makes people stop entering transactions —
 * which is the one failure mode this app cannot recover from.
 */
function initConnectivity() {
  on(EVENTS.OFFLINE, () => {
    toastWarn('Offline. Entries are saved on this device and sync when you reconnect.', { duration: 5000 });
  });
}

/**
 * Running from the filesystem changes the behaviour of ES modules, fetch and
 * crypto.subtle all at once, and the resulting errors name none of those
 * things. Saying it once, up front, saves the half hour.
 */
function warnFileProtocol() {
  if (!IS_FILE_PROTOCOL) return;
  console.warn(
    '[Hisab] Opened from the filesystem (file://). Module imports, fetch() and\n' +
    'the Web Crypto API used by the vault all behave differently or refuse to run.\n' +
    'Serve the folder instead:  python -m http.server 8000'
  );
}

function boot() {
  warnFileProtocol();
  initReveal();
  initFab();
  initConnectivity();
}

// DOMContentLoaded may already have fired: a module script is deferred by
// definition, so on a cached page this file can execute after the event. Both
// paths are needed, and only one of them will run.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
