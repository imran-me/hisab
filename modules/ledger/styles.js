/**
 * Ledger · its stylesheets, loaded by the code that needs them
 *
 * The entry sheet, the account picker and the ledger row are used on pages
 * that are not the Ledger (Home, account detail). A page should not have to
 * know which of another module's stylesheets its compose button or its list
 * of entries needs, so each is loaded here on first use - once, and awaited,
 * so nothing paints unstyled for a frame. Resolved against this file, not the
 * page, because the pages live in other folders.
 */

import { el } from '../../shared/js/core/dom.js';

const loaded = new Map();

/** @param {'entry-sheet.css'|'row.css'} file */
export function loadStyles(file) {
  if (!loaded.has(file)) {
    const href = new URL(`./${file}`, import.meta.url).href;
    loaded.set(file, new Promise((resolve) => {
      if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
      const link = el('link', { rel: 'stylesheet', href });
      link.addEventListener('load', resolve);
      link.addEventListener('error', resolve);   // unstyled beats nothing at all
      document.head.append(link);
    }));
  }
  return loaded.get(file);
}
