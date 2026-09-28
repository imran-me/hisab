/**
 * Hisab · Count-up on hero figures
 *
 *   import { countUp, initCountUp } from '…/components/count-up.js';
 *   countUp(node)        // animate the figure now in `node` from its last value
 *   initCountUp()        // main.js: every hero figure, automatically
 *
 * A hero figure rolls to its value when it first paints, and from the old
 * value to the new one when an entry changes it: the motion says "this is the
 * number that moved" (DIRECTION §3.6). Only the digits animate. The markup is
 * formatMoneyHTML()'s own, untouched: the ৳, the sign and the poisha stay
 * where the formatter put them, and the integer text node alone is rewritten
 * each frame, in the same grouping and the same digits (Latin or Bangla).
 *
 * Automatic for .money--hero, .home-hero__figure and anything marked
 * [data-countup]: a MutationObserver sees the page write a new figure, so no
 * page has to call this. Tabular figures keep the width steady while it runs.
 *
 * Under prefers-reduced-motion the figure is simply written, as before.
 */

const SELECTOR = '[data-countup], .money--hero, .home-hero__figure';
const DURATION = 620;

const BN = '০১২৩৪৫৬৭৮৯';
const toLatin = (s) => s.replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
const toBangla = (s) => s.replace(/[0-9]/g, (d) => BN[Number(d)]);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const last = new WeakMap();      // node → the value it last showed
const running = new WeakMap();   // node → rAF id

/* The one text node holding the integer part: the first run of digits that
   is not inside the minor units or a currency code. */
function figureText(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t.parentElement?.closest('.money__minor, .money__code, .sr-only')) continue;
    if (/[0-9০-৯]/.test(t.data)) return t;
  }
  return null;
}

const PARTS = /^(\D*?)([0-9০-৯][0-9০-৯,]*(?:\.[0-9০-৯]+)?)([\s\S]*)$/;

function parse(text) {
  const m = PARTS.exec(text);
  if (!m) return null;
  const latin = toLatin(m[2]);
  return {
    pre: m[1],
    post: m[3],
    value: Number(latin.replace(/,/g, '')),
    decimals: (latin.split('.')[1] || '').length,
    grouped: latin.includes(','),
    bangla: /[০-৯]/.test(m[2]),
  };
}

function format(value, p) {
  let s = p.grouped
    ? value.toLocaleString('en-IN', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : value.toFixed(p.decimals);
  if (p.bangla) s = toBangla(s);
  return p.pre + s + p.post;
}

/** Animate the figure currently in `node` up (or down) from its last shown value. */
export function countUp(node, { from } = {}) {
  const text = figureText(node);
  if (!text) return;
  const p = parse(text.data);
  if (!p || !Number.isFinite(p.value)) return;
  const start = from ?? last.get(node) ?? 0;
  last.set(node, p.value);
  if (start === p.value || reduced() || document.hidden) return;

  cancelAnimationFrame(running.get(node));
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / DURATION);
    // ease-out-expo: fast off the mark, settling on the digits people read
    const e = k === 1 ? 1 : 1 - 2 ** (-10 * k);
    const v = start + (p.value - start) * e;
    if (!text.isConnected) return;
    text.data = format(p.decimals ? v : Math.round(v), p);
    if (k < 1) running.set(node, requestAnimationFrame(step));
  };
  text.data = format(start, p);
  running.set(node, requestAnimationFrame(step));
}

let started = false;

/** Watch the document and count up every hero figure a page writes. */
export function initCountUp() {
  if (started || !('MutationObserver' in window)) return;
  started = true;
  const pending = new Set();
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const node of pending) if (node.isConnected) countUp(node);
    pending.clear();
  };
  const note = (node) => {
    if (!(node instanceof Element)) node = node?.parentElement;
    if (!node) return;
    const host = node.closest(SELECTOR);
    if (host) pending.add(host);
    node.querySelectorAll?.(SELECTOR).forEach((n) => pending.add(n));
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  };
  new MutationObserver((records) => {
    for (const r of records) {
      note(r.target);
      r.addedNodes.forEach(note);
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(SELECTOR).forEach((n) => note(n));
}
