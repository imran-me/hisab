/**
 * Hisab · Institutions
 *
 * The banks, mobile wallets and card networks an account can belong to, with
 * the colour and mark that identify each on a phone at a glance.
 *
 *   id       stable key, stored on nothing yet (accounts keep a free-text
 *            `institution`; findInstitution() matches it to one of these)
 *   name     full name, as the institution writes it
 *   short    2–5 letters for the monogram tile, as people say it
 *   kind     'bank' | 'mfs' | 'card' | 'generic'
 *   color    the brand colour, used as the monogram's ground
 *   logo     a file under assets/banks/, or null (then the monogram is drawn)
 *   match    extra spellings findInstitution() accepts
 *
 * BRAND COLOURS ARE DATA, NOT DESIGN TOKENS: they belong to the institutions,
 * are the one set of hexes outside _variables.css, and are approximations of
 * each brand's primary colour taken from its public mark. See
 * assets/banks/README.md for where each logo came from and its licence.
 */
export const INSTITUTIONS = [
  /* ---- Banks ------------------------------------------------------------ */
  { id: 'brac',        name: 'BRAC Bank',                 short: 'BRAC', kind: 'bank', color: '#1C4E9D', logo: null, match: ['brac'] },
  { id: 'city',        name: 'The City Bank',             short: 'City', kind: 'bank', color: '#D7282F', logo: null, match: ['city bank', 'citybank', 'city'] },
  { id: 'dbbl',        name: 'Dutch-Bangla Bank',         short: 'DBBL', kind: 'bank', color: '#00833E', logo: null, match: ['dutch', 'dbbl'] },
  { id: 'ebl',         name: 'Eastern Bank',              short: 'EBL',  kind: 'bank', color: '#0A3C75', logo: null, match: ['eastern', 'ebl'] },
  { id: 'ibbl',        name: 'Islami Bank Bangladesh',    short: 'IBBL', kind: 'bank', color: '#00695C', logo: null, match: ['islami', 'ibbl'] },
  { id: 'sonali',      name: 'Sonali Bank',               short: 'SB',   kind: 'bank', color: '#B8860B', logo: null, match: ['sonali'] },
  { id: 'janata',      name: 'Janata Bank',               short: 'JB',   kind: 'bank', color: '#1F7A3A', logo: null, match: ['janata'] },
  { id: 'agrani',      name: 'Agrani Bank',               short: 'AGR',  kind: 'bank', color: '#2E7D32', logo: null, match: ['agrani'] },
  { id: 'pubali',      name: 'Pubali Bank',               short: 'PB',   kind: 'bank', color: '#0F4C81', logo: null, match: ['pubali'] },
  { id: 'prime',       name: 'Prime Bank',                short: 'PBL',  kind: 'bank', color: '#005BAA', logo: null, match: ['prime'] },
  { id: 'scb',         name: 'Standard Chartered',        short: 'SC',   kind: 'bank', color: '#0072AA', logo: null, match: ['standard chartered', 'stanchart', 'scb'] },
  { id: 'hsbc',        name: 'HSBC',                      short: 'HSBC', kind: 'bank', color: '#DB0011', logo: null, match: ['hsbc'] },
  { id: 'mtb',         name: 'Mutual Trust Bank',         short: 'MTB',  kind: 'bank', color: '#A6192E', logo: null, match: ['mutual trust', 'mtb'] },
  { id: 'bankasia',    name: 'Bank Asia',                 short: 'BA',   kind: 'bank', color: '#0055A5', logo: null, match: ['bank asia'] },
  { id: 'dhaka',       name: 'Dhaka Bank',                short: 'DB',   kind: 'bank', color: '#007A4D', logo: null, match: ['dhaka bank'] },
  { id: 'sebl',        name: 'Southeast Bank',            short: 'SEBL', kind: 'bank', color: '#006838', logo: null, match: ['southeast', 'south east', 'sebl'] },
  { id: 'ucb',         name: 'United Commercial Bank',    short: 'UCB',  kind: 'bank', color: '#E31B23', logo: null, match: ['ucb', 'united commercial'] },
  { id: 'abbank',      name: 'AB Bank',                   short: 'AB',   kind: 'bank', color: '#C8102E', logo: null, match: ['ab bank'] },
  { id: 'ific',        name: 'IFIC Bank',                 short: 'IFIC', kind: 'bank', color: '#004B8D', logo: null, match: ['ific'] },
  { id: 'jamuna',      name: 'Jamuna Bank',               short: 'JBL',  kind: 'bank', color: '#1B5E20', logo: null, match: ['jamuna'] },
  { id: 'nrb',         name: 'NRB Bank',                  short: 'NRB',  kind: 'bank', color: '#0067B1', logo: null, match: ['nrb'] },
  { id: 'one',         name: 'ONE Bank',                  short: 'ONE',  kind: 'bank', color: '#E87722', logo: null, match: ['one bank'] },
  { id: 'trust',       name: 'Trust Bank',                short: 'TBL',  kind: 'bank', color: '#00843F', logo: null, match: ['trust bank'] },
  { id: 'mercantile',  name: 'Mercantile Bank',           short: 'MBL',  kind: 'bank', color: '#00539F', logo: null, match: ['mercantile'] },
  { id: 'premier',     name: 'The Premier Bank',          short: 'PRM',  kind: 'bank', color: '#1B75BB', logo: null, match: ['premier'] },
  { id: 'midland',     name: 'Midland Bank',              short: 'MDB',  kind: 'bank', color: '#C8102E', logo: null, match: ['midland'] },
  { id: 'community',   name: 'Community Bank Bangladesh', short: 'CBB',  kind: 'bank', color: '#0E7C3A', logo: null, match: ['community'] },

  /* ---- Mobile financial services ---------------------------------------- */
  { id: 'bkash',       name: 'bKash',                     short: 'bK',   kind: 'mfs',  color: '#E2136E', logo: null, match: ['bkash', 'b kash'] },
  { id: 'nagad',       name: 'Nagad',                     short: 'N',    kind: 'mfs',  color: '#EC1C24', logo: null, match: ['nagad'] },
  { id: 'rocket',      name: 'Rocket',                    short: 'R',    kind: 'mfs',  color: '#8C3494', logo: null, match: ['rocket'] },
  { id: 'upay',        name: 'Upay',                      short: 'U',    kind: 'mfs',  color: '#0054A6', logo: null, match: ['upay'] },
  { id: 'tap',         name: 'Tap',                       short: 'tap',  kind: 'mfs',  color: '#6C2D82', logo: null, match: ['tap'] },
  { id: 'surecash',    name: 'SureCash',                  short: 'SC',   kind: 'mfs',  color: '#00A651', logo: null, match: ['surecash', 'sure cash'] },

  /* ---- Card networks ----------------------------------------------------- */
  { id: 'visa',        name: 'Visa',                      short: 'VISA', kind: 'card', color: '#1A1F71', logo: null, match: ['visa'] },
  { id: 'mastercard',  name: 'Mastercard',                short: 'MC',   kind: 'card', color: '#EB001B', logo: null, match: ['mastercard', 'master card'] },
  { id: 'amex',        name: 'American Express',          short: 'AMEX', kind: 'card', color: '#2E77BC', logo: null, match: ['amex', 'american express'] },

  /* ---- Generic: no institution, or one not listed -------------------------
     Drawn from the sprite in a tint, never a grey placeholder. */
  { id: 'cash',        name: 'Cash',                      short: '',     kind: 'generic', icon: 'cash',   tint: 'in',    logo: null, match: ['cash'] },
  { id: 'bank',        name: 'Bank',                      short: '',     kind: 'generic', icon: 'bank',   tint: 'biz',   logo: null, match: [] },
  { id: 'wallet',      name: 'Wallet',                    short: '',     kind: 'generic', icon: 'wallet', tint: 'saved', logo: null, match: ['wallet'] },
  { id: 'card',        name: 'Card',                      short: '',     kind: 'generic', icon: 'card',   tint: 'accent', logo: null, match: ['card'] },
];
