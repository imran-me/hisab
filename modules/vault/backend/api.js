/**
 * Vault · module API
 *
 * The door between the vault UI and vault data. Read `../SECURITY.md` and
 * `endpoints.md` first.
 *
 * The shape of this file is decided by one constraint: the server stores opaque
 * blobs and cannot filter, sort or search them. So the whole vault is decrypted
 * once on unlock, held in memory, and searched there. That is fine at the scale
 * a person's vault reaches, and it is the honest consequence of the server not
 * being able to read anything.
 *
 * The decrypted cache is dropped the instant the vault locks. It listens for
 * the bus event rather than being asked to, so there is no code path that locks
 * the session and forgets to clear the plaintext.
 */

import { storage, KEYS } from '../../../shared/js/core/storage.js';
import { get, post, put, del, hasBackend } from '../../../shared/js/core/http.js';
import { ulid } from '../../../shared/js/core/id.js';
import { on, emit, EVENTS } from '../../../shared/js/core/bus.js';
import * as crypto from './crypto.js';
import { randomBytes } from './crypto.js';
import * as session from './session.js';

/**
 * The kinds of entry, and the fields each one starts with.
 *
 * `secret: true` means the value is masked until revealed and is excluded from
 * search — a card number is not something anyone searches for, and including it
 * would mean typing a card number into a search box.
 *
 * These are defaults, not a schema. Every entry can add, rename or remove
 * fields, because the whole record is one encrypted blob and the server has no
 * opinion about its shape.
 */
export const KINDS = [
  {
    key: 'login', label: 'Login', icon: 'globe',
    fields: [
      { label: 'Website', type: 'url' },
      { label: 'Username', type: 'text' },
      { label: 'Password', type: 'password', secret: true },
    ],
  },
  {
    key: 'card', label: 'Card', icon: 'card',
    fields: [
      { label: 'Cardholder', type: 'text' },
      { label: 'Number', type: 'text', secret: true },
      { label: 'Expires', type: 'text' },
      { label: 'CVV', type: 'text', secret: true },
      { label: 'PIN', type: 'text', secret: true },
    ],
  },
  {
    key: 'bank', label: 'Bank account', icon: 'bank',
    fields: [
      { label: 'Bank', type: 'text' },
      { label: 'Account name', type: 'text' },
      { label: 'Account number', type: 'text', secret: true },
      { label: 'Routing / IBAN', type: 'text', secret: true },
      { label: 'Branch', type: 'text' },
    ],
  },
  {
    key: 'key', label: 'API key', icon: 'key',
    fields: [
      { label: 'Service', type: 'text' },
      { label: 'Key ID', type: 'text' },
      { label: 'Secret', type: 'password', secret: true },
    ],
  },
  {
    key: 'note', label: 'Secure note', icon: 'note',
    fields: [],
  },
];

export const kindOf = (key) => KINDS.find((k) => k.key === key) || KINDS[4];

/** Decrypted entries, in memory only, for the life of an unlocked session. */
let cache = null;

/* The one guarantee that makes the cache safe: it is cleared by the lock event
   itself, so no caller can lock the session and leave plaintext behind. */
on(EVENTS.VAULT_LOCKED, () => { cache = null; });

/* =========================================================================
   The header — setup and unlock
   ========================================================================= */

/** Has a vault been created on this account yet? */
export async function exists() {
  return (await readHeader()) !== null;
}

async function readHeader() {
  const local = storage.get(KEYS.VAULT_META, null);
  if (local) return local;

  if (await hasBackend()) {
    const res = await get('/vault/header');
    if (res.ok && res.data) {
      storage.set(KEYS.VAULT_META, res.data);
      return res.data;
    }
    // A 404 means no vault yet, which is a legitimate state. A 401 does NOT
    // mean that, and must not be answered with "set up a new vault" — that
    // would offer to overwrite a vault the person simply is not signed in to.
    if (res.reason === 'auth') throw new Error('Sign in to open the vault.');
  }
  return null;
}

/**
 * First-time setup. Refuses if a vault already exists — see the note above.
 *
 * `iterations` is passed straight through to the KDF and exists for the
 * integration test and for a future "stronger, slower" setting. Left null, the
 * count is measured on the device.
 */
export async function create(password, { iterations = null } = {}) {
  if (await exists()) {
    return { ok: false, reason: 'conflict', message: 'A vault already exists on this device.' };
  }

  const header = await session.setup(password, { iterations });
  storage.set(KEYS.VAULT_META, header);
  cache = [];

  if (await hasBackend()) {
    const res = await post('/vault/header', header);
    if (!res.ok && res.reason !== 'offline') return res;
  }
  return { ok: true, data: null };
}

export async function unlock(password) {
  const header = await readHeader();
  if (!header) return { ok: false, reason: 'missing' };

  const result = await session.unlock(password, header);
  if (!result.ok) return result;

  await hydrate();
  return { ok: true };
}

export const lock = (reason) => session.lock(reason);
export const isUnlocked = () => session.isUnlocked();

export async function changePassword(oldPassword, newPassword) {
  const header = await readHeader();
  if (!header) return { ok: false, reason: 'missing' };

  const rotated = await session.changePassword(oldPassword, newPassword, header);
  if (!rotated) return { ok: false, reason: 'wrong' };

  storage.set(KEYS.VAULT_META, rotated);
  if (await hasBackend()) await put('/vault/header', rotated);

  // Nothing is re-encrypted: the DEK is unchanged and only its wrapping moved.
  // That is the whole reason for the wrapped-DEK design — see SECURITY.md §3.
  return { ok: true };
}

/* =========================================================================
   Entries
   ========================================================================= */

/**
 * Decrypt every blob once, into the in-memory cache.
 *
 * A blob that fails to decrypt is COLLECTED, not skipped silently and not
 * allowed to abort the whole load. One corrupt row must not make the other
 * ninety-nine unreachable, and it must not disappear without anyone being told
 * — a vault that quietly shows fewer entries than it holds is worse than one
 * that says "1 entry could not be read".
 */
async function hydrate() {
  const blobs = await readBlobs();
  const key = session.key();

  const entries = [];
  const damaged = [];

  for (const row of blobs) {
    try {
      const plain = await crypto.openJSON(key, row.blob);
      entries.push({ ...plain, id: row.id, updated_at: row.updated_at, created_at: row.created_at });
    } catch {
      damaged.push(row.id);
    }
  }

  cache = entries;
  if (damaged.length) emit(EVENTS.VAULT_CHANGED, { damaged });
  return { entries, damaged };
}

/**
 * List entries.
 *
 * Search runs here, over the decrypted set, because the server cannot do it —
 * SECURITY.md §2. Fields marked `secret` are excluded from the haystack: a card
 * number is not something anyone searches for, and matching against it would
 * mean typing one into a search box.
 */
export async function list({ q = '', kind = '', tag = '' } = {}) {
  if (!session.isUnlocked()) return { ok: false, reason: 'locked' };
  if (!cache) await hydrate();

  let rows = cache.slice();

  if (kind) rows = rows.filter((e) => e.kind === kind);
  if (tag) rows = rows.filter((e) => (e.tags || []).includes(tag));

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((entry) => {
      const parts = [entry.title, entry.subtitle, entry.note, ...(entry.tags || [])];
      for (const field of entry.fields || []) {
        if (!field.secret) parts.push(field.label, field.value);
      }
      return parts.filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }

  rows.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  return { ok: true, data: rows, meta: { total: rows.length } };
}

export async function find(id) {
  if (!session.isUnlocked()) return { ok: false, reason: 'locked' };
  if (!cache) await hydrate();
  const hit = cache.find((e) => e.id === id);
  return hit ? { ok: true, data: hit } : { ok: false, reason: 'missing' };
}

/** Every tag in use, with counts — for the filter strip. */
export async function tags() {
  if (!session.isUnlocked()) return [];
  if (!cache) await hydrate();
  const counts = new Map();
  for (const entry of cache) {
    for (const tag of entry.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export async function save(input) {
  if (!session.isUnlocked()) return { ok: false, reason: 'locked' };

  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false, reason: 'invalid', errors };

  if (!cache) await hydrate();

  const existing = input.id ? cache.find((e) => e.id === input.id) : null;
  const now = new Date().toISOString();

  const entry = {
    id: existing?.id || ulid(),
    kind: input.kind || 'note',
    title: String(input.title).trim(),
    subtitle: input.subtitle?.trim() || null,
    fields: (input.fields || [])
      // An empty field is dropped rather than stored. A vault full of blank
      // "CVV" rows from the card template is noise on every detail screen.
      .filter((f) => f.label?.trim() && String(f.value ?? '').length)
      .map((f) => ({ label: f.label.trim(), value: String(f.value), secret: Boolean(f.secret), type: f.type || 'text' })),
    note: input.note?.trim() || null,
    tags: [...new Set((input.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))],
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  // Sealed from the WHOLE entry, title included. The server learns nothing but
  // the id and the timestamp — see endpoints.md.
  const blob = await crypto.seal(session.key(), entry);

  const row = { id: entry.id, blob, created_at: entry.created_at, updated_at: entry.updated_at };
  const blobs = (await readBlobs()).filter((b) => b.id !== entry.id);
  blobs.push(row);
  writeBlobs(blobs);

  cache = cache.filter((e) => e.id !== entry.id);
  cache.push(entry);

  emit(EVENTS.VAULT_CHANGED, { id: entry.id });

  if (await hasBackend()) {
    const res = existing ? await put(`/vault/${entry.id}`, { blob }) : await post('/vault', row);
    if (!res.ok && res.reason !== 'offline') return res;
  }

  return { ok: true, data: entry };
}

export async function destroy(id) {
  if (!session.isUnlocked()) return { ok: false, reason: 'locked' };

  const blobs = await readBlobs();
  const next = blobs.filter((b) => b.id !== id);
  if (next.length === blobs.length) return { ok: false, reason: 'missing' };

  writeBlobs(next);
  if (cache) cache = cache.filter((e) => e.id !== id);
  emit(EVENTS.VAULT_CHANGED, { id });

  if (await hasBackend()) {
    const res = await del(`/vault/${id}`);
    if (!res.ok && res.reason !== 'offline') return res;
  }
  return { ok: true, data: null };
}

/* =========================================================================
   Generating a password
   ========================================================================= */

/**
 * A random password.
 *
 * Two details that are easy to get wrong:
 *
 * 1. The character is chosen with REJECTION SAMPLING, not `byte % length`.
 *    A modulo of a uniform 0..255 over an alphabet that does not divide 256
 *    is biased toward the early characters — small, but it is a bias in the
 *    one place where uniformity is the entire product.
 * 2. Ambiguous characters are excluded by default. This costs about two bits
 *    on a 20-character password and saves reading `l` as `1` off a screen
 *    while typing it into a terminal.
 */
export function generatePassword({ length = 20, symbols = true, ambiguous = false } = {}) {
  // Excludes exactly five characters: I, l, 1, O and 0. Those are the ones
  // actually confused with one another when a password is read off a screen and
  // typed into a terminal. i, o and L stay — a dotted i is distinguishable, and
  // L has no lookalike once 1 and I are gone. Excluding more than necessary
  // costs entropy for nothing.
  let alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  if (ambiguous) alphabet += 'Il1O0';
  if (symbols) alphabet += '!@#$%^&*()-_=+[]{};:,.?';

  const out = [];
  const max = Math.floor(256 / alphabet.length) * alphabet.length;

  while (out.length < length) {
    // A batch rather than one byte at a time: rejection means some bytes are
    // discarded, and asking for exactly as many as are needed guarantees a
    // second round trip on most calls.
    const bytes = randomBytes(length * 2);
    for (const byte of bytes) {
      if (byte >= max) continue;          // reject, to stay uniform
      out.push(alphabet[byte % alphabet.length]);
      if (out.length === length) break;
    }
  }
  return out.join('');
}

/** A memorable passphrase, for the master password itself. */
export function generatePassphrase(words = 5) {
  // A small, deliberately plain list. It is not the EFF wordlist — shipping
  // 7,776 words for one screen is not worth the bytes — so the entropy per word
  // is about 8.5 bits rather than 12.9, and the default length compensates.
  const list = ('able acid aged also area army away baby back ball band bank base bath bear beat been beer bell belt best bike bird blue boat body bone book boot born boss both bowl bulk burn bush busy cake call calm came camp card care case cash cast cell chat chip city club coal coat code cold come cook cool cope copy core corn cost crew crop dark data date dawn days dead deal dean dear debt deep deny desk dial diet disc disk does done door dose down draw drew drop drug dual duke dust duty each earn ease east easy edge else even ever evil exit face fact fail fair fall farm fast fate fear feed feel feet fell felt file fill film find fine fire firm fish five flat flow food foot ford form fort four free from fuel full fund gain game gate gave gear gene gift girl give glad goal goes gold golf gone good gray grew grey grid grow gulf hair half hall hand hang hard harm hate have head hear heat held hell help here hero high hill hire hold hole holy home hope horn host hour huge hung hunt hurt idea inch into iron item jack jane jean john join jump jury just keen keep kent kept kick kind king knee knew know lack lady laid lake land lane last late lead leaf lean left lens less life lift like limb line link list live load loan lock logo long look lord lose loss lost love luck made mail main make male mall many mark mass matt meal mean meat meet menu mere mile milk mill mind mine miss mode mood moon more most move much must name navy near neck need news next nice nine node none noon norm nose note noun page paid pain pair palm park part pass past path peak pick pile pink pipe plan play plot plug plus poem poet pole poll pool poor port post pull pure push race rail rain rank rare rate read real rear rely rent rest rice rich ride ring rise risk road rock role roll roof room root rope rose rule rush ruth safe said sail salt same sand save seat seed seek seem seen self sell send sent sept ship shoe shop shot show shut sick side sign silk sing sink site size skin skip slip slow snap snow soft soil sold sole solo some song soon sort soul spot star stay step stop such suit sure take tale talk tall tank tape task team tech tell tend tent term test text than that them then they thin this thus tide tidy tile till time tiny told toll tone took tool tour town tree trip true tube tune turn twin type unit upon urge used user vary vast very vice view vote wage wait wake walk wall want ward warm wash wave ways weak wear week well went were west what when whom wide wife wild will wind wine wing wire wise wish with wood word wore work worn wrap yard yarn year your zero zone').split(' ');

  // SIXTEEN-BIT sampling, not eight.
  //
  // The single-byte rejection loop used for generatePassword above cannot work
  // here and the failure is not subtle: with a list longer than 256 entries,
  // Math.floor(256 / list.length) is 0, so `max` is 0, so every byte is
  // rejected, and the loop never terminates. It hung the browser hard — no
  // error, no rejection, just a page that stopped — and it was found by a test
  // reporting which assertion it had reached rather than by reading the code.
  //
  // Two bytes give a 0..65535 value, and 65536 divided by a list of this size
  // leaves a remainder small enough that rejection almost never fires.
  const picked = [];
  const max = Math.floor(65536 / list.length) * list.length;

  while (picked.length < words) {
    const bytes = randomBytes(words * 8);
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const value = (bytes[i] << 8) | bytes[i + 1];
      if (value >= max) continue;              // reject, to stay uniform
      picked.push(list[value % list.length]);
      if (picked.length === words) break;
    }
  }
  return picked.join(' ');
}

export const strength = crypto.strength;

/* =========================================================================
   Storage
   ========================================================================= */

async function readBlobs() {
  const local = storage.get(KEYS.VAULT, null);
  if (Array.isArray(local)) return local;

  if (await hasBackend()) {
    const res = await get('/vault');
    if (res.ok) {
      const rows = res.data?.data || [];
      storage.set(KEYS.VAULT, rows);
      return rows;
    }
    if (res.reason === 'auth') throw new Error('Sign in to open the vault.');
  }
  return [];
}

function writeBlobs(rows) {
  storage.set(KEYS.VAULT, rows);
}

function validate(input) {
  const errors = {};
  if (!String(input.title || '').trim()) errors.title = ['Give it a name you will recognise.'];
  if (String(input.title || '').length > 120) errors.title = ['Keep the name under 120 characters.'];
  return errors;
}

/**
 * Wipe the vault from this device.
 *
 * Deliberately does NOT touch the server: "remove from this phone" and "delete
 * my vault" are different intentions, and conflating them means losing a vault
 * by signing out of a borrowed device.
 */
export function forgetOnThisDevice() {
  session.lock('forgotten');
  cache = null;
  storage.remove(KEYS.VAULT);
  storage.remove(KEYS.VAULT_META);
}
