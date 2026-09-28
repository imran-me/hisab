# assets/banks — institution logos

Self-hosted logo files for `shared/js/components/bank-logo.js`. An
institution in `shared/js/data/institutions.js` with `logo: '<file>'` shows
that file on a white, square tile. One with `logo: null` is drawn as an SVG
monogram in its brand colour, which is the fallback for anything not here.

Each logo is a trademark of its owner. It is shown only to identify the
owner's own account at that institution. Every file below came from
Wikimedia Commons, and its licence is the one Commons records. A file whose
source or licence was unclear was not added.

Fetched 2026-09-27 via the Commons API. SVGs were stripped of metadata and
editor attributes, and given a `viewBox` so they scale inside an `<img>`.
PNGs were scaled to 160 px on the long side and quantised to 64 colours.

| File | Institution | Commons file | Licence |
|---|---|---|---|
| `dbbl.svg` | Dutch-Bangla Bank | [File:Dutch-bangla-bank-ltd.svg](https://commons.wikimedia.org/wiki/File:Dutch-bangla-bank-ltd.svg) | CC0 |
| `sonali.svg` | Sonali Bank | [File:Sonali Bank Limited.svg](https://commons.wikimedia.org/wiki/File:Sonali_Bank_Limited.svg) | Public domain |
| `janata.svg` | Janata Bank | [File:Janata Bank Logo.svg](https://commons.wikimedia.org/wiki/File:Janata_Bank_Logo.svg) | Public domain |
| `scb.svg` | Standard Chartered | [File:Standard Chartered Logo (2021, Logo only).svg](https://commons.wikimedia.org/wiki/File:Standard_Chartered_Logo_(2021,_Logo_only).svg) | Public domain |
| `rocket.svg` | Rocket (DBBL) | [File:Rocket mobile banking logo.svg](https://commons.wikimedia.org/wiki/File:Rocket_mobile_banking_logo.svg) | Public domain |
| `upay.svg` | Upay | [File:Upay logo.svg](https://commons.wikimedia.org/wiki/File:Upay_logo.svg) | Public domain |
| `visa.svg` | Visa | [File:Visa Inc. logo (2021–present).svg](https://commons.wikimedia.org/wiki/File:Visa_Inc._logo_(2021%E2%80%93present).svg) | Public domain |
| `mastercard.svg` | Mastercard | [File:Mastercard 2019 logo.svg](https://commons.wikimedia.org/wiki/File:Mastercard_2019_logo.svg) | Public domain |
| `amex.png` | American Express | [File:American Express logo.png](https://commons.wikimedia.org/wiki/File:American_Express_logo.png) | CC0 |

## Looked at and not used (these are drawn as monograms)

- **Wide wordmarks** are illegible in a 40 px square: a 5:1 mark becomes
  32 × 6 px there. This covers Eastern, Prime, Mutual Trust, Bank Asia,
  Dhaka, Southeast, AB, IFIC, Jamuna, ONE, Premier, Midland and Community
  Bank. The brand-colour monogram reads better at that size.
- **HSBC**: the only candidate was "HSBC UK", the wrong entity for
  Bangladesh.
- **bKash**: the only candidate (CC BY 4.0) is the Bangla wordmark, which
  is unreadable at tile size. The pink "bK" monogram is used.
- **NRB Bank**: "NRB Logo.svg" is a different institution with a Cyrillic
  mark.
- **Islami Bank**: search returned other Islamic banks' logos only.
- **Not on Commons**: BRAC, City, Agrani, Pubali, UCB, Trust, Mercantile,
  Nagad, Tap and SureCash.

To add one: put an optimised square-ish file here, set `logo:` in
`institutions.js`, add a row above, and check `tools/institutions.html`.

## Added 2026-09-28

Square marks (96px PNG, transparent) and, where one exists, a wide
`<id>-wordmark.png` (≤240px) shown on the account card.

- Wordmarks and most square marks: the English Wikipedia article for each
  bank (its logo file; many are non-free logos used under fair use there).
  Square marks for bKash, Prime, Southeast and Trust are cropped from those
  wordmarks.
- city, pubali, hsbc, mtb, dhaka, ucb, jamuna, premier, community, brac,
  bankasia, ific, ebl, agrani, abbank, nrb, one, midland, surecash: each
  bank's own site icon, via the site or Google's favicon service.
- ibbl, nagad: the bank's own site favicon.

These are trademarks of their owners, used here only to identify the
owner's own accounts in a private app. Mercantile, Tap and SureCash's
wordmark had no usable source and keep the brand-colour monogram.
