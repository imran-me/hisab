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
 *   logo     a square mark under assets/banks/, or null (then the monogram is drawn)
 *   wordmark optional wide logo for places with room (the account card)
 *   match    spellings findInstitution() accepts ANYWHERE in the text, as
 *            whole words. The id is never matched: "trust", "one",
 *            "standard" and "wise" are ordinary words.
 *   exact    spellings that match only as the WHOLE text: an account called
 *            just "City" is City Bank; "City savings" is not
 *   region   'ae' for a Gulf bank; absent means Bangladesh
 *   group    'online' for Payoneer, Wise and PayPal: kind 'bank' so the bank
 *            picker offers them, grouped apart on the contact sheet
 *
 * Every bank Bangladesh Bank lists as scheduled (state-owned, specialised,
 * private, Islamic and foreign) is here, 61 in all, as of 2026-09.
 *
 * BRAND COLOURS ARE DATA, NOT DESIGN TOKENS: they belong to the institutions,
 * are the one set of hexes outside _variables.css, and are approximations of
 * each brand's primary colour taken from its public mark. See
 * assets/banks/README.md for where each logo came from and its licence.
 */
export const INSTITUTIONS = [
  /* ---- Banks ------------------------------------------------------------ */
  { id: 'brac',        name: 'BRAC Bank',                 short: 'BRAC', kind: 'bank', color: '#1C4E9D', logo: 'brac.png', wordmark: 'brac-wordmark.png', match: ['brac'] },
  { id: 'city',        name: 'The City Bank',             short: 'City', kind: 'bank', color: '#D7282F', logo: 'city.png', wordmark: 'city-wordmark.png', match: ['city bank', 'citybank'], exact: ['city'] },
  { id: 'dbbl',        name: 'Dutch-Bangla Bank',         short: 'DBBL', kind: 'bank', color: '#00833E', logo: 'dbbl.svg', match: ['dutch', 'dbbl'] },
  { id: 'ebl',         name: 'Eastern Bank',              short: 'EBL',  kind: 'bank', color: '#0A3C75', logo: 'ebl.png', match: ['eastern', 'ebl'] },
  { id: 'ibbl',        name: 'Islami Bank Bangladesh',    short: 'IBBL', kind: 'bank', color: '#00695C', logo: 'ibbl.png', wordmark: 'ibbl-wordmark.png', match: ['islami', 'ibbl'] },
  { id: 'sonali',      name: 'Sonali Bank',               short: 'SB',   kind: 'bank', color: '#B8860B', logo: 'sonali.svg', match: ['sonali'] },
  { id: 'janata',      name: 'Janata Bank',               short: 'JB',   kind: 'bank', color: '#1F7A3A', logo: 'janata.svg', match: ['janata'] },
  { id: 'agrani',      name: 'Agrani Bank',               short: 'AGR',  kind: 'bank', color: '#2E7D32', logo: 'agrani.png', wordmark: 'agrani-wordmark.png', match: ['agrani'] },
  { id: 'pubali',      name: 'Pubali Bank',               short: 'PB',   kind: 'bank', color: '#0F4C81', logo: 'pubali.png', wordmark: 'pubali-wordmark.png', match: ['pubali'] },
  { id: 'prime',       name: 'Prime Bank',                short: 'PBL',  kind: 'bank', color: '#005BAA', logo: 'prime.png', wordmark: 'prime-wordmark.png', match: ['prime bank'], exact: ['prime'] },
  { id: 'scb',         name: 'Standard Chartered',        short: 'SC',   kind: 'bank', color: '#0072AA', logo: 'scb.svg', match: ['standard chartered', 'stanchart', 'scb'] },
  { id: 'hsbc',        name: 'HSBC',                      short: 'HSBC', kind: 'bank', color: '#DB0011', logo: 'hsbc.png', match: ['hsbc'] },
  { id: 'mtb',         name: 'Mutual Trust Bank',         short: 'MTB',  kind: 'bank', color: '#A6192E', logo: 'mtb.png', wordmark: 'mtb-wordmark.png', match: ['mutual trust', 'mtb'] },
  { id: 'bankasia',    name: 'Bank Asia',                 short: 'BA',   kind: 'bank', color: '#0055A5', logo: 'bankasia.png', wordmark: 'bankasia-wordmark.png', match: ['bank asia'] },
  { id: 'dhaka',       name: 'Dhaka Bank',                short: 'DB',   kind: 'bank', color: '#007A4D', logo: 'dhaka.png', wordmark: 'dhaka-wordmark.png', match: ['dhaka bank'] },
  { id: 'sebl',        name: 'Southeast Bank',            short: 'SEBL', kind: 'bank', color: '#006838', logo: 'sebl.png', wordmark: 'sebl-wordmark.png', match: ['southeast', 'south east', 'sebl'] },
  { id: 'ucb',         name: 'United Commercial Bank',    short: 'UCB',  kind: 'bank', color: '#E31B23', logo: 'ucb.png', wordmark: 'ucb-wordmark.png', match: ['ucb', 'united commercial'] },
  { id: 'abbank',      name: 'AB Bank',                   short: 'AB',   kind: 'bank', color: '#C8102E', logo: 'abbank.png', wordmark: 'abbank-wordmark.png', match: ['ab bank'] },
  { id: 'ific',        name: 'IFIC Bank',                 short: 'IFIC', kind: 'bank', color: '#004B8D', logo: 'ific.png', wordmark: 'ific-wordmark.png', match: ['ific'] },
  { id: 'jamuna',      name: 'Jamuna Bank',               short: 'JBL',  kind: 'bank', color: '#1B5E20', logo: 'jamuna.png', wordmark: 'jamuna-wordmark.png', match: ['jamuna'] },
  { id: 'nrb',         name: 'NRB Bank',                  short: 'NRB',  kind: 'bank', color: '#0067B1', logo: 'nrb.png', wordmark: 'nrb-wordmark.png', match: ['nrb'] },
  { id: 'one',         name: 'ONE Bank',                  short: 'ONE',  kind: 'bank', color: '#E87722', logo: 'one.png', wordmark: 'one-wordmark.png', match: ['one bank'], exact: ['one'] },
  { id: 'trust',       name: 'Trust Bank',                short: 'TBL',  kind: 'bank', color: '#00843F', logo: 'trust.png', wordmark: 'trust-wordmark.png', match: ['trust bank'], exact: ['trust'] },
  { id: 'mercantile',  name: 'Mercantile Bank',           short: 'MBL',  kind: 'bank', color: '#00539F', logo: 'mercantile.png', wordmark: 'mercantile-wordmark.png', match: ['mercantile'] },
  { id: 'premier',     name: 'The Premier Bank',          short: 'PRM',  kind: 'bank', color: '#1B75BB', logo: 'premier.png', match: ['premier bank'], exact: ['premier'] },
  { id: 'midland',     name: 'Midland Bank',              short: 'MDB',  kind: 'bank', color: '#C8102E', logo: 'midland.png', wordmark: 'midland-wordmark.png', match: ['midland'] },
  { id: 'community',   name: 'Community Bank Bangladesh', short: 'CBB',  kind: 'bank', color: '#0E7C3A', logo: 'community.png', match: ['community bank'], exact: ['community'] },

  /* State-owned, specialised, private and Islamic banks scheduled by Bangladesh Bank */
  { id: 'rupali',     name: 'Rupali Bank',               short: 'RB',   kind: 'bank', color: '#C8102E', logo: 'rupali.png', wordmark: 'rupali-wordmark.png', match: ['rupali'] },
  { id: 'basic',      name: 'BASIC Bank',                short: 'BSC',  kind: 'bank', color: '#0B7A3E', logo: 'basic.png', match: ['basic bank'], exact: ['basic'] },
  { id: 'bdbl',       name: 'Bangladesh Development Bank', short: 'BDBL', kind: 'bank', color: '#1D5FA8', logo: 'bdbl.png', match: ['bdbl', 'bangladesh development'] },
  { id: 'bkb',        name: 'Bangladesh Krishi Bank',    short: 'BKB',  kind: 'bank', color: '#0B7A3E', logo: 'bkb.png', wordmark: 'bkb-wordmark.png', match: ['krishi bank', 'bkb'] },
  { id: 'rakub',      name: 'Rajshahi Krishi Unnayan Bank', short: 'RKB',  kind: 'bank', color: '#1B7A3A', logo: 'rakub.png', match: ['rakub', 'rajshahi krishi'] },
  { id: 'pkb',        name: 'Probashi Kallyan Bank',     short: 'PKB',  kind: 'bank', color: '#B71C1C', logo: 'pkb.png', match: ['probashi', 'probashi kallyan', 'pkb'] },
  { id: 'meghna',     name: 'Meghna Bank',               short: 'MGB',  kind: 'bank', color: '#3F2A8C', logo: 'meghna.png', wordmark: 'meghna-wordmark.png', match: ['meghna'] },
  { id: 'modhumoti',  name: 'Modhumoti Bank',            short: 'MMB',  kind: 'bank', color: '#0F8C6A', logo: 'modhumoti.png', wordmark: 'modhumoti-wordmark.png', match: ['modhumoti'] },
  { id: 'nbl',        name: 'National Bank',             short: 'NBL',  kind: 'bank', color: '#1B8A3A', logo: 'nbl.png', wordmark: 'nbl-wordmark.png', match: ['national bank', 'nbl'] },
  { id: 'ncc',        name: 'NCC Bank',                  short: 'NCC',  kind: 'bank', color: '#1B4F9C', logo: 'ncc.png', wordmark: 'ncc-wordmark.png', match: ['ncc', 'national credit'] },
  { id: 'nrbc',       name: 'NRBC Bank',                 short: 'NRBC', kind: 'bank', color: '#2E9E4A', logo: 'nrbc.png', wordmark: 'nrbc-wordmark.png', match: ['nrbc', 'nrb commercial'] },
  { id: 'padma',      name: 'Padma Bank',                short: 'PDB',  kind: 'bank', color: '#E2127A', logo: 'padma.png', match: ['padma bank'] },
  { id: 'shimanto',   name: 'Shimanto Bank',             short: 'SMB',  kind: 'bank', color: '#C8102E', logo: 'shimanto.png', wordmark: 'shimanto-wordmark.png', match: ['shimanto'] },
  { id: 'sbac',       name: 'SBAC Bank',                 short: 'SBAC', kind: 'bank', color: '#6A2C91', logo: 'sbac.png', match: ['sbac', 'south bangla'] },
  { id: 'uttara',     name: 'Uttara Bank',               short: 'UB',   kind: 'bank', color: '#0B6B3A', logo: 'uttara.png', wordmark: 'uttara-wordmark.png', match: ['uttara bank'] },
  { id: 'citizens',   name: 'Citizens Bank',             short: 'CZB',  kind: 'bank', color: '#8B1A1A', logo: 'citizens.png', match: ['citizens bank'], exact: ['citizens'] },
  { id: 'bengal',     name: 'Bengal Commercial Bank',    short: 'BCB',  kind: 'bank', color: '#1D4F91', logo: null, match: ['bengal commercial', 'bengal bank'] },
  { id: 'bcbl',       name: 'Bangladesh Commerce Bank',  short: 'BCBL', kind: 'bank', color: '#1D3F8F', logo: 'bcbl.png', wordmark: 'bcbl-wordmark.png', match: ['bangladesh commerce', 'bcbl'] },
  { id: 'alarafah',   name: 'Al-Arafah Islami Bank',     short: 'AIB',  kind: 'bank', color: '#0E6B3A', logo: 'alarafah.png', match: ['al arafah', 'alarafah', 'aibl'] },
  { id: 'exim',       name: 'EXIM Bank',                 short: 'EXIM', kind: 'bank', color: '#D71920', logo: 'exim.png', wordmark: 'exim-wordmark.png', match: ['exim'] },
  { id: 'fsibl',      name: 'First Security Islami Bank', short: 'FSIB', kind: 'bank', color: '#0E4D2E', logo: 'fsibl.png', match: ['first security', 'fsibl'] },
  { id: 'sjibl',      name: 'Shahjalal Islami Bank',     short: 'SJIB', kind: 'bank', color: '#2B6CB0', logo: 'sjibl.png', wordmark: 'sjibl-wordmark.png', match: ['shahjalal', 'sjibl'] },
  { id: 'sibl',       name: 'Social Islami Bank',        short: 'SIBL', kind: 'bank', color: '#D71920', logo: 'sibl.png', wordmark: 'sibl-wordmark.png', match: ['social islami', 'sibl'] },
  { id: 'icbib',      name: 'ICB Islamic Bank',          short: 'ICB',  kind: 'bank', color: '#2A3B8F', logo: 'icbib.png', match: ['icb islamic', 'icb'] },
  { id: 'gib',        name: 'Global Islami Bank',        short: 'GIB',  kind: 'bank', color: '#1A1A1A', logo: 'gib.png', wordmark: 'gib-wordmark.png', match: ['global islami', 'gib'] },
  { id: 'union',      name: 'Union Bank',                short: 'UBL',  kind: 'bank', color: '#6A2C91', logo: 'union.png', wordmark: 'union-wordmark.png', match: ['union bank'], exact: ['union'] },
  { id: 'standard',   name: 'Standard Bank',             short: 'STB',  kind: 'bank', color: '#0E8A3A', logo: 'standard.png', match: ['standard bank'], exact: ['standard'] },

  /* Foreign banks with a Bangladesh licence */
  { id: 'citi',       name: 'Citibank',                  short: 'Citi', kind: 'bank', color: '#056DAE', logo: 'citi.png', wordmark: 'citi-wordmark.png', match: ['citibank', 'citi bank', 'citi'] },
  { id: 'cbc',        name: 'Commercial Bank of Ceylon', short: 'CBC',  kind: 'bank', color: '#0068B3', logo: 'cbc.png', wordmark: 'cbc-wordmark.png', match: ['commercial bank of ceylon', 'ceylon'] },
  { id: 'hbl',        name: 'Habib Bank',                short: 'HBL',  kind: 'bank', color: '#008269', logo: 'hbl.png', wordmark: 'hbl-wordmark.png', match: ['habib', 'hbl'] },
  { id: 'nbp',        name: 'National Bank of Pakistan', short: 'NBP',  kind: 'bank', color: '#0B7A3E', logo: 'nbp.png', wordmark: 'nbp-wordmark.png', match: ['national bank of pakistan', 'nbp'] },
  { id: 'sbi',        name: 'State Bank of India',       short: 'SBI',  kind: 'bank', color: '#1A9BD7', logo: 'sbi.png', wordmark: 'sbi-wordmark.png', match: ['state bank of india', 'sbi'] },
  { id: 'woori',      name: 'Woori Bank',                short: 'WRB',  kind: 'bank', color: '#0067AC', logo: 'woori.png', wordmark: 'woori-wordmark.png', match: ['woori'] },
  { id: 'alfalah',    name: 'Bank Alfalah',              short: 'BAF',  kind: 'bank', color: '#D71920', logo: 'alfalah.png', wordmark: 'alfalah-wordmark.png', match: ['alfalah'] },

  /* Gulf banks (region: ae) — the owner banks in the UAE too */
  { id: 'adcb',       name: 'Abu Dhabi Commercial Bank', short: 'ADCB', kind: 'bank', color: '#D71920', logo: 'adcb.png', wordmark: 'adcb-wordmark.png', region: 'ae', match: ['adcb', 'abu dhabi commercial'] },
  { id: 'enbd',       name: 'Emirates NBD',              short: 'ENBD', kind: 'bank', color: '#0A2F6E', logo: 'enbd.png', wordmark: 'enbd-wordmark.png', region: 'ae', match: ['emirates nbd', 'enbd'] },
  { id: 'fab',        name: 'First Abu Dhabi Bank',      short: 'FAB',  kind: 'bank', color: '#0A2F6E', logo: 'fab.png', wordmark: 'fab-wordmark.png', region: 'ae', match: ['first abu dhabi'], exact: ['fab'] },
  { id: 'mashreq',    name: 'Mashreq',                   short: 'MSQ',  kind: 'bank', color: '#F15A22', logo: 'mashreq.png', wordmark: 'mashreq-wordmark.png', region: 'ae', match: ['mashreq', 'mashreqbank', 'mashreq neo'] },
  { id: 'dib',        name: 'Dubai Islamic Bank',        short: 'DIB',  kind: 'bank', color: '#0E7A3A', logo: 'dib.png', wordmark: 'dib-wordmark.png', region: 'ae', match: ['dubai islamic', 'dib'] },
  { id: 'rakbank',    name: 'RAKBANK',                   short: 'RAK',  kind: 'bank', color: '#D71920', logo: 'rakbank.png', wordmark: 'rakbank-wordmark.png', region: 'ae', match: ['rakbank', 'rak bank', 'national bank of ras al khaimah'] },

  /* Online accounts: kind bank so the bank picker finds them, group online */
  { id: 'payoneer',   name: 'Payoneer',                  short: 'P',    kind: 'bank', color: '#FF4800', logo: 'payoneer.png', wordmark: 'payoneer-wordmark.png', group: 'online', match: ['payoneer'] },
  { id: 'wise',       name: 'Wise',                      short: 'W',    kind: 'bank', color: '#9FE870', logo: 'wise.png', wordmark: 'wise-wordmark.png', group: 'online', match: ['wise account', 'wise com', 'transferwise'], exact: ['wise'] },
  { id: 'paypal',     name: 'PayPal',                    short: 'PP',   kind: 'bank', color: '#003087', logo: 'paypal.png', wordmark: 'paypal-wordmark.png', group: 'online', match: ['paypal'] },

  /* ---- Mobile financial services ---------------------------------------- */
  { id: 'bkash',       name: 'bKash',                     short: 'bK',   kind: 'mfs',  color: '#E2136E', logo: 'bkash.png', wordmark: 'bkash-wordmark.png', match: ['bkash', 'b kash'] },
  { id: 'nagad',       name: 'Nagad',                     short: 'N',    kind: 'mfs',  color: '#F26722', logo: 'nagad.png', match: ['nagad'] },
  { id: 'rocket',      name: 'Rocket',                    short: 'R',    kind: 'mfs',  color: '#8C3494', logo: 'rocket.svg', match: ['rocket wallet', 'dbbl rocket'], exact: ['rocket'] },
  { id: 'upay',        name: 'Upay',                      short: 'U',    kind: 'mfs',  color: '#0054A6', logo: 'upay.svg', match: ['upay'] },
  { id: 'tap',         name: 'Tap',                       short: 'tap',  kind: 'mfs',  color: '#6C2D82', logo: null, match: ['tap wallet', 'trust axiata pay'], exact: ['tap'] },
  { id: 'surecash',    name: 'SureCash',                  short: 'SC',   kind: 'mfs',  color: '#00A651', logo: 'surecash.png', match: ['surecash', 'sure cash'] },
  { id: 'okwallet',   name: 'OK Wallet',                 short: 'OK',   kind: 'mfs',  color: '#F6C700', logo: 'okwallet.png', match: ['ok wallet', 'okwallet'] },
  { id: 'mcash',      name: 'mCash',                     short: 'mC',   kind: 'mfs',  color: '#0B7A3E', logo: null, match: ['mcash', 'm cash'] },
  { id: 'cellfin',    name: 'CellFin',                   short: 'CF',   kind: 'mfs',  color: '#0E6B3A', logo: null, match: ['cellfin'] },
  { id: 'dmoney',     name: 'dmoney',                    short: 'dm',   kind: 'mfs',  color: '#1B4F9C', logo: null, match: ['dmoney', 'd money'] },
  { id: 'ipay',       name: 'iPay',                      short: 'iP',   kind: 'mfs',  color: '#0E9F7E', logo: 'ipay.png', match: ['ipay'] },

  /* ---- Card networks ----------------------------------------------------- */
  { id: 'visa',        name: 'Visa',                      short: 'VISA', kind: 'card', color: '#1A1F71', logo: 'visa.svg', match: ['visa'] },
  { id: 'mastercard',  name: 'Mastercard',                short: 'MC',   kind: 'card', color: '#EB001B', logo: 'mastercard.svg', match: ['mastercard', 'master card'] },
  { id: 'amex',        name: 'American Express',          short: 'AMEX', kind: 'card', color: '#2E77BC', logo: 'amex.png', match: ['amex', 'american express'] },

  /* ---- Generic: no institution, or one not listed -------------------------
     Drawn from the sprite in a tint, never a grey placeholder. */
  { id: 'cash',        name: 'Cash',                      short: '',     kind: 'generic', icon: 'cash',   tint: 'in',    logo: null, match: ['cash'] },
  { id: 'bank',        name: 'Bank',                      short: '',     kind: 'generic', icon: 'bank',   tint: 'biz',   logo: null, match: [] },
  { id: 'wallet',      name: 'Wallet',                    short: '',     kind: 'generic', icon: 'wallet', tint: 'saved', logo: null, match: ['wallet'] },
  { id: 'card',        name: 'Card',                      short: '',     kind: 'generic', icon: 'card',   tint: 'accent', logo: null, match: ['card'] },
];
