/**
 * Ledger · read a bKash, Nagad, Rocket or bank SMS
 *
 *   parseSms(text, { today: '2026-09-28' })
 *     → { ok: true, provider, kind, type, amount_minor, fee_minor, currency,
 *         trx_id, counterparty, balance_minor, occurred_on, tail }
 *     | { ok: false, reason }
 *
 * Pure: no DOM, no storage, no network, so tools/test-sms.mjs runs it in
 * Node against real message formats. The entry sheet does the rest.
 *
 * What it gets right on purpose:
 *
 * · THE FEE IS ITS OWN FIGURE. "Cash Out Tk 2,000.00 … Fee Tk 37.00" is a
 *   2,000 cash-out and a 37 charge. Folding them into one 2,037 row hides
 *   what the wallet costs, which is the number people want to see
 *   (DIRECTION §3.4: the fee becomes its own "Fees & charges" line).
 * · THE BALANCE IS NOT THE AMOUNT. Every one of these messages carries two
 *   or three taka figures; the amount is the one attached to the verb, the
 *   fee to "Fee"/"Charge", the balance to "Balance"/"Avl Bal". Anything else
 *   (a phone number, a TrxID full of digits) is never read as money.
 * · THE KIND DECIDES THE TYPE. Received, Cash In (from an agent), a bank
 *   credit: money in. Payment, Send Money, Recharge, Bill Pay, a debit or a
 *   card spend: money out. Cash Out is a TRANSFER from the wallet to cash,
 *   and Cash In at an agent is a transfer from cash into the wallet: the
 *   money is still the owner's, and counting it as spending or income would
 *   make both figures wrong.
 * · THE TRXID is returned as written (upper-cased), for duplicate detection.
 *
 * Integer minor units throughout, through money.js's parseAmount (exact, no
 * floats; Indian grouping like 1,23,456.00 is read correctly).
 */

import { parseAmount } from '../../shared/js/core/money.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/* A taka figure: "Tk 1,500.00", "Tk1500", "BDT 2,500.00", "৳640". */
const MONEY = String.raw`(?:tk\.?|bdt|৳)\s*:?\s*([\d,]+(?:\.\d{1,2})?)`;
const money = (re, text) => {
  const m = re.exec(text);
  return m ? parseAmount(m[1], 'BDT') : null;
};

/** Which service sent it. Decided by vocabulary, not by a sender id we never see. */
function providerOf(t) {
  if (/\bbkash\b/.test(t)) return 'bkash';
  if (/\bnagad\b/.test(t)) return 'nagad';
  if (/\brocket\b|\bdbbl\b|a\/c:\s*0\d{10,11}/.test(t)) return 'rocket';
  if (/\btxnid\b/.test(t) && !/\ba\/c\b/.test(t)) return 'nagad';
  if (/\btrxid\b/.test(t)) return 'bkash';
  if (/\b(a\/c|acct?|account|card)\b.*\b(debited|credited|spent|withdrawn|deposited|purchase)\b|\b(debited|credited)\b/.test(t)) return 'bank';
  if (/\b(spent|purchase)\b.*\bcard\b/.test(t)) return 'bank';
  return null;
}

/**
 * The verb, and the direction it moves the wallet or account. Order
 * matters: "Cash Out" before "out", "Send Money" before "money received".
 */
const KINDS = [
  { kind: 'cash_out', type: 'transfer', dir: 'out', re: /\bcash[\s-]?out\b/ },
  { kind: 'cash_in', type: 'transfer', dir: 'in', re: /\bcash[\s-]?in\b/ },
  { kind: 'received', type: 'income', dir: 'in', re: /\b(you have received|money received|received|received from)\b/ },
  { kind: 'send', type: 'expense', dir: 'out', re: /\b(send money|sent|transferred)\b/ },
  { kind: 'recharge', type: 'expense', dir: 'out', re: /\b(mobile recharge|recharge|top[\s-]?up)\b/ },
  { kind: 'bill', type: 'expense', dir: 'out', re: /\b(bill pay(ment)?|pay bill|bill)\b/ },
  { kind: 'payment', type: 'expense', dir: 'out', re: /\b(payment|merchant pay|paid)\b/ },
  { kind: 'credit', type: 'income', dir: 'in', re: /\b(credited|deposited|deposit)\b/ },
  { kind: 'debit', type: 'expense', dir: 'out', re: /\b(debited|withdrawn|spent|purchase|pos)\b/ },
];

/**
 * @param {string} text   the SMS as pasted
 * @param {object} [opts]
 * @param {string} [opts.today]  YYYY-MM-DD, for a message with no date
 */
export function parseSms(text, { today = null } = {}) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (raw.length < 12) return { ok: false, reason: 'empty' };
  const t = raw.toLowerCase();

  const provider = providerOf(t);
  if (!provider) return { ok: false, reason: 'unknown' };

  const found = KINDS.find((k) => k.re.test(t));
  if (!found) return { ok: false, reason: 'unknown' };

  // The amount: the figure attached to the verb, else labelled "Amount", else
  // the first taka figure that is not a fee or a balance.
  const amount = money(new RegExp(String.raw`amount\s*:?\s*${MONEY}`, 'i'), raw)
    ?? money(new RegExp(String.raw`(?:debited|credited|withdrawn|deposited)\s+(?:by|with|of|for)?\s*${MONEY}`, 'i'), raw)
    ?? firstPlain(raw);
  if (!amount || amount <= 0) return { ok: false, reason: 'no-amount' };

  const fee = money(new RegExp(String.raw`\b(?:fee|charge|charges|vat)\s*:?\s*${MONEY}`, 'i'), raw) || 0;
  const balance = money(new RegExp(String.raw`(?:balance|avl\.?\s*bal\.?|available balance|avail(?:able)?\s*bal(?:ance)?)\s*(?:is)?\s*:?\s*${MONEY}`, 'i'), raw);

  const trx = /\b(?:trx\s*id|txn\s*id|trans(?:action)?\s*id|txnid|trxid|ref(?:erence)?\s*no\.?)\s*[:#]?\s*([A-Z0-9]{6,20})\b/i.exec(raw);

  return {
    ok: true,
    provider,
    kind: found.kind,
    type: found.type,
    direction: found.dir,
    amount_minor: amount,
    fee_minor: fee,
    currency: 'BDT',
    trx_id: trx ? trx[1].toUpperCase() : null,
    counterparty: counterpartyOf(raw, found.kind),
    balance_minor: balance,
    occurred_on: dateOf(raw) || today,
    // The masked account or card number a bank message names ("****1234").
    tail: (/(?:a\/c|acct?|account|card)[^\d*x]{0,20}[*x]{2,}\s*(\d{3,4})\b/i.exec(raw)
      || /card ending\s*(?:with)?\s*(\d{4})/i.exec(raw))?.[1] || null,
  };
}

/** The first taka figure that is not labelled as a fee, a charge or a balance. */
function firstPlain(raw) {
  const re = new RegExp(MONEY, 'gi');
  let m;
  while ((m = re.exec(raw))) {
    const before = raw.slice(Math.max(0, m.index - 22), m.index).toLowerCase();
    // \b: "Recharge Tk 100" is an amount, not a charge.
    if (/\b(fee|charges?|vat|balance|bal\.?|limit)\s*:?\s*$/.test(before)) continue;
    const v = parseAmount(m[1], 'BDT');
    if (v) return v;
  }
  return null;
}

/** Who the money went to or came from: a merchant name or a number. */
function counterpartyOf(raw, kind) {
  const patterns = kind === 'received' || kind === 'cash_in' || kind === 'credit'
    ? [/\b(?:from|sender)\s*:?\s*(?:a\/c:?\s*)?([A-Za-z0-9][\w .&'-]{1,40}?)(?=[.,;]|\s+(?:fee|charge|ref|txn|trx|balance|successful|on\s+\d|at\s+\d)|$)/i]
    : [
      /\b(?:to|at)\s+(?:agent\s+|a\/c:?\s*|merchant\s+)?([A-Za-z0-9][\w .&'-]{1,40}?)(?=[.,;]|\s+(?:fee|charge|ref|txn|trx|balance|successful|is successful|on\s+\d|avl)|$)/i,
      /\bfor\s+(?:pos purchase at\s+)?([A-Za-z][\w .&'-]{1,40}?)(?=[.,;]|\s+(?:avl|balance|ref)|$)/i,
    ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m) {
      const name = m[1].trim().replace(/\s+successful$/i, '');
      if (name && !/^(your|the|a)$/i.test(name)) return name;
    }
  }
  return null;
}

/**
 * The date the message states: 28/09/2026, 28-09-2026, 28-Sep-2026,
 * 28-SEP-26, 2026-09-28. Day first, as every Bangladeshi service writes it.
 */
function dateOf(raw) {
  let m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(raw);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(raw);
  if (m) return iso(year(m[3]), +m[2], +m[1]);
  m = /\b(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-,]*(\d{2,4})\b/.exec(raw);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(year(m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

const year = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));

function iso(y, mo, d) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 2000)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The owner's account this message is about: the wallet named after the
 * provider, or for a bank, the account whose last digits the message shows.
 *
 * @param {object} parsed   from parseSms()
 * @param {Array} accounts  the owner's accounts
 */
export function accountFor(parsed, accounts = []) {
  const live = accounts.filter((a) => !a.archived_at);
  const says = (a, word) => `${a.name || ''} ${a.institution || ''}`.toLowerCase().includes(word);
  if (parsed.provider === 'bank') {
    return (parsed.tail && live.find((a) => String(a.number_tail || '').endsWith(parsed.tail)))
      || null;
  }
  return live.find((a) => says(a, parsed.provider)) || null;
}

/** The cash account, the other end of a Cash Out or an agent Cash In. */
export function cashAccount(accounts = []) {
  return accounts.find((a) => !a.archived_at && a.type === 'cash') || null;
}

/** "TrxID 9JK4LMNOPQ": how the id is kept on the entry, and searched for. */
export const trxNote = (id) => `TrxID ${id}`;

/** Has an entry already recorded this TrxID? Reads the note it was kept in. */
export function seenTrx(trxId, rows = []) {
  if (!trxId) return null;
  const needle = trxId.toUpperCase();
  return rows.find((r) => !r.reverses_id && String(r.note || '').toUpperCase().includes(needle)) || null;
}
