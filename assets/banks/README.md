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

## Added 2026-09-28 (second pass): every scheduled bank, more wallets, Gulf and online

The list now covers all 61 banks Bangladesh Bank schedules (state-owned,
specialised, private, Islamic and foreign), the other mobile wallets, the
six Gulf banks the owner may use (ADCB, Emirates NBD, FAB, Mashreq, DIB,
RAKBANK) and Payoneer, Wise and PayPal.

How they were made (2026-09-28). Sources in this order of preference:

1. the English Wikipedia article's logo file, found through the API
   (the infobox's `logo`, else `prop=images`), fetched as a PNG rendering
   with `imageinfo&iiurlwidth=256` (960 for a wide mark, so its symbol can
   be cropped out);
2. the brand's own site icon (`apple-touch-icon` or the largest `<link
   rel=icon>` on its homepage);
3. Google's favicon service, `https://www.google.com/s2/favicons?domain=X&sz=128`.

Requests carried a generic User-Agent, were spaced 2.5 seconds apart for
Wikimedia, and backed off on 429. Nothing personal was sent.

Each square mark is normalised to a 96 px PNG: a white ground flood-filled
to transparent from the edges, trimmed, centred, and quantised to 128
colours. A wordmark is trimmed and scaled to at most 240 × 72 px. Where
the only square source was a tiny or generic favicon, the symbol was
cropped out of the wordmark instead. Every candidate was put on a contact
sheet and looked at; wrong matches were rejected: a photo of a Dhaka
shopping mall (Shwapno), a KFC restaurant photo, Trust Bank's logo on the
"Tap" redirect, Cirkle's logo on the Airtel redirect, the Bangladesh
government emblem that DPDC, DESCO, WASA and several banks serve as their
favicon, and tap.com.bd's unrelated "S" icon. Those keep the brand-colour
monogram.

These are trademarks of their owners, used only to identify the owner's
own accounts and payees in a private app.

Still drawn as a monogram: Bengal Commercial Bank (no source found), Tap,
mCash, CellFin and dmoney (no usable icon).

| id | Files and where they came from |
|---|---|
| rupali | `rupali.png`: Wikipedia “Rupali Bank”, [Rupali Bank PLC logo.svg](https://en.wikipedia.org/wiki/File:Rupali_Bank_PLC_logo.svg) (Fair use), cropped from the wordmark<br>`rupali-wordmark.png`: Wikipedia “Rupali Bank”, [Rupali Bank PLC logo.svg](https://en.wikipedia.org/wiki/File:Rupali_Bank_PLC_logo.svg) (Fair use), the article’s logo file |
| basic | `basic.png`: Wikipedia “BASIC Bank”, [BASIC Bank Logo.svg](https://commons.wikimedia.org/wiki/File:BASIC_Bank_Logo.svg) (Public domain), the article’s logo file |
| bdbl | `bdbl.png`: Wikipedia “Bangladesh Development Bank”, [Bangladesh Development Bank logo.svg](https://commons.wikimedia.org/wiki/File:Bangladesh_Development_Bank_logo.svg) (Public domain), the article’s logo file |
| bkb | `bkb.png`: Wikipedia “Bangladesh Krishi Bank”, [Bangladesh Krishi Bank logo.png](https://en.wikipedia.org/wiki/File:Bangladesh_Krishi_Bank_logo.png) (Fair use), cropped from the wordmark<br>`bkb-wordmark.png`: Wikipedia “Bangladesh Krishi Bank”, [Bangladesh Krishi Bank logo.png](https://en.wikipedia.org/wiki/File:Bangladesh_Krishi_Bank_logo.png) (Fair use), the article’s logo file |
| rakub | `rakub.png`: Wikipedia “Rajshahi Krishi Unnayan Bank”, [Rajshahi Krishi Unnayan Bank.png](https://en.wikipedia.org/wiki/File:Rajshahi_Krishi_Unnayan_Bank.png) (Fair use), the article’s logo file |
| pkb | `pkb.png`: Wikipedia “Probashi Kallyan Bank”, [Probashi_Kallyan_Bank.jpg](https://en.wikipedia.org/wiki/File:Probashi_Kallyan_Bank.jpg) (Fair use), the article’s logo file |
| mercantile | `mercantile.png`: Wikipedia “Mercantile Bank (Bangladesh)”, [Logo of Mercantile Bank.jpg](https://en.wikipedia.org/wiki/File:Logo_of_Mercantile_Bank.jpg) (Fair use), cropped from the wordmark<br>`mercantile-wordmark.png`: Wikipedia “Mercantile Bank (Bangladesh)”, [Logo of Mercantile Bank.jpg](https://en.wikipedia.org/wiki/File:Logo_of_Mercantile_Bank.jpg) (Fair use), the article’s logo file |
| meghna | `meghna.png`: Wikipedia “Meghna Bank”, [Meghna-Bank Logo JPG.jpg](https://commons.wikimedia.org/wiki/File:Meghna-Bank_Logo_JPG.jpg) (CC BY-SA 4.0), cropped from the wordmark<br>`meghna-wordmark.png`: Wikipedia “Meghna Bank”, [Meghna-Bank Logo JPG.jpg](https://commons.wikimedia.org/wiki/File:Meghna-Bank_Logo_JPG.jpg) (CC BY-SA 4.0), the article’s logo file |
| modhumoti | `modhumoti.png`: the brand’s own site icon (`https://www.domaish.com/wp-content/uploads/2025/02/favicon4-300x300.png`)<br>`modhumoti-wordmark.png`: Wikipedia “Modhumoti Bank”, [Logo of Modhumoti Bank-en.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Modhumoti_Bank-en.svg) (Public domain), the article’s logo file |
| nbl | `nbl.png`: Wikipedia “National Bank (Bangladesh)”, [NBL Logo New.jpg](https://commons.wikimedia.org/wiki/File:NBL_Logo_New.jpg) (CC0), cropped from the wordmark<br>`nbl-wordmark.png`: Wikipedia “National Bank (Bangladesh)”, [NBL Logo New.jpg](https://commons.wikimedia.org/wiki/File:NBL_Logo_New.jpg) (CC0), the article’s logo file |
| ncc | `ncc.png`: Wikipedia “National Credit and Commerce Bank”, [NCC bank logo.png](https://en.wikipedia.org/wiki/File:NCC_bank_logo.png) (Fair use), cropped from the wordmark<br>`ncc-wordmark.png`: Wikipedia “National Credit and Commerce Bank”, [NCC bank logo.png](https://en.wikipedia.org/wiki/File:NCC_bank_logo.png) (Fair use), the article’s logo file |
| nrbc | `nrbc.png`: Wikipedia “NRBC Bank”, [NRBC Bank logo.svg](https://commons.wikimedia.org/wiki/File:NRBC_Bank_logo.svg) (Public domain), cropped from the wordmark<br>`nrbc-wordmark.png`: Wikipedia “NRBC Bank”, [NRBC Bank logo.svg](https://commons.wikimedia.org/wiki/File:NRBC_Bank_logo.svg) (Public domain), the article’s logo file |
| padma | `padma.png`: Wikipedia “Padma Bank”, [Logo of Padma Bank.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Padma_Bank.svg) (Public domain), the article’s logo file |
| shimanto | `shimanto.png`: Wikipedia “Shimanto Bank”, [Logo of Shimanto Bank.png](https://en.wikipedia.org/wiki/File:Logo_of_Shimanto_Bank.png) (Fair use), cropped from the wordmark<br>`shimanto-wordmark.png`: Wikipedia “Shimanto Bank”, [Logo of Shimanto Bank.png](https://en.wikipedia.org/wiki/File:Logo_of_Shimanto_Bank.png) (Fair use), the article’s logo file |
| sbac | `sbac.png`: Wikipedia “South Bangla Agriculture and Commerce Bank”, [Logo of SBAC Bank.svg](https://en.wikipedia.org/wiki/File:Logo_of_SBAC_Bank.svg) (Fair use), the article’s logo file |
| uttara | `uttara.png`: Wikipedia “Uttara Bank PLC.”, [Logo of Uttara Bank.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Uttara_Bank.svg) (Public domain), cropped from the wordmark<br>`uttara-wordmark.png`: Wikipedia “Uttara Bank PLC.”, [Logo of Uttara Bank.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Uttara_Bank.svg) (Public domain), the article’s logo file |
| citizens | `citizens.png`: the brand’s favicon via Google’s favicon service (`citizensbankbd.com`) |
| bcbl | `bcbl.png`: the brand’s favicon via Google’s favicon service (`bcblbd.com`)<br>`bcbl-wordmark.png`: Wikipedia “Bangladesh Commerce Bank”, [Bangladesh Commerce Bank Limited.png](https://en.wikipedia.org/wiki/File:Bangladesh_Commerce_Bank_Limited.png) (Fair use), the article’s logo file |
| alarafah | `alarafah.png`: Wikipedia “Al-Arafah Islami Bank”, [Logo of Al-Arafah Islami Bank PLC.png](https://en.wikipedia.org/wiki/File:Logo_of_Al-Arafah_Islami_Bank_PLC.png) (Fair use), the article’s logo file |
| exim | `exim.png`: Wikipedia “Exim Bank (Bangladesh)”, [Logo of Exim Bank (Bangladesh).svg](https://commons.wikimedia.org/wiki/File:Logo_of_Exim_Bank_(Bangladesh).svg) (Public domain), cropped from the wordmark<br>`exim-wordmark.png`: Wikipedia “Exim Bank (Bangladesh)”, [Logo of Exim Bank (Bangladesh).svg](https://commons.wikimedia.org/wiki/File:Logo_of_Exim_Bank_(Bangladesh).svg) (Public domain), the article’s logo file |
| fsibl | `fsibl.png`: Wikipedia “First Security Islami Bank PLC”, [Logo of First Security Islami Bank.svg](https://commons.wikimedia.org/wiki/File:Logo_of_First_Security_Islami_Bank.svg) (Public domain), the article’s logo file |
| sjibl | `sjibl.png`: Wikipedia “Shahjalal Islami Bank”, [SJIBPLC Logo blue-01.jpg](https://commons.wikimedia.org/wiki/File:SJIBPLC_Logo_blue-01.jpg) (CC BY-SA 4.0), cropped from the wordmark<br>`sjibl-wordmark.png`: Wikipedia “Shahjalal Islami Bank”, [SJIBPLC Logo blue-01.jpg](https://commons.wikimedia.org/wiki/File:SJIBPLC_Logo_blue-01.jpg) (CC BY-SA 4.0), the article’s logo file |
| sibl | `sibl.png`: Wikipedia “Social Islami Bank”, [Logo of Social Islami Bank.svg](https://en.wikipedia.org/wiki/File:Logo_of_Social_Islami_Bank.svg) (Fair use), cropped from the wordmark<br>`sibl-wordmark.png`: Wikipedia “Social Islami Bank”, [Logo of Social Islami Bank.svg](https://en.wikipedia.org/wiki/File:Logo_of_Social_Islami_Bank.svg) (Fair use), the article’s logo file |
| icbib | `icbib.png`: Wikipedia “ICB Islamic Bank”, [ICB Islamic Bank Logo.svg](https://commons.wikimedia.org/wiki/File:ICB_Islamic_Bank_Logo.svg) (Public domain), the article’s logo file |
| gib | `gib.png`: Wikipedia “Global Islami Bank”, [Logo of Global Islami Bank.svg](https://en.wikipedia.org/wiki/File:Logo_of_Global_Islami_Bank.svg) (Fair use), cropped from the wordmark<br>`gib-wordmark.png`: Wikipedia “Global Islami Bank”, [Logo of Global Islami Bank.svg](https://en.wikipedia.org/wiki/File:Logo_of_Global_Islami_Bank.svg) (Fair use), the article’s logo file |
| union | `union.png`: Wikipedia “Union Bank (Bangladesh)”, [Logo of Union Bank (Bangladesh).png](https://en.wikipedia.org/wiki/File:Logo_of_Union_Bank_(Bangladesh).png) (Fair use), cropped from the wordmark<br>`union-wordmark.png`: Wikipedia “Union Bank (Bangladesh)”, [Logo of Union Bank (Bangladesh).png](https://en.wikipedia.org/wiki/File:Logo_of_Union_Bank_(Bangladesh).png) (Fair use), the article’s logo file |
| standard | `standard.png`: Wikipedia “Standard Bank (Bangladesh)”, [Standard_Bank_Limited_logo.png](https://en.wikipedia.org/wiki/File:Standard_Bank_Limited_logo.png) (Fair use), the article’s logo file |
| citi | `citi.png`: Wikipedia “Citibank”, [Citibank.svg](https://commons.wikimedia.org/wiki/File:Citibank.svg) (Public domain), cropped from the wordmark<br>`citi-wordmark.png`: Wikipedia “Citibank”, [Citibank.svg](https://commons.wikimedia.org/wiki/File:Citibank.svg) (Public domain), the article’s logo file |
| cbc | `cbc.png`: Wikipedia “Commercial Bank of Ceylon”, [Commercial Bank logo.svg](https://commons.wikimedia.org/wiki/File:Commercial_Bank_logo.svg) (Public domain), cropped from the wordmark<br>`cbc-wordmark.png`: Wikipedia “Commercial Bank of Ceylon”, [Commercial Bank logo.svg](https://commons.wikimedia.org/wiki/File:Commercial_Bank_logo.svg) (Public domain), the article’s logo file |
| hbl | `hbl.png`: Wikipedia “Habib Bank Limited”, [Habib Bank Limited logo (2026).png](https://commons.wikimedia.org/wiki/File:Habib_Bank_Limited_logo_(2026).png) (Public domain), cropped from the wordmark<br>`hbl-wordmark.png`: Wikipedia “Habib Bank Limited”, [Habib Bank Limited logo (2026).png](https://commons.wikimedia.org/wiki/File:Habib_Bank_Limited_logo_(2026).png) (Public domain), the article’s logo file |
| nbp | `nbp.png`: Wikipedia “National Bank of Pakistan”, [NBP logo.png](https://en.wikipedia.org/wiki/File:National_Bank_of_Pakistan_(logo).png) (Fair use), cropped from the wordmark<br>`nbp-wordmark.png`: Wikipedia “National Bank of Pakistan”, [NBP logo.png](https://en.wikipedia.org/wiki/File:National_Bank_of_Pakistan_(logo).png) (Fair use), the article’s logo file |
| sbi | `sbi.png`: Wikipedia “State Bank of India”, [State Bank of India.svg](https://commons.wikimedia.org/wiki/File:State_Bank_of_India.svg) (Public domain), cropped from the wordmark<br>`sbi-wordmark.png`: Wikipedia “State Bank of India”, [State Bank of India.svg](https://commons.wikimedia.org/wiki/File:State_Bank_of_India.svg) (Public domain), the article’s logo file |
| woori | `woori.png`: Wikipedia “Woori Bank”, [Logo of Woori Bank.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Woori_Bank.svg) (Public domain), cropped from the wordmark<br>`woori-wordmark.png`: Wikipedia “Woori Bank”, [Logo of Woori Bank.svg](https://commons.wikimedia.org/wiki/File:Logo_of_Woori_Bank.svg) (Public domain), the article’s logo file |
| alfalah | `alfalah.png`: Wikipedia “Bank Alfalah”, [Bank Alfalah Limited logo (2026).svg](https://commons.wikimedia.org/wiki/File:Bank_Alfalah_Limited_logo_(2026).svg) (Public domain), cropped from the wordmark<br>`alfalah-wordmark.png`: Wikipedia “Bank Alfalah”, [Bank Alfalah Limited logo (2026).svg](https://commons.wikimedia.org/wiki/File:Bank_Alfalah_Limited_logo_(2026).svg) (Public domain), the article’s logo file |
| okwallet | `okwallet.png`: the brand’s own site icon (`https://okwallet.com.bd/images/favicon.png`) |
| ipay | `ipay.png`: the brand’s own site icon (`https://www.ipay.com.bd/icon.png?icon.0zj9i08ukjn9r.png?dpl=dpl_36sWcWqAN8k4wfhXNFirtY9nfSYu`) |
| adcb | `adcb.png`: Wikipedia “ADCB”, [Abu Dhabi Commercial Bank logo.svg](https://commons.wikimedia.org/wiki/File:Abu_Dhabi_Commercial_Bank_logo.svg) (Public domain), cropped from the wordmark<br>`adcb-wordmark.png`: Wikipedia “ADCB”, [Abu Dhabi Commercial Bank logo.svg](https://commons.wikimedia.org/wiki/File:Abu_Dhabi_Commercial_Bank_logo.svg) (Public domain), the article’s logo file |
| enbd | `enbd.png`: Wikipedia “Emirates NBD”, [Lg-67a9470992e1d-Emirates-NBD.png](https://en.wikipedia.org/wiki/File:Lg-67a9470992e1d-Emirates-NBD.png) (Fair use), cropped from the wordmark<br>`enbd-wordmark.png`: Wikipedia “Emirates NBD”, [Lg-67a9470992e1d-Emirates-NBD.png](https://en.wikipedia.org/wiki/File:Lg-67a9470992e1d-Emirates-NBD.png) (Fair use), the article’s logo file |
| fab | `fab.png`: Wikipedia “First Abu Dhabi Bank”, [First Abu Dhabi Bank Logo.svg](https://commons.wikimedia.org/wiki/File:First_Abu_Dhabi_Bank_Logo.svg) (Public domain), cropped from the wordmark<br>`fab-wordmark.png`: Wikipedia “First Abu Dhabi Bank”, [First Abu Dhabi Bank Logo.svg](https://commons.wikimedia.org/wiki/File:First_Abu_Dhabi_Bank_Logo.svg) (Public domain), the article’s logo file |
| mashreq | `mashreq.png`: the brand’s favicon via Google’s favicon service (`mashreq.com`)<br>`mashreq-wordmark.png`: Wikipedia “Mashreq (bank)”, [Mashreq logo 2022.svg](https://en.wikipedia.org/wiki/File:Mashreq_logo_2022.svg) (PD), the article’s logo file |
| dib | `dib.png`: Wikipedia “Dubai Islamic Bank”, [Dubai-Islamic-Bank-Logo.png](https://en.wikipedia.org/wiki/File:Dubai-Islamic-Bank-Logo.png) (Fair use), cropped from the wordmark<br>`dib-wordmark.png`: Wikipedia “Dubai Islamic Bank”, [Dubai-Islamic-Bank-Logo.png](https://en.wikipedia.org/wiki/File:Dubai-Islamic-Bank-Logo.png) (Fair use), the article’s logo file |
| rakbank | `rakbank.png`: Wikipedia “RAKBANK”, [RAKBANK.png](https://en.wikipedia.org/wiki/File:RAKBANK.png) (Fair use), cropped from the wordmark<br>`rakbank-wordmark.png`: Wikipedia “RAKBANK”, [RAKBANK.png](https://en.wikipedia.org/wiki/File:RAKBANK.png) (Fair use), the article’s logo file |
| payoneer | `payoneer.png`: Wikipedia “Payoneer”, [Payoneer logo.svg](https://commons.wikimedia.org/wiki/File:Payoneer_logo.svg) (Public domain), cropped from the wordmark<br>`payoneer-wordmark.png`: Wikipedia “Payoneer”, [Payoneer logo.svg](https://commons.wikimedia.org/wiki/File:Payoneer_logo.svg) (Public domain), the article’s logo file |
| wise | `wise.png`: the brand’s favicon via Google’s favicon service (`wise.com`)<br>`wise-wordmark.png`: Wikipedia “Wise (company)”, [Wise logo light-on-dark.png](https://commons.wikimedia.org/wiki/File:Wise_logo_light-on-dark.png) (Public domain), the article’s logo file |
| paypal | `paypal.png`: the brand’s favicon via Google’s favicon service (`paypal.com`)<br>`paypal-wordmark.png`: Wikipedia “PayPal”, [PayPal 2024.svg](https://commons.wikimedia.org/wiki/File:PayPal_2024.svg) (Public domain), the article’s logo file |
