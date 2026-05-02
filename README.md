# hemingwestad.no

Personlig nettside og verktøyhub for Heming Westad.

Live på [hemingwestad.no](https://hemingwestad.no).

## Struktur

Ren statisk HTML/CSS/JS. Ingen build-step, ingen backend.

```
/
├── index.html              Forside
├── tools.html              Verktøy-oversikt
├── projects.html           Prosjekter
├── now.html                Hva som skjer nå
├── about.html              Om meg
├── 404.html                404-side
├── style.css               Felles stil
├── astro.js                Sol/måne-beregninger (delt)
├── orbit.js                Orbital mekanikk (delt)
└── tools/
    ├── fishing.html        Fiskeforhold-prediktor (MET Norway)
    ├── hunting.html        Jaktkalender Notodden
    ├── orbit.html          Orbit ground track
    ├── linkbudget.html     Radio link budget
    ├── wind.html           Vindavdrift
    ├── converter.html      Konverterer (frekvens, dB, enheter)
    ├── satellites.html     Satellittracker (TLE/SGP4)
    └── sun.html            Sol & måne-kalender
```

## Eksterne avhengigheter

- **Google Fonts** — Fraunces, JetBrains Mono
- **Open-Meteo** (proxy til MET Norway) — værdata for fiskeforhold
- **CelesTrak** — TLE-data for satellittracker
- **OpenStreetMap + Leaflet** — kart for orbit og satellittracker
- **satellite.js** — SGP4-implementasjon

Ingen API-nøkler kreves. Alle beregninger som kan gjøres lokalt, gjøres lokalt.

## Deploy

Auto-deploy via Cloudflare Workers på push til `main`-branch på GitHub.

## Lokalt

Bare åpne `index.html` i en nettleser. For best resultat (på grunn av
relative stier), kjør en simpel server:

```bash
python -m http.server 8000
# eller
npx serve
```

## Kreditter

Astronomiske formler basert på Jean Meeus' *Astronomical Algorithms*.
SGP4 implementasjon via [satellite.js](https://github.com/shashwatak/satellite-js).
Orbital mekanikk web-portet fra eget Python-verktøy.

## Lisens

Innholdet er mitt — koden står du fritt til å låne fra hvis du finner noe nyttig.
