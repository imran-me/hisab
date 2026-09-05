/**
 * Hisab · money.js test
 *
 *   node tools/test-money.mjs
 *
 * No test framework, because adding one would mean a package.json, a lockfile
 * and node_modules in a repository whose locked rule is "no build step". These
 * are assertions in a loop, they run in under a second, and they cover the
 * cases that actually break money code:
 *
 *   - a currency with three decimal places, and one with none
 *   - South Asian lakh/crore digit grouping
 *   - the float that parseFloat('1250.50') * 100 produces
 *   - negative rounding symmetry through an FX conversion
 *   - a split whose parts must sum exactly back to the whole
 */

import {
  parseAmount, formatMoney, formatMoneyHTML, convert, convertAndSum,
  splitMinor, sumMinor, currency, minorFactor,
} from '../shared/js/core/money.js';

let passed = 0;
const failures = [];

function is(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed += 1; return; }
  failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

function throws(fn, label) {
  try { fn(); failures.push(`${label}\n    expected a throw, got none`); }
  catch { passed += 1; }
}

/* ---- The registry ------------------------------------------------------- */
is(currency('BDT').minorUnit, 2, 'BDT has two decimal places');
is(currency('KWD').minorUnit, 3, 'KWD has three decimal places');
is(currency('JPY').minorUnit, 0, 'JPY has none');
is(minorFactor('KWD'), 1000, 'KWD minor factor is 1000, not 100');
is(currency('ZZZ').code, 'ZZZ', 'an unknown code still renders rather than throwing');

/* ---- Parsing ------------------------------------------------------------ */
is(parseAmount('1250.50', 'BDT'), 125050, 'plain decimal');
is(parseAmount('1,250.50', 'BDT'), 125050, 'western grouping is stripped');
is(parseAmount('1,25,050', 'BDT'), 12505000, 'Indian grouping is stripped');
is(parseAmount('  450 ', 'BDT'), 45000, 'surrounding space');
is(parseAmount('৳ 1250', 'BDT'), 125000, 'a symbol in the field');
is(parseAmount('-450', 'BDT'), -45000, 'leading minus');
is(parseAmount('(450)', 'BDT'), -45000, 'accounting parentheses are negative');
is(parseAmount('.5', 'BDT'), 50, 'a bare fraction');
is(parseAmount('১২৫০', 'BDT'), 125000, 'Bengali digits');
is(parseAmount('٤٥٠', 'BDT'), 45000, 'Arabic-Indic digits');
is(parseAmount('1,250', 'BDT'), 125000, "'1,250' is one thousand two fifty, not 1.25");
is(parseAmount('1.234,56', 'BDT'), 123456, 'European separators: the last one is the decimal');
is(parseAmount('12.345', 'KWD'), 12345, 'three decimal places are kept for KWD');
is(parseAmount('4200', 'JPY'), 4200, 'a zero-decimal currency does not get scaled');
is(parseAmount('12.999', 'BDT'), 1299, 'a third decimal is truncated, never rounded up');
is(parseAmount('abc', 'BDT'), null, 'unreadable input is null, NOT zero');
is(parseAmount('', 'BDT'), null, 'empty is null');
is(parseAmount(null, 'BDT'), null, 'null is null');

// The specific float this module exists to avoid.
is(parseAmount('1250.50', 'BDT'), Math.round(1250.50 * 100), 'agrees with the float on a case where the float is right');
is(parseAmount('0.29', 'BDT'), 29, '0.29 — parseFloat("0.29")*100 is 28.999999999999996');
is(parseAmount('8.87', 'BDT'), 887, '8.87 — the classic float rounding case');

/* ---- Formatting --------------------------------------------------------- */
is(formatMoney(125050, 'BDT'), '1,250.50', 'BDT basic');
is(formatMoney(12345678, 'BDT'), '1,23,456.78', 'BDT groups in the Indian style');
is(formatMoney(1234567890, 'BDT'), '1,23,45,678.90', 'a crore-scale figure');
is(formatMoney(12345678, 'USD'), '123,456.78', 'USD groups in threes');
is(formatMoney(12345, 'KWD'), '12.345', 'KWD keeps three decimals');
is(formatMoney(4200, 'JPY'), '4,200', 'JPY shows no decimal part at all');
is(formatMoney(-45000, 'BDT'), '−450.00', 'negative uses a true minus sign');
is(formatMoney(45000, 'BDT', { sign: 'always' }), '+450.00', 'explicit plus when asked');
is(formatMoney(125050, 'BDT', { code: true }), 'BDT 1,250.50', 'code prefix');
is(formatMoney(125050, 'BDT', { symbol: true }), '৳1,250.50', 'symbol prefix');
is(formatMoney(125050, 'BDT', { decimals: false }), '1,250', 'decimals suppressed');
is(formatMoney(0, 'BDT'), '0.00', 'zero renders');

/* Compact — the axis-label form. */
is(formatMoney(12345600, 'BDT', { compact: true }), '1.2L', 'lakh');
is(formatMoney(1234560000, 'BDT', { compact: true }), '1.2Cr', 'crore');
is(formatMoney(12345600, 'USD', { compact: true }), '123k', 'thousands for a western currency');
is(formatMoney(1234560000, 'USD', { compact: true }), '12M', 'millions');

/* HTML form */
is(
  formatMoneyHTML(125050, 'BDT'),
  '<span class="money__code">BDT</span>1,250<span class="money__minor">.50</span>',
  'HTML splits the code and the minor part'
);
is(
  formatMoneyHTML(4200, 'JPY'),
  '<span class="money__code">JPY</span>4,200',
  'no minor span for a zero-decimal currency'
);

/* ---- Round trip --------------------------------------------------------- */
for (const [text, code] of [['1250.50', 'BDT'], ['12.345', 'KWD'], ['4200', 'JPY'], ['0.01', 'USD']]) {
  const minor = parseAmount(text, code);
  is(parseAmount(formatMoney(minor, code), code), minor, `round trip ${text} ${code}`);
}

/* ---- Conversion --------------------------------------------------------- */
is(convert(10000, 'USD', 'BDT', 122.5), 1225000, 'USD 100 at 122.5 is BDT 12,250');
is(convert(1225000, 'BDT', 'USD', 1 / 122.5), 10000, 'and back again');
is(convert(10000, 'USD', 'JPY', 157.2), 15720, 'into a zero-decimal currency');
// USD 100.00 at 0.307 is KD 30.700, which is 30700 fils — not 3070. The first
// version of this assertion had the wrong expectation, which is precisely the
// mistake a hardcoded /100 makes in production.
is(convert(10000, 'USD', 'KWD', 0.307), 30700, 'into a three-decimal currency');
is(convert(5000, 'BDT', 'BDT', 1), 5000, 'same currency is a passthrough');
is(convert(5000, 'USD', 'BDT', 0), null, 'a zero rate is refused, not applied');
is(convert(5000, 'USD', 'BDT', NaN), null, 'a missing rate is refused');

// Rounding symmetry: an expense and a refund of the same size must convert to
// the same magnitude. Math.round alone does not guarantee this.
{
  const rate = 122.4567;
  const plus = convert(12345, 'USD', 'BDT', rate);
  const minus = convert(-12345, 'USD', 'BDT', rate);
  is(minus, -plus, 'negative conversion rounds symmetrically');
}

/* ---- Summing ------------------------------------------------------------ */
is(
  sumMinor([{ amount_minor: 100, currency: 'BDT' }, { amount_minor: 250, currency: 'BDT' }]),
  { amountMinor: 350, currency: 'BDT' },
  'same-currency sum'
);

throws(
  () => sumMinor([{ amount_minor: 100, currency: 'BDT' }, { amount_minor: 250, currency: 'USD' }]),
  'a mixed-currency sum throws instead of returning a meaningless number'
);

{
  const rows = [
    { amount_minor: 100000, currency: 'BDT' },
    { amount_minor: 10000, currency: 'USD' },
    { amount_minor: 5000, currency: 'XYZ' },   // no rate on purpose
  ];
  const out = convertAndSum(rows, 'BDT', { 'USD/BDT': 122.5 });
  is(out.amountMinor, 100000 + 1225000, 'converted total covers what it could convert');
  is(out.missing, ['XYZ'], 'and reports what it could not, rather than dropping it silently');
}

/* ---- Splitting ---------------------------------------------------------- */
{
  // 100.00 three ways: 33.34 / 33.33 / 33.33, summing to exactly 100.00.
  const parts = splitMinor(10000, [1, 1, 1]);
  is(parts.reduce((a, b) => a + b, 0), 10000, 'a three-way split sums back exactly');
  is(parts, [3334, 3333, 3333], 'the leftover unit goes to one share, not to none');
}

{
  const parts = splitMinor(10000, [60, 25, 15]);
  is(parts.reduce((a, b) => a + b, 0), 10000, 'a weighted split sums back exactly');
  is(parts, [6000, 2500, 1500], 'clean weights split cleanly');
}

{
  // The pathological one: seven ways, where six of the seven need a leftover.
  const parts = splitMinor(10000, [1, 1, 1, 1, 1, 1, 1]);
  is(parts.reduce((a, b) => a + b, 0), 10000, 'a seven-way split still sums back exactly');
}

is(splitMinor(10000, [0, 0]), [0, 0], 'zero weights do not divide by zero');

/* ---- Report ------------------------------------------------------------- */
if (failures.length) {
  console.error(`\n  ${failures.length} FAILED, ${passed} passed\n`);
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`  money.js — ${passed} assertions passed`);
