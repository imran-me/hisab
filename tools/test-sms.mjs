/**
 * Hisab · SMS parser test
 *
 *   node tools/test-sms.mjs
 *
 * modules/ledger/sms.js against messages in the shapes bKash, Nagad, Rocket
 * and the banks actually send (numbers, ids and balances changed). The cases
 * that break a parser like this: a fee read as the amount, a balance read as
 * the amount, a phone number or a TrxID read as money, a Cash Out counted as
 * spending, Indian digit grouping, and a two-digit year.
 *
 * Owned by track B (DIRECTION §4, B10). No framework, like test-money.mjs.
 */

import { parseSms, accountFor, cashAccount, seenTrx, trxNote } from '../modules/ledger/sms.js';

let passed = 0;
const failures = [];
function is(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed += 1; return; }
  failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}
const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k]]));
const KEYS = ['provider', 'kind', 'type', 'amount_minor', 'fee_minor', 'trx_id', 'occurred_on'];
const today = '2026-09-28';

const CASES = [
  // ---- bKash ---------------------------------------------------------------
  ['bKash received',
    'You have received Tk 1,500.00 from 01711223344. Fee Tk 0.00. Balance Tk 12,345.67. TrxID 9JK4LMNOPQ at 28/09/2026 14:32',
    { provider: 'bkash', kind: 'received', type: 'income', amount_minor: 150000, fee_minor: 0, trx_id: '9JK4LMNOPQ', occurred_on: '2026-09-28' },
    { counterparty: '01711223344', balance_minor: 1234567 }],
  ['bKash cash out: a transfer to cash, the fee separate',
    'Cash Out Tk 2,000.00 to Agent 01811223344 successful. Fee Tk 37.00. Balance Tk 8,963.00. TrxID 9JK4ABCDEF at 27/09/2026 10:05',
    { provider: 'bkash', kind: 'cash_out', type: 'transfer', amount_minor: 200000, fee_minor: 3700, trx_id: '9JK4ABCDEF', occurred_on: '2026-09-27' },
    { balance_minor: 896300 }],
  ['bKash send money with a reference',
    'Send Money Tk 500.00 to 01911223344 successful. Ref Rent. Fee Tk 5.00. Balance Tk 1,234.00. TrxID BIK7Q2W3E4 at 26/09/2026 21:10',
    { provider: 'bkash', kind: 'send', type: 'expense', amount_minor: 50000, fee_minor: 500, trx_id: 'BIK7Q2W3E4', occurred_on: '2026-09-26' },
    { counterparty: '01911223344' }],
  ['bKash merchant payment',
    'Payment Tk 640.00 to Foodpanda Bangladesh successful. Balance Tk 7,210.50. TrxID 9JL1PAYMNT at 28/09/2026 20:41',
    { provider: 'bkash', kind: 'payment', type: 'expense', amount_minor: 64000, fee_minor: 0, trx_id: '9JL1PAYMNT', occurred_on: '2026-09-28' },
    { counterparty: 'Foodpanda Bangladesh' }],
  ['bKash cash in from an agent: a transfer into the wallet',
    'Cash In Tk 5,000.00 from 01712345678 successful. Balance Tk 12,000.00. TrxID 9JM2CASHIN at 25/09/2026 09:12',
    { provider: 'bkash', kind: 'cash_in', type: 'transfer', amount_minor: 500000, fee_minor: 0, trx_id: '9JM2CASHIN', occurred_on: '2026-09-25' },
    {}],
  ['bKash mobile recharge, no date in the text',
    'Mobile Recharge Tk 100.00 to 01711000111 successful. Balance Tk 950.00. TrxID 9JN3RECHRG',
    { provider: 'bkash', kind: 'recharge', type: 'expense', amount_minor: 10000, fee_minor: 0, trx_id: '9JN3RECHRG', occurred_on: today },
    {}],

  // ---- Nagad ---------------------------------------------------------------
  ['Nagad money received, multi-line, no brand word',
    'Money Received.\nAmount: Tk 1500.00\nSender: 01712345678\nRef: N/A\nTxnID: 71ABCD2E\nBalance: Tk 3,200.50\n28/09/2026 14:32',
    { provider: 'nagad', kind: 'received', type: 'income', amount_minor: 150000, fee_minor: 0, trx_id: '71ABCD2E', occurred_on: '2026-09-28' },
    { counterparty: '01712345678', balance_minor: 320050 }],
  ['Nagad cash out with a charge',
    'Cash Out Tk 1,000.00 successful. Charge Tk 12.50. TxnID: 7A1B2C3D. Balance: Tk 2,187.50. 24/09/2026 10:15',
    { provider: 'nagad', kind: 'cash_out', type: 'transfer', amount_minor: 100000, fee_minor: 1250, trx_id: '7A1B2C3D', occurred_on: '2026-09-24' },
    {}],
  ['Nagad send money named',
    'Nagad: Send Money Tk 300.00 to 01812345678 successful. Charge: Tk 0.00 TxnID: 72XYZ9QW Balance: Tk 1,887.50 23-09-2026',
    { provider: 'nagad', kind: 'send', type: 'expense', amount_minor: 30000, fee_minor: 0, trx_id: '72XYZ9QW', occurred_on: '2026-09-23' },
    {}],

  // ---- Rocket (DBBL) ---------------------------------------------------------
  ['Rocket transfer, a two-digit year and a month name',
    'Tk500.00 transferred to A/C:01912345678 Fee:Tk5.00 TxnId:1234567890 Balance:Tk2,345.00 28-SEP-26 11:03 AM',
    { provider: 'rocket', kind: 'send', type: 'expense', amount_minor: 50000, fee_minor: 500, trx_id: '1234567890', occurred_on: '2026-09-28' },
    { counterparty: '01912345678', balance_minor: 234500 }],
  ['Rocket received',
    'Tk1,000.00 received from A/C:01712345678 TxnId:9876543210 Balance:Tk3,345.00 22-SEP-26 04:40 PM',
    { provider: 'rocket', kind: 'received', type: 'income', amount_minor: 100000, fee_minor: 0, trx_id: '9876543210', occurred_on: '2026-09-22' },
    { counterparty: '01712345678' }],
  ['Rocket cash out',
    'Cash-Out Tk2,000.00 from A/C:01912345678 Fee:Tk36.00 TxnId:5556667778 Balance:Tk309.00 21-SEP-26',
    { provider: 'rocket', kind: 'cash_out', type: 'transfer', amount_minor: 200000, fee_minor: 3600, trx_id: '5556667778', occurred_on: '2026-09-21' },
    {}],

  // ---- Banks -----------------------------------------------------------------
  ['bank debit at a shop: the balance is not the amount',
    'Dear Customer, your A/C ****1234 has been debited by BDT 2,500.00 on 28-Sep-2026 for POS purchase at SHWAPNO. Avl Bal BDT 45,210.00. Ref no 55123456',
    { provider: 'bank', kind: 'debit', type: 'expense', amount_minor: 250000, fee_minor: 0, trx_id: '55123456', occurred_on: '2026-09-28' },
    { tail: '1234', balance_minor: 4521000 }],
  ['bank salary credit with lakh grouping',
    'Your A/C XXXX5678 is credited with BDT 1,25,000.00 on 30/08/2026 (Salary). Available balance: BDT 1,98,456.00',
    { provider: 'bank', kind: 'credit', type: 'income', amount_minor: 12500000, fee_minor: 0, trx_id: null, occurred_on: '2026-08-30' },
    { tail: '5678', balance_minor: 19845600 }],
  ['card spend',
    'BDT 1,250.00 spent on your card ending 4321 at DARAZ on 28-09-2026. Avl limit BDT 48,750.00',
    { provider: 'bank', kind: 'debit', type: 'expense', amount_minor: 125000, fee_minor: 0, trx_id: null, occurred_on: '2026-09-28' },
    { tail: '4321', counterparty: 'DARAZ' }],
];

for (const [label, sms, want, extra] of CASES) {
  const r = parseSms(sms, { today });
  is(r.ok, true, `${label}: parsed`);
  if (!r.ok) continue;
  is(pick(r, KEYS), want, label);
  for (const [k, v] of Object.entries(extra)) is(r[k], v, `${label}: ${k}`);
}

// ---- refusals -----------------------------------------------------------
is(parseSms('').ok, false, 'empty text is refused');
is(parseSms('Your OTP for bKash is 123456. Do not share it.').ok, false, 'an OTP is not an entry');
is(parseSms('Hi, are we meeting at 5? Bring Tk 500').ok, false, 'a chat message is not an entry');

// ---- the account it belongs to -------------------------------------------
const accounts = [
  { id: 'cash', name: 'Cash in hand', type: 'cash' },
  { id: 'bk', name: 'bKash', type: 'mfs', institution: 'bKash' },
  { id: 'ng', name: 'Personal wallet', type: 'mfs', institution: 'Nagad' },
  { id: 'city', name: 'City Bank', type: 'bank', number_tail: '1234' },
  { id: 'old', name: 'Old bKash', type: 'mfs', institution: 'bKash', archived_at: '2026-01-01' },
];
is(accountFor(parseSms(CASES[0][1]), accounts)?.id, 'bk', 'a bKash SMS lands on the bKash wallet');
is(accountFor(parseSms(CASES[6][1]), accounts)?.id, 'ng', 'a Nagad SMS finds the wallet by institution');
is(accountFor(parseSms(CASES[12][1]), accounts)?.id, 'city', 'a bank SMS finds the account by its last digits');
is(accountFor(parseSms(CASES[13][1]), accounts), null, 'an unknown tail finds nothing rather than guessing');
is(cashAccount(accounts)?.id, 'cash', 'the cash end of a cash-out');

// ---- duplicates by TrxID ---------------------------------------------------
const rows = [{ id: 'r1', note: trxNote('9JK4LMNOPQ') }, { id: 'r2', note: 'TrxID 7A1B2C3D', reverses_id: 'x' }];
is(seenTrx('9jk4lmnopq', rows)?.id, 'r1', 'a TrxID already recorded is found, case aside');
is(seenTrx('7A1B2C3D', rows), null, 'a reversal mirror does not count as recorded');
is(seenTrx(null, rows), null, 'no TrxID, no duplicate check');

if (failures.length) {
  console.log(`  sms.js — ${failures.length} FAILED, ${passed} passed\n`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exit(1);
}
console.log(`  sms.js — ${passed} assertions passed`);
