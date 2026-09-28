/**
 * Hisab · institution and merchant matching test
 *
 *   node tools/test-institutions.mjs
 *
 * The cases that went wrong once: an ordinary word that is also a bank's id
 * or one-word name ("Trust fund", "One card", "Wise savings") must not take
 * that bank's logo and card colour, and a payee that is an everyday word
 * ("apple 1kg") must not become a merchant.
 */

globalThis.window = { matchMedia: () => ({ matches: false }), location: { href: 'http://localhost/', protocol: 'http:' } };

const { findInstitution } = await import('../shared/js/components/bank-logo.js');
const { findMerchant } = await import('../shared/js/components/merchant-logo.js');

let passed = 0;
const failures = [];
const is = (actual, expected, label) => {
  if (actual === expected) passed += 1;
  else failures.push(`${label}\n    expected ${expected}\n    actual   ${actual}`);
};
const inst = (t) => findInstitution(t)?.id ?? null;
const merch = (t) => findMerchant(t)?.id ?? null;

/* ---- Not a bank ---------------------------------------------------------- */
for (const t of ['Trust fund', 'Standard savings', 'Basic savings', 'One card', 'Wise savings',
  'City savings', 'Prime savings', 'Union dues', 'Rocket fund', 'Tap money', 'Premier league pool',
  'Community fund', 'Emergency fund', 'Home savings']) is(inst(t), null, `"${t}" is no institution`);

/* ---- A bank, by its real spellings ---------------------------------------- */
const hits = {
  'Trust Bank': 'trust', 'ONE Bank PLC': 'one', 'Standard Bank': 'standard', 'BASIC Bank': 'basic',
  'The City Bank': 'city', 'City': 'city', 'Wise': 'wise', 'TransferWise': 'wise', 'Wise account': 'wise',
  'bKash': 'bkash', 'DBBL Rocket': 'rocket', 'Rocket': 'rocket', 'Bank Asia': 'bankasia',
  'Dutch-Bangla Bank': 'dbbl', 'Emirates NBD': 'enbd', 'Islami Bank Bangladesh': 'ibbl',
  'Union Bank': 'union', 'Citibank': 'citi', 'Payoneer': 'payoneer', 'Mashreq Neo': 'mashreq',
};
for (const [t, id] of Object.entries(hits)) is(inst(t), id, `"${t}" is ${id}`);

/* ---- Merchants -------------------------------------------------------------- */
is(merch('apple 1kg'), null, 'apples are not Apple');
is(merch('Apple'), 'apple', 'Apple alone is Apple');
is(merch('dinner with Robi'), null, 'Robi the friend');
is(merch('Emirates NBD transfer'), null, 'the bank is not the airline');
is(merch('Uber Eats dinner'), 'uber', 'Uber Eats');
is(merch('Meena Bazar'), 'meenabazar', 'Meena Bazar');

if (failures.length) {
  console.error(`\n  ${failures.length} FAILED, ${passed} passed\n`);
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`  institutions — ${passed} assertions passed`);
