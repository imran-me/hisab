# assets/merchants — merchant and biller logos

Square marks for `shared/js/components/merchant-logo.js`, which shows a
ledger entry paid to Foodpanda, DESCO or Netflix with that brand's own
mark instead of the category glyph. The list and the spellings that match
are in `shared/js/data/merchants.js`; an entry with `logo: null` is drawn
as a monogram in its brand colour.

Wide `<id>-wordmark.png` files are kept for places with room (none use
them yet).

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

Drawn as a monogram: Agora (only a wide mark with a mascot), DESCO, DPDC
and Dhaka WASA (their sites serve the government emblem).

| id | Files and where they came from |
|---|---|
| daraz | `daraz.png`: the brand’s favicon via Google’s favicon service (`daraz.com.bd`) |
| foodpanda | `foodpanda.png`: Wikipedia “Foodpanda”, [Foodpanda logo.svg](https://en.wikipedia.org/wiki/File:Foodpanda_logo.svg) (Fair use), cropped from the wordmark<br>`foodpanda-wordmark.png`: Wikipedia “Foodpanda”, [Foodpanda logo.svg](https://en.wikipedia.org/wiki/File:Foodpanda_logo.svg) (Fair use), the article’s logo file |
| pathao | `pathao.png`: the brand’s own site icon (`https://pathao.com/bn/wp-content/uploads/sites/6/2023/10/cropped-180x180-1-192x192.png`)<br>`pathao-wordmark.png`: Wikipedia “Pathao”, [Pathao - Here with You.png](https://commons.wikimedia.org/wiki/File:Pathao_-_Here_with_You.png) (CC BY 4.0), the article’s logo file |
| uber | `uber.png`: the brand’s favicon via Google’s favicon service (`uber.com`)<br>`uber-wordmark.png`: Wikipedia “Uber”, [Uber logo 2018.svg](https://commons.wikimedia.org/wiki/File:Uber_logo_2018.svg) (Public domain), the article’s logo file |
| shohoz | `shohoz.png`: the brand’s own site icon (`https://www.shohoz.com/assets/icons/icon-512x512.png`) |
| chaldal | `chaldal.png`: the brand’s favicon via Google’s favicon service (`chaldal.com`)<br>`chaldal-wordmark.png`: Wikipedia “Chaldal”, [Chaldal.com logo.png](https://en.wikipedia.org/wiki/File:Chaldal.com_logo.png) (Fair use), the article’s logo file |
| gp | `gp.png`: Wikipedia “Grameenphone”, [Grameenphone_Logo_GP_Logo.svg](https://commons.wikimedia.org/wiki/File:Grameenphone_Logo_GP_Logo.svg) (Public domain), the article’s logo file |
| robi | `robi.png`: the brand’s own site icon (`https://www.robi.com.bd/favicon/apple-icon.png`) |
| banglalink | `banglalink.png`: Wikipedia “Banglalink”, [Banglalink Logo 2025.svg](https://commons.wikimedia.org/wiki/File:Banglalink_Logo_2025.svg) (Public domain), cropped from the wordmark<br>`banglalink-wordmark.png`: Wikipedia “Banglalink”, [Banglalink Logo 2025.svg](https://commons.wikimedia.org/wiki/File:Banglalink_Logo_2025.svg) (Public domain), the article’s logo file |
| teletalk | `teletalk.png`: Wikipedia “Teletalk”, [Teletalk Bangladesh Limited.svg](https://en.wikipedia.org/wiki/File:Teletalk_Bangladesh_Limited.svg) (Fair use), cropped from the wordmark<br>`teletalk-wordmark.png`: Wikipedia “Teletalk”, [Teletalk Bangladesh Limited.svg](https://en.wikipedia.org/wiki/File:Teletalk_Bangladesh_Limited.svg) (Fair use), the article’s logo file |
| titas | `titas.png`: Wikipedia “Titas Gas”, [Titas Gas logo.png](https://en.wikipedia.org/wiki/File:Titas_Gas_logo.png) (Fair use), the article’s logo file |
| netflix | `netflix.png`: Wikipedia “Netflix”, [Netflix 2015 logo.svg](https://commons.wikimedia.org/wiki/File:Netflix_2015_logo.svg) (Public domain), cropped from the wordmark<br>`netflix-wordmark.png`: Wikipedia “Netflix”, [Netflix 2015 logo.svg](https://commons.wikimedia.org/wiki/File:Netflix_2015_logo.svg) (Public domain), the article’s logo file |
| spotify | `spotify.png`: Wikipedia “Spotify”, [2024 Spotify Logo.svg](https://commons.wikimedia.org/wiki/File:2024_Spotify_Logo.svg) (Public domain), cropped from the wordmark<br>`spotify-wordmark.png`: Wikipedia “Spotify”, [2024 Spotify Logo.svg](https://commons.wikimedia.org/wiki/File:2024_Spotify_Logo.svg) (Public domain), the article’s logo file |
| google | `google.png`: the brand’s favicon via Google’s favicon service (`google.com`)<br>`google-wordmark.png`: Wikipedia “Google”, [Google 2026 logo.svg](https://commons.wikimedia.org/wiki/File:Google_2026_logo.svg) (Public domain), the article’s logo file |
| apple | `apple.png`: Wikipedia “Apple Inc.”, [Apple logo black.svg](https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg) (Public domain), the article’s logo file |
| amazon | `amazon.png`: the brand’s favicon via Google’s favicon service (`amazon.com`)<br>`amazon-wordmark.png`: Wikipedia “Amazon (company)”, [Amazon 2024.svg](https://commons.wikimedia.org/wiki/File:Amazon_2024.svg) (Public domain), the article’s logo file |
| facebook | `facebook.png`: Wikipedia “Facebook”, [2023 Facebook icon.svg](https://commons.wikimedia.org/wiki/File:2023_Facebook_icon.svg) (Public domain), the article’s logo file |
| meta | `meta.png`: Wikipedia “Meta Platforms”, [Meta Platforms Inc. logo.svg](https://commons.wikimedia.org/wiki/File:Meta_Platforms_Inc._logo.svg) (Public domain), cropped from the wordmark<br>`meta-wordmark.png`: Wikipedia “Meta Platforms”, [Meta Platforms Inc. logo.svg](https://commons.wikimedia.org/wiki/File:Meta_Platforms_Inc._logo.svg) (Public domain), the article’s logo file |
| youtube | `youtube.png`: Wikipedia “YouTube”, [YouTube Logo 2017.svg](https://commons.wikimedia.org/wiki/File:YouTube_Logo_2017.svg) (Public domain), cropped from the wordmark<br>`youtube-wordmark.png`: Wikipedia “YouTube”, [YouTube Logo 2017.svg](https://commons.wikimedia.org/wiki/File:YouTube_Logo_2017.svg) (Public domain), the article’s logo file |
| airtel | `airtel.png`: Wikipedia “Cirkle (telecommunications)”, [Bharti Airtel Logo.svg](https://commons.wikimedia.org/wiki/File:Bharti_Airtel_Logo.svg) (Public domain), the article’s logo file |
| btcl | `btcl.png`: Wikipedia “Bangladesh Telecommunications Company Limited”, [Bangladesh Telecommunications Company Limited Emblem.svg](https://commons.wikimedia.org/wiki/File:Bangladesh_Telecommunications_Company_Limited_Emblem.svg) (Public domain), cropped from the wordmark<br>`btcl-wordmark.png`: Wikipedia “Bangladesh Telecommunications Company Limited”, [Bangladesh Telecommunications Company Limited Emblem.svg](https://commons.wikimedia.org/wiki/File:Bangladesh_Telecommunications_Company_Limited_Emblem.svg) (Public domain), the article’s logo file |
| link3 | `link3.png`: Wikipedia “Link3”, [Link3_Technologies_Ltd_Logo.svg](https://en.wikipedia.org/wiki/File:Link3_Technologies_Ltd_Logo.svg) (Fair use), the article’s logo file |
| amberit | `amberit.png`: the brand’s favicon via Google’s favicon service (`amberit.com.bd`) |
| carnival | `carnival.png`: the brand’s own site icon (`https://carnival.com.bd/vendor/cms-template/carnival_internet/images/favicon.ico`) |
| aarong | `aarong.png`: Wikipedia “Aarong”, [Aarong.png](https://commons.wikimedia.org/wiki/File:Aarong.png) (CC0), the article’s logo file |
| shwapno | `shwapno.png`: the brand’s favicon via Google’s favicon service (`shwapno.com`) |
| agora | `agora-wordmark.png`: Wikipedia “Agora Super Stores”, [Agora Super Stores Logo.png](https://en.wikipedia.org/wiki/File:Agora_Super_Stores_Logo.png) (Fair use), the article’s logo file |
| meenabazar | `meenabazar.png`: the brand’s favicon via Google’s favicon service (`meenabazaronline.com`) |
| unimart | `unimart.png`: Wikipedia “Unimart (Bangladesh)”, [Unimart logo.png](https://en.wikipedia.org/wiki/File:Unimart_logo.png) (PD), cropped from the wordmark<br>`unimart-wordmark.png`: Wikipedia “Unimart (Bangladesh)”, [Unimart logo.png](https://en.wikipedia.org/wiki/File:Unimart_logo.png) (PD), the article’s logo file |
| kfc | `kfc.png`: the brand’s favicon via Google’s favicon service (`kfc.com`) |
| pizzahut | `pizzahut.png`: Wikipedia “Pizza Hut”, [Pizza Hut 2025.svg](https://commons.wikimedia.org/wiki/File:Pizza_Hut_2025.svg) (Public domain), the article’s logo file |
| starbucks | `starbucks.png`: Wikipedia “Starbucks”, [Starbucks Corporation Logo 2011.svg](https://en.wikipedia.org/wiki/File:Starbucks_Corporation_Logo_2011.svg) (Fair use), the article’s logo file |
| bata | `bata.png`: the brand’s favicon via Google’s favicon service (`bata.com`) |
| apex | `apex.png`: the brand’s favicon via Google’s favicon service (`apexfootwearltd.com`) |
| biman | `biman.png`: Wikipedia “Biman Bangladesh Airlines”, [Biman Airlines classic logo.svg](https://en.wikipedia.org/wiki/File:Biman_Airlines_classic_logo.svg) (PD), cropped from the wordmark<br>`biman-wordmark.png`: Wikipedia “Biman Bangladesh Airlines”, [Biman Airlines classic logo.svg](https://en.wikipedia.org/wiki/File:Biman_Airlines_classic_logo.svg) (PD), the article’s logo file |
| usbangla | `usbangla.png`: Wikipedia “US-Bangla Airlines”, [Logo of US-Bangla Airlines.svg](https://en.wikipedia.org/wiki/File:Logo_of_US-Bangla_Airlines.svg) (Fair use), cropped from the wordmark<br>`usbangla-wordmark.png`: Wikipedia “US-Bangla Airlines”, [Logo of US-Bangla Airlines.svg](https://en.wikipedia.org/wiki/File:Logo_of_US-Bangla_Airlines.svg) (Fair use), the article’s logo file |
| novoair | `novoair.png`: Wikipedia “Novoair”, [Novoair logo.svg](https://en.wikipedia.org/wiki/File:Novoair_logo.svg) (Fair use), cropped from the wordmark<br>`novoair-wordmark.png`: Wikipedia “Novoair”, [Novoair logo.svg](https://en.wikipedia.org/wiki/File:Novoair_logo.svg) (Fair use), the article’s logo file |
| emirates | `emirates.png`: the brand’s favicon via Google’s favicon service (`emirates.com`) |
| qatar | `qatar.png`: Wikipedia “Qatar Airways”, [Qatar Airways Logo.svg](https://en.wikipedia.org/wiki/File:Qatar_Airways_Logo.svg) (Fair use), cropped from the wordmark<br>`qatar-wordmark.png`: Wikipedia “Qatar Airways”, [Qatar Airways Logo.svg](https://en.wikipedia.org/wiki/File:Qatar_Airways_Logo.svg) (Fair use), the article’s logo file |
| desco | `desco-wordmark.png`: Wikipedia “Dhaka Electric Supply Company Limited”, [Logo of DESCO.svg](https://commons.wikimedia.org/wiki/File:Logo_of_DESCO.svg) (Public domain), the article’s logo file |
