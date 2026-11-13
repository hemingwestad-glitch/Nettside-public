# hemingwestad.no

Personlig nettside og verktøyhub for Heming Westad.

Live på [hemingwestad.no](https://hemingwestad.no).

## Struktur

Ren statisk HTML/CSS/JS. Ingen build-step, ingen backend.

```
/
├── index.html              Forside med himmelkart, strømpris og vannstand
├── tools.html              Verktøyoversikt med søk
├── projects.html           Prosjekter
├── about.html              Om meg og kontakt
├── 404.html                Feilside
├── now.html                Flyttet til about.html (kan slettes)
├── style.css               Felles utseende
├── common.js               Felles JS (faner, hjelpefunksjoner)
├── fonts/                  Schibsted Grotesk, lagret lokalt (OFL)
├── bilder/meteor/          Egne mottak fra Meteor M2-3 og M2-4
├── _redirects              Videresendinger
├── .assetsignore           Filer som ikke skal ut på nettsiden
└── tools/
    ├── space.html          Satellitter: sporing, pass, Doppler, link budget (7 faner)
    ├── meteor-guide.html   Guide: værbilder fra Meteor
    ├── antenna-builder.html Antennedesigner
    ├── radio.html          Bandplan, prefikser, Q-koder, morse
    ├── dynamics.html       Dynamikk i 3D (Three.js + RK4)
    ├── aviation.html       METAR, sidevind, density altitude, vekt og balanse
    ├── aurora.html         Nordlysvarsel
    ├── map.html            Friluftskart (Leaflet)
    ├── wind.html           Ballistikk (G1/G7)
    ├── hunting.html        Jaktkalender
    ├── fishing.html        Fiskeforhold (MET)
    ├── sun.html            Sol og måne
    ├── discgolf.html       Frisbeegolf-simulator
    ├── tides.html          Tidevann og Fourier-sandkasse
    ├── power.html          Strømpris NO3
    ├── sand.html           Pikselfysikk
    ├── bridge.html         Brobygger
    ├── converter.html      Enheter, frekvens, dB
    ├── pressure.html       Trykk
    └── time.html           Tid (UTC/JD/GMST)
```

## Utseende

Hvit bakgrunn, svart tekst og én skrift (Schibsted Grotesk). Blått er lenker
og knapper, oransje er levende data og hovedserien i diagrammer. Vanlig
setningsform overalt, ingen versaler eller nummerering til pynt.

Verktøysidene deler klassene i `style.css` (`.panel`, `.stat`, `.tabs`,
`.data-table` osv.). Topp og bunn er kopiert inn i hver HTML-fil, så en
endring i menyen må gjøres i alle.

## Eksterne kilder

Verktøyene regner i nettleseren, men henter data og noen biblioteker utenfra:

- **MET Norway**: vær (fishing, map, aurora) og vannstand (tides, forsiden)
- **hvakosterstrommen.no**: strømpriser
- **CelesTrak**: TLE-data for satellitter
- **NOAA SWPC**: Kp-indeks og solvind (aurora)
- **aviationweather.gov**: METAR
- **OpenStreetMap, Kartverket, Esri**: kartfliser og stedsnavn (map)
- **jsDelivr og unpkg**: satellite.js, Three.js (r0.160) og Leaflet

Skriften ligger lokalt i `fonts/`, så ingenting hentes fra Google Fonts.

## Tester

Integritets- og fysikk-tester (ingen avhengigheter, ren Node):

```sh
node test/check.js
```

Sjekker at hver HTML-fil er hel (slutter med `</html>`, balanserte
`<script>`-tagger, gyldig inline-JS/JSON) — fanger «truncation» før deploy —
og validerer fysikkverktøyene (ballistikk, sol/måne, tid) mot referanseverdier.
Kjører også automatisk på hver push via GitHub Actions.

## Deploy

Cloudflare Workers, auto-deploy fra `main`-branch på GitHub.

```sh
git add -A
git commit -m "..."
git push
```

## Lisens

Personlig nettside – kode er åpen for inspirasjon, men design og innhold er mitt.
