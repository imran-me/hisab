/**
 * Hisab · Dates and periods
 *
 * Everything in this file works in LOCAL time and stores dates as 'YYYY-MM-DD'
 * strings. That is a decision, not an oversight:
 *
 * A transaction happens on a day, in the place the person was standing. It is
 * not an instant on a timeline. Storing it as an ISO timestamp and rendering it
 * back means an expense entered at 11pm in Dhaka appears on the previous day
 * to anyone whose browser is set to UTC — and, worse, silently moves between
 * months at a month boundary, changing a monthly total after it was closed.
 *
 * So: no Date objects in storage, no toISOString() on a local date (it converts
 * to UTC first, which is the bug above), and no timezone anywhere.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today as 'YYYY-MM-DD', in the device's own timezone. */
export function today() {
  return toDateKey(new Date());
}

/**
 * A Date to 'YYYY-MM-DD', using its LOCAL parts.
 *
 * Deliberately not `d.toISOString().slice(0, 10)`, which converts to UTC first
 * and therefore returns yesterday for anyone east of Greenwich after their
 * local evening — the single most common date bug in a web app.
 */
export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 'YYYY-MM-DD' to a local Date at midnight.
 *
 * `new Date('2026-09-05')` parses as UTC midnight per the spec, which is the
 * previous day locally in the Americas and the same day at a different hour
 * everywhere else. Constructing from parts avoids the parser entirely.
 */
export function fromDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 'YYYY-MM' — the period key that every monthly figure is filed under. */
export function toPeriodKey(dateKeyOrDate) {
  if (dateKeyOrDate instanceof Date) return toDateKey(dateKeyOrDate).slice(0, 7);
  return String(dateKeyOrDate || '').slice(0, 7);
}

export function currentPeriod() {
  return toDateKey(new Date()).slice(0, 7);
}

/** Step a period key by n months. shiftPeriod('2026-01', -1) === '2025-12'. */
export function shiftPeriod(periodKey, n) {
  const [y, m] = String(periodKey).split('-').map(Number);
  // Day 1 with an out-of-range month is well defined and rolls the year for us.
  const d = new Date(y, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The first and last date keys of a period, inclusive. */
export function periodBounds(periodKey) {
  const [y, m] = String(periodKey).split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);   // day 0 of the next month is the last of this
  return { from: toDateKey(first), to: toDateKey(last) };
}

export function daysInPeriod(periodKey) {
  const [y, m] = String(periodKey).split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * How far through the current month we are, 0..1.
 *
 * Used to pace a budget: spending 60% of a budget on the 10th is a different
 * message from spending 60% on the 28th. Returns 1 for any past month and 0 for
 * a future one, so a closed month never reads as "on pace".
 */
export function periodProgress(periodKey, now = new Date()) {
  const nowPeriod = toPeriodKey(now);
  if (periodKey < nowPeriod) return 1;
  if (periodKey > nowPeriod) return 0;
  return now.getDate() / daysInPeriod(periodKey);
}

/* =========================================================================
   Formatting
   ========================================================================= */

/** '5 Sep 2026' — day first, which is how the date is read in Bangladesh and the Gulf. */
export function formatDate(dateKey, { year = 'auto' } = {}) {
  const d = fromDateKey(dateKey);
  if (!d) return '';
  const showYear = year === 'always' || (year === 'auto' && d.getFullYear() !== new Date().getFullYear());
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`;
}

/** 'September 2026' or 'Sep 2026'. */
export function formatPeriod(periodKey, { short = false } = {}) {
  const [y, m] = String(periodKey).split('-').map(Number);
  if (!y || !m) return '';
  const name = short ? MONTHS_SHORT[m - 1] : MONTHS[m - 1];
  return `${name} ${y}`;
}

/** 'Sat' — for a date group heading. */
export function formatWeekday(dateKey) {
  const d = fromDateKey(dateKey);
  return d ? DAYS_SHORT[d.getDay()] : '';
}

/**
 * 'Today', 'Yesterday', 'Sat 5 Sep' — the heading over a day's transactions.
 *
 * Relative labels stop at two days. 'Three days ago' takes longer to place than
 * a date does, and a list heading is scanned, not read.
 */
export function formatDayLabel(dateKey) {
  const d = fromDateKey(dateKey);
  if (!d) return '';
  const now = new Date();
  const t = toDateKey(now);
  if (dateKey === t) return 'Today';

  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dateKey === toDateKey(yest)) return 'Yesterday';

  const showYear = d.getFullYear() !== now.getFullYear();
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`;
}

/** 'in 3 days' / '2 weeks ago' — for a due date or a rate's as-of date. */
export function formatRelative(dateKey, from = new Date()) {
  const d = fromDateKey(dateKey);
  if (!d) return '';
  // Compare at day granularity by zeroing the time, so "tomorrow" does not
  // become "in 0 days" simply because it is currently late in the evening.
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const days = Math.round((d - a) / 86400000);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';

  const abs = Math.abs(days);
  const unit = abs < 7 ? [abs, 'day']
    : abs < 31 ? [Math.round(abs / 7), 'week']
    : abs < 365 ? [Math.round(abs / 30), 'month']
    : [Math.round(abs / 365), 'year'];

  const label = `${unit[0]} ${unit[1]}${unit[0] === 1 ? '' : 's'}`;
  return days > 0 ? `in ${label}` : `${label} ago`;
}

/* =========================================================================
   Ranges
   ========================================================================= */

/** The last n period keys ending at (and including) `endPeriod`, oldest first. */
export function lastPeriods(n, endPeriod = currentPeriod()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(shiftPeriod(endPeriod, -i));
  return out;
}

/** Inclusive on both ends, so a filter of 'the 5th to the 5th' finds that day. */
export function isWithin(dateKey, from, to) {
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

/**
 * Named ranges for the filter bar. Returned as date keys rather than as a
 * label, so the caller never has to know what "this quarter" means.
 */
export function namedRange(name, now = new Date()) {
  const t = toDateKey(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (name) {
    case 'today':      return { from: t, to: t };
    case 'week': {
      // Weeks start on Saturday: that is the working week in Bangladesh and
      // most of the Gulf, and a "this week" that starts on Monday puts a
      // Saturday expense in the previous week for the whole target audience.
      const dow = now.getDay();
      const back = (dow + 1) % 7;
      const start = new Date(y, m, now.getDate() - back);
      return { from: toDateKey(start), to: t };
    }
    case 'month':      return periodBounds(toPeriodKey(now));
    case 'last-month': return periodBounds(shiftPeriod(toPeriodKey(now), -1));
    case 'quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: toDateKey(qStart), to: t };
    }
    case 'year':       return { from: `${y}-01-01`, to: t };
    case 'all':        return { from: null, to: null };
    default:           return { from: null, to: null };
  }
}
