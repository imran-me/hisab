/**
 * Budgets · the progress ring
 *
 * One budget as a ring: the share used, coloured by the state the server
 * computed (green under 75%, amber to 100%, red past it). Past 100% the ring
 * is full and the overrun is drawn as a second, brighter lap on top, so ৳250
 * over and ৳2,500 over do not look the same.
 *
 * Geometry goes in SVG attributes, never style="": the CSP is style-src
 * 'self', which blocks inline style attributes (see accounts/style-vars.js).
 * The fill animates by setting stroke-dashoffset through the CSSOM once the
 * ring is in the page, which the CSP allows.
 */

const TAU = Math.PI * 2;

/**
 * @param {number|null} ratio   spent ÷ budget; null for no budget
 * @param {string|null} state   ok | warn | over
 * @param {object} [opts]
 * @param {number} [opts.size=44]
 * @param {number} [opts.stroke=5]
 * @param {number|null} [opts.today]  share of the month gone, 0..1: a tick on the ring
 */
export function ring(ratio, state, { size = 44, stroke = 5, today = null } = {}) {
  const c = size / 2;
  const r = (size - stroke) / 2;
  const len = TAU * r;
  const used = Math.max(0, Math.min(1, ratio ?? 0));
  const over = Math.max(0, Math.min(1, (ratio ?? 0) - 1));
  const turn = `rotate(-90 ${c} ${c})`;
  const circle = (cls, extra = '') =>
    `<circle class="${cls}" cx="${c}" cy="${c}" r="${r.toFixed(2)}" stroke-width="${stroke}" transform="${turn}"${extra}/>`;

  // The month's pace as a short tick across the ring, at today's angle. A
  // fill that has passed it is spending ahead of the calendar.
  let tick = '';
  if (today !== null && today > 0 && today < 1) {
    const a = today * TAU - Math.PI / 2;
    const inner = r - stroke / 2 - 2;
    const outer = r + stroke / 2 + 2;
    tick = `<line class="ring__today" x1="${(c + inner * Math.cos(a)).toFixed(2)}" y1="${(c + inner * Math.sin(a)).toFixed(2)}"
      x2="${(c + outer * Math.cos(a)).toFixed(2)}" y2="${(c + outer * Math.sin(a)).toFixed(2)}"/>`;
  }

  return `
    <svg class="ring ring--${state || 'none'}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">
      ${circle('ring__track')}
      ${circle('ring__fill', ` stroke-dasharray="${len.toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${len.toFixed(2)}" data-ring-to="${(len * (1 - used)).toFixed(2)}"`)}
      ${over > 0 ? circle('ring__over', ` stroke-dasharray="${len.toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${len.toFixed(2)}" data-ring-to="${(len * (1 - over)).toFixed(2)}"`) : ''}
      ${tick}
    </svg>`;
}

/**
 * Run every ring in `root` from empty to its value. Called after the markup
 * is in the page; under reduced motion the CSS drops the transition and the
 * ring simply appears filled.
 */
export function animateRings(root) {
  const arcs = [...root.querySelectorAll('[data-ring-to]')];
  if (!arcs.length) return;
  // Two frames: the first paints the empty ring, so the second is a change
  // the transition can run from.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const arc of arcs) arc.style.strokeDashoffset = arc.dataset.ringTo;
  }));
}

/** "85%" for the middle of a ring; "—" when there is nothing to measure. */
export function percent(ratio) {
  if (ratio === null || ratio === undefined) return '—';
  const pct = Math.round(ratio * 100);
  return pct > 999 ? '999+%' : `${pct}%`;
}
