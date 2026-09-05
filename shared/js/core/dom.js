/**
 * Hisab · DOM helpers
 *
 * A deliberately small set. There is no framework here, so these are the
 * primitives every module builds markup with — and keeping the set small is
 * what stops this file from quietly becoming one.
 */

/** querySelector, scoped. Named to be greppable, unlike a bare $. */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

/**
 * Escape text for insertion into HTML.
 *
 * Used on EVERY user-supplied string that reaches innerHTML — a category name,
 * an account name, a note, a vault title. Category names come from the person
 * using the app, which sounds safe right up until a backup file is imported
 * from somewhere else.
 *
 * The five characters are the complete set needed for both element content and
 * a double- or single-quoted attribute value.
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Create an element.
 *
 *   el('button', { class: 'btn btn--primary', 'data-id': id }, 'Save')
 *
 * Children may be strings (inserted as TEXT, never parsed as HTML) or nodes.
 * That asymmetry is deliberate: building a node tree is the safe path, and
 * anything that genuinely needs markup has to say so by using `html()` and
 * passing escaped values.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * A tagged template that escapes every interpolated value.
 *
 *   html`<div class="row">${account.name}</div>`
 *
 * This is the only sanctioned way to build a markup string in this codebase.
 * Plain concatenation is not, because the escaping is then something a person
 * has to remember on every value, and the one that gets forgotten is the one
 * that matters.
 *
 * To interpolate markup that is already safe — a nested html`` result, or
 * formatMoneyHTML's output — wrap it in `raw()`.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v && v.__raw) out += v.value;
    else if (Array.isArray(v)) out += v.map((x) => (x && x.__raw ? x.value : esc(x))).join('');
    else out += esc(v);
    out += strings[i + 1];
  }
  return { __raw: true, value: out, toString() { return out; } };
}

/** Mark a string as already-safe markup, for interpolation into html``. */
export function raw(value) {
  return { __raw: true, value: String(value ?? ''), toString() { return String(value ?? ''); } };
}

/** Replace a container's contents with an html`` result or a node. */
export function render(container, content) {
  if (!container) return;
  if (content && content.__raw) container.innerHTML = content.value;
  else if (content instanceof Node) { container.replaceChildren(content); }
  else container.textContent = String(content ?? '');
}

/**
 * Delegated events.
 *
 * A list of 400 transactions gets ONE listener on the container, not 400 on the
 * rows — and, more importantly, the listener keeps working when the list is
 * re-rendered, which a per-row listener does not.
 *
 * `closest` is bounded by the container so a click on a nested control does not
 * escape upward past it into an unrelated match.
 */
export function delegate(container, eventName, selector, handler) {
  const listener = (event) => {
    const match = event.target.closest(selector);
    if (match && container.contains(match)) handler(event, match);
  };
  container.addEventListener(eventName, listener);
  return () => container.removeEventListener(eventName, listener);
}

/**
 * An SVG sprite reference.
 *
 *   icon('arrow-in', { class: 'icon icon--sm' })
 *
 * <use href="…#id"> rather than an inline copy of the path, so the twenty-eight
 * icons are one cached file and a row repeated 400 times costs 400 references
 * rather than 400 copies of the geometry.
 *
 * aria-hidden by default: an icon beside a label is decorative, and announcing
 * it doubles the label for a screen reader. An icon that IS the label passes
 * `label`, which switches it to role="img" with a title.
 */
export function icon(name, { class: className = 'icon', label = null } = {}) {
  const href = `${window.HISAB_SPRITE || ''}#i-${name}`;
  if (label) {
    return raw(`<svg class="${esc(className)}" role="img" aria-label="${esc(label)}"><use href="${esc(href)}"/></svg>`);
  }
  return raw(`<svg class="${esc(className)}" aria-hidden="true"><use href="${esc(href)}"/></svg>`);
}

/**
 * Announce a message to assistive technology without moving focus.
 *
 * Used for "Saved", "3 results", "Vault locked" — the things a sighted user
 * learns from a toast or from the list simply changing. One shared live region
 * rather than one per component, because two simultaneous live regions
 * interrupt each other and neither is heard.
 *
 * The text is cleared first: a live region whose content is set to the same
 * string it already holds does not fire, so saving twice in a row would
 * announce once.
 */
let liveRegion = null;
export function announce(message, { assertive = false } = {}) {
  if (!liveRegion) {
    liveRegion = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(liveRegion);
  }
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  liveRegion.textContent = '';
  window.setTimeout(() => { liveRegion.textContent = message; }, 40);
}

/** Wait for an element's transition or animation to finish, with a hard cap. */
export function afterTransition(node, timeout = 600) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; node.removeEventListener('transitionend', finish); node.removeEventListener('animationend', finish); resolve(); } };
    node.addEventListener('transitionend', finish);
    node.addEventListener('animationend', finish);
    // The cap is not belt-and-braces. Under prefers-reduced-motion the
    // durations are 1ms and the event still fires, but an element that is
    // display:none, or is removed before the animation starts, fires nothing at
    // all and the promise would never settle.
    window.setTimeout(finish, timeout);
  });
}

/** True when the device has no hover — used to skip hover-only affordances. */
export const IS_TOUCH = window.matchMedia('(hover: none)').matches;
