/**
 * Hisab · Path resolution
 *
 * Pages live at three different depths — `/index.html`, `/modules/ledger/list.html`,
 * `/modules/vault/entry.html` — but they all reference the same shared assets and
 * the same JSON fixtures. A relative path is therefore wrong for at least two of
 * them, and a root-absolute path ("/shared/…") is wrong the moment the app is
 * served from a subdirectory, which is exactly how it is opened locally and how
 * a staging copy sits on Hostinger.
 *
 * So the site root is DERIVED, once, from this module's own URL. This file is
 * known to live at <root>/shared/js/core/paths.js, so stripping that suffix from
 * import.meta.url gives the root under any of those conditions — including a
 * `file://` double-click, where every other method fails.
 */

/** <root>/ — always with a trailing slash. */
export const SITE_ROOT = new URL('../../../', import.meta.url).href;

/**
 * Absolute URL for a path relative to the site root.
 *
 *   siteURL('shared/icons/sprite.svg')
 *   siteURL('modules/ledger/data/seed.json')
 *
 * A leading slash is tolerated and stripped, because it is the mistake
 * everyone makes on the first call and silently resolves to the domain root.
 */
export function siteURL(path = '') {
  return new URL(String(path).replace(/^\/+/, ''), SITE_ROOT).href;
}

/**
 * The path of the current page relative to the site root, without a leading
 * slash: 'index.html', 'modules/ledger/list.html'.
 *
 * Used by the navigation to decide which tab is current. A directory URL
 * ('/modules/ledger/') normalises to its index.html so both spellings of the
 * same page match the same tab.
 */
export function currentPath() {
  const here = window.location.href.split(/[?#]/)[0];
  let rel = here.startsWith(SITE_ROOT) ? here.slice(SITE_ROOT.length) : here;
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return rel;
}

/**
 * The module the current page belongs to, or null on a root page.
 * 'modules/ledger/list.html' -> 'ledger'
 */
export function currentModule() {
  const m = /^modules\/([^/]+)\//.exec(currentPath());
  return m ? m[1] : null;
}

/**
 * True when the app is running from the filesystem rather than a server.
 *
 * Worth knowing: ES modules, fetch() and the Web Crypto API all behave
 * differently — or refuse to run at all — under file://, so the boot sequence
 * warns once rather than failing in five places with unrelated errors.
 */
export const IS_FILE_PROTOCOL = window.location.protocol === 'file:';

/**
 * Where the Laravel API lives.
 *
 * Same origin by default, which is the deployed arrangement: `public/` is the
 * document root and the API is under `/api` on that same host. It is
 * overridable from the page for the split-origin case (a static frontend on
 * one host, the API on another) via <meta name="hisab:api" content="…">, and
 * that meta tag is the ONLY supported way to change it — a hardcoded URL in a
 * module's api.js is how a staging build ends up writing to production.
 */
export function apiBase() {
  const meta = document.querySelector('meta[name="hisab:api"]');
  const configured = meta && meta.getAttribute('content');
  if (configured) return configured.replace(/\/+$/, '');
  return new URL('api', SITE_ROOT).href.replace(/\/+$/, '');
}
