/**
 * Dues · module API
 *
 * The one door to /api/dues. Shapes in `endpoints.md`, returned unchanged.
 *
 * SERVER-ONLY: a due is a ledger transfer written in the same database
 * transaction as the entry, and a person's balance is read back from those
 * ledger legs. Neither half can be done honestly in a browser alone, so with
 * no server the screen says so instead of keeping a second, local ledger.
 *
 * After any write the ledger's local copy is stale (the server wrote two
 * legs), so it is dropped and re-read on the next ask.
 */

import { get, post, patch, hasBackend } from '../../../shared/js/core/http.js';
import { emit, EVENTS } from '../../../shared/js/core/bus.js';
import * as ledger from '../../ledger/backend/api.js';

/** The four kinds, from the owner's side. `sign` is on "what they owe you". */
export const KINDS = {
  lent:      { label: 'I lent',        verb: 'Lent',        sign: 1,  tone: 'out' },
  got_back:  { label: 'They paid back', verb: 'Got back',   sign: -1, tone: 'in' },
  borrowed:  { label: 'I borrowed',    verb: 'Borrowed',    sign: -1, tone: 'in' },
  paid_back: { label: 'I paid back',   verb: 'Paid back',   sign: 1,  tone: 'out' },
};

const offline = () => ({ ok: false, reason: 'offline' });

export async function overview({ book = 'personal' } = {}) {
  if (!(await hasBackend())) return offline();
  const res = await get('/dues', { book });
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

export async function person(id) {
  if (!(await hasBackend())) return offline();
  const res = await get(`/dues/people/${encodeURIComponent(id)}`);
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

export async function addPerson({ name, phone = null, note = null, book = 'personal' }) {
  if (!(await hasBackend())) return offline();
  const res = await post('/dues/people', { name, phone: phone || null, note: note || null, book });
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

export async function updatePerson(id, changes) {
  if (!(await hasBackend())) return offline();
  const res = await patch(`/dues/people/${encodeURIComponent(id)}`, changes);
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

export async function record(id, { kind, amount_minor, account_id, occurred_on, note }) {
  if (!(await hasBackend())) return offline();
  const res = await post(`/dues/people/${encodeURIComponent(id)}/entries`, {
    kind, amount_minor: Math.trunc(amount_minor), account_id, occurred_on, note: note || null,
  });
  if (res.ok) moved();
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

export async function settle(id, { account_id, occurred_on }) {
  if (!(await hasBackend())) return offline();
  const res = await post(`/dues/people/${encodeURIComponent(id)}/settle`, { account_id, occurred_on });
  if (res.ok) moved();
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

/** Change a due's amount: the server reverses the old transfer and records the new one. */
export async function changeEntry(entryId, amountMinor) {
  if (!(await hasBackend())) return offline();
  const res = await patch(`/dues/entries/${encodeURIComponent(entryId)}`, { amount_minor: Math.trunc(amountMinor) });
  if (res.ok) moved();
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

/** Undo a due: its transfer is reversed, and the entry stays as history. */
export async function undoEntry(entryId) {
  if (!(await hasBackend())) return offline();
  const res = await post(`/dues/entries/${encodeURIComponent(entryId)}/undo`);
  if (res.ok) moved();
  return res.ok ? { ok: true, data: res.data?.data } : res;
}

/** The server wrote ledger legs: drop the ledger's cached copy and say so. */
function moved() {
  ledger.reset();
  emit(EVENTS.TRANSACTION_CREATED, { source: 'dues' });
}
