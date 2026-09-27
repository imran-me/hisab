/**
 * Categories · glyph and tint
 *
 * What a category LOOKS like: the tint (one of the `--cat-*` tokens) and the
 * icon on its tile. DIRECTION §3.7.2: tints belong to categories, never to
 * money flows, and a category without an assigned tint is drawn in --text-3.
 *
 * Keyed on the category's `key` - the stable slug, which a rename does not
 * change - so a renamed "Transport" keeps its colour. A category the person
 * created has a key nobody mapped and takes the neutral tile.
 *
 * Presentation only, and deliberately not a database column yet: the owner
 * cannot pick a colour until the Categories screen (B11) exists, and then
 * this becomes the default the column falls back to. Listed under "Not built"
 * in backend/endpoints.md.
 */

/** key → tint. The tint names are the `--cat-<tint>` tokens. */
const TINTS = {
  groceries: 'food',
  dining: 'dining',
  transport: 'transport',
  travel: 'transport',
  rent: 'home',
  family: 'home',
  utilities: 'utilities',
  'bank-fees': 'utilities',
  internet: 'mobile',
  subscriptions: 'mobile',
  gadgets: 'shopping',
  clothing: 'shopping',
  health: 'health',
  'personal-care': 'health',
};

/**
 * The tint, the sprite icon (`cat-<tint>`, drawn by Track A in db2595d) and
 * the class that colours a tile (`.cat-<tint>` in _surfaces.css). A category
 * nobody mapped gets the neutral tag on --text-3.
 *
 * @returns {{ tint: string|null, icon: string, className: string }}
 */
export function glyphOf(category) {
  const tint = TINTS[category?.key] || null;
  return { tint, icon: tint ? `cat-${tint}` : 'tag', className: tint ? `cat-${tint}` : '' };
}
