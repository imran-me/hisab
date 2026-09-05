/**
 * Hisab · Identifiers
 *
 * Every record in this product is keyed by a ULID, never by an auto-increment
 * integer. Three reasons, in order of how much they matter here:
 *
 * 1. A sequential id in a URL is an invitation. /transactions/41 tells you that
 *    40 exists, and a mistake in one ownership check turns that into someone
 *    else's ledger. A 128-bit random tail is not walkable.
 * 2. The frontend can mint an id BEFORE the server has seen the record, so a
 *    transaction saved offline has its final identity from the moment it is
 *    created — no temporary id to reconcile, no row that changes key when it
 *    syncs.
 * 3. Unlike a UUIDv4, a ULID sorts by creation time as a plain string, so a
 *    list ordered by id is in the order things happened, and a database index
 *    on it does not fragment the way a random UUID's does.
 *
 * Format: 26 characters, Crockford base32. The first 10 encode the millisecond
 * timestamp; the last 16 are random.
 */

// Crockford's alphabet: no I, L, O or U. The first three because they are
// unreadable next to 1 and 0 when someone reads an id off a screen to support
// the other one; U because excluding it prevents the generator from ever
// spelling an obscenity in an id a person will see.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

/**
 * Cryptographically strong random bytes.
 *
 * crypto.getRandomValues is available in every browser this app supports and
 * under file:// as well — unlike crypto.subtle, which requires a secure
 * context. If it is genuinely missing the right move is to fail loudly: an id
 * generator silently falling back to Math.random produces collisions and
 * guessable keys, and neither is visible until it matters.
 */
function randomBytes(n) {
  const bytes = new Uint8Array(n);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Hisab requires crypto.getRandomValues, which this browser does not provide.');
  }
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function encodeTime(now) {
  let out = '';
  let t = now;
  for (let i = TIME_LEN; i > 0; i -= 1) {
    const mod = t % ENCODING_LEN;
    out = ALPHABET[mod] + out;
    t = (t - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom() {
  const bytes = randomBytes(RANDOM_LEN);
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i += 1) {
    // The byte is masked to 5 bits rather than taken modulo 32. Both give a
    // character, but a modulo of a 0..255 value is very slightly biased toward
    // the first 224/32 of the alphabet; masking is uniform.
    out += ALPHABET[bytes[i] & 0x1f];
  }
  return out;
}

let lastTime = 0;
let lastRandom = '';

/**
 * A new ULID.
 *
 * Two ids minted in the same millisecond would otherwise sort arbitrarily
 * against each other — which shows up as two transactions added in one tap
 * appearing in a different order on each render. Within a millisecond the
 * random tail is INCREMENTED instead of regenerated, so the second id is
 * guaranteed to sort after the first.
 */
export function ulid(now = Date.now()) {
  if (now === lastTime && lastRandom) {
    lastRandom = incrementBase32(lastRandom);
  } else {
    lastTime = now;
    lastRandom = encodeRandom();
  }
  return encodeTime(now) + lastRandom;
}

/** Increment a Crockford base32 string, carrying left. */
function incrementBase32(str) {
  const chars = str.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const idx = ALPHABET.indexOf(chars[i]);
    if (idx < ENCODING_LEN - 1) {
      chars[i] = ALPHABET[idx + 1];
      return chars.join('');
    }
    chars[i] = ALPHABET[0];   // carry
  }
  // Overflowed all 16 characters within one millisecond, which would need 2^80
  // ids in a millisecond. Regenerating is the only sane response.
  return encodeRandom();
}

/** The creation time encoded in a ULID, as a Date. */
export function ulidTime(id) {
  const time = String(id).slice(0, TIME_LEN);
  let ms = 0;
  for (const char of time) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) return null;
    ms = ms * ENCODING_LEN + idx;
  }
  return new Date(ms);
}

export function isUlid(value) {
  return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

/**
 * A URL- and filename-safe slug.
 *
 * Used for category and business keys, which appear in URLs and in export
 * filenames. Bengali and Arabic letters are NOT transliterated — they are
 * dropped, and a name written entirely in them therefore slugs to an empty
 * string. That is why the caller must fall back to a ULID rather than trusting
 * this to always return something.
 */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    // The combining-marks block, written as escapes rather than as literal
    // characters — a literal combining mark in source is invisible in most
    // editors and does not survive every copy-paste.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
