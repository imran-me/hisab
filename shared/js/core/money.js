/**
 * Hisab · Money
 *
 * THE RULE: an amount is an INTEGER in the currency's minor unit, plus a
 * currency code. Never a float, never a formatted string, never a number of
 * "taka" with a decimal point.
 *
 *   { amountMinor: 125050, currency: 'BDT' }   // ৳1,250.50
 *   { amountMinor: 4200,   currency: 'JPY' }   // ¥4,200   — no minor unit
 *   { amountMinor: 12345,  currency: 'KWD' }   // KD 12.345 — three places
 *
 * Two things follow from that, and both have bitten every expense tracker that
 * got them wrong:
 *
 * 1. THE NUMBER OF DECIMAL PLACES IS A PROPERTY OF THE CURRENCY, NOT A
 *    CONSTANT 2. Dividing by 100 turns 12345 fils of Kuwaiti dinar into
 *    KD 123.45 instead of KD 12.345, and 4200 yen into ¥42. Every conversion
 *    in this file goes through the currency's `minorUnit`.
 *
 * 2. FLOATS CANNOT HOLD MONEY. 0.1 + 0.2 is 0.30000000000000004, and a year of
 *    a ledger accumulates that. Arithmetic happens on integers here and the
 *    only float in the file is the FX rate, which is deliberately applied once,
 *    at a documented rounding step, rather than being carried around.
 */

/**
 * The currency registry.
 *
 * This mirrors the `currencies` table — the database is the source of truth and
 * this is the offline fallback the frontend boots from before /api/currencies
 * answers. `minorUnit` is ISO 4217's exponent, which is the only reason these
 * numbers are not all 2.
 *
 * `group` is the digit-grouping style, and it is NOT cosmetic: the South Asian
 * lakh/crore grouping puts the separators at 2,2,3 from the right
 * (1,23,45,678) rather than 3,3,3 (12,345,678). A Bangladeshi reading a taka
 * figure grouped in the Western style has to count digits to know whether it is
 * lakhs or millions, which is exactly the moment of doubt this app exists to
 * remove.
 */
export const CURRENCIES = {
  BDT: { code: 'BDT', symbol: '৳',   name: 'Bangladeshi taka',   minorUnit: 2, group: 'indian',  symbolFirst: true },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE dirham',         minorUnit: 2, group: 'western', symbolFirst: true },
  USD: { code: 'USD', symbol: '$',   name: 'US dollar',          minorUnit: 2, group: 'western', symbolFirst: true },
  EUR: { code: 'EUR', symbol: '€',   name: 'Euro',               minorUnit: 2, group: 'western', symbolFirst: true },
  GBP: { code: 'GBP', symbol: '£',   name: 'Pound sterling',     minorUnit: 2, group: 'western', symbolFirst: true },
  SAR: { code: 'SAR', symbol: '﷼',   name: 'Saudi riyal',        minorUnit: 2, group: 'western', symbolFirst: true },
  INR: { code: 'INR', symbol: '₹',   name: 'Indian rupee',       minorUnit: 2, group: 'indian',  symbolFirst: true },
  PKR: { code: 'PKR', symbol: '₨',   name: 'Pakistani rupee',    minorUnit: 2, group: 'indian',  symbolFirst: true },
  MYR: { code: 'MYR', symbol: 'RM',  name: 'Malaysian ringgit',  minorUnit: 2, group: 'western', symbolFirst: true },
  SGD: { code: 'SGD', symbol: 'S$',  name: 'Singapore dollar',   minorUnit: 2, group: 'western', symbolFirst: true },
  CAD: { code: 'CAD', symbol: 'C$',  name: 'Canadian dollar',    minorUnit: 2, group: 'western', symbolFirst: true },
  AUD: { code: 'AUD', symbol: 'A$',  name: 'Australian dollar',  minorUnit: 2, group: 'western', symbolFirst: true },
  // Three decimal places. Present specifically so the /100 assumption cannot
  // survive a test run.
  KWD: { code: 'KWD', symbol: 'KD',  name: 'Kuwaiti dinar',      minorUnit: 3, group: 'western', symbolFirst: true },
  BHD: { code: 'BHD', symbol: 'BD',  name: 'Bahraini dinar',     minorUnit: 3, group: 'western', symbolFirst: true },
  OMR: { code: 'OMR', symbol: 'ر.ع', name: 'Omani rial',         minorUnit: 3, group: 'western', symbolFirst: true },
  // No minor unit at all.
  JPY: { code: 'JPY', symbol: '¥',   name: 'Japanese yen',       minorUnit: 0, group: 'western', symbolFirst: true },
  KRW: { code: 'KRW', symbol: '₩',   name: 'South Korean won',   minorUnit: 0, group: 'western', symbolFirst: true },
};

/** A currency the registry has never heard of still has to render. */
const FALLBACK = { code: '???', symbol: '', name: 'Unknown currency', minorUnit: 2, group: 'western', symbolFirst: true };

/**
 * Registry lookup. Unknown codes get a 2-place western fallback rather than
 * throwing: a report must still render when one row references a currency that
 * has since been deactivated.
 */
export function currency(code) {
  if (!code) return FALLBACK;
  return CURRENCIES[String(code).toUpperCase()] || { ...FALLBACK, code: String(code).toUpperCase() };
}

/**
 * Replace the registry with the server's list, once /api/currencies answers.
 * Merged rather than assigned, so a currency the server has not sent yet keeps
 * working from the fallback above instead of disappearing mid-session.
 */
export function registerCurrencies(rows = []) {
  for (const row of rows) {
    if (!row || !row.code) continue;
    const code = String(row.code).toUpperCase();
    CURRENCIES[code] = {
      code,
      symbol: row.symbol ?? code,
      name: row.name ?? code,
      minorUnit: Number.isInteger(row.minor_unit) ? row.minor_unit : (CURRENCIES[code]?.minorUnit ?? 2),
      group: row.group ?? CURRENCIES[code]?.group ?? 'western',
      symbolFirst: row.symbol_first ?? CURRENCIES[code]?.symbolFirst ?? true,
    };
  }
}

/** 10 ** minorUnit — how many minor units make one major unit. */
export function minorFactor(code) {
  return 10 ** currency(code).minorUnit;
}

/* =========================================================================
   Parsing — text a person typed, to integer minor units
   ========================================================================= */

/**
 * Parse what someone typed into integer minor units.
 *
 * Handles: '1250.50', '1,250.50', '1,25,050' (Indian grouping), '১২৫০' (Bengali
 * digits), ' 1250 ', '-450', '(450)' as negative, and a bare '.5'.
 *
 * Returns null for anything it cannot read — NOT 0. A silent zero is the worst
 * possible answer here, because it saves a transaction that looks deliberate
 * and is wrong; null makes the caller show a validation error instead.
 *
 * The scaling deliberately does NOT use `Math.round(value * factor)` on a
 * parsed float: parseFloat('1250.50') * 100 is 125049.99999999999 for some
 * inputs, and rounding hides that only until it does not. The decimal string is
 * split and padded instead, so the result is exact by construction.
 */
export function parseAmount(input, code = 'BDT') {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    // A number that arrived as a float is already suspect, but it is well
    // defined for whole numbers, which is how a calculator result gets here.
    if (!Number.isFinite(input)) return null;
    return Math.round(input * minorFactor(code));
  }

  let text = String(input).trim();
  if (!text) return null;

  // Bengali and Arabic-Indic digits, so a figure typed on a Bangla keyboard is
  // not rejected as unreadable.
  text = text
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  // Accounting parentheses mean negative.
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  if (/^-/.test(text)) { negative = true; text = text.slice(1); }
  if (/^\+/.test(text)) text = text.slice(1);

  // Strip currency symbols, codes, spaces and grouping separators. The decimal
  // point is whatever separator appears LAST — '1.234,56' (European) and
  // '1,234.56' (Anglo) are both unambiguous under that rule.
  text = text.replace(/[^\d.,]/g, '');
  if (!text) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let decimalAt = Math.max(lastDot, lastComma);

  // A lone COMMA with exactly three digits after it is grouping, not a decimal
  // point: '1,250' is one thousand two hundred and fifty, not 1.25.
  //
  // The same rule must NOT be applied to a dot. It was, at first, and it read
  // '12.999' as twelve thousand nine hundred and ninety-nine — a hundredfold
  // error on a perfectly ordinary typo in a two-decimal currency. In
  // Bangladesh, the Gulf and every locale this app targets, a dot is a decimal
  // separator; only a comma is ambiguous. The European '1.234,56' still parses
  // correctly because it contains BOTH separators, and the last one wins.
  if (decimalAt > -1 && decimalAt === lastComma && lastDot === -1) {
    const tail = text.length - decimalAt - 1;
    if (tail === 3) decimalAt = -1;
  }

  let whole, frac;
  if (decimalAt === -1) {
    whole = text.replace(/[.,]/g, '');
    frac = '';
  } else {
    whole = text.slice(0, decimalAt).replace(/[.,]/g, '');
    frac = text.slice(decimalAt + 1).replace(/[.,]/g, '');
  }

  if (!whole && !frac) return null;
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) return null;

  const places = currency(code).minorUnit;
  // Pad or truncate the fraction to the currency's precision. Truncation
  // rather than rounding: someone typing a third decimal into a two-place
  // currency has made a typing error, and rounding it up quietly adds money
  // that was never entered.
  const scaled = (frac + '0'.repeat(places)).slice(0, places);
  const minor = Number((whole || '0') + scaled);

  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/* =========================================================================
   Formatting — integer minor units, to text a person reads
   ========================================================================= */

/**
 * Group the integer part.
 *
 * 'western' — 3,3,3 from the right.
 * 'indian'  — 3 then 2,2 from the right: 1,23,45,678 (one crore twenty-three
 *             lakh …). Getting this wrong is not a formatting nicety; it
 *             changes the magnitude a Bangladeshi reader perceives.
 */
function groupDigits(digits, style) {
  if (style !== 'indian' || digits.length <= 3) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/**
 * Format an integer minor amount as text.
 *
 * @param {number} minor          integer minor units; may be negative
 * @param {string} code           currency code
 * @param {object} [opts]
 * @param {boolean} [opts.symbol=false]   prefix the currency symbol
 * @param {boolean} [opts.code=false]     prefix the ISO code (preferred in
 *                                        multi-currency lists — '৳' and '₹'
 *                                        are distinct but 'RM' and 'R$' are
 *                                        not, and a code never is)
 * @param {boolean} [opts.decimals=true]  show the minor part
 * @param {'auto'|'always'|'never'} [opts.sign='auto']
 * @param {boolean} [opts.compact=false]  1.2L / 3.4Cr / 1.2M for chart labels
 */
export function formatMoney(minor, code = 'BDT', opts = {}) {
  const cur = currency(code);
  const {
    symbol = false,
    code: showCode = false,
    decimals = true,
    sign = 'auto',
    compact = false,
  } = opts;

  const n = Number.isFinite(minor) ? Math.trunc(minor) : 0;
  const negative = n < 0;
  const abs = Math.abs(n);

  let body;
  if (compact) {
    body = compactBody(abs, cur);
  } else {
    const factor = 10 ** cur.minorUnit;
    // Integer division and remainder — never abs / factor, which reintroduces
    // the float this whole module exists to avoid.
    const whole = Math.floor(abs / factor);
    const rest = abs % factor;
    body = groupDigits(String(whole), cur.group);
    if (decimals && cur.minorUnit > 0) {
      body += '.' + String(rest).padStart(cur.minorUnit, '0');
    }
  }

  let prefix = '';
  if (showCode) prefix = cur.code + ' ';
  else if (symbol && cur.symbolFirst) prefix = cur.symbol;

  const suffix = (symbol && !cur.symbolFirst) ? ' ' + cur.symbol : '';

  let signChar = '';
  if (negative) signChar = '−';                      // U+2212, not a hyphen: a
  else if (sign === 'always' && n > 0) signChar = '+'; // hyphen is narrower than
                                                       // a digit and breaks the
                                                       // tabular alignment.
  if (sign === 'never') signChar = '';

  return signChar + prefix + body + suffix;
}

/** 1.2L, 3.45Cr, 1.2M, 850 — for axis labels and chips where space is the constraint. */
function compactBody(absMinor, cur) {
  const major = absMinor / 10 ** cur.minorUnit;
  const round = (v) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v)));

  if (cur.group === 'indian') {
    if (major >= 1e7) return round(major / 1e7) + 'Cr';
    if (major >= 1e5) return round(major / 1e5) + 'L';
    if (major >= 1e3) return round(major / 1e3) + 'k';
  } else {
    if (major >= 1e9) return round(major / 1e9) + 'B';
    if (major >= 1e6) return round(major / 1e6) + 'M';
    if (major >= 1e3) return round(major / 1e3) + 'k';
  }
  return round(major);
}

/**
 * The same figure as HTML, with the code and the minor part in their own spans
 * so `.money__code` and `.money__minor` can set them smaller and dimmer.
 *
 * Returns a STRING of markup. Every part of it is generated from a number and a
 * registry entry, so there is no user-supplied text in the output and nothing
 * to escape — which is stated here because that is the assumption a future
 * change would break.
 */
export function formatMoneyHTML(minor, code = 'BDT', opts = {}) {
  const cur = currency(code);
  const n = Number.isFinite(minor) ? Math.trunc(minor) : 0;
  const abs = Math.abs(n);
  const factor = 10 ** cur.minorUnit;
  const whole = groupDigits(String(Math.floor(abs / factor)), cur.group);
  const rest = abs % factor;

  const sign = n < 0 ? '<span class="money__sign">−</span>'
    : (opts.sign === 'always' && n > 0 ? '<span class="money__sign">+</span>' : '');

  const codePart = opts.code === false ? '' : `<span class="money__code">${cur.code}</span>`;
  const minorPart = (cur.minorUnit > 0 && opts.decimals !== false)
    ? `<span class="money__minor">.${String(rest).padStart(cur.minorUnit, '0')}</span>`
    : '';

  return codePart + sign + whole + minorPart;
}

/* =========================================================================
   Arithmetic
   ========================================================================= */

/**
 * Sum a list of same-currency amounts.
 *
 * THROWS on a mixed-currency list rather than returning a number. Summing two
 * currencies produces a figure that is not wrong by a little — it is
 * meaningless, and it would flow into a dashboard tile looking authoritative.
 * Cross-currency totals go through convert() and are labelled as converted.
 */
export function sumMinor(rows, { amountKey = 'amount_minor', currencyKey = 'currency' } = {}) {
  let total = 0;
  let code = null;
  for (const row of rows) {
    const c = row[currencyKey];
    if (code === null) code = c;
    else if (c !== code) {
      throw new TypeError(`sumMinor: mixed currencies (${code} and ${c}). Use convertAndSum().`);
    }
    total += Math.trunc(row[amountKey] || 0);
  }
  return { amountMinor: total, currency: code };
}

/**
 * Convert an amount between currencies.
 *
 * `rate` is the number of TARGET major units per one SOURCE major unit — the
 * direction people quote, and the direction the fx module stores.
 *
 * The rounding step is here and nowhere else, and it happens exactly once:
 * scale to the target's minor precision, then round half away from zero, so a
 * negative amount rounds the same distance as its positive twin. JavaScript's
 * Math.round rounds −0.5 to −0 (toward +∞), which makes an expense and a refund
 * of the same size differ by one minor unit.
 */
export function convert(minor, fromCode, toCode, rate) {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const from = currency(fromCode);
  const to = currency(toCode);
  if (from.code === to.code) return Math.trunc(minor);

  const major = minor / 10 ** from.minorUnit;
  const targetMajor = major * rate;
  const scaled = targetMajor * 10 ** to.minorUnit;

  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/**
 * Sum a mixed-currency list into one target currency.
 *
 * Returns the total AND the parts it could not convert. A missing rate is
 * never treated as 1 and never silently dropped: the caller is told, so the
 * UI can say "plus 2 accounts in currencies with no rate" instead of quietly
 * under-reporting a balance.
 */
export function convertAndSum(rows, toCode, rates, { amountKey = 'amount_minor', currencyKey = 'currency' } = {}) {
  let total = 0;
  const missing = new Set();

  for (const row of rows) {
    const from = row[currencyKey];
    const minor = Math.trunc(row[amountKey] || 0);
    if (from === toCode) { total += minor; continue; }

    const rate = rates?.[`${from}/${toCode}`];
    if (!Number.isFinite(rate)) { missing.add(from); continue; }

    const converted = convert(minor, from, toCode, rate);
    if (converted === null) { missing.add(from); continue; }
    total += converted;
  }

  return { amountMinor: total, currency: toCode, missing: [...missing] };
}

/**
 * Split an amount into n parts that sum EXACTLY back to it.
 *
 * Used by investment share splits and by shared bills. The naive version —
 * dividing and rounding each share — loses or invents up to n−1 minor units,
 * which over a year of splitting a rent bill three ways is a real discrepancy
 * that nobody can trace. Here the remainder is distributed one unit at a time
 * to the earliest shares, so the sum is exact by construction.
 */
export function splitMinor(minor, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);

  const base = weights.map((w) => Math.floor((minor * w) / total));
  let remainder = minor - base.reduce((a, b) => a + b, 0);

  // Give the leftover units to the largest weights first — a rounding gain
  // should land on the biggest share, not on whoever happens to be first in
  // the array.
  const order = weights
    .map((w, i) => [w, i])
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);

  let k = 0;
  while (remainder > 0 && order.length) {
    base[order[k % order.length]] += 1;
    remainder -= 1;
    k += 1;
  }
  return base;
}

/** Percentage of a whole, guarded against the divide-by-zero that an empty month is. */
export function shareOf(part, whole) {
  if (!whole) return 0;
  return (part / whole) * 100;
}
