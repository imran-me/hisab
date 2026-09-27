/**
 * Reports · per-instance CSS values, set the way the CSP allows
 *
 * A bar's width or a segment's colour is data, not styling, so it reaches
 * CSS as a custom property. It CANNOT arrive as a style="" attribute in
 * markup: the Content-Security-Policy is `style-src 'self'`, which blocks
 * inline style attributes, so `<i style="--w:40%">` renders as a bar of no
 * width on the real site. (The screenshot tool bypasses the CSP, which is how
 * that looked fine in testing.) Setting the property through the CSSOM is not
 * an inline style in the CSP's sense and is allowed.
 *
 * Markup carries `data-vars="w:40%;at:62%"`; applyStyleVars() turns each
 * pair into `--w: 40%`, `--at: 62%` on that element.
 */

/** @param {ParentNode} root */
export function applyStyleVars(root) {
  for (const node of root.querySelectorAll('[data-vars]')) {
    for (const pair of node.dataset.vars.split(';')) {
      const at = pair.indexOf(':');
      if (at > 0) node.style.setProperty(`--${pair.slice(0, at).trim()}`, pair.slice(at + 1).trim());
    }
  }
}
