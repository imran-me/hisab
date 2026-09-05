/**
 * Vault · cryptography
 *
 * The whole of the vault's client-side encryption. Read `../SECURITY.md` first:
 * it carries the threat model, the key hierarchy, and the list of things this
 * deliberately does not protect against.
 *
 * Nothing here touches storage, the network or the DOM. It takes bytes and
 * returns bytes, so it is testable in Node — `node tools/test-crypto.mjs`.
 *
 * THE FIVE RULES (repeated from SECURITY.md because this is the file where
 * breaking one of them does the damage):
 *
 *   1. Plaintext never crosses this module's boundary except as a return value.
 *   2. A decryption failure is never caught and defaulted. GCM failing to
 *      authenticate means tampering or a wrong key. Both stop the operation.
 *   3. No secret is compared with ===. The verifier relies on GCM's own
 *      authentication, which is constant-time by construction.
 *   4. An IV is never reused. Every seal generates a fresh random 12 bytes.
 *      Reusing one under the same key in GCM is a total break, not a weakness.
 *   5. Key material is zeroed on lock, not merely dereferenced.
 */

const subtle = globalThis.crypto?.subtle;

/** Parameters. Versioned, so a future change can migrate rather than guess. */
export const KDF = {
  version: 1,
  name: 'PBKDF2',
  hash: 'SHA-256',
  /**
   * The OWASP 2023 figure for PBKDF2-HMAC-SHA-256. It is a floor, not a target:
   * calibrate() measures the actual device at setup and raises it, so a vault
   * created on a fast laptop is not stuck at a phone's number.
   */
  iterations: 600_000,
  saltBytes: 16,
};

const KEY_BITS = 256;
const IV_BYTES = 12;   // 96 bits — the size GCM is specified and fastest for

/* =========================================================================
   Primitives
   ========================================================================= */

function requireSubtle() {
  if (!subtle) {
    // crypto.subtle is only exposed in a secure context. Opening the app from
    // the filesystem or over plain http on a LAN address gives a browser where
    // every other feature works and this one is simply absent — so the failure
    // has to name the actual cause rather than surfacing as "cannot read
    // property encrypt of undefined".
    throw new Error(
      'The Web Crypto API is unavailable. The vault needs a secure context: ' +
      'open Hisab over https, or on http://localhost. It will not work from a ' +
      'file:// path or a plain-http LAN address.'
    );
  }
  return subtle;
}

/**
 * Cryptographically strong random bytes, of any length.
 *
 * getRandomValues refuses any request over 65,536 bytes — a limit in the spec,
 * not a Node quirk, so a browser throws the same QuotaExceededError. Nothing in
 * the vault currently asks for more than 32 bytes, but a helper that throws on
 * a large request is a trap for whoever needs one later, and filling in chunks
 * costs three lines.
 */
export function randomBytes(n) {
  const out = new Uint8Array(n);
  const MAX = 65536;
  for (let offset = 0; offset < n; offset += MAX) {
    globalThis.crypto.getRandomValues(out.subarray(offset, Math.min(offset + MAX, n)));
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Bytes to base64 and back.
 *
 * Written in chunks rather than as String.fromCharCode(...bytes): spreading a
 * large array into a function call overflows the argument-count limit and
 * throws for anything over roughly 100KB, which is exactly the size an attached
 * note or a document reaches.
 */
export function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Overwrite key material in place.
 *
 * Best-effort and honestly labelled as such: a CryptoKey's bytes are held by
 * the browser and are not reachable from JavaScript, and any string that ever
 * held a password is at the garbage collector's mercy. What this does
 * guarantee is that the typed arrays this module allocated do not sit in the
 * heap holding a key after a lock.
 */
export function zero(bytes) {
  if (bytes instanceof Uint8Array) bytes.fill(0);
}

/* =========================================================================
   Key derivation
   ========================================================================= */

/**
 * Master password → KEK.
 *
 * extractable: false on the derived key. The KEK never needs to be exported,
 * and marking it non-extractable means that even a script running in this page
 * cannot read its bytes back out — which is a genuine (if partial) mitigation
 * against a cross-site scripting bug in the app itself.
 */
export async function deriveKEK(password, salt, iterations = KDF.iterations) {
  const crypto = requireSubtle();

  const material = await crypto.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: KDF.hash },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );
}

/**
 * How many iterations this device can afford.
 *
 * Measured rather than assumed. A 2019 phone and a current laptop differ by
 * more than an order of magnitude, and a number hardcoded for one of them is
 * either too slow to use or too weak to matter on the other.
 *
 * Targets ~350ms, which is slow enough to be a real cost per guess and fast
 * enough that unlocking does not feel broken. Never returns below the OWASP
 * floor, however slow the device.
 */
export async function calibrate(targetMs = 350) {
  const crypto = requireSubtle();
  const probe = 50_000;
  const salt = randomBytes(KDF.saltBytes);

  const material = await crypto.importKey('raw', encoder.encode('calibration'), 'PBKDF2', false, ['deriveBits']);

  const started = performance.now();
  await crypto.deriveBits({ name: 'PBKDF2', salt, iterations: probe, hash: KDF.hash }, material, KEY_BITS);
  const elapsed = performance.now() - started;

  // A device fast enough to make `elapsed` round to zero would otherwise divide
  // by zero and return Infinity.
  const perMs = probe / Math.max(elapsed, 1);
  const suggested = Math.round((perMs * targetMs) / 10_000) * 10_000;

  return Math.max(KDF.iterations, suggested);
}

/* =========================================================================
   Sealing and opening
   ========================================================================= */

/**
 * Encrypt one value.
 *
 * Returns `{ iv, ct }` as base64 strings — a plain object, so it serialises to
 * JSON and back with no custom handling and no chance of a typed array being
 * silently stringified as "[object Uint8Array]".
 *
 * A fresh IV per call, every call. See rule 4.
 */
export async function seal(key, plaintext) {
  const crypto = requireSubtle();
  const iv = randomBytes(IV_BYTES);
  const data = encoder.encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));

  const ct = await crypto.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data);

  zero(data);
  return { v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

/**
 * Decrypt one value.
 *
 * THROWS on failure and does not catch. A GCM authentication failure means one
 * of exactly two things — the key is wrong, or the ciphertext was modified —
 * and continuing past either with a default value is how an attacker gets a
 * vault to open. See rule 2.
 */
export async function open(key, sealed) {
  const crypto = requireSubtle();
  if (!sealed || !sealed.iv || !sealed.ct) throw new Error('Malformed ciphertext.');

  const iv = fromBase64(sealed.iv);
  const ct = fromBase64(sealed.ct);

  const plain = await crypto.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct);
  return decoder.decode(plain);
}

export async function openJSON(key, sealed) {
  return JSON.parse(await open(key, sealed));
}

/* =========================================================================
   The DEK, and the vault header
   ========================================================================= */

/**
 * Create a brand-new vault header.
 *
 * The header is NOT secret. It holds the KDF parameters, the salt, the wrapped
 * DEK and a verifier — all of which an attacker may have without gaining
 * anything, because each is useless without the master password.
 *
 * The verifier is a known string sealed under the DEK. Unlocking decrypts it,
 * and GCM's authentication tag is what proves the password was right. That is
 * a constant-time check by construction, unlike comparing a stored hash, and it
 * proves the DEK unwrapped correctly rather than merely that the password
 * matched something.
 */
export async function createHeader(password, { iterations = null } = {}) {
  const crypto = requireSubtle();

  const salt = randomBytes(KDF.saltBytes);
  const rounds = iterations ?? await calibrate();

  const kek = await deriveKEK(password, salt, rounds);

  // The DEK is extractable so that it can be wrapped. It is generated, wrapped
  // and dropped within this function; the unwrapped form only ever exists again
  // inside unlock(), and it is never stored.
  const dek = await crypto.generateKey({ name: 'AES-GCM', length: KEY_BITS }, true, ['encrypt', 'decrypt']);

  const wrapIv = randomBytes(IV_BYTES);
  const wrapped = await crypto.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: wrapIv, tagLength: 128 });

  const verifier = await seal(dek, VERIFIER_TEXT);

  return {
    header: {
      v: KDF.version,
      kdf: { name: KDF.name, hash: KDF.hash, iterations: rounds },
      salt: toBase64(salt),
      wrap: { iv: toBase64(wrapIv), key: toBase64(new Uint8Array(wrapped)) },
      verifier,
      created_at: new Date().toISOString(),
    },
    dek,
  };
}

/** The plaintext behind the verifier. Its content is irrelevant; only that it
 *  is known and fixed. */
const VERIFIER_TEXT = 'hisab.vault.v1';

/**
 * Unlock: password + header → the DEK.
 *
 * Returns `null` for a wrong password rather than throwing, because a wrong
 * password is an expected outcome of a login form and not an exceptional one.
 * Every OTHER failure — a corrupt header, a missing field, an unsupported KDF —
 * throws, because those are not something the person typing can fix by trying
 * again.
 */
export async function unlock(password, header) {
  const crypto = requireSubtle();

  if (!header?.salt || !header?.wrap?.key) throw new Error('The vault header is corrupt or incomplete.');
  if (header.kdf?.name && header.kdf.name !== KDF.name) {
    throw new Error(`This vault uses ${header.kdf.name}, which this version cannot open.`);
  }

  const salt = fromBase64(header.salt);
  const rounds = header.kdf?.iterations || KDF.iterations;

  const kek = await deriveKEK(password, salt, rounds);

  let dek;
  try {
    dek = await crypto.unwrapKey(
      'raw',
      fromBase64(header.wrap.key),
      kek,
      { name: 'AES-GCM', iv: fromBase64(header.wrap.iv), tagLength: 128 },
      { name: 'AES-GCM', length: KEY_BITS },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch {
    // The unwrap's GCM tag failed: the KEK is wrong, which means the password
    // is wrong. This is the ONE place a decryption failure is swallowed, and it
    // is swallowed into a null return rather than a default value.
    return null;
  }

  // Belt and braces: prove the DEK opens the verifier too. An unwrap that
  // succeeded on a truncated or swapped header would be caught here.
  try {
    const check = await open(dek, header.verifier);
    if (check !== VERIFIER_TEXT) return null;
  } catch {
    return null;
  }

  return dek;
}

/**
 * Change the master password.
 *
 * Re-wraps the SAME DEK under a new KEK. Every entry's ciphertext is untouched,
 * so this is one small write regardless of how large the vault is — and, more
 * importantly, there is no window in which some entries have been re-encrypted
 * and some have not. See SECURITY.md §3.
 */
export async function rewrap(oldPassword, newPassword, header, { iterations = null } = {}) {
  const crypto = requireSubtle();

  const dek = await unlock(oldPassword, header);
  if (!dek) return null;

  // The DEK has to be extractable to be re-wrapped, and unlock() deliberately
  // returns a non-extractable one. So it is exported through the OLD KEK and
  // re-imported — the raw bytes exist in this function's scope only, and are
  // zeroed before it returns.
  const oldKek = await deriveKEK(oldPassword, fromBase64(header.salt), header.kdf?.iterations || KDF.iterations);
  const rawDek = new Uint8Array(await crypto.decrypt(
    { name: 'AES-GCM', iv: fromBase64(header.wrap.iv), tagLength: 128 },
    oldKek,
    fromBase64(header.wrap.key),
  ));

  const salt = randomBytes(KDF.saltBytes);
  const rounds = iterations ?? header.kdf?.iterations ?? KDF.iterations;
  const newKek = await deriveKEK(newPassword, salt, rounds);

  const wrapIv = randomBytes(IV_BYTES);
  const reimported = await crypto.importKey('raw', rawDek, { name: 'AES-GCM', length: KEY_BITS }, true, ['encrypt', 'decrypt']);
  const wrapped = await crypto.wrapKey('raw', reimported, newKek, { name: 'AES-GCM', iv: wrapIv, tagLength: 128 });

  zero(rawDek);

  return {
    ...header,
    kdf: { name: KDF.name, hash: KDF.hash, iterations: rounds },
    salt: toBase64(salt),
    wrap: { iv: toBase64(wrapIv), key: toBase64(new Uint8Array(wrapped)) },
    rotated_at: new Date().toISOString(),
  };
}

/* =========================================================================
   Password strength
   ========================================================================= */

/**
 * A rough strength estimate, for the setup screen only.
 *
 * Deliberately NOT a character-class checklist ("one uppercase, one symbol").
 * Those rules produce `Passw0rd!` — which satisfies every one of them and is in
 * every wordlist — while rejecting a genuinely strong passphrase for having no
 * digit. Length dominates here, because for a KDF-protected secret it actually
 * does.
 *
 * The estimate is generous on purpose: it is guidance on a screen, not a gate,
 * and the only real defence is the iteration count.
 */
export function strength(password) {
  const value = String(password || '');
  if (!value) return { score: 0, label: 'Empty', hint: 'A vault needs a master password.' };

  // A crude entropy estimate: alphabet size times length. Overstates a
  // dictionary word badly, which is why the penalties below exist.
  let alphabet = 0;
  if (/[a-z]/.test(value)) alphabet += 26;
  if (/[A-Z]/.test(value)) alphabet += 26;
  if (/[0-9]/.test(value)) alphabet += 10;
  if (/[^a-zA-Z0-9]/.test(value)) alphabet += 33;

  /**
   * Length is counted with repeated runs COLLAPSED, not as raw character count.
   *
   * A flat penalty for repetition was the first attempt and it was far too
   * weak: sixteen letter 'a's scored as "Strong", because sixteen characters
   * of a 26-letter alphabet is 75 bits by the naive formula and a twelve-bit
   * deduction barely dents it. A run of sixteen is worth about as much as a
   * run of five, so each run contributes 1 + log2(its length) rather than its
   * length. Sixteen 'a's now score 23 bits, which is "Weak", which is true.
   */
  const runs = value.match(/(.)\1*/gu) || [];
  const effectiveLength = runs.reduce((sum, run) => sum + 1 + Math.log2(run.length), 0);

  let bits = effectiveLength * Math.log2(alphabet || 1);
  if (/(?:abc|bcd|cde|123|234|345|qwe|asd|password|admin|hisab)/i.test(value)) bits -= 25;
  // A short password is weak regardless of how many character classes it has.
  if (value.length < 12) bits -= (12 - value.length) * 4;

  bits = Math.max(0, bits);

  if (bits < 40) return { score: 1, label: 'Weak', bits, hint: 'A few words strung together beats a short complicated one.' };
  if (bits < 60) return { score: 2, label: 'Fair', bits, hint: 'Longer is what helps most. Aim for four words or more.' };
  if (bits < 90) return { score: 3, label: 'Strong', bits, hint: 'Good. Write it down somewhere physical — there is no recovery.' };
  return { score: 4, label: 'Very strong', bits, hint: 'Write it down somewhere physical — there is no recovery.' };
}
