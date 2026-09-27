/**
 * Accounts · how an account looks
 *
 * The institution, its tile and its brand colour come from Dev A's shared
 * list (shared/js/data/institutions.js, shared/js/components/bank-logo.js).
 * This file adds only what an account CARD needs on top: the ground colour
 * the card is printed in, and the ink that reads on it.
 *
 * CARD GROUNDS ARE DATA, like the brand colours beside them: the colour a
 * card is printed in, not a design token. A known bank's card is its brand
 * colour; an account with a colour chosen in the form, or with no known
 * institution, is printed in one of eight deep grounds below. The choice the
 * owner makes is stored as a NAME (Account::COLOURS), never as a hex.
 */

import { institutions, accountInstitution, findInstitution, bankLogo, accountLogo } from '../../shared/js/components/bank-logo.js';

export { institutions, findInstitution, bankLogo, accountLogo };

/** The colour names an account can wear, in the order the form offers them. */
export const COLOURS = ['marigold', 'green', 'violet', 'blue', 'rose', 'teal', 'orange', 'slate'];

/** Deep enough for white lettering on every one; the swatch in the form is the token of the same name. */
const GROUNDS = {
  marigold: '#B7791F',
  green: '#11694A',
  violet: '#4B3B9A',
  blue: '#1D4F91',
  rose: '#A3264F',
  teal: '#0F6E78',
  orange: '#B4501A',
  slate: '#3A4556',
};

/** A card with no chosen colour and no brand prints in its type's ground. */
const BY_TYPE = { cash: 'green', bank: 'blue', mfs: 'rose', card: 'slate', wallet: 'teal', savings: 'violet', investment: 'marigold' };

/** White or near-black lettering, whichever clears 4.5:1 on the ground. */
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

/**
 * How an account's card is printed.
 *
 * @returns {{inst: object, ground: string, ink: string, vars: string}}
 *   `vars` is for data-vars (style-vars.js): the CSP blocks style="".
 */
export function cardLook(account) {
  const inst = accountInstitution(account);
  const chosen = COLOURS.includes(account.colour) ? GROUNDS[account.colour] : null;
  const brand = inst && inst.kind !== 'generic' && /^#[0-9a-f]{6}$/i.test(inst.color || '') ? inst.color : null;
  const ground = chosen || brand || GROUNDS[BY_TYPE[account.type] || 'slate'];
  const ink = inkOn(ground);
  return { inst, ground, ink, vars: `card:${ground};card-ink:${ink}` };
}

/** The picker's lists: banks for a bank or a card's issuer, wallets for mobile money. */
export const banks = () => institutions.filter((i) => i.kind === 'bank');
export const wallets = () => institutions.filter((i) => i.kind === 'mfs').slice(0, 4);
