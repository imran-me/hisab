/**
 * Hisab · Merchants and billers
 *
 * The shops, services and bill collectors an entry is most often paid to, so a
 * ledger row can show "Foodpanda" as Foodpanda's mark instead of a generic
 * dining glyph. findMerchant() (components/merchant-logo.js) matches an entry's
 * payee, then its note, against these.
 *
 *   id     stable key
 *   name   as the brand writes it
 *   short  2–4 letters for the monogram tile when there is no logo file
 *   color  the brand colour, the monogram's ground
 *   logo   a 96px square mark under assets/merchants/, or null
 *   match  spellings found ANYWHERE in the text, as whole words
 *   exact  spellings that match only when they are the WHOLE text: a word
 *          that is also an everyday word or a person's name ("Apple",
 *          "Robi", "Apex") must not turn "apple 1kg" into an Apple purchase
 *   not    spellings that veto the match ("Emirates NBD" is a bank, not the
 *          airline)
 *
 * Brand colours are data, not design tokens, exactly as in institutions.js.
 * Where each logo came from is in assets/merchants/README.md.
 */
export const MERCHANTS = [
  /* ---- Shopping and delivery -------------------------------------------- */
  { id: 'daraz',      name: 'Daraz',        short: 'D',    color: '#F85606', logo: 'daraz.png',      match: ['daraz'] },
  { id: 'foodpanda',  name: 'Foodpanda',    short: 'fp',   color: '#D70F64', logo: 'foodpanda.png',  match: ['foodpanda', 'food panda', 'pandamart', 'panda mart'] },
  { id: 'pathao',     name: 'Pathao',       short: 'P',    color: '#E4262C', logo: 'pathao.png',     match: ['pathao'] },
  { id: 'uber',       name: 'Uber',         short: 'U',    color: '#000000', logo: 'uber.png',       match: ['uber', 'uber eats', 'uber moto'] },
  { id: 'shohoz',     name: 'Shohoz',       short: 'S',    color: '#E8413A', logo: 'shohoz.png',     match: ['shohoz'] },
  { id: 'chaldal',    name: 'Chaldal',      short: 'C',    color: '#F5B400', logo: 'chaldal.png',    match: ['chaldal'] },
  { id: 'aarong',     name: 'Aarong',       short: 'A',    color: '#8B1D1D', logo: 'aarong.png',     match: ['aarong'] },
  { id: 'shwapno',    name: 'Shwapno',      short: 'S',    color: '#E31E25', logo: 'shwapno.png',    match: ['shwapno', 'swapno'] },
  { id: 'agora',      name: 'Agora',        short: 'A',    color: '#00A651', logo: null, wordmark: 'agora-wordmark.png', match: ['agora'] },
  { id: 'meenabazar', name: 'Meena Bazar',  short: 'MB',   color: '#D71920', logo: 'meenabazar.png', match: ['meena bazar', 'meena bazaar', 'meenabazar'] },
  { id: 'unimart',    name: 'Unimart',      short: 'U',    color: '#005BAA', logo: 'unimart.png',    match: ['unimart'] },
  { id: 'bata',       name: 'Bata',         short: 'B',    color: '#E4002B', logo: 'bata.png',       match: ['bata'] },
  { id: 'apex',       name: 'Apex',         short: 'A',    color: '#D71920', logo: 'apex.png',       match: ['apex footwear', 'apex shoe', 'apex shoes'], exact: ['apex'] },
  { id: 'amazon',     name: 'Amazon',       short: 'a',    color: '#FF9900', logo: 'amazon.png',     match: ['amazon', 'aws', 'prime video'] },

  /* ---- Food and coffee --------------------------------------------------- */
  { id: 'kfc',        name: 'KFC',          short: 'KFC',  color: '#E4002B', logo: 'kfc.png',        match: ['kfc'] },
  { id: 'pizzahut',   name: 'Pizza Hut',    short: 'PH',   color: '#EE3124', logo: 'pizzahut.png',   match: ['pizza hut', 'pizzahut'] },
  { id: 'starbucks',  name: 'Starbucks',    short: 'S',    color: '#00704A', logo: 'starbucks.png',  match: ['starbucks'] },

  /* ---- Mobile, internet ---------------------------------------------------- */
  { id: 'gp',         name: 'Grameenphone', short: 'GP',   color: '#19AAF8', logo: 'gp.png',         match: ['grameenphone', 'grameen phone', 'gp', 'skitto'] },
  { id: 'robi',       name: 'Robi',         short: 'R',    color: '#E4002B', logo: 'robi.png',       match: ['robi axiata', 'robi recharge', 'robi bill', 'robi internet', 'robi pack', 'robi postpaid'], exact: ['robi'] },
  { id: 'banglalink', name: 'Banglalink',   short: 'BL',   color: '#F26522', logo: 'banglalink.png', match: ['banglalink'] },
  { id: 'teletalk',   name: 'Teletalk',     short: 'TT',   color: '#00953B', logo: 'teletalk.png',   match: ['teletalk'] },
  { id: 'airtel',     name: 'Airtel',       short: 'A',    color: '#E40000', logo: 'airtel.png',     match: ['airtel'] },
  { id: 'btcl',       name: 'BTCL',         short: 'BTCL', color: '#006A4E', logo: 'btcl.png',       match: ['btcl'] },
  { id: 'link3',      name: 'Link3',        short: 'L3',   color: '#E31E24', logo: 'link3.png',      match: ['link3', 'link 3'] },
  { id: 'amberit',    name: 'Amber IT',     short: 'AIT',  color: '#F7941D', logo: 'amberit.png',    match: ['amber it', 'amberit'] },
  { id: 'carnival',   name: 'Carnival',     short: 'C',    color: '#EC1C24', logo: 'carnival.png',   match: ['carnival internet', 'carnival isp'], exact: ['carnival'] },

  /* ---- Utility bills ------------------------------------------------------- */
  { id: 'desco',      name: 'DESCO',        short: 'DES',  color: '#1B4F9C', logo: null,             match: ['desco'] },
  { id: 'dpdc',       name: 'DPDC',         short: 'DPDC', color: '#0C4DA2', logo: null,             match: ['dpdc'] },
  { id: 'titas',      name: 'Titas Gas',    short: 'TG',   color: '#0067A5', logo: 'titas.png',      match: ['titas', 'titas gas'] },
  { id: 'wasa',       name: 'Dhaka WASA',   short: 'W',    color: '#0072BC', logo: null,             match: ['wasa', 'dwasa', 'dhaka wasa'] },

  /* ---- Subscriptions and tech ---------------------------------------------- */
  { id: 'netflix',    name: 'Netflix',      short: 'N',    color: '#E50914', logo: 'netflix.png',    match: ['netflix'] },
  { id: 'spotify',    name: 'Spotify',      short: 'S',    color: '#1DB954', logo: 'spotify.png',    match: ['spotify'] },
  { id: 'youtube',    name: 'YouTube',      short: 'YT',   color: '#FF0000', logo: 'youtube.png',    match: ['youtube', 'yt premium'] },
  { id: 'google',     name: 'Google',       short: 'G',    color: '#4285F4', logo: 'google.png',     match: ['google', 'google one', 'google play', 'google workspace', 'gsuite'] },
  { id: 'apple',      name: 'Apple',        short: 'A',    color: '#000000', logo: 'apple.png',      match: ['app store', 'itunes', 'icloud', 'apple music', 'apple tv', 'apple one', 'apple com', 'applecare'], exact: ['apple'] },
  { id: 'facebook',   name: 'Facebook',     short: 'f',    color: '#0866FF', logo: 'facebook.png',   match: ['facebook', 'fb ads', 'fb boost'] },
  { id: 'meta',       name: 'Meta',         short: 'M',    color: '#0668E1', logo: 'meta.png',       match: ['meta ads', 'meta platforms', 'meta verified'], exact: ['meta'] },

  /* ---- Travel -------------------------------------------------------------- */
  { id: 'biman',      name: 'Biman Bangladesh', short: 'BG', color: '#D71921', logo: 'biman.png',    match: ['biman'] },
  { id: 'usbangla',   name: 'US-Bangla',    short: 'BS',   color: '#0D4C92', logo: 'usbangla.png',   match: ['us bangla', 'usbangla'] },
  { id: 'novoair',    name: 'Novoair',      short: 'VQ',   color: '#0E3B7D', logo: 'novoair.png',    match: ['novoair', 'novo air'] },
  { id: 'emirates',   name: 'Emirates',     short: 'EK',   color: '#D71921', logo: 'emirates.png',   match: ['emirates', 'emirates airline'], not: ['emirates nbd', 'emirates islamic'] },
  { id: 'qatar',      name: 'Qatar Airways', short: 'QR',  color: '#5C0632', logo: 'qatar.png',      match: ['qatar airways', 'qatar air'] },
];
