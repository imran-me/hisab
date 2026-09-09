/**
 * Hisab · Sign in
 *
 * The only screen that is reachable without a session, and the only one that
 * mounts no app shell — every destination in the navigation needs a session, so
 * showing them here would be a row of links that all bounce back to this page.
 */

import { qs } from '../../shared/js/core/dom.js';
import { signIn, session } from '../../shared/js/core/session.js';
import { siteURL } from '../../shared/js/core/paths.js';

const form = qs('[data-login-form]');
const errorLine = qs('[data-login-error]');
const submit = qs('[data-submit]');
const offlineNote = qs('[data-offline-note]');

/**
 * Where to go after signing in.
 *
 * Read from ?next=, and deliberately resolved through siteURL() rather than
 * used as a URL. An open redirect is the classic hole in a login page: a link
 * to /login?next=https://evil.example sends someone through a page they trust
 * to one they do not, with the sign-in already done. Forcing the value to be a
 * path relative to this site's own root means an absolute URL cannot survive it.
 */
function destination() {
  const next = new URL(window.location.href).searchParams.get('next');
  if (!next) return siteURL('index.html');

  // A protocol-relative '//evil.example' also parses as absolute, so both
  // leading slashes and any scheme are stripped before resolving.
  const cleaned = String(next).replace(/^[a-z][a-z0-9+.-]*:/i, '').replace(/^\/+/, '');
  if (cleaned.startsWith('modules/auth/')) return siteURL('index.html');

  return siteURL(cleaned);
}

function showError(message) {
  errorLine.textContent = message;
  errorLine.hidden = false;
}

function clearError() {
  errorLine.hidden = true;
  errorLine.textContent = '';
}

function busy(isBusy) {
  submit.disabled = isBusy;
  submit.textContent = isBusy ? 'Signing in…' : 'Sign in';
}

/**
 * If there is no server, there is nothing to sign in to.
 *
 * Someone can only land here by typing the URL — the guard in main.js does not
 * redirect on a static deployment. Saying so plainly beats a login form that
 * cannot succeed and will not say why.
 */
(async function reflectDeployment() {
  const state = await session();

  if (!state.backend) {
    form.hidden = true;
    offlineNote.hidden = false;
    return;
  }

  // Already signed in: skip the form rather than asking again.
  if (state.authenticated) window.location.replace(destination());
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const email = qs('#login-email').value.trim();
  const password = qs('#login-password').value;
  const remember = qs('[name="remember"]').checked;

  if (!email || !password) {
    showError('Enter your email and password.');
    return;
  }

  busy(true);
  const res = await signIn(email, password, remember);
  busy(false);

  if (res.ok) {
    window.location.replace(destination());
    return;
  }

  // Mapped by reason rather than by status, and each message says what to do
  // next. The 'invalid' case deliberately uses the server's own wording, which
  // is identical for every kind of failure — see the module's endpoints.md.
  const messages = {
    invalid: res.message || 'Those details do not match.',
    rate: res.retryAfter
      ? `Too many attempts. Try again in ${Math.ceil(res.retryAfter / 60)} minute(s).`
      : 'Too many attempts. Wait a minute and try again.',
    // A stale CSRF token on the login page itself, which happens when the tab
    // has been open for a long time. Reloading is the fix, so it says so.
    stale: 'This page has been open a while. Reload it and try again.',
    offline: 'Cannot reach the server. Check your connection.',
    timeout: 'The server took too long to answer. Try again.',
    server: 'Something went wrong on the server. Try again shortly.',
  };

  showError(messages[res.reason] ?? 'Could not sign in. Try again.');
  qs('#login-password').select();
});
