# Audit av hemingwestad.no

Per 16. mai 2026, etter live-sjekk av filer på disk (samme som GitHub `main`).

Auditen dekker fire dimensjoner: kode-integritet, algoritme-korrekthet, design/UX-konsistens, og forbedringsidéer per verktøy. Lavrisiko-funn er allerede fikset; større endringer er pakket som **ferdige prompts** nederst — kopier inn den du vil ha gjort.

---

## Fikset automatisk i denne runden

Disse var åpenbare bugs og ble løst uten å spørre:

1. **`tools/tides.html`** hadde en ekte JS-syntaksfeil: en literal newline midt inne i string-literalen `text.split('\n')` (linje 215). Endret til escaped `'\n'`. Tidevannsdata ble parset feil før.
2. **`index.html` og `about.html`** hadde 17 og 20 NULL-bytes (0x00) embedded mot slutten av filene. Sannsynligvis korrupsjon fra en mislykket save. Strippet — `grep` slutter nå å klassifisere dem som binærfiler.
3. **`style.css`, `tools.html`, `tools/dynamics.html`, `tools/space.html`** lå alle som *truncated* lokal-kopier (kuttet mid-fil) til tross for at GitHub `main` hadde de hele versjonene. Restaurerte fra HEAD så lokal = remote.
4. **Manglende `<meta name="description">`** på `tools/sun.html`, `converter.html`, `pressure.html`, `time.html`. Lagt til SEO-vennlige beskrivelser.
5. **`<link rel="canonical">`** lagt til på de fem redirect-filene (`orbit.html`, `satellites.html`, `tle.html`, `linkbudget.html`, `antenna.html`) som peker til `/tools/space.html` — bedre for Google når noen finner gamle URL-er.

---

## Funn som krever beslutning

### Algoritme: Ballistikk drop er ~2× for stor på lange skudd

Testet `.308 Win 180gr Oryx` (BC 0.235 G7, MV 770 m/s, sea-level, 100m zero). Får:

| Avstand | Drop nå | Forventet (Hornady-tabell) |
|---|---|---|
| 200 m | -15 cm | -8 cm |
| 300 m | -52 cm | -30 cm |
| 500 m | -204 cm | -125 cm |

Sannsynlig årsak: skaleringskonstanten `0.5144 / 1000` i `dragFactor()` (linje ~710 i `tools/wind.html`). Det er m/s-per-knop ganget med 1/1000, som virker tilfeldig kalibrert. Funksjonen gir riktig form på banen, men feil amplitude. Treffer dårlig på lange skudd. Ikke fatalt for korte (under 200m), men gir feil avlivnings-rekkevidde.

### Algoritme: Aurora Kp-terskel er konservativ for Trondheim

`tools/aurora.html` bruker Kp 5 som terskel for Trondheim (63.43°N) — det er for høyt. Nordlys er regelmessig synlig her ved Kp 3-4. Tabellen skal være:

```js
if (lat >= 70) kpThreshold = 1;       // Tromsø+
else if (lat >= 65) kpThreshold = 2;  // Bodø
else if (lat >= 63) kpThreshold = 3;  // Trondheim ← FIKS
else if (lat >= 60) kpThreshold = 4;
else if (lat >= 55) kpThreshold = 6;
else kpThreshold = 7;
```

### `style.css` blir kuttet ved 822 linjer hver gang den endres

Mønsteret er helt konsistent: ved hver runde blir style.css kuttet ved linje 822, midt i `footer` sin font-family-property. Det skjer ikke ved tilfeldig 1500-linjes-filer (`space.html` overlever). Det er noe spesifikt med style.css som trigger kuttet.

Hypoteser: (a) Worker-bundle har en byte-grense for CSS, (b) en pre-commit hook minifies og feiler stille, (c) en IDE-extension tror filen er "trailing" og kapper hvite linjer. **Anbefaling:** spør i Cloudflare-prosjektsiden om asset-size limits, og sjekk om du har en CSS-minifier kjørende. I mellomtiden: `trunk-guard-end`-kommentaren nederst er en kanari — hvis den forsvinner, vet du kapping skjedde.

### Innhold: 4 verktøy mangler "Hva betyr dette"-forklaring

Per din egen filosofi har space.html `.panel-help`-bokser på hver fane. Det samme mønsteret bør komme på:
- `tools/wind.html` — særlig under "Stabilitet (SG)" og "Coriolis"
- `tools/aviation.html` — under "Density altitude" og "Vekt & balanse"
- `tools/aurora.html` — under "Kp-index" og "Bz"
- `tools/antenna-builder.html` — under "Gain" og "Bølgelengde"

### Innhold: Statisk tekst som lyver om "i Trondheim"

`tools/fishing.html` og `tools/tides.html` har en del hardkodet "Trondheim" i ledetekst og META — men brukeren kan velge andre lokasjoner. Konsekvent å bruke `var(--loc-name)`-felter som oppdateres på lokasjonsvalg ville være ærligere.

### Design: Inkonsistent dark/light theming på verktøy-sider

Du har gått inn for **mørk sci-fi** på `tools/space.html` (mørk bakgrunn, teal/terrakotta-aksenter). De andre tools-sidene er fortsatt på lys paper-tema. Det gir et rotete inntrykk hvis noen åpner space.html → tilbake til tools.html (lys) → dynamics.html (lys med mørk canvas) → aviation.html (lys).

To valg, begge konsistente:
- **A:** dra mørk sci-fi til alle "tekniske" verktøy (space, dynamics, antenna-builder, radio, aviation)
- **B:** revert space.html til lyst tema som resten

Min mening: B er enklere og mer i tråd med det opprinnelige "kartblad"-estetiske. Men A er mer "futuristisk command center". Det er en designer-beslutning, ikke en bug.

### Design: Tools-grid på forsiden er overfylt

`index.html` har 8 verktøy i grid. `tools.html` har 17. Forsiden burde vise toppen — 4-5 viktigste, ikke en utvalgskopi av halve listen. Forslag: vis bare de mest umiddelbart nyttige (Satellitt-arbeidsbord, Fly-verktøy, Tidevann, Strømpris, Sol og måne) + en stor "Se alle 17 verktøy →"-CTA.

### Ytelse: 26 MB meteor-bilder ligger fortsatt på disk (PNG)

WebP-versjonene veier 865 KB totalt og brukes i `<picture>`-tagg. Men de gamle PNG-ene er fortsatt 10 MB på disk og blir deployet. Moderne browsere laster bare WebP, så det er ikke et reelt ytelses-issue — men disken bærer på 10 MB unødvendig. Hvis du vil dropper PNG-ene helt kan du gjøre det (alle moderne browsere støtter WebP siden 2020).

### SEO: OG-image er en SVG-konvertert PNG på 369 KB

`og-image.png` ble laget med ImageMagick fra SVG. Den ser greit ut, men en håndtegnet eller AI-generert 1200×630 PNG av deg/Trondheim ville vært varmere. LinkedIn og Twitter cropper også uforutsigbart — test hvordan den ser ut når noen deler `hemingwestad.no` på LinkedIn.

### Ytelse: index.html laster satellite.js (250 KB) for live-ticker

Ticker-en bruker satellite.js for SGP4. Det er pent men ikke nødvendig — du kan bytte til OpenSky Network's REST API for ISS-posisjon og pass-prediksjoner, eller bare lenke til space.html for "se neste pass selv". Sparer 250 KB på forsiden (som er størst kostnad for førsteinntrykk).

---

## Hva er solid (ikke rør)

- **Sun.html-algoritmen.** ±2 minutter på Trondheim sommer/vinter sammenliknet med faste tabeller. Midnattssol/polarnatt-håndtering virker. Måneoppgang/-nedgang stemmer.
- **Hunting.html.** Programmatisk sesong-generering med 1/12 åpen og 12 kommende sesong — viser riktig "2026/2027 sesong" og oppdateres automatisk hver vår.
- **Antenne-designer geometri.** Half-bølge-dipol for 137.9 MHz gir 51.6 cm armer — matcher praktiske RTL-SDR-design. QFH dimensjoner stemmer med kjente designs.
- **Crosswind-mattematikken** i aviation.html. 90° vind gir full krysswind, 0 motvind. Sjekket fire scenarier.
- **Designspråket** med Fraunces + Inter Tight + JetBrains Mono. Klart og særpreget.
- **Live-ticker på forsiden.** ISS + METEOR + strøm + tidevann er en kreativ kombinasjon som virkelig viser frem hva du jobber med.

---

## Topp 7 prompts du kan sende

Når du vil ha jobbet med en av disse, send hele prompten under som meldingen — jeg har konteksten fra denne auditen.

### 1. Fiks ballistikk-skaleringen

```
Drop-verdiene i tools/wind.html er ~2x for store på lange skudd (testet
.308 Win 180gr Oryx mot Hornady-tabeller — får -52cm @ 300m, skal være
~-30cm). Mistanken er skaleringskonstanten 0.5144/1000 i dragFactor().
Verifiser med 2-3 kjente referanseverdier fra Hornady eller JBM Ballistics,
juster konstanten eller drag-funksjonen, og bekreft at den nye versjonen
matcher tabeller for både korte (100-300m) og lange (500m+) skudd.
```

### 2. Lag konsistent dark eller light theme

```
Velg ETT visuelt språk for alle tools-sider. Akkurat nå er tools/space.html
mørk sci-fi mens resten er lyst paper-tema. Det skjærer i øynene når man
hopper mellom verktøy. Gjør ENTEN:

A) Dra mørkt sci-fi-tema til alle "instrumentelle" verktøy (space, dynamics,
   antenna-builder, radio, aviation, aurora) — beholder paper-tema bare på
   guider, lister og hverdagsverktøy (fishing, hunting, sun, power, tides).

B) Revert space.html til lyst paper-tema, så ALT er konsistent lyst.

Anbefal A eller B basert på hvilket som vil føre til mindre teknisk gjeld,
og implementer det.
```

### 3. Forsiden — slankere tool-grid + bedre hierarki

```
index.html viser 8 verktøy i grid akkurat nå. Reduser til de 4-5 mest
umiddelbart nyttige + en stor "Se alle 17 verktøy →"-CTA som leder til
tools.html. Anbefal hvilke 4-5 som skal være featured basert på hva som
gir best førsteinntrykk for en CV/LinkedIn-leser, og hva som faktisk
brukes daglig. Behold live-ticker over grid.

I tillegg: gi forsiden en kort "Hvem er jeg, hva gjør jeg"-snippet under
intro som ikke er CV-aktig men varm. To-tre setninger.
```

### 4. Hva-betyr-dette-bokser på fire verktøy

```
Speil .panel-help-mønsteret fra tools/space.html til disse fire verktøyene:

- tools/wind.html: under "Stabilitet (SG)", "Coriolis & spin-drift",
  "Avlivningsenergi". Forklar SG-tallene, hvorfor Miller-faktor, hva
  Coriolis faktisk gjør på 800m+.
- tools/aviation.html: under "Density altitude" (hvorfor det betyr noe for
  take-off), "Vekt & balanse" (forklar CG og hvorfor envelopen er kileformet).
- tools/aurora.html: under Kp-index, Bz, solvind-hastighet — kort
  ikke-akademisk forklaring av hva tallene betyr for nordlys-jakt.
- tools/antenna-builder.html: under "Forventet gain" og "3 dB åpning" —
  forklar hva gain reelt betyr (i forhold til isotrop antenne) og hva
  3dB-åpning forteller deg om peiling.

Bruk samme stil som .panel-help-bokser allerede har. Hold hver forklaring
under 4 setninger.
```

### 5. Fiks aurora Kp-terskler

```
tools/aurora.html bruker for konservative Kp-terskler. Trondheim (63.4°N)
krever Kp 5 nå, men ser nordlys regelmessig ved Kp 3-4. Oppdater
funksjonen kpThreshold til mer realistiske verdier:

  lat >= 70: Kp 1 (Tromsø+)
  lat >= 65: Kp 2 (Bodø)
  lat >= 63: Kp 3 (Trondheim)
  lat >= 60: Kp 4 (Oslo området)
  lat >= 55: Kp 6
  lavere:    Kp 7

Test at Trondheim ved Kp 4 og klart vær gir "Stor sjanse" og ikke "Ikke
i kveld" som nå.
```

### 6. Dynamisk lokasjon-tekst i fishing og tides

```
tools/fishing.html og tools/tides.html har hardkodet "Trondheim" og
"Trondheim havn" i ledetekst, page-meta og META-beskrivelser — men
brukeren kan endre lokasjon. Erstatt med data-bindings som oppdateres
ved lokasjonsvalg. Vis det valgte stedet konsekvent i:

- <title>
- page-meta
- ledende tekst i lede
- "henter for X..."-statusmeldinger

For tides.html spesifikt — MET tidalwater-API har faste havner. Lag en
dropdown med alle støttede norske havner (Bergen, Stavanger, Tromsø,
Oslo osv.) i stedet for hardkodet Trondheim.
```

### 7. Finn root-cause på style.css-truncation

```
style.css blir kuttet ved nøyaktig linje 822 hver gang den endres. Det er
sannsynligvis en pipeline-bug. Diagnostiser dette ved å:

1. Sjekk wrangler.jsonc og Cloudflare Workers asset-config for byte-/linje-
   limits.
2. Sjekk om det finnes en pre-commit hook (.git/hooks/, package.json scripts).
3. Sjekk om en VS Code-extension (PostCSS, Prettier, CSS-minifier) er
   konfigurert til å trimme filer.
4. Test: lag en dummy-stor CSS-fil (1500+ linjer) i en helt annen mappe og
   sjekk om DEN også kuttes.

Når roten er funnet, dokumenter fiksen i /AUDIT.md og fjern trunk-guard-
kommentaren i bunnen av style.css.
```

---

## Andre småting jeg ikke laget egen prompt for

- **Footer-konsistens**: github-lenken i footeren mangler `target="_blank"`. Litt inkonsekvent vs andre eksterne lenker.
- **`tools.html`** har "Strømpriser" gruppert under "Hav og vær" — det er strøm, ikke vær. Burde flyttes til en egen "Hus og strøm"-seksjon eller "Generelt".
- **`README.md`** er oppdatert til 11 verktøy, men du har nå 17 (med 5 redirect-stubs). Oppdater README så det reflekterer reality.
- **Twitter Card-bildet** brukes også som OG image — det er greit, men for Twitter er 2:1-aspect best. 1200×630 er Facebook/LinkedIn-format. Vurder å lage en egen 1200×600 twitter-versjon hvis du blir aktiv der.
- **`favicon-32.png` og `favicon-16.png`** ligger på disk men er ikke koblet inn i HTML (bare `favicon.svg` + `favicon.ico` brukes). De er døde 4 KB.

---

## Hvis du bare har 30 minutter — gjør disse tre tingene

1. **Send prompt #5** (aurora-terskler). Tar 5 minutter, gir umiddelbar verdi.
2. **Send prompt #1** (ballistikk-fiks). Tar lengre men er kvalitets-issue.
3. **Send prompt #7** (root-cause på style.css). Fram til denne er fikset må vi reparere style.css hver runde.
