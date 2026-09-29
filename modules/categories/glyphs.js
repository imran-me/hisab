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

/**
 * key → [tint, icon]. The tint names are the `--cat-<tint>` tokens; the icon
 * is a sprite symbol. Every seeded category has its own mark - the plain tag
 * is only for one the person made themselves.
 */
const LOOK = {
  // Spending
  groceries: ['food', 'cat-food'],
  dining: ['dining', 'cat-dining'],
  transport: ['transport', 'cat-transport'],
  travel: ['transport', 'cat-plane'],
  rent: ['home', 'cat-home'],
  family: ['home', 'users'],
  utilities: ['utilities', 'cat-utilities'],
  'bank-fees': ['utilities', 'bank'],
  internet: ['mobile', 'cat-mobile'],
  subscriptions: ['mobile', 'refresh'],
  gadgets: ['shopping', 'cat-laptop'],
  clothing: ['shopping', 'cat-shopping'],
  health: ['health', 'cat-health'],
  'personal-care': ['health', 'user'],
  education: ['education', 'cat-education'],
  books: ['education', 'cat-book'],
  entertainment: ['fun', 'cat-fun'],
  charity: ['health', 'cat-charity'],
  gift: ['fun', 'cat-gift'],
  tax: ['work', 'cat-tax'],
  'other-expense': ['work', 'dots'],
  other: ['work', 'dots'],

  // Income
  salary: ['education', 'briefcase'],
  freelance: ['mobile', 'cat-laptop'],
  interest: ['utilities', 'cat-percent'],
  refund: ['transport', 'refresh'],
  scholarship: ['education', 'cat-education'],
  investment: ['shopping', 'trend-up'],
  'rent-received': ['home', 'cat-home'],
  'other-income': ['work', 'dots'],

  // Savings (deposits)
  savings: ['home', 'coins'],
  dps: ['transport', 'bank'],
  fdr: ['transport', 'lock'],
  gold: ['utilities', 'coins'],
  shares: ['shopping', 'trend-up'],
  emergency: ['dining', 'alert'],
  'other-deposit': ['work', 'dots'],

  // Business
  sales: ['shopping', 'trend-up'],
  services: ['work', 'briefcase'],
  commission: ['fun', 'cat-percent'],
  cogs: ['food', 'inbox'],
  marketing: ['fun', 'cat-megaphone'],
  logistics: ['transport', 'cat-truck'],
  equipment: ['work', 'cat-tool'],
  software: ['mobile', 'cat-code'],
  professional: ['work', 'briefcase'],
  salaries: ['work', 'users'],
  'office-rent': ['home', 'cat-home'],
  'biz-utilities': ['utilities', 'cat-utilities'],
  'biz-bank-fees': ['utilities', 'bank'],
  'travel-biz': ['transport', 'cat-plane'],
  'biz-fdr': ['transport', 'lock'],
  'business-draw': ['home', 'arrow-move'],
  reinvest: ['shopping', 'refresh'],
  retained: ['work', 'coins'],
  'other-biz-in': ['work', 'dots'],
  'other-biz-out': ['work', 'dots'],
};

/**
 * The tint, the sprite icon and the class that colours a tile
 * (`.cat-<tint>` in _surfaces.css). A category nobody mapped gets the
 * neutral tag on --text-3.
 *
 * @returns {{ tint: string|null, icon: string, className: string }}
 */
export function glyphOf(category) {
  const [tint, icon] = LOOK[category?.key] || [null, 'tag'];
  return { tint, icon, className: tint ? `cat-${tint}` : '' };
}
