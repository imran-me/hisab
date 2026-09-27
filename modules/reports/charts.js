/**
 * Reports · small charts for a phone
 *
 * Two hand-drawn SVG charts, each sized to its container's real pixel width
 * so text stays at its true size at 360px, redrawn when the container
 * resizes, and readable by touch: a tap or a drag picks a day or a month and
 * the chart's readout line says the values. The same readout answers the
 * keyboard (arrow keys on the focused chart), and every value is also in the
 * table under the chart, so nothing is reachable only by touch.
 *
 * WHY NOT A LIBRARY. No build step, and a chart library is ten times the size
 * of everything else on the screen. These are two shapes.
 *
 * COLOUR. Identity is never carried by hue alone. The day-by-day lines are
 * told apart by lightness (this month in ink, last month in the meta grey),
 * a legend and an end label. In versus out is told apart by SHAPE: income is
 * the track, spending is the fill inside it, because green against pink fails
 * a deuteranope (checked: ΔE 3.1). All colours are tokens.
 */

import { esc } from '../../shared/js/core/dom.js';

/**
 * The smallest "round" number at or above v. Finer than 1-2-5: a month that
 * peaks at ৳55k gets a ৳60k top, not ৳1L, which would leave the top half of a
 * 172px chart empty.
 */
export function niceCeil(v) {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * mag >= v) return step * mag;
  }
  return 10 * mag;
}

/** Redraw on resize, keeping one observer per host. */
function sized(host, draw) {
  host.__draw = draw;
  if (!host.__ro && 'ResizeObserver' in window) {
    let last = 0;
    host.__ro = new ResizeObserver(() => {
      const w = Math.round(host.clientWidth);
      if (w && w !== last) { last = w; host.__draw(w); }
    });
    host.__ro.observe(host);
  }
  draw(Math.round(host.clientWidth) || 328);
}

/** Pointer position to a 0-based slot, for a tap or a drag across the chart. */
function slotAt(event, svg, left, width, count) {
  if (count <= 1 || width <= 0) return 0;
  const box = svg.getBoundingClientRect();
  const x = event.clientX - box.left;
  const t = Math.max(0, Math.min(1, (x - left) / width));
  return Math.round(t * (count - 1));
}

/** A tap picks; a held drag keeps picking. Arrow keys step. */
function interact(target, svg, { left, width, count, pick, get }) {
  let down = false;
  target.addEventListener('pointerdown', (e) => {
    down = true;
    // Capture keeps a drag that leaves the chart still driving it. It throws
    // for a pointer the browser no longer tracks, which must not stop the tap.
    try { target.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    pick(slotAt(e, svg, left, width, count));
  });
  target.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse') pick(slotAt(e, svg, left, width, count)); });
  const up = () => { down = false; };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    pick(Math.max(0, Math.min(count - 1, get() + (Number.isFinite(step) ? step : step > 0 ? count : -count))));
  });
}

/* =========================================================================
   Day by day: cumulative spending this month against last month
   ========================================================================= */

/**
 * @param {HTMLElement} host
 * @param {object} o
 * @param {number[]} o.current    cumulative minor units by day, day 1 first, through today
 * @param {number[]} o.previous   cumulative minor units by day for the whole of last month
 * @param {number}   o.days       days in the chosen month
 * @param {string}   o.label      accessible summary
 * @param {Function} o.axis       minor -> short label ('৳20k')
 * @param {Function} o.onPick     (dayIndex) -> void; says the values in the readout
 */
export function cumulativeChart(host, o) {
  const count = Math.max(o.days, o.previous.length, o.current.length, 2);
  let chosen = Math.max(0, o.current.length - 1);

  sized(host, (W) => {
    const H = 172;
    const pad = { l: 2, r: 2, t: 22, b: 24 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const max = niceCeil(Math.max(1, ...o.current, ...o.previous));
    const x = (i) => pad.l + (i / (count - 1)) * pw;
    const y = (v) => pad.t + (1 - v / max) * ph;
    const path = (series) => series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');

    // Ticks on the 1st, 10th, 20th and the last day: the four a person counts by.
    const ticks = [0, 9, 19, count - 1].filter((d, i, a) => d < count && a.indexOf(d) === i);
    const last = o.current.length - 1;

    host.innerHTML = `
      <svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">
        <line class="chart__grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max)}" y2="${y(max)}"/>
        <line class="chart__grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max / 2)}" y2="${y(max / 2)}"/>
        <line class="chart__base" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>
        <text class="chart__tick" x="${pad.l}" y="${y(max) - 6}">${esc(o.axis(max))}</text>
        <text class="chart__tick" x="${pad.l}" y="${y(max / 2) - 6}">${esc(o.axis(max / 2))}</text>
        ${ticks.map((d) => `<text class="chart__tick" x="${x(d)}" y="${H - 6}" text-anchor="${d === 0 ? 'start' : d === count - 1 ? 'end' : 'middle'}">${d + 1}</text>`).join('')}
        ${o.previous.length ? `<path class="chart__line chart__line--was" d="${path(o.previous)}"/>` : ''}
        ${o.current.length ? `
          <path class="chart__area" d="${path(o.current)}L${x(last)} ${y(0)}L${x(0)} ${y(0)}Z"/>
          <path class="chart__line chart__line--now" d="${path(o.current)}"/>
          <circle class="chart__dot chart__dot--now" cx="${x(last)}" cy="${y(o.current[last])}" r="4"/>` : ''}
        <g class="chart__cross" data-cross>
          <line class="chart__crossline" y1="${pad.t}" y2="${y(0)}" x1="0" x2="0"/>
          <circle class="chart__dot chart__dot--was" data-dot-was r="4" cx="-10" cy="-10"/>
          <circle class="chart__dot chart__dot--now" data-dot-now r="4" cx="-10" cy="-10"/>
        </g>
        <rect class="chart__hit" x="0" y="0" width="${W}" height="${H}" tabindex="0"
              aria-label="Pick a day. Left and right arrows step."/>
      </svg>`;

    const svg = host.firstElementChild;
    const cross = svg.querySelector('[data-cross]');
    const place = (i) => {
      chosen = i;
      const cx = x(i);
      cross.querySelector('line').setAttribute('x1', cx);
      cross.querySelector('line').setAttribute('x2', cx);
      const dot = (sel, series) => {
        const node = cross.querySelector(sel);
        const has = i < series.length;
        node.setAttribute('cx', has ? cx : -10);
        node.setAttribute('cy', has ? y(series[i]) : -10);
      };
      dot('[data-dot-was]', o.previous);
      dot('[data-dot-now]', o.current);
      o.onPick(i);
    };

    interact(svg.querySelector('.chart__hit'), svg, { left: pad.l, width: pw, count, pick: place, get: () => chosen });
    place(Math.min(chosen, count - 1));
  });
}

/* =========================================================================
   Six months: what came in, and how much of it went out
   ========================================================================= */

/**
 * One column per month. The track is what came in (with a 2px mark at its
 * top in the income colour); the fill is what went out. A fill that stops
 * well below the mark is a month that kept money; a fill over the mark is a
 * month that spent more than it earned.
 *
 * @param {HTMLElement} host
 * @param {object} o
 * @param {{short: string, in: number, out: number}[]} o.months  oldest first
 * @param {string}   o.label
 * @param {Function} o.axis
 * @param {Function} o.onPick   (monthIndex) -> void
 */
export function inOutChart(host, o) {
  const n = o.months.length;
  let chosen = n - 1;

  sized(host, (W) => {
    const H = 164;
    const pad = { l: 2, r: 2, t: 22, b: 24 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const max = niceCeil(Math.max(1, ...o.months.flatMap((m) => [m.in, m.out])));
    const gw = pw / n;
    const bw = Math.min(24, gw * 0.5);
    const cx = (i) => pad.l + gw * (i + 0.5);
    const y = (v) => pad.t + (1 - Math.max(0, v) / max) * ph;
    const base = y(0);

    // A column with a 4px rounded top and a square foot on the baseline.
    const column = (i, v) => {
      const top = y(v);
      const h = base - top;
      if (h <= 0) return '';
      const r = Math.min(4, h, bw / 2);
      const l = cx(i) - bw / 2;
      return `M${l} ${base}V${top + r}Q${l} ${top} ${l + r} ${top}H${l + bw - r}Q${l + bw} ${top} ${l + bw} ${top + r}V${base}Z`;
    };

    host.innerHTML = `
      <svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">
        <line class="chart__grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max)}" y2="${y(max)}"/>
        <line class="chart__base" x1="${pad.l}" x2="${W - pad.r}" y1="${base}" y2="${base}"/>
        <text class="chart__tick" x="${pad.l}" y="${y(max) - 6}">${esc(o.axis(max))}</text>
        ${o.months.map((m, i) => `
          <g class="chart__month" data-month-index="${i}">
            <path class="chart__track" d="${column(i, m.in)}"/>
            ${m.in > 0 ? `<line class="chart__cap" x1="${cx(i) - bw / 2}" x2="${cx(i) + bw / 2}" y1="${y(m.in)}" y2="${y(m.in)}"/>` : ''}
            <path class="chart__fill" d="${column(i, m.out)}"/>
            <text class="chart__tick chart__tick--month" x="${cx(i)}" y="${H - 6}" text-anchor="middle">${esc(m.short)}</text>
          </g>`).join('')}
        <rect class="chart__hit" x="0" y="0" width="${W}" height="${H}" tabindex="0"
              aria-label="Pick a month. Left and right arrows step."/>
      </svg>`;

    const svg = host.firstElementChild;
    const place = (i) => {
      chosen = i;
      svg.querySelectorAll('[data-month-index]').forEach((g) => {
        g.classList.toggle('is-picked', Number(g.dataset.monthIndex) === i);
      });
      o.onPick(i);
    };

    // Slots are the column centres, so map the pointer onto them directly.
    interact(svg.querySelector('.chart__hit'), svg, {
      left: pad.l + gw / 2, width: pw - gw, count: n, pick: place, get: () => chosen,
    });
    place(Math.min(chosen, n - 1));
  });
}
