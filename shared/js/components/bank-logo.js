/**
 * Hisab · Bank and wallet logos
 *
 *   import { bankLogo, institutions, findInstitution, accountLogo } from '…/components/bank-logo.js';
 *
 *   bankLogo('bkash', 40)            → markup: bKash's logo in a 40px tile
 *   accountLogo(account, 40)         → the right tile for an account row
 *   findInstitution('City Bank Ltd') → the City Bank entry, or null
 *
 * A tile is always drawn. With a self-hosted logo file (assets/banks/) it is
 * the logo on white; without one it is a MONOGRAM in the brand's own colour
 * (bKash pink with "bK", DBBL green with "DBBL"); for no institution at all it
 * is the account type's glyph in a tint. Never a grey placeholder: an account
 * list is read by these tiles before any name is.
 *
 * Returns markup strings, like icon() and formatMoneyHTML(): every part comes
 * from the data file or a number, and the one free-text value (a label) is
 * escaped.
 */

import { INSTITUTIONS } from '../data/institutions.js';
import { icon, esc } from '../core/dom.js';
import { siteURL } from '../core/paths.js';

export const institutions = INSTITUTIONS;

const BY_ID = new Map(INSTITUTIONS.map((i) => [i.id, i]));

/** An institution by id, or null. */
export function institution(id) {
  return BY_ID.get(String(id || '').toLowerCase()) || null;
}

/**
 * Match free text (an account's `institution` field, or its name) to an
 * institution. Longest spelling wins, whole words only, so "Bank Asia" is not
 * taken for a generic bank and "Dhaka Bank" does not match "Dhaka Bank Asia"
 * wrongly. Generic entries are never matched by text: they are the fallback.
 */
export function findInstitution(text) {
  const hay = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  if (!hay.trim()) return null;
  let best = null;
  let bestLen = 0;
  for (const inst of INSTITUTIONS) {
    if (inst.kind === 'generic') continue;
    for (const spelling of [inst.id, inst.name, ...(inst.match || [])]) {
      const needle = ` ${spelling.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
      if (needle.length > bestLen && hay.includes(needle)) { best = inst; bestLen = needle.length; }
    }
  }
  return best;
}

/** Account type → the generic tile used when no institution matches. */
const GENERIC_FOR_TYPE = {
  cash: 'cash', bank: 'bank', mfs: 'wallet', card: 'card', wallet: 'wallet',
  savings: 'bank', investment: 'bank',
};

/** The institution an account belongs to: its institution field, then its name, then its type. */
export function accountInstitution(account = {}) {
  return findInstitution(account.institution)
    || findInstitution(account.name)
    || institution(GENERIC_FOR_TYPE[account.type] || 'wallet');
}

/** The tile for an account. */
export function accountLogo(account, size = 40, opts = {}) {
  return bankLogo(accountInstitution(account), size, opts);
}

/**
 * The tile for an institution.
 *
 * @param {string|object} idOrInstitution
 * @param {number} [size=40]           px, square
 * @param {object} [opts]
 * @param {string} [opts.label]        makes it an image with this name; without
 *                                     one it is decorative (aria-hidden), which
 *                                     is right beside a visible name
 */
export function bankLogo(idOrInstitution, size = 40, { label = null } = {}) {
  const inst = typeof idOrInstitution === 'object' && idOrInstitution
    ? idOrInstitution
    : institution(idOrInstitution) || institution('bank');

  const s = Math.max(12, Math.round(size));
  const r = Math.round(s * 0.26);
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';

  // NO style attributes anywhere in here: the CSP is style-src 'self', which
  // blocks an inline style="" parsed from markup (the screenshots bypass CSP,
  // so they would not show it). Size is the width/height attributes, and the
  // brand colour is an SVG fill attribute, which is not style.

  if (inst.logo) {
    return `<img class="inst-logo inst-logo--img" src="${esc(siteURL(`assets/banks/${inst.logo}`))}"`
      + ` width="${s}" height="${s}" alt="${label ? esc(label) : ''}"${label ? '' : ' aria-hidden="true"'}`
      + ` loading="lazy" decoding="async">`;
  }

  if (inst.kind === 'generic') {
    const pad = Math.round(s * 0.23);
    const href = `${window.HISAB_SPRITE || ''}#i-${inst.icon || 'wallet'}`;
    return `<svg class="inst-logo inst-logo--generic inst-tint--${esc(inst.tint || 'accent')}" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" ${a11y}>`
      + `<rect class="inst-logo__ground" width="${s}" height="${s}" rx="${r}"/>`
      + `<use class="inst-logo__glyph" href="${esc(href)}" x="${pad}" y="${pad}" width="${s - 2 * pad}" height="${s - 2 * pad}"/>`
      + `</svg>`;
  }

  const text = inst.short || inst.name.slice(0, 2);
  const scale = [0.42, 0.42, 0.42, 0.33, 0.27, 0.23][Math.min(text.length, 5)];
  const brand = /^#[0-9a-f]{6}$/i.test(inst.color || '') ? inst.color : '#5C6270';
  return `<svg class="inst-logo inst-logo--mono" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" ${a11y}>`
    + `<rect width="${s}" height="${s}" rx="${r}" fill="${brand}"/>`
    + `<text class="inst-logo__text" x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="${(s * scale).toFixed(1)}" fill="${inkOn(brand)}">${esc(text)}</text>`
    + `</svg>`;
}

/** White or near-black lettering, whichever reads on the brand colour (WCAG luminance). */
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#FFFFFF';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (lum + 0.05)) >= 4.5 ? '#FFFFFF' : '#16181D';
}
