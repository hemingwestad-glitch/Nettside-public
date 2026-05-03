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
├── style.css               Designsystem (4 temaer)
├── common.js               Tema-bytte + SVG verdenskart
├── astro.js                Sol/måne-beregninger
├── orbit.js                Orbital mekanikk
└── tools/
    ├── fishing.html        Fiskeforhold (MET Norway)
    ├── hunting.html        Jaktkalender (klauvdyr)
    ├── orbit.html          Orbit ground track + passes
    ├── satellites.html     Live satellittracker (TLE/SGP4)
    ├── tle.html            TLE-leser/dekoder
    ├── linkbudget.html     Radio link budget
    ├── antenna.html        Antenne-beregner (dipol/yagi/helix)
    ├── wind.html           Avansert ballistikk (G1/G7, miljø)
    ├── converter.html      Konverterer (frekvens, dB, enheter)
    ├── pressure.html       Trykk-omregner (vakuum/atmosfære)
    ├── time.html           Tidskonverterer (UTC/JD/GMST/TLE)
    └── sun.html            Sol & måne-kalender
```

## Temaer

Fire valgbare utseender, byttes via knapper øverst. Lagres i nettleseren.

- **terminal** – mørkt, JetBrains Mono + Fraunces, varm orange
- **lab** – lyst papirnotat, Caveat + Spectral, rødbrunt blekk
- **cyber** – neon-grønt på dyp blå, VT323-font, CRT-aktig
- **brutalist** – hvit + svart + neon-orange, Archivo Black, harde skygger

## Eksterne avhengigheter

- **Google Fonts** – Fraunces, JetBrains Mono, Caveat, Spectral, VT323, Archivo Black, Inter
- **Open-Meteo** (MET Norway proxy) – værdata for fiskeforhold
- **CelesTrak** – TLE-data for satellittracker
- **satellite.js** – SGP4-implementasjon

Kart er bygget som SVG i common.js – ingen eksterne tile-servere lenger.

## Deploy

Cloudflare Workers, auto-deploy fra `main`-branch på GitHub.

```bash
git add -A
git commit -m "..."
git push
```

## Lisens

Personlig nettside – kode er åpen for inspirasjon, men design og innhold er mitt.
