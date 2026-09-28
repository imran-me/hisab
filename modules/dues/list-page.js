/**
 * Dues · page script
 *
 * "Who owes me, and whom do I owe?" The two totals, the two ways in (I lent,
 * I borrowed), any reminder that has come due, then everyone with their
 * running balance. Every figure is the server's, read back from the ledger
 * (modules/dues/backend/endpoints.md).
 */

import { qs, esc, delegate } from '../../shared/js/core/dom.js';
import { formatMoneyHTML, moneyLabel } from '../../shared/js/core/money.js';
import { formatDate } from '../../shared/js/core/dates.js';
import { on, EVENTS } from '../../shared/js/core/bus.js';
import * as state from '../../shared/js/core/state.js';
import { mountShell } from '../../shared/js/components/shell.js';
import { mountCompose } from '../ledger/entry-sheet.js';
import * as dues from './backend/api.js';
import { openRecordSheet, openPersonSheet, initials, tintOf, stateText } from './dues-sheets.js';

mountShell({ title: 'Dues' });
mountCompose({ onSaved: () => refresh() });
on(EVENTS.BOOK_CHANGED, () => refresh());

const CODE = 'BDT';
const label = (minor) => moneyLabel(minor, CODE, { minor: 'never' });
const figure = (minor) => formatMoneyHTML(minor, CODE, { minor: 'never', direction: false });

let data = null;

delegate(document.body, 'click', '[data-new]', (_e, b) => {
  openRecordSheet({ kind: b.dataset.new, people: data?.people || [], book: state.book(), onSaved: refresh });
});

delegate(document.body, 'click', '[data-open]', (_e, b) => {
  openPersonSheet(b.dataset.open, { book: state.book(), people: data?.people || [], onChanged: refresh });
});

refresh();

async function refresh() {
  const res = await dues.overview({ book: state.book() });
  const offline = !res.ok;
  qs('[data-offline]').hidden = !offline;
  for (const node of document.querySelectorAll('.dues-hero, .dues-actions, [data-net]')) node.hidden = offline;
  if (offline) return;

  data = res.data;
  const owed = data.people.filter((p) => p.state === 'owes_you');
  const owe = data.people.filter((p) => p.state === 'you_owe');

  qs('[data-owed]').innerHTML = figure(data.owed_to_you_minor);
  qs('[data-owe]').innerHTML = figure(data.you_owe_minor);
  qs('[data-owed-count]').textContent = owed.length ? `${owed.length} ${owed.length === 1 ? 'person' : 'people'}` : 'Nobody';
  qs('[data-owe-count]').textContent = owe.length ? `${owe.length} ${owe.length === 1 ? 'person' : 'people'}` : 'Nobody';

  const net = data.net_minor;
  qs('[data-net]').innerHTML = !data.people.length ? ''
    : net === 0 ? 'Even overall.'
      : `Overall, <strong>${esc(label(Math.abs(net)))}</strong> ${net > 0 ? 'more is owed to you than you owe' : 'more is owed by you than to you'}.`;

  drawReminders();
  drawPeople();
}

/** A reminder that has come due, as one line with the action in it. */
function drawReminders() {
  const due = data.people.filter((p) => p.remind_due);
  qs('[data-reminders]').innerHTML = due.slice(0, 2).map((p) => `
    <p class="dues-remind">
      <span><strong>${esc(p.name)}</strong> ${p.state === 'owes_you'
        ? `owes you ${esc(label(p.balance_minor))}`
        : `is owed ${esc(label(-p.balance_minor))}`}. Reminder for ${esc(formatDate(p.remind_on))}.</span>
      <button type="button" class="btn btn--secondary btn--sm" data-open="${esc(p.id)}">Open</button>
    </p>`).join('');
}

function drawPeople() {
  const sec = qs('[data-people-sec]');
  sec.hidden = !data.people.length;
  qs('[data-empty]').hidden = data.people.length > 0;

  qs('[data-people]').innerHTML = data.people.map((p) => {
    const tone = p.state === 'owes_you' ? 'dues-owed' : p.state === 'you_owe' ? 'dues-owe' : 'dues-zero';
    const sub = [stateText(p)];
    if (p.last_on) sub.push(`last ${formatDate(p.last_on)}`);
    return `
      <li>
        <button type="button" class="row dues-person${p.state === 'settled' ? ' is-settled' : ''}" data-open="${esc(p.id)}">
          <span class="dues-avatar ${tintOf(p.name)}" aria-hidden="true">${esc(initials(p.name))}</span>
          <span class="row__main">
            <span class="row__title">${esc(p.name)}</span>
            <span class="row__sub">
              <span>${esc(sub.join(' · '))}</span>
              ${p.remind_due ? '<span aria-hidden="true">·</span><span class="dues-due">remind</span>' : ''}
            </span>
          </span>
          <span class="row__end">
            <span class="money money--md ${tone}">${p.state === 'settled' ? '৳0' : figure(Math.abs(p.balance_minor))}</span>
          </span>
        </button>
      </li>`;
  }).join('');
}
