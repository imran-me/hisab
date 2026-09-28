/**
 * Categories · module API
 *
 * Categories, payment methods and the four necessity bands. Every one of them
 * lives in data rather than in code, so the person using the app can change
 * them without a deployment.
 *
 * Categories are scoped to a BOOK — the personal book and each business have
 * their own sets, because "Cost of goods sold" is meaningless on a household
 * ledger and "Dining out" is a red flag on a company one.
 */

import { moduleStore, session as sessionCache } from '../../../shared/js/core/storage.js';
import { get, post, patch, del, hasBackend } from '../../../shared/js/core/http.js';
import { session as currentSession } from '../../../shared/js/core/session.js';
import { on, EVENTS } from '../../../shared/js/core/bus.js';
import { siteURL } from '../../../shared/js/core/paths.js';
import { ulid, slugify } from '../../../shared/js/core/id.js';

const store = moduleStore('categories');

let memo = null;

/** The four bands. Ordered best to worst; the order is the meaning. */
export async function necessityBands() {
  const all = await load();
  return all.necessity;
}

export async function methods() {
  const all = await load();
  return all.methods;
}

/**
 * Categories for one book and one transaction type.
 *
 * `transfer` is deliberately absent: a transfer between your own accounts is
 * not a category of spending, and offering one invites a ledger where half the
 * transfers are filed under "Other" and the totals no longer balance.
 */
export async function list({ book = 'personal', type = 'expense', includeArchived = false } = {}) {
  const all = await load();
  const scope = book === 'personal' ? 'personal' : 'business';
  const rows = (all.books[scope]?.[type] || []);
  return includeArchived ? rows : rows.filter((c) => !c.archived_at);
}

/**
 * The entry sheet's one-tap tiles: the most used categories for this book and
 * type, filled to `limit` in seed order. Shape in endpoints.md, "frequent".
 *
 * Without a backend there is no usage to rank by from here - this module does
 * not read the ledger, which depends on it - so the rows come back in seed
 * order with uses: 0 and last_account_id: null. Same shape, less knowledge.
 */
export async function frequent({ book = 'personal', type = 'expense', limit = 8 } = {}) {
  const scope = book === 'personal' ? 'personal' : 'business';
  if (await hasBackend()) {
    const res = await get('/categories/frequent', { book: scope, type, limit });
    if (res.ok) return res.data?.data || [];
    if (res.reason === 'auth') return [];
  }
  const rows = await list({ book, type });
  return rows.slice(0, limit).map((c) => ({ ...c, uses: 0, last_account_id: null }));
}

/** One category by id, including archived ones — a historical row still points at it. */
export async function find(id) {
  const all = await load();
  for (const scope of Object.values(all.books)) {
    for (const rows of Object.values(scope)) {
      const hit = rows.find((c) => c.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

export async function create({ book = 'personal', type = 'expense', label, necessity = null }) {
  const name = String(label || '').trim();
  if (!name) return { ok: false, reason: 'invalid', errors: { label: ['Give the category a name.'] } };

  const all = await load();
  const scope = book === 'personal' ? 'personal' : 'business';
  const rows = all.books[scope][type] || (all.books[scope][type] = []);

  // Case-insensitive duplicate check. Two categories differing only in case
  // split a year of spending across two rows in every report, and the person
  // who created them cannot tell them apart in the picker.
  if (rows.some((c) => !c.archived_at && c.label.toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: 'invalid', errors: { label: ['A category with that name already exists.'] } };
  }

  const row = {
    id: ulid(),
    // The slug can come back empty for a name written entirely in Bangla, so
    // the id is the fallback — see slugify()'s note.
    key: slugify(name) || ulid().toLowerCase(),
    label: name,
    type,
    book: scope,
    necessity: type === 'expense' ? (necessity ?? 3) : null,
    archived_at: null,
    created_at: new Date().toISOString(),
  };

  // With a backend the SERVER's row is the one kept, id included. A client id
  // the server has never seen is refused by every entry filed under it.
  if (await hasBackend()) {
    const res = await post('/categories', { label: name, type, book: scope, necessity: row.necessity });
    if (res.ok && res.data?.data) {
      rows.push(res.data.data);
      persist(all);
      return { ok: true, data: res.data.data };
    }
    if (res.reason !== 'offline') return res;
  }

  rows.push(row);
  persist(all);
  return { ok: true, data: row };
}

export async function rename(id, label) {
  const name = String(label || '').trim();
  if (!name) return { ok: false, reason: 'invalid', errors: { label: ['Give the category a name.'] } };

  const all = await load();
  const row = await find(id);
  if (!row) return { ok: false, reason: 'missing' };

  row.label = name;
  // The KEY is not regenerated. It is the stable identifier a historical
  // transaction snapshotted, and rewriting it would orphan every row that
  // referenced this category before the rename.
  persist(all);

  if (await hasBackend()) {
    const res = await patch(`/categories/${id}`, { label: name });
    if (!res.ok && res.reason !== 'offline') return res;
  }
  return { ok: true, data: row };
}

/**
 * Archive, never delete.
 *
 * A deleted category leaves every transaction that used it pointing at nothing,
 * and those transactions are years of history. Archiving removes it from the
 * picker and leaves every report intact.
 */
export async function archive(id) {
  const all = await load();
  const row = await find(id);
  if (!row) return { ok: false, reason: 'missing' };

  // The server archives through DELETE (and hard-deletes a category nothing
  // ever used). This sent PATCH { archived: true }, which the server refuses
  // for want of a label, so an archive never reached it.
  if (await hasBackend()) {
    const res = await del(`/categories/${id}`);
    if (!res.ok && res.reason !== 'offline') return res;
    if (res.ok && res.data?.data?.deleted) {
      for (const scope of Object.values(all.books)) {
        for (const [type, rows] of Object.entries(scope)) scope[type] = rows.filter((c) => c.id !== id);
      }
      persist(all);
      return { ok: true, data: { ...row, deleted: true } };
    }
    if (res.ok) row.archived_at = res.data?.data?.archived_at || new Date().toISOString();
  }

  row.archived_at ??= new Date().toISOString();
  persist(all);
  return { ok: true, data: row };
}

export async function restore(id) {
  const all = await load();
  const row = await find(id);
  if (!row) return { ok: false, reason: 'missing' };

  // It never told the server, so a restored category came back archived on
  // the next load.
  if (await hasBackend()) {
    const res = await post(`/categories/${id}/restore`);
    if (!res.ok && res.reason !== 'offline') return res;
  }
  row.archived_at = null;
  persist(all);
  return { ok: true, data: row };
}

/* ---- Storage ------------------------------------------------------------ */

/**
 * The whole set, once.
 *
 * ONE PROMISE, SHARED. The row renderer, the entry sheet and the page each ask
 * for categories as they mount, all before the first answer arrives. With only
 * the finished value memoised, every one of them started its own load - on
 * the Ledger that was three loads of six requests each, eighteen calls to a
 * server that answers one at a time, and the larger part of a 24-second first
 * paint. The in-flight promise is what is shared now.
 */
let loading = null;

function load() {
  if (memo) return Promise.resolve(memo);
  loading ??= fetchAll().finally(() => { loading = null; });
  return loading;
}

async function fetchAll() {
  // THE SERVER'S CATEGORIES WHEN THERE IS ONE.
  //
  // This used to read only local storage and the seed, so with a backend the
  // sheet offered categories with CLIENT ids the server had never seen, and
  // the server refused every categorised entry ("The selected category id is
  // invalid"). The ids have to be the server's.
  //
  // Every book and type, archived included, because find() resolves a
  // historical row's category by id wherever it lives - in ONE request
  // (GET /categories/all), not one per book and type.
  if (await hasBackend()) {
    const who = await ownerId();

    // Nobody signed in, on a real server: whatever this device holds belongs
    // to whoever was here before. Dropped, not merely skipped, so the next
    // person to sign in on this browser never starts from it.
    if (!who && await signedOut()) forget();

    // Kept for the tab's session: categories change a few times a year, and
    // every page needs them before it can draw a row. Keyed to the signed-in
    // owner, so a tab that signs out and in as someone else never shows the
    // first person's category names.
    const cached = who ? sessionCache.get(SESSION_KEY, null) : null;
    if (cached?.owner === who && cached.all?.books) {
      memo = cached.all;
      owner = who;
      // Older than the window: used anyway (a category renamed on another
      // device ten minutes ago is not worth a blank screen), and refreshed
      // behind the paint.
      if (Date.now() - (cached.at || 0) > SESSION_FRESH_MS) {
        window.setTimeout(() => { refreshFromServer(who); }, 1500);
      }
      return memo;
    }

    const res = await refreshFromServer(who);
    if (res) return res;
    // Offline or a 500: the last copy below is better than nothing - if it
    // is this owner's. A copy stamped with someone else's id is not used.
    const saved = store.read(null);
    if (saved?.books && (!saved.owner || saved.owner === who)) { memo = saved; owner = who; return memo; }
  }

  const saved = store.read(null);
  if (saved?.books && !saved.owner) { memo = saved; return memo; }

  // First run. The seed is fetched rather than inlined so the starting set can
  // be edited as data by anyone, without touching a JS file.
  const seed = await seedReference();

  memo = {
    necessity: seed.necessity || [],
    methods: seed.methods || [],
    books: {
      personal: hydrate(seed.personal, 'personal'),
      business: hydrate(seed.business, 'business'),
    },
  };
  persist(memo);
  return memo;
}

/** Give every seeded category a real id, so it is indistinguishable from one
 *  the user creates and can be renamed and archived the same way. */
function hydrate(scope, book) {
  const out = {};
  for (const [type, rows] of Object.entries(scope || {})) {
    out[type] = (rows || []).map((row) => ({
      id: ulid(),
      key: row.key,
      label: row.label,
      type,
      book,
      necessity: type === 'expense' ? (row.necessity ?? 3) : null,
      archived_at: null,
      created_at: new Date().toISOString(),
    }));
  }
  return out;
}

/** The seed file: the starting categories, and the bands and methods, which
 *  are reference data and the same on both sides. */
let seedPromise = null;
function seedReference() {
  seedPromise ??= fetch(siteURL('modules/categories/data/seed.json'))
    .then((r) => r.json())
    // No seed reachable (file://, or a partial deployment). An empty set is
    // usable, whereas throwing here would take the whole entry form down.
    .catch(() => ({ necessity: [], methods: [], personal: {}, business: {} }));
  return seedPromise;
}

/**
 * One request for every book and type. Resolves to the set, or null when the
 * server could not answer (offline, a 500), so the caller falls back.
 */
async function refreshFromServer(who) {
  const res = await get('/categories/all');

  // A 401 must not fall through to this device's data (api-contract.md §1).
  if (!res.ok && res.reason === 'auth') {
    forget();
    const base = await seedReference();
    memo = { necessity: base.necessity, methods: base.methods, books: { personal: {}, business: {} } };
    return memo;
  }
  if (!res.ok) return null;

  const base = await seedReference();
  const books = { personal: {}, business: {} };
  for (const [book, types] of Object.entries(res.data?.data || {})) {
    books[book] = {};
    for (const [type, rows] of Object.entries(types || {})) books[book][type] = rows || [];
  }
  const all = { necessity: base.necessity, methods: base.methods, books };
  persist(all, who);
  return all;
}

/** A real server said nobody is signed in (not: the question could not be asked). */
async function signedOut() {
  try {
    const state = await currentSession();
    return state?.backend === true && state.authenticated === false;
  } catch { return false; }
}

/** The signed-in owner's id, from the page's one session probe (no request of its own). */
async function ownerId() {
  try {
    const state = await currentSession();
    return state?.user?.id ?? null;
  } catch { return null; }
}

const SESSION_KEY = store.key;
/** How long the tab's copy counts as fresh before it is refreshed behind the paint. */
const SESSION_FRESH_MS = 10 * 60 * 1000;

let owner = null;

/**
 * Keep the set: in memory for this page, on the device as the offline copy,
 * and in session storage for the next page of this tab. Every write (create,
 * rename, archive) goes through here, so the tab's copy never lags a change
 * made in it.
 */
function persist(all, who = owner) {
  memo = all;
  owner = who ?? owner;
  // Stamped with the owner, so an offline fallback never serves one
  // person's categories to another on a shared browser.
  store.write(owner ? { ...all, owner } : all);
  if (owner) sessionCache.set(SESSION_KEY, { owner, at: Date.now(), all });
}

/** Drop every copy this device holds: memory, the offline copy, the tab's. */
function forget() { memo = null; owner = null; store.clear(); sessionCache.remove(SESSION_KEY); }

/**
 * For sign-out, and the settings screen's "reset categories to defaults".
 * Sign-out should call it (shell.js / settings-page.js, Dev A); until then the
 * module drops its copies itself the first time a real server says nobody is
 * signed in, and never serves a copy stamped with another owner.
 */
export function reset() { forget(); }

// Signing out anywhere (the More sheet, Settings) drops this device's copies
// at once, not on the next read.
on(EVENTS.SIGNED_OUT, reset);
