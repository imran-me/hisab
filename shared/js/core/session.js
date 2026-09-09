/**
 * Hisab · Session
 *
 * Who is signed in, and whether that question even applies.
 *
 * THIS FILE IS THE REASON PHASE 1 AND PHASE 2 CAN BE THE SAME BUILD.
 *
 * Deployed as static files there is no server, nobody is signed in, and the app
 * must work exactly as it did before — the ledger lives in the browser and a
 * login screen would be a locked door in front of an empty room. Deployed with
 * the API behind it, the same files must refuse to show anything until someone
 * has signed in, because now the data is on a server and the URL alone must not
 * be enough to read it.
 *
 * So there are three states, not two, and collapsing them is the bug this file
 * exists to prevent:
 *
 *   backend: false                  static deployment — no login, no gate
 *   backend: true, authenticated: false   a real server saying "sign in"
 *   backend: true, authenticated: true    signed in
 *
 * The middle one is the only one that redirects. Treating "not authenticated"
 * as sufficient grounds would lock every static deployment out of itself.
 */

import { get, post, hasBackend } from './http.js';
import { siteURL, currentPath } from './paths.js';

/** Where the login screen lives. One constant, because two would disagree. */
export const LOGIN_PATH = 'modules/auth/login.html';

let probe = null;

/**
 * The session, probed once per page load and cached.
 *
 * Cached because nearly every page asks, and a request per asker turns one
 * round trip into five on a screen that mounts several panels.
 *
 * @returns {Promise<{backend: boolean, authenticated: boolean, user: object|null}>}
 */
export function session({ force = false } = {}) {
  if (probe && !force) return probe;

  probe = (async () => {
    const backend = await hasBackend();
    if (!backend) return { backend: false, authenticated: false, user: null };

    const res = await get('/auth/session');

    // The endpoint answers 200 whether or not anyone is signed in, so a failure
    // here is a failure of the request, not an answer to the question. Reported
    // as "no backend" rather than "signed out": a network blip must not throw
    // someone out of an app whose data is on this device anyway.
    if (!res.ok) return { backend: false, authenticated: false, user: null };

    const data = res.data?.data ?? {};
    return {
      backend: true,
      authenticated: Boolean(data.authenticated),
      user: data.user ?? null,
    };
  })();

  return probe;
}

/** Drop the cached answer. After signing in or out, the old one is a lie. */
export function forgetSession() { probe = null; }

/**
 * Send someone to the login screen, remembering where they were.
 *
 * The `next` parameter is the whole point: being bounced to the ledger after
 * signing in, when you clicked a link to one specific entry, is the kind of
 * small rudeness that makes an app feel careless.
 */
export function toLogin({ next = currentPath() } = {}) {
  const url = new URL(siteURL(LOGIN_PATH));
  if (next && !next.startsWith('modules/auth/')) url.searchParams.set('next', next);
  window.location.replace(url.href);
}

/**
 * The guard. Called by main.js on every page except the login screen itself.
 *
 * Returns the session so a caller that already needs it does not ask twice.
 */
export async function requireSession() {
  const state = await session();

  // No server: this is Phase 1, and there is nothing to sign in to.
  if (!state.backend) return state;

  if (!state.authenticated) toLogin();

  return state;
}

/**
 * @returns {Promise<{ok: true, user: object} | {ok: false, reason: string, errors?: object, message?: string}>}
 */
export async function signIn(email, password, remember = true) {
  // A GET first, to be issued the XSRF-TOKEN cookie that the POST has to echo
  // back. Without it the very first login of a fresh browser session is a 419,
  // and the person sees "page expired" for a page they just opened.
  await get('/auth/session');

  const res = await post('/auth/login', { email, password, remember });

  if (!res.ok) return res;

  forgetSession();
  return { ok: true, user: res.data?.data?.user ?? null };
}

export async function signOut() {
  const res = await post('/auth/logout');
  forgetSession();
  return res;
}
