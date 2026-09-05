/**
 * Vault · list page
 *
 * The lock screen, the entry list, and the detail sheet.
 *
 * Three rules this file follows, from ../SECURITY.md §4:
 *
 *   · a decrypted value is escaped before it reaches innerHTML, always. A
 *     password can contain any character, including '<', and it arrives from a
 *     blob that may have been imported from elsewhere.
 *   · a secret is never put in the DOM until it is revealed, and it is removed
 *     again when it is hidden. Masked-with-CSS is not hidden; it is present in
 *     the page and readable from the inspector, from a screenshot tool, and
 *     from any script running on the page.
 *   · nothing is logged. There is no console.log in this file and there must
 *     not be one added for debugging that survives.
 */

import { qs, qsa, icon, esc, delegate, announce } from '../../shared/js/core/dom.js';
import { debounce } from '../../shared/js/utils/debounce.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import { formatRelative } from '../../shared/js/core/dates.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { openSheet, confirmDialog } from '../../shared/js/components/sheet.js';
import { toast, toastOk, toastError, toastFailure } from '../../shared/js/components/toast.js';
import { menu } from '../../shared/js/components/menu.js';
import * as vault from './backend/api.js';
import * as session from './backend/session.js';

mountShell({
  title: 'Vault',
  actions: `<button type="button" class="btn btn--icon" data-lock-now aria-label="Lock the vault" hidden>
              ${icon('lock', { class: 'icon' })}
            </button>`,
});

const lockEl = qs('[data-lock]');
const filters = { q: '', kind: '' };

session.watch();

/* The lock event is the single place the UI re-covers itself. Every path that
   locks — the button, the idle timer, the tab being hidden — goes through the
   session module and arrives here, so none of them can forget. */
on(EVENTS.VAULT_LOCKED, (reason) => {
  showLock();
  if (reason === 'idle') announce('The vault locked after a period of inactivity.');
});

on(EVENTS.VAULT_CHANGED, (payload) => {
  if (payload?.damaged?.length) {
    toastError(`${payload.damaged.length} ${payload.damaged.length === 1 ? 'entry' : 'entries'} could not be decrypted and are not shown.`, { duration: 0 });
  }
  refresh();
});

boot();

/* =========================================================================
   The lock screen
   ========================================================================= */

async function boot() {
  // crypto.subtle is absent outside a secure context, and the failure it
  // produces otherwise ("cannot read property encrypt of undefined") names
  // nothing useful. Checked before anything else so the explanation is the
  // first thing on screen rather than the last thing in the console.
  if (!window.isSecureContext || !window.crypto?.subtle) {
    qs('[data-lock-sub]').textContent = 'Unavailable on this connection';
    qs('[data-insecure]').hidden = false;
    return;
  }

  let hasVault;
  try {
    hasVault = await vault.exists();
  } catch (err) {
    qs('[data-lock-sub]').textContent = err.message;
    return;
  }

  if (hasVault) {
    qs('[data-lock-title]').textContent = 'Vault locked';
    qs('[data-lock-sub]').textContent = 'Enter your master password';
    qs('[data-unlock-form]').hidden = false;
    qs('#lock-password').focus();
  } else {
    qs('[data-lock-title]').textContent = 'Set up your vault';
    qs('[data-lock-sub]').textContent = 'Cards, accounts, logins and notes — encrypted on this device';
    qs('[data-setup-form]').hidden = false;
  }
}

function showLock() {
  lockEl.hidden = false;
  qs('[data-lock-now]')?.setAttribute('hidden', '');
  qs('[data-list]').innerHTML = '';       // the decrypted list leaves the DOM
  qs('[data-search]').value = '';
  filters.q = '';
  const field = qs('#lock-password');
  if (field) { field.value = ''; field.focus(); }
}

function hideLock() {
  lockEl.hidden = true;
  qs('[data-lock-now]')?.removeAttribute('hidden');
}

/* Reveal-the-password toggles, on both forms. */
delegate(document.body, 'click', '[data-peek]', (_event, button) => {
  const input = button.closest('.input-wrap').querySelector('input');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!showing));
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  button.innerHTML = icon(showing ? 'eye' : 'eye-off', { class: 'icon icon--sm' }).value;
});

/* ---- Unlock -------------------------------------------------------------- */

qs('[data-unlock-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = qs('[type="submit"]', form);
  const error = qs('[data-unlock-error]');

  error.hidden = true;
  button.classList.add('is-busy');
  button.disabled = true;
  // The KDF takes a deliberate third of a second or more, which on a phone is
  // long enough to look like nothing happened. Saying so is better than a
  // spinner alone.
  button.textContent = 'Unlocking…';

  const result = await vault.unlock(form.elements.password.value);

  button.classList.remove('is-busy');
  button.disabled = false;
  button.textContent = 'Unlock';

  if (!result.ok) {
    form.elements.password.value = '';
    form.elements.password.focus();
    error.hidden = false;
    error.textContent = result.waitMs
      ? `Wrong password. The next attempt will take ${Math.round(result.waitMs / 1000)}s.`
      : 'Wrong password.';
    // Assertive: a failed unlock is not something to mention quietly after
    // whatever else is being read out.
    announce('Wrong password', { assertive: true });
    return;
  }

  hideLock();
  form.elements.password.value = '';
  await refresh();
});

/* ---- Setup --------------------------------------------------------------- */

const setupForm = qs('[data-setup-form]');

setupForm.elements.password.addEventListener('input', debounce((event) => {
  const value = event.target.value;
  const panel = qs('[data-strength]');
  panel.hidden = !value;
  if (!value) { qs('[data-strength-hint]').textContent = ''; return; }

  const result = vault.strength(value);
  panel.dataset.score = String(result.score);
  qs('.strength__fill', panel).style.width = `${(result.score / 4) * 100}%`;
  qs('.strength__label', panel).textContent = result.label;
  qs('[data-strength-hint]').textContent = result.hint;
}, 120));

qs('[data-suggest]').addEventListener('click', () => {
  const phrase = vault.generatePassphrase(5);
  setupForm.elements.password.value = phrase;
  setupForm.elements.password.type = 'text';   // it is useless if it cannot be read down
  setupForm.elements.password.dispatchEvent(new Event('input'));
  setupForm.elements.confirm.value = '';
  toast('Write this down somewhere physical before continuing.', { tone: 'warn', duration: 8000 });
});

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = qs('[data-setup-error]');
  const password = form.elements.password.value;

  error.hidden = true;

  if (password.length < 10) {
    error.hidden = false;
    error.textContent = 'Use at least 10 characters. A few unrelated words is the easiest way.';
    return;
  }
  if (password !== form.elements.confirm.value) {
    error.hidden = false;
    error.textContent = 'The two do not match.';
    form.elements.confirm.focus();
    return;
  }

  const sure = await confirmDialog({
    title: 'Have you written it down?',
    text: 'This password never reaches the server, so there is no reset and no recovery. If it is lost, everything in the vault is lost with it.',
    confirmLabel: 'Yes, create the vault',
    cancelLabel: 'Not yet',
  });
  if (!sure) return;

  const button = qs('[type="submit"]', form);
  button.classList.add('is-busy');
  button.disabled = true;
  button.textContent = 'Creating…';

  const result = await vault.create(password);

  button.classList.remove('is-busy');
  button.disabled = false;
  button.textContent = 'Create the vault';

  if (!result.ok) { toastFailure(result, 'Could not create the vault.'); return; }

  // Cleared from the form immediately. The value is still in memory somewhere
  // until the garbage collector gets to it — that is unavoidable in JavaScript
  // and is stated in SECURITY.md — but leaving it in a DOM node is not.
  form.elements.password.value = '';
  form.elements.confirm.value = '';

  hideLock();
  toastOk('Vault created.');
  await refresh();
});

/* =========================================================================
   The list
   ========================================================================= */

qs('[data-lock-now]')?.addEventListener('click', () => vault.lock('manual'));

qs('[data-search]').addEventListener('input', debounce((event) => {
  filters.q = event.target.value.trim();
  refresh();
}, 180));

delegate(document.body, 'click', '[data-kind]', (_event, button) => {
  filters.kind = button.dataset.kind;
  qsa('[data-kind]').forEach((b) => b.classList.toggle('is-active', b === button));
  refresh();
});

delegate(document.body, 'click', '[data-new-entry]', () => openEntrySheet());
delegate(document.body, 'click', '[data-open]', (_event, button) => openDetail(button.dataset.open));

function drawFilters() {
  const host = qs('[data-kind-filter]');
  if (host.children.length) return;   // static; built once
  host.innerHTML = `<button type="button" class="pill is-active" data-kind="">All</button>` +
    vault.KINDS.map((k) => `
      <button type="button" class="pill" data-kind="${esc(k.key)}">
        ${icon(k.icon, { class: 'icon icon--sm' })}${esc(k.label)}
      </button>`).join('');
}

async function refresh() {
  if (!vault.isUnlocked()) return;
  drawFilters();

  const res = await vault.list(filters);
  if (!res.ok) return;

  const host = qs('[data-list]');

  if (!res.data.length) {
    host.innerHTML = `<li>
      <div class="empty">
        <span class="empty__glyph">${icon(filters.q ? 'search' : 'shield-lock', { class: 'icon icon--lg' })}</span>
        <span class="empty__title">${filters.q ? 'Nothing matched' : 'The vault is empty'}</span>
        <p class="empty__text">${filters.q
          ? esc(`Nothing matches “${filters.q}”. Passwords and card numbers are deliberately not searched.`)
          : 'Cards, bank accounts, logins, API keys and notes. Nothing here leaves this device unencrypted.'}</p>
        ${filters.q ? '' : '<button type="button" class="btn btn--vault btn--sm" data-new-entry>Add the first entry</button>'}
      </div></li>`;
    return;
  }

  host.innerHTML = res.data.map((entry) => {
    const kind = vault.kindOf(entry.kind);
    return `
      <li>
        <button type="button" class="row" data-open="${esc(entry.id)}">
          <span class="row__glyph row__glyph--vault">${icon(kind.icon, { class: 'icon' })}</span>
          <span class="row__main">
            <span class="row__title">${esc(entry.title)}</span>
            <span class="row__sub">
              <span>${esc(entry.subtitle || kind.label)}</span>
              ${(entry.tags || []).length ? `<span aria-hidden="true">·</span><span>${esc(entry.tags.join(', '))}</span>` : ''}
            </span>
          </span>
          ${icon('chevron-right', { class: 'icon icon--sm row__chev' })}
        </button>
      </li>`;
  }).join('');

  if (filters.q) announce(`${res.data.length} ${res.data.length === 1 ? 'entry' : 'entries'}`);
}

/* =========================================================================
   Detail
   ========================================================================= */

async function openDetail(id) {
  const res = await vault.find(id);
  if (!res.ok) { toastFailure(res); return; }
  const entry = res.data;
  const kind = vault.kindOf(entry.kind);

  const body = document.createElement('div');
  body.className = 'stack stack--4';

  body.innerHTML = `
    <div class="cluster">
      <span class="chip chip--vault">${icon(kind.icon, { class: 'icon icon--sm' })}${esc(kind.label)}</span>
      ${(entry.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
    </div>

    <dl class="vault-fields">
      ${(entry.fields || []).map((field, i) => fieldRow(field, i)).join('')}
    </dl>

    ${entry.note ? `
      <div class="stack stack--2">
        <span class="label">Note</span>
        <p class="vault-note">${esc(entry.note)}</p>
      </div>` : ''}

    <p class="meta">Updated ${esc(formatRelative(String(entry.updated_at).slice(0, 10)))}</p>

    <div class="form-actions">
      <button type="button" class="btn btn--danger btn--keep" data-delete aria-label="Delete entry">
        ${icon('trash', { class: 'icon' })}
      </button>
      <button type="button" class="btn btn--secondary" data-edit>Edit</button>
    </div>
  `;

  const sheet = openSheet({ title: entry.title, body });

  /* ---- Reveal ------------------------------------------------------------
     THE SECRET IS NOT IN THE DOM UNTIL THIS RUNS. The markup renders a row of
     bullets of the right length and holds the real value nowhere; revealing
     writes it in, and hiding takes it out again. Masking with CSS would leave
     the value sitting in the page for the inspector, for a screenshot tool and
     for any script on the page to read.
     ---------------------------------------------------------------------- */
  const revealTimers = new Map();

  delegate(body, 'click', '[data-reveal-field]', (_event, button) => {
    const index = Number(button.dataset.revealField);
    const field = entry.fields[index];
    const target = qs(`[data-field-value="${index}"]`, body);
    const showing = button.getAttribute('aria-pressed') === 'true';

    if (showing) return hideField(index, target, button);

    target.textContent = field.value;         // textContent, never innerHTML
    target.classList.remove('masked');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'Hide value');
    button.innerHTML = icon('eye-off', { class: 'icon icon--sm' }).value;

    // Re-hides on its own after 30 seconds. A revealed password left on screen
    // while the phone is put down is the everyday version of this risk, and it
    // is far more likely than anything in the threat model.
    revealTimers.set(index, window.setTimeout(() => hideField(index, target, button), 30_000));
  });

  function hideField(index, target, button) {
    window.clearTimeout(revealTimers.get(index));
    revealTimers.delete(index);
    target.textContent = '•'.repeat(Math.min(24, entry.fields[index].value.length));
    target.classList.add('masked');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Show value');
    button.innerHTML = icon('eye', { class: 'icon icon--sm' }).value;
  }

  /* ---- Copy -------------------------------------------------------------- */
  delegate(body, 'click', '[data-copy-field]', async (_event, button) => {
    const field = entry.fields[Number(button.dataset.copyField)];
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      // Denied, or an insecure context. Silently failing here would look like a
      // successful copy and the person would paste whatever was there before.
      toastError('The browser would not let the page write to the clipboard.');
      return;
    }
    toastOk(`${field.label} copied. The clipboard is cleared in 45 seconds.`);

    // Best effort, and honestly labelled. The clipboard cannot be cleared once
    // another app has read it, the tab may be closed before this fires, and
    // overwriting only works while the page still holds focus. It is worth
    // doing anyway: a password sitting in the clipboard is read by the next
    // paste anywhere on the device.
    window.setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === field.value) await navigator.clipboard.writeText('');
      } catch { /* focus lost, or read permission denied — nothing to do */ }
    }, 45_000);
  });

  delegate(body, 'click', '[data-edit]', () => {
    sheet.close('edit');
    openEntrySheet(entry);
  });

  delegate(body, 'click', '[data-delete]', async () => {
    const sure = await confirmDialog({
      title: `Delete ${entry.title}?`,
      text: 'This cannot be undone. There is no recycle bin in the vault, deliberately — a deleted secret should be gone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!sure) return;
    const out = await vault.destroy(entry.id);
    if (!out.ok) { toastFailure(out); return; }
    sheet.close('deleted');
    toastOk('Deleted.');
  });
}

function fieldRow(field, index) {
  const masked = field.secret;
  const shown = masked ? '•'.repeat(Math.min(24, String(field.value).length)) : field.value;

  return `
    <div class="vault-field">
      <dt class="vault-field__label">${esc(field.label)}</dt>
      <dd class="vault-field__value">
        <span class="${masked ? 'masked' : 'vault-field__text'}" data-field-value="${index}">${esc(shown)}</span>
        <span class="vault-field__actions">
          ${masked ? `
            <button type="button" class="btn btn--icon btn--sm" data-reveal-field="${index}"
                    aria-pressed="false" aria-label="Show value">
              ${icon('eye', { class: 'icon icon--sm' })}
            </button>` : ''}
          <button type="button" class="btn btn--icon btn--sm" data-copy-field="${index}"
                  aria-label="Copy ${esc(field.label)}">
            ${icon('copy', { class: 'icon icon--sm' })}
          </button>
        </span>
      </dd>
    </div>`;
}

/* =========================================================================
   Create / edit
   ========================================================================= */

function openEntrySheet(entry = null) {
  const editing = Boolean(entry);
  const form = document.createElement('form');
  form.className = 'stack stack--4';
  form.noValidate = true;

  const kind = vault.kindOf(entry?.kind || 'login');
  const fields = entry?.fields?.length
    ? entry.fields
    : kind.fields.map((f) => ({ ...f, value: '' }));

  form.innerHTML = `
    <fieldset class="fieldset">
      <legend class="sr-only">Kind of entry</legend>
      <div class="choices" role="radiogroup">
        ${vault.KINDS.map((k) => `
          <label class="choice">
            <input type="radio" name="kind" value="${esc(k.key)}"${k.key === kind.key ? ' checked' : ''}${editing ? ' disabled' : ''}>
            ${icon(k.icon, { class: 'icon icon--sm' })}
            <span>${esc(k.label)}</span>
          </label>`).join('')}
      </div>
      ${editing ? '<p class="field__hint">The kind is fixed once created — it decides the starting fields, and changing it would not migrate what you have typed.</p>' : ''}
    </fieldset>

    <div class="field">
      <label class="field__label" for="v-title">Name <span class="field__req" aria-hidden="true">*</span></label>
      <input class="input" id="v-title" name="title" value="${esc(entry?.title || '')}"
             placeholder="What you will look for" autocomplete="off" data-autofocus>
      <p class="field__error" data-error="title" hidden></p>
    </div>

    <div class="stack stack--2" data-fields></div>

    <button type="button" class="btn btn--ghost btn--sm" data-add-field>
      ${icon('plus', { class: 'icon icon--sm' })} Add a field
    </button>

    <div class="field">
      <label class="field__label" for="v-note">Note</label>
      <textarea class="textarea" id="v-note" name="note" rows="3"
                placeholder="Anything else worth keeping with this">${esc(entry?.note || '')}</textarea>
    </div>

    <div class="field">
      <label class="field__label" for="v-tags">Tags</label>
      <input class="input" id="v-tags" name="tags" autocomplete="off"
             value="${esc((entry?.tags || []).join(', '))}" placeholder="work, personal, bank">
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn--vault btn--lg">${editing ? 'Save changes' : 'Add to the vault'}</button>
    </div>
  `;

  const fieldHost = qs('[data-fields]', form);
  fields.forEach((field) => fieldHost.append(buildFieldRow(field)));

  qs('[data-add-field]', form).addEventListener('click', () => {
    fieldHost.append(buildFieldRow({ label: '', value: '', secret: false }));
    fieldHost.lastElementChild.querySelector('input').focus();
  });

  // Changing the kind swaps in that kind's starting fields — but only when
  // nothing has been typed yet. Replacing filled-in fields because someone
  // tapped the wrong chip would throw away their work.
  delegate(form, 'change', '[name="kind"]', (_event, input) => {
    const filled = [...fieldHost.querySelectorAll('[name="field_value"]')].some((f) => f.value.trim());
    if (filled) return;
    fieldHost.innerHTML = '';
    vault.kindOf(input.value).fields.forEach((f) => fieldHost.append(buildFieldRow({ ...f, value: '' })));
  });

  const sheet = openSheet({ title: editing ? 'Edit entry' : 'New entry', body: form });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      id: entry?.id,
      kind: form.elements.kind.value,
      title: form.elements.title.value,
      note: form.elements.note.value,
      tags: form.elements.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      fields: [...fieldHost.children].map((row) => ({
        label: row.querySelector('[name="field_label"]').value,
        value: row.querySelector('[name="field_value"]').value,
        secret: row.querySelector('[name="field_secret"]').checked,
      })),
    };

    const result = await vault.save(payload);

    if (!result.ok) {
      if (result.reason === 'invalid') {
        for (const [field, messages] of Object.entries(result.errors || {})) {
          const node = qs(`[data-error="${field}"]`, form);
          if (node) { node.textContent = messages[0]; node.hidden = false; }
        }
      } else toastFailure(result, 'Could not save.');
      return;
    }

    sheet.close('saved');
    toastOk(editing ? 'Saved.' : 'Added to the vault.');
  });
}

function buildFieldRow(field) {
  const row = document.createElement('div');
  row.className = 'vault-edit-field';
  row.innerHTML = `
    <input class="input vault-edit-field__label" name="field_label" value="${esc(field.label || '')}"
           placeholder="Label" autocomplete="off" aria-label="Field label">
    <div class="input-wrap">
      <input class="input" name="field_value" type="${field.secret ? 'password' : 'text'}"
             value="${esc(field.value || '')}" placeholder="Value" autocomplete="off"
             aria-label="Field value">
      <button type="button" class="btn btn--icon btn--sm input-action" data-gen aria-label="Generate a password" hidden>
        ${icon('refresh', { class: 'icon icon--sm' })}
      </button>
    </div>
    <label class="check vault-edit-field__secret">
      <input type="checkbox" name="field_secret"${field.secret ? ' checked' : ''}>
      <span class="check__box"></span>
      <span class="check__text">Secret</span>
    </label>
    <button type="button" class="btn btn--icon btn--sm" data-remove-field aria-label="Remove this field">
      ${icon('close', { class: 'icon icon--sm' })}
    </button>
  `;

  const value = row.querySelector('[name="field_value"]');
  const secret = row.querySelector('[name="field_secret"]');
  const gen = row.querySelector('[data-gen]');

  const syncSecret = () => {
    value.type = secret.checked ? 'password' : 'text';
    gen.hidden = !secret.checked;
  };
  syncSecret();

  secret.addEventListener('change', syncSecret);
  gen.addEventListener('click', () => {
    value.type = 'text';                     // useless if it cannot be read
    value.value = vault.generatePassword({ length: 20 });
    value.dispatchEvent(new Event('input'));
  });
  row.querySelector('[data-remove-field]').addEventListener('click', () => row.remove());

  return row;
}
