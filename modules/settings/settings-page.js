/**
 * Hisab · Settings
 *
 * Appearance, and where the data lives.
 *
 * Everything here already existed in shared/js/core/state.js — setTheme,
 * setDensity, setHand and applyTheme were written with the design system and
 * have been working since. What was missing was any way to reach them: the
 * theme followed the device and there was no way to override it, so someone on
 * a phone set to dark had a dark app and no say in the matter.
 */

import { qs, qsa } from '../../shared/js/core/dom.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { getState, setTheme, setDensity, setHand } from '../../shared/js/core/state.js';
import { session, signOut } from '../../shared/js/core/session.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { toast } from '../../shared/js/components/toast.js';

mountShell({ title: 'Settings' });

/* ---- Appearance ---------------------------------------------------------- */

const state = getState();

/**
 * Check the radio matching the stored value.
 *
 * `?? ''` is load-bearing: an unset theme is null, and the "Follow device"
 * radio carries value="" — so the empty string is a real choice here rather
 * than a missing one.
 */
function select(group, value) {
  const input = qs(`[data-${group}-choices] input[value="${value ?? ''}"]`);
  if (input) input.checked = true;
}

select('theme', state.theme ?? '');
select('density', state.density ?? 'default');
select('hand', state.hand ?? 'right');

/**
 * What the current theme setting actually means right now.
 *
 * Worth saying out loud on the "Follow device" option, because that is the
 * setting where the app's appearance is decided somewhere the app cannot show
 * you — and "why is it dark when I did not choose dark" is the question this
 * line answers.
 */
function describeTheme() {
  const hint = qs('[data-theme-hint]');
  const chosen = getState().theme;

  if (chosen === 'day') { hint.textContent = 'Always light, whatever this device is set to.'; return; }
  if (chosen === 'night') { hint.textContent = 'Always dark, whatever this device is set to.'; return; }

  const deviceIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  hint.textContent = deviceIsDark
    ? 'This device is set to dark, so Hisab is dark. Choose Day to override it.'
    : 'This device is set to light, so Hisab is light. Choose Night to override it.';
}

describeTheme();

qsa('[data-theme-choices] input').forEach((input) => {
  input.addEventListener('change', () => {
    // '' means "no stored preference", which is what lets the media query take
    // over again — setTheme removes the key rather than storing an empty value.
    setTheme(input.value || null);
    describeTheme();
  });
});

qsa('[data-density-choices] input').forEach((input) => {
  input.addEventListener('change', () => setDensity(input.value));
});

qsa('[data-hand-choices] input').forEach((input) => {
  input.addEventListener('change', () => setHand(input.value));
});

// The device changing its mind while this page is open. Only meaningful on
// "Follow device", and describeTheme() already checks which setting is active.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', describeTheme);

/* ---- Account and storage -------------------------------------------------- */

(async function reflectDeployment() {
  const state = await session();
  const note = qs('[data-storage-note]');

  if (!state.backend) {
    // Said plainly rather than reassuringly. This is the single most likely
    // cause of real loss in Phase 1, and someone who does not know it cannot
    // act on it.
    note.textContent = 'On this device only. Your ledger is stored in this '
      + 'browser and does not sync — clearing site data deletes it. Install '
      + 'Hisab to your home screen to make that much less likely.';
    return;
  }

  note.textContent = state.authenticated
    ? 'On the server, so the same ledger appears on every device you sign in from. '
      + 'Your vault is the exception: it stays encrypted on this device.'
    : 'On the server. Sign in to see it.';

  if (!state.authenticated) return;

  qs('[data-account-section]').hidden = false;
  qs('[data-account-email]').textContent = state.user?.email ?? '';

  wireDemo();

  qs('[data-sign-out]').addEventListener('click', async () => {
    const res = await signOut();

    if (!res.ok && res.reason !== 'offline') {
      toast('Could not sign out. Try again.');
      return;
    }

    // replace(), not assign(): signing out and then pressing Back should not
    // return to a page rendered while signed in.
    window.location.replace(siteURL('modules/auth/login.html'));
  });
})();

/* ---- Demo data ------------------------------------------------------------ */

/**
 * Generating and removing demo entries.
 *
 * Only reachable with a backend, because that is where the generator runs. The
 * buttons reflect what is actually there rather than offering both at once: an
 * "Add" that would be refused, or a "Remove" with nothing to remove, is a
 * control that teaches people their taps do not matter.
 */
async function wireDemo() {
  const section = qs('[data-demo-section]');
  const note = qs('[data-demo-note]');
  const add = qs('[data-demo-add]');
  const remove = qs('[data-demo-remove]');

  section.hidden = false;

  const { get, post, del } = await import('../../shared/js/core/http.js');

  function draw(status) {
    const demo = status?.demo_entries ?? 0;
    const real = status?.real_entries ?? 0;

    add.hidden = demo > 0;
    remove.hidden = demo === 0;

    note.textContent = demo > 0
      ? `${demo} demo entries are in your ledger${real ? `, alongside ${real} of your own` : ''}.`
      : real > 0
        ? `You have ${real} entries of your own. Demo data would be added alongside them and marked as demo.`
        : 'Your ledger is empty. Demo data fills it with a few months of plausible entries so the screens have something to show.';
  }

  async function refreshStatus() {
    const res = await get('/ledger/demo');
    if (res.ok) draw(res.data?.data);
    else note.textContent = 'Could not check for demo data.';
  }

  await refreshStatus();

  add.addEventListener('click', async () => {
    add.disabled = true;
    add.textContent = 'Generating…';

    const res = await post('/ledger/demo', { months: 3 });

    add.disabled = false;
    add.textContent = 'Add 3 months of demo data';

    if (!res.ok) { toast(res.message || 'Could not add demo data.'); return; }

    draw(res.data?.data);
    toast('Demo data added. Open the Overview.', { tone: 'good' });
  });

  remove.addEventListener('click', async () => {
    const { confirmDialog } = await import('../../shared/js/components/sheet.js');
    const sure = await confirmDialog({
      title: 'Remove demo data?',
      // Worth stating plainly, because this is the ONE thing in the app that
      // actually deletes rather than reverses - and the reason it is safe is
      // exactly that it can tell the two apart.
      text: 'Only the generated entries are deleted. Anything you recorded yourself stays.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!sure) return;

    remove.disabled = true;
    remove.textContent = 'Removing…';

    const res = await del('/ledger/demo');

    remove.disabled = false;
    remove.textContent = 'Remove demo data';

    if (!res.ok) { toast('Could not remove demo data.'); return; }

    draw(res.data?.data);
    toast('Demo data removed.', { tone: 'good' });
  });
}
