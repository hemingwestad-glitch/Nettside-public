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
├── style.css               Designsystem (ett tema)
├── common.js               Felles JS (faner, hjelpefunksjoner)
└── tools/
    ├── space.html          Konsolidert satellitt-arbeidsbord (7 faner)
    ├── dynamics.html       3D dynamikk-sandkasse (Three.js + RK4)
    ├── tides.html          Tidevann i Trondheim + Fourier-sandkasse
    ├── power.html          NO3 strømpriser
    ├── fishing.html        Fiskeforhold (MET Norway)
    ├── hunting.html        Jaktkalender (klauvdyr)
    ├── wind.html           Ballistikk (G1/G7 drag)
    ├── sun.html            Sol- og månekalender
    ├── converter.html      Enheter, frekvens, dB
    ├── pressure.html       Trykk-omregner (vakuum)
    ├── time.html           Tidskonverterer (UTC/JD/GMST)
    ├── orbit.html          → space.html (redirect)
    ├── satellites.html     → space.html (redirect)
    ├── tle.html            → space.html (redirect)
    ├── linkbudget.html     → space.html (redirect)
    └── antenna.html        → space.html (redirect)
```

## Designvalg

Ett tidløst tema, inspirert av tekniske manualer og kartblader.
Varm off-white bakgrunn, terrakotta-aksenter, JetBrains Mono for tall
og Fraunces som display-font.

## Eksterne avhengigheter

Alle hentes fra CDN, ingen build-step.

- **Google Fonts** – Fraunces, Inter Tight, JetBrains Mono
- **MET Norway** – Vær for fishing.html, tidevann for tides.html
- **hvakosterstrommen.no** – Strømpriser
- **CelesTrak** – TLE-data for satellitter
- **satellite.js** – SGP4-implementasjon
- **Three.js** (r0.160) – 3D-rendering for dynamics og space

## Deploy

Cloudflare Workers, auto-deploy fra `main`-branch på GitHub.

```sh
git add -A
git commit -m "..."
git push
```

## Lisens

Personlig nettside – kode er åpen for inspirasjon, men design og innhold er mitt.
