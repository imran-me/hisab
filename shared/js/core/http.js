/**
 * Hisab · HTTP
 *
 * The single place this app talks to a server. Every module's `backend/api.js`
 * calls through here; no page-level script ever does.
 *
 * THE RESULT SHAPE IS THE POINT OF THIS FILE.
 *
 * Every call resolves — it never rejects — to one of:
 *
 *   { ok: true,  data }
 *   { ok: false, reason: 'auth'     }   401/403 — signed out, or not permitted
 *   { ok: false, reason: 'missing'  }   404     — no such record
 *   { ok: false, reason: 'invalid', errors }    422 — validation
 *   { ok: false, reason: 'rate'     }   429
 *   { ok: false, reason: 'server'   }   5xx
 *   { ok: false, reason: 'offline'  }   the request never reached a server
 *   { ok: false, reason: 'timeout'  }
 *
 * The distinction between `offline` and `auth` carries real weight. A module's
 * api.js falls back to its local fixture when there is no backend at all —
 * which is what a static deployment of these files looks like — but must NOT
 * fall back on a 401, because that is a real server saying "not signed in", and
 * answering it with local data would show one person another person's ledger.
 * Collapsing both into a bare `null` is how that bug gets written.
 */

import { apiBase } from './paths.js';
import { emit, EVENTS } from './bus.js';

const TIMEOUT_MS = 15000;

/** Laravel's stateful-SPA CSRF cookie, read for the X-XSRF-TOKEN header. */
function xsrfToken() {
  const match = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(document.cookie);
  // Laravel URL-encodes the cookie value; sending it back encoded fails the
  // comparison with a message that says nothing about why.
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Was this a genuine "no server", as opposed to a server that answered badly?
 *
 * fetch() rejects with a TypeError for a DNS failure, a refused connection, a
 * CORS rejection and an offline device alike, and the message differs per
 * browser — so navigator.onLine is checked first and the TypeError is the
 * fallback signal. Anything that produced an HTTP status is not offline, by
 * definition, however broken the response was.
 */
function isNetworkFailure(err) {
  if (err?.name === 'AbortError') return false;
  return err instanceof TypeError || !navigator.onLine;
}

let offlineNotified = false;

function noteOffline() {
  if (!offlineNotified) { offlineNotified = true; emit(EVENTS.OFFLINE); }
}

function noteOnline() {
  if (offlineNotified) { offlineNotified = false; emit(EVENTS.ONLINE); }
}

/**
 * One request.
 *
 * @param {string} path    '/accounts' — relative to the API base
 * @param {object} options
 * @param {string} [options.method='GET']
 * @param {object} [options.body]        JSON-encoded automatically
 * @param {object} [options.params]      query string, nullish values dropped
 * @param {AbortSignal} [options.signal] to cancel, e.g. a superseded search
 */
export async function request(path, options = {}) {
  const { method = 'GET', body, params, signal, headers = {} } = options;

  const url = new URL(apiBase() + '/' + String(path).replace(/^\/+/, ''));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      // A null filter means "not filtering", not "filter by the string null" —
      // which is what an unguarded append writes into the query string.
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(`${key}[]`, v));
      else url.searchParams.set(key, String(value));
    }
  }

  // The caller's own signal and the timeout both have to be able to abort the
  // request. AbortSignal.any() does this natively but is too new to rely on, so
  // the timeout controller listens to the caller's signal instead.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  const init = {
    method,
    signal: controller.signal,
    // Sanctum's cookie session needs the cookie sent on every request, and it
    // is not sent by default for a cross-origin call.
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      // Laravel only returns a 401 JSON body instead of a redirect to a login
      // page when it believes the caller is an XHR. Without this header a
      // signed-out request resolves as a 200 containing an HTML login page,
      // and the parse failure below is the first sign anything is wrong.
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
    },
  };

  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
    const token = xsrfToken();
    if (token) init.headers['X-XSRF-TOKEN'] = token;
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    window.clearTimeout(timer);
    if (controller.signal.reason === 'timeout') return { ok: false, reason: 'timeout' };
    if (err?.name === 'AbortError') return { ok: false, reason: 'aborted' };
    if (isNetworkFailure(err)) { noteOffline(); return { ok: false, reason: 'offline' }; }
    return { ok: false, reason: 'server', error: err };
  }
  window.clearTimeout(timer);
  noteOnline();

  if (response.status === 204) return { ok: true, data: null };

  // Parsed before the status is branched on, because a 422's body IS the
  // result — the field errors are the useful part of the failure.
  let payload = null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { payload = await response.json(); } catch { payload = null; }
  }

  if (response.ok) return { ok: true, data: payload };

  switch (response.status) {
    case 401:
    case 403:
      return { ok: false, reason: 'auth', status: response.status };
    case 404:
      return { ok: false, reason: 'missing', status: 404 };
    case 419:
      // Laravel's expired-CSRF status. Distinct from 401: the session is fine,
      // the token is stale, and the fix is to reload rather than to sign in.
      return { ok: false, reason: 'stale', status: 419 };
    case 422:
      return { ok: false, reason: 'invalid', errors: payload?.errors || {}, message: payload?.message };
    case 429:
      return { ok: false, reason: 'rate', retryAfter: Number(response.headers.get('Retry-After')) || null };
    default:
      return { ok: false, reason: 'server', status: response.status, message: payload?.message };
  }
}

export const get = (path, params, options) => request(path, { ...options, method: 'GET', params });
export const post = (path, body, options) => request(path, { ...options, method: 'POST', body });
export const patch = (path, body, options) => request(path, { ...options, method: 'PATCH', body });
export const del = (path, options) => request(path, { ...options, method: 'DELETE' });

/**
 * Is there a backend at all?
 *
 * Probed once and cached for the life of the page. A module's api.js asks this
 * before deciding whether to fall back to local data, so a static deployment
 * does not make an HTTP request per panel only to fail each time.
 *
 * `null` means "not yet determined"; callers await the promise rather than
 * reading the flag.
 */
let backendProbe = null;

export function hasBackend() {
  if (backendProbe) return backendProbe;
  backendProbe = request('health')
    .then((res) => res.ok || res.reason === 'auth')   // a 401 still proves a server
    .catch(() => false);
  return backendProbe;
}

/** For tests and for the settings screen's "re-check connection" action. */
export function resetBackendProbe() { backendProbe = null; }

// Browser-level connectivity, which is coarser than the per-request signal
// above but arrives without waiting for a request to fail.
window.addEventListener('online', noteOnline);
window.addEventListener('offline', noteOffline);
