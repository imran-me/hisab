/**
 * Hisab · Sparklines and bar strips
 *
 * Small charts drawn as inline SVG. No library: the whole product needs exactly
 * two shapes — a trend line and a bar strip — and pulling in a charting
 * dependency for that would be more code than this file, plus a build step the
 * locked rules do not allow.
 *
 * This module owns GEOMETRY only. Colour, stroke weight and opacity come from
 * .spark__line / .spark__area / .bars__bar in _data.css, so a chart re-themes
 * with everything else and there is no palette duplicated in JavaScript.
 */

import { esc } from '../core/dom.js';
import { formatMoney } from '../core/money.js';

/**
 * A trend line.
 *
 * @param {number[]} values           in minor units; may include negatives
 * @param {object} [opts]
 * @param {number} [opts.width=200]   viewBox width — the SVG scales to its box
 * @param {number} [opts.height=40]
 * @param {boolean} [opts.area=true]  fill under the line
 * @param {boolean} [opts.dot=true]   mark the last point
 * @param {string} [opts.label]       accessible summary
 * @returns {string} SVG markup
 */
export function sparkline(values, opts = {}) {
  const { width = 200, height = 40, area = true, dot = true, label = '' } = opts;
  const pad = 3;   // room for the 1.5px stroke and the end dot's radius

  const clean = (values || []).filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    // One point is not a trend. A flat rule is honest about that; a line drawn
    // between a value and itself implies a history that does not exist.
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label || 'Not enough data')}">
      <line class="spark__zero" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}"/>
    </svg>`;
  }

  const min = Math.min(...clean, 0);
  const max = Math.max(...clean, 0);
  // A flat series has zero range, and dividing by it puts every point at NaN —
  // which renders as an empty SVG with no error anywhere.
  const range = (max - min) || 1;

  const stepX = (width - pad * 2) / (clean.length - 1);
  const toX = (i) => pad + i * stepX;
  const toY = (v) => pad + (1 - (v - min) / range) * (height - pad * 2);

  const points = clean.map((v, i) => `${toX(i).toFixed(2)},${toY(v).toFixed(2)}`);
  const line = `M${points.join('L')}`;

  const zeroY = toY(0);
  const showZero = min < 0 && max > 0;

  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
    ${showZero ? `<line class="spark__zero" x1="0" y1="${zeroY.toFixed(2)}" x2="${width}" y2="${zeroY.toFixed(2)}"/>` : ''}
    ${area ? `<path class="spark__area" d="${line}L${toX(clean.length - 1).toFixed(2)},${(height - pad).toFixed(2)}L${pad},${(height - pad).toFixed(2)}Z"/>` : ''}
    <path class="spark__line" d="${line}" vector-effect="non-scaling-stroke"/>
    ${dot ? `<circle class="spark__dot" cx="${toX(clean.length - 1).toFixed(2)}" cy="${toY(clean[clean.length - 1]).toFixed(2)}" r="2"/>` : ''}
  </svg>`;
}

/**
 * A bar strip — twelve months of spending, say.
 *
 * Bars are divs rather than SVG rects because each one is individually
 * hoverable, focusable and titled, and doing that in SVG means managing focus
 * order by hand.
 *
 * @param {Array<{label:string, value:number, current?:boolean}>} rows
 * @param {object} [opts]
 * @param {string} [opts.currency='BDT']  for the tooltip figure
 * @param {string} [opts.tone]            'in' | 'out' | 'hold' | 'biz'
 */
export function barStrip(rows, opts = {}) {
  const { currency = 'BDT', tone = null } = opts;
  const values = rows.map((r) => Math.abs(Number(r.value) || 0));
  const max = Math.max(...values, 1);

  const color = tone ? `var(--flow-${tone})` : null;

  const bars = rows.map((row, i) => {
    const v = values[i];
    // Percentage of the tallest, floored at a visible tick. A zero month must
    // still be a mark on the strip — a gap reads as missing data rather than as
    // a month in which nothing was spent.
    const pct = Math.max(2, (v / max) * 100);
    const title = `${row.label}: ${formatMoney(row.value, currency, { code: true })}`;
    return `<div class="bars__bar${row.current ? ' is-current' : ''}"
      style="--bar-height:${pct.toFixed(1)}%${color ? `;--bar-color:${color}` : ''}"
      title="${esc(title)}"></div>`;
  }).join('');

  return `<div class="bars" role="img" aria-label="${esc(summarise(rows, currency))}">${bars}</div>`;
}

function summarise(rows, currency) {
  if (!rows.length) return 'No data';
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `${rows.length} periods, ${first.label} ${formatMoney(first.value, currency)} to ${last.label} ${formatMoney(last.value, currency)}`;
}

/**
 * A single horizontal bar split into category segments.
 *
 * Segments below a threshold are folded into one "Other" segment — not to tidy
 * the picture, but because a 0.2% segment is two pixels wide and cannot be
 * hovered, so its label is unreachable and it is effectively invisible while
 * still taking a legend row.
 *
 * @param {Array<{name:string, value:number, color?:string}>} parts
 * @param {object} [opts]
 * @param {number} [opts.minShare=2]   percent below which a part is folded
 */
export function breakdownBar(parts, opts = {}) {
  const { minShare = 2 } = opts;
  const total = parts.reduce((sum, p) => sum + Math.abs(p.value || 0), 0);
  if (!total) return '<div class="breakdown" aria-hidden="true"></div>';

  const kept = [];
  let other = 0;
  for (const part of parts) {
    const share = (Math.abs(part.value) / total) * 100;
    if (share < minShare) other += Math.abs(part.value);
    else kept.push({ ...part, share });
  }
  if (other > 0) kept.push({ name: 'Other', value: other, share: (other / total) * 100, color: 'var(--ink-4)' });

  const segs = kept.map((p) => `<div class="breakdown__seg"
      style="--seg-share:${p.share.toFixed(3)}${p.color ? `;--seg-color:${p.color}` : ''}"
      title="${esc(p.name)} — ${p.share.toFixed(1)}%"></div>`).join('');

  return `<div class="breakdown" role="img" aria-label="Breakdown by category">${segs}</div>`;
}

/**
 * The palette for category segments.
 *
 * Generated from the accent hue rather than listed as hexes, so it stays inside
 * the product's colour world and does not become a second, unrelated palette.
 * Hues are spaced by the golden angle (137.5°), which is what stops adjacent
 * categories in a sorted list from being adjacent in hue — an evenly spaced
 * ramp gives neighbouring segments nearly the same colour.
 *
 * Lightness alternates in a three-step cycle so that two segments landing on a
 * similar hue still differ in value, which is what keeps them apart in
 * greyscale and for a colour-blind reader.
 */
export function segmentColor(index) {
  const hue = (196 + index * 137.5) % 360;
  const light = [58, 68, 48][index % 3];
  return `hsl(${hue.toFixed(0)} 62% ${light}%)`;
}
