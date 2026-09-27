/**
 * Reports · the words for the month's insights
 *
 * MonthCockpit decides WHICH observations are worth making and sends a code
 * and its figures (modules/accounts/backend/Services/MonthCockpit.php,
 * insights()). The wording is here, with the rest of the app's wording. That
 * split keeps every threshold on the server without the API sending HTML the
 * browser is asked to trust.
 *
 * One line each, the number first, so a line can be read by its first word.
 * Codes this screen already shows elsewhere (the top category, the deposit)
 * are skipped rather than repeated. An unknown code is skipped too: a server
 * that learns a new insight before this file knows its words shows one line
 * fewer, never the word "undefined".
 */

const pct = (v) => `${Math.round(Number(v) || 0)}%`;

/**
 * @param {object} insight  one entry of the month's `insights`
 * @param {(minor:number) => string} money  a formatter for a figure in a sentence
 * @param {(key:string) => string} monthName  'YYYY-MM' -> 'August'
 * @returns {{tone:string, lead:string, text:string}|null}
 */
export function insightLine(insight, money, monthName) {
  const i = insight;
  switch (i.code) {
    case 'kept_strong':
      return { tone: 'in', lead: `${pct(i.rate)} kept`, text: `${money(i.kept_minor)}, above the 20% mark` };
    case 'kept_thin':
      return { tone: 'warn', lead: `${pct(i.rate)} kept`, text: `${money(i.kept_minor)}; 20% is the usual target` };
    case 'overspent':
      return { tone: 'out', lead: `${money(i.over_minor)} more out than in`, text: 'something is being drawn down' };
    case 'soft_spend':
      return { tone: 'warn', lead: `${pct(i.share)} of spending was soft`, text: `${money(i.soft_minor)} discretionary or avoidable` };
    case 'untagged':
      return { tone: 'info', lead: `${money(i.untagged_minor)} not judged yet`, text: 'no "was it worth it" on those entries' };
    case 'spend_moved':
      return {
        tone: i.up ? 'warn' : 'in',
        lead: `Spending ${pct(i.share)} ${i.up ? 'up' : 'down'}`,
        text: `against ${monthName(i.previous)}`,
      };
    case 'over_budget':
      return { tone: 'out', lead: `${money(i.over_minor)} over budget`, text: `of ${money(i.budget_minor)}` };
    case 'within_budget':
      return { tone: 'in', lead: `${money(i.left_minor)} of budget left`, text: `of ${money(i.budget_minor)}` };
    default:
      return null;
  }
}
