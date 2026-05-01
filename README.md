# hemingwestad.no

Personlig nettside. Hånd-skrevet HTML og CSS, ingen JavaScript-rammeverk,
ingen sporing.

## Stack

- **Hosting:** Cloudflare Workers (statisk).
- **Domene:** Domeneshop.
- **CI/CD:** Auto-deploy fra `main`-branch via GitHub-integrasjon.
- **Fonter:** [Fraunces](https://fonts.google.com/specimen/Fraunces) + [JetBrains Mono](https://www.jetbrains.com/lp/mono/).

## Struktur

```
.
├── index.html              Forside
├── projects.html           Oversikt over prosjekter
├── now.html                Hva jeg jobber med akkurat nå
├── uses.html               Utstyr og verktøy
├── about.html              Om meg + om siden
├── style.css               Felles stilark for hele siden
├── projects/
│   ├── adsb.html
│   ├── satellites.html
│   ├── cubesat-tools.html
│   └── fishlog.html
└── README.md
```

## Lokal utvikling

Ingen build-steg. Dobbeltklikk `index.html` for å åpne den i nettleseren,
eller kjør en lokal server:

```bash
python -m http.server 8000
```

Og gå til `http://localhost:8000`.

## Deploy

Push til `main`-branch. Cloudflare deployer automatisk innen et minutt.

```bash
git add .
git commit -m "beskrivelse av endring"
git push
```

## Lisens

Innhold (tekst, bilder): © Heming Westad.
Kode (HTML/CSS-strukturen): fri til å bruke som inspirasjon.
