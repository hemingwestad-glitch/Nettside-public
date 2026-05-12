# Review av hemingwestad.no

Gjennomgang per 9. mai 2026, med tanke på at siden skal stå seg som
portfolio-link på LinkedIn og CV. Funn er gruppert etter prioritet og hver
oppføring har `fil:linje` der det gir mening, så det er enkelt å hoppe rett
til endringen.

## Helhetsinntrykk

Stilren, jordnær og personlig — typografivalgene (Fraunces / Inter Tight /
JetBrains Mono), terrakotta-aksenten og det rolige off-white-temaet får siden
til å føles som et godt designet kartblad. Verktøy-grid på forsiden er en
klar styrke. Som portfolio kommuniserer siden tre ting bra: **ingeniør-faglig
dybde** (RK4, SGP4, link budget), **håndverk** (rein HTML/CSS/JS uten
build-step), og **personlighet** (jakt, fiske, småsatellitter).

Tre ting drar ned helhetsinntrykket akkurat nå:

1. **Et par verktøy gir feil tall.** Sun/måne-verktøyet er mest alvorlig — det
   gir helt feil soloppgangstider. Det er en CV-killer hvis en faglig sterk
   leser oppdager det.
2. **Meteor-guiden veier 26 MB i bilder.** Det bryter løftet om at siden
   "skal kunne lastes på dårlig 4G".
3. **Jaktkalenderen er statisk for 2025/26-sesongen** og viser tom liste i
   mai 2026.

Detaljer under.

---

## Kritisk (fiks før du linker fra CV/LinkedIn)

### 1. `tools/sun.html` — soloppgangstider er fundamentalt feil

Algoritmen i `timeForSunAlt()` gir helt galne resultater. Testet for Trondheim
2026-05-09 gir den `01.04.2026 16:49` for soloppgang og `29.06.2026 05:49` for
solnedgang — riktig svar er ca. 04:50 og 22:25 lokal tid.

Bug: `eqOfTime = (sun.ra - lst) * 12 / Math.PI` regner ut **timeforvinkelen**,
ikke equation of time. Iterasjonen divergerer over flere uker fordi
solar-noon-estimatet driver. Testet for jan, mar, mai, jun, sep, des — alle
returner feil dato og tid.

```
sun.html:136-153
```

**Fiks:** Bytt ut implementasjonen mot en kjent korrekt Meeus-rutine, eller
vurder å droppe egen implementering og bruke for eksempel
[suncalc](https://github.com/mourner/suncalc) (10 KB, ingen build-step). Den
matcher allerede stilen til siden — ingen API-kall, alt lokalt. Eller skriv
om eqOfTime med standard NOAA-formelen (`-7.65*sin(2L) + 9.87*sin(2L+...)`
osv.).

I tillegg: HTML har `id="moon-up"` og `id="moon-down"` (linje 78–79) som
aldri blir populert av JS. De vil stå som `—` for alltid.

### 2. `tools/hunting.html` — sesongdata er hard-kodet til 2025/26

I dag (9. mai 2026) er **ingen** sesonger åpne — siste sesong (Bever) gikk
ut 30. april. Verktøyet vil rendere tom seksjon under "Pågående og kommende"
inntil september 2026, og "Alle klauvdyr"-tabellen viser bare gamle datoer
med "Stengt".

```
hunting.html:69-83
```

**Fiks:**
- Kort sikt: Oppdater `SEASONS`-arrayet til 2026/27 (Miljødirektoratet
  publiserer rundt 1. april).
- Lengre sikt: Generer datoene programmatisk. Norske jakttider følger fast
  mønster (f.eks. elg 25. sept – 23. des hvert år), så `season(art, year)` kan
  beregnes. Da slipper du årlig vedlikehold og verktøyet er evig riktig.
- Bytt subtittel fra "2025/2026 sesong" til en `data-today`-attributt som
  viser hvilken sesong som er aktiv ("2026/2027 — under vedlikehold inntil
  september" e.l.).

### 3. Bilder i meteor-guide veier 26 MB totalt

| Fil | Dimensjoner | Størrelse |
|---|---|---|
| `msu_mr_rgb_AVHRR_3a21_False_Color_corrected1.png` | 2800×1368 | **8.5 MB** |
| `msu_mr_rgb_AVHRR_221_False_Color_corrected.png` | 2800×1544 | 5.1 MB |
| `msu_mr_rgb_MSA_corrected_map.png` | 2800×1640 | 3.3 MB |
| `msu_mr_rgb_AVHRR_3a21_False_Color_corrected1 (2).png` | 2800×1144 | 2.8 MB |
| `msu_mr_rgb_AVHRR_221_False_Color_corrected1.png` | 2800×1136 | 2.4 MB |
| `msu_mr_rgb_MSA_corrected_map1.png` | 2800×1200 | 2.5 MB |
| `msu_mr_rgb_AVHRR_3a21_False_Color.png` | 1568×1168 | 2.2 MB |

Karusellen viser dem `object-fit: contain` i 16:9, så maks visningsbredde
typisk ≤ 1400 px. Alle bildene er ~2× større enn nødvendig.

**Fiks:**
- Konverter til **WebP** med kvalitet 80, gjerne også AVIF. Gir typisk
  4–10× mindre filer på dette innholdet (mye kontinuerlig tone). 26 MB →
  ~3 MB er realistisk.
- Resize maks 1600 px bred. Lag en `srcset` med 800w og 1600w varianter for
  mobile.
- Legg til `loading="lazy"` på alle bortsett fra første slide.
- Vurder `<picture>` med fallback til PNG for gamle browsere.

Et lite skript med `sharp` eller `cwebp` (ingen npm-install i prod, kjør
manuelt før commit) gjør jobben:
```sh
for f in bilder/meteor/*.png; do
  cwebp -q 80 -resize 1600 0 "$f" -o "${f%.png}.webp"
done
```

---

## Viktig (kvalitetsforbedringer som høyner profesjonell standard)

### 4. SEO og social-deling mangler på flere sider

- `projects.html`, `now.html`, `404.html` mangler `<meta name="description">`.
- Ingen Open Graph-tags (`og:title`, `og:description`, `og:image`,
  `og:type`) på noen side. Når siden deles på LinkedIn eller i Slack får du
  bare URL-en — ingen bilde, ingen tekst.
- Ingen `<link rel="icon">` / favicon på noen side. Lukket faner i Chrome
  viser default-ikon.
- Ingen `<link rel="canonical">`.
- Ingen `robots.txt` eller `sitemap.xml`.

**Fiks (eksempel for `index.html`):**
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="https://hemingwestad.no/">
<meta property="og:title" content="Heming Westad">
<meta property="og:description" content="Personlig nettside og verktøyhub.">
<meta property="og:image" content="https://hemingwestad.no/og-image.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```
Lag et lite SVG-favicon basert på "H." eller satellitt-glyfen `◐`. Lag en
1200×630 OG-image i samme palett (kan være en kopi av forsiden).

### 5. `tools/fishing.html` har et par logikk- og navne-bugs

- Variabelen `sixAgo` (linje 203–207) er villedende — `find()` matcher
  første element fordi alle timeseries-tider er `≤ Date.now() + 6h`.
  Resultatet er at `sixAgo === series[0]` (nå), ikke for 6 timer siden.
  `sixFromNow = series[6]` brukes faktisk videre. Døp om `sixAgo` → fjern,
  rydd opp.
- "Trykktrend (6t)" stat-blokk: `trend = press6 - press` er
  forecast-trend (hvor trykket er på vei), ikke målt trend bakover. Det er
  mest nyttig for fiske, men labelen er ambiguøs. Bytt til "Trykktrend neste
  6t" og bruk pilkonvensjon: `↑ +2,3 hPa`, `↓ −1,8 hPa`.
- `chart-wind` SVG-en er merket "Vind og temperatur" (overskrift), men
  `renderChart` plotter bare wind_speed.
- `User-Agent`-headeren (linje 105) er en **forbidden header** i nettleseren
  og dropptes silent. MET-API-en aksepterer fortsatt vanlig nettleser-UA,
  så det funker — men koden gir et falskt inntrykk av at den følger MET-TOS.
  Fjern den, eller flytt til en serverless proxy hvis du vil identifisere
  klienten.

### 6. `tools.html` mangler lenke til meteor-guide

`tools.html` er sentrum for "alle verktøy", men mens forsiden inkluderer
guide via en lenke fra `space.html`, har ikke `tools.html` selv guide-kortet
i sin grid. Den ER der faktisk, jeg sjekket. **Vent**, ja den er på linje
48-52. Greit. Da kan denne strykes — men `index.html` har den ikke.
Vurder å legge inn meteor-guide-kortet i `index.html` også, siden det er
en av de mer fortelle-vennlige delene av prosjektet.

### 7. Lenker som åpnes i ny fane mangler `rel="noopener"` enkelte steder

Konsistens-issue:
- Footer-lenker til "kildekode" (i alle filer) er uten `target="_blank"`,
  som er ok men inkonsekvent med hvordan andre eksterne lenker åpnes.
  Velg én konvensjon: enten alle eksterne i samme fane (mer "stillferdig"),
  eller alle i ny fane med `rel="noopener noreferrer"`.
- For *enhver* `target="_blank"`-lenke til ekstern URL bør du ha
  `rel="noopener noreferrer"` for sikkerhet og personvern.

### 8. Last-stop for ytelse: Google Fonts loaded synchronously

Hver side gjør et synchronous render-blocking call til
`fonts.googleapis.com` for tre fonter med variabelaksevariasjoner. Selv om
preconnect ligger der, er det rom for forbedring:

- **Self-host fontene.** Last ned WOFF2 fra
  `google-webfonts-helper` og legg dem i `/fonts/`. Eliminerer en ekstra DNS
  + HTTPS handshake og gir GDPR-ren oppførsel.
- **Subset til Latin + de få spesialtegnene du trenger** (du bruker
  primært norsk).
- Legg til `font-display: swap` i `@font-face` så du slipper FOIT.

---

## Forbedringer (polish)

### 9. Forsiden kan vise litt mer "showcase"

CV-publikum trenger noen sekunder til å forstå *hva* siden er. Vurder:

- Et lite "press" eller "sett her hva jeg har bygget"-snutt med tre tall
  (f.eks. "13 verktøy · 8.6 k linjer kode · 0 build-steg") rett under lede.
  Du har allerede `stat-grid`-stilen.
- En `<a class="btn">Last ned CV (PDF)</a>` rett under intro hvis det
  finnes.
- LinkedIn-lenke i kontaktboksen, ikke bare GitHub + e-post. Det er det
  første en CV-leser leter etter.

### 10. `now.html` er litt utdatert

Sist oppdatert vises som dagens dato (via `data-today`), men teksten
beskriver "skutsesong til høsten" som høres ut som det er skrevet i mai.
Gi sidene en faktisk `data-modified="2026-04-15"` og rendre "Sist endret
xx" basert på det — da kan du la siden ligge urørt et par uker uten at den
lyver.

### 11. Konsoliderte verktøy: 5 redirect-filer

`orbit.html`, `satellites.html`, `tle.html`, `linkbudget.html`,
`antenna.html` er alle 16-linjers `<meta http-equiv="refresh">`-redirects.
Det er fint at de finnes for backwards compat. To små forbedringer:

- Legg til `<link rel="canonical" href="/tools/space.html">` så søkemotorer
  konsoliderer rangeringen.
- Bruk `301`-statuskode via en `_redirects`-fil (Cloudflare Workers støtter
  dette) i stedet for meta-refresh. Bedre for SEO og raskere for brukere.

### 12. `tools/dynamics.html` — manglende reset ved param-endring for noen systemer

I `setupSystem()` står det `if (p.requiresReset) reset();`, men søk
gjennom `SYSTEMS`-objektet viste ingen `requiresReset: true`. Sjekk om
dette ble gjort med vilje eller om noen parametre faktisk burde trigge
reset (f.eks. antall pendler i kjede-pendel). Hvis ikke brukt, fjern feltet
fra dokumentasjonen.

### 13. Font-loading: `display=swap` mangler

URL-en er
`...&family=...&display=swap` — ja, swap er der. ✓ Bekreftet, ikke et
issue.

### 14. Tilgjengelighet (a11y)

Ganske bra alt i alt — du har semantisk HTML, god kontrast, og
alt-tekster på meteor-bildene. Småforbedringer:

- `<button id="btn-trail" class="secondary">Skjul spor</button>` i
  dynamics.html bør ha `aria-pressed` for togglet state.
- `<input type="checkbox" id="en-${comp.id}">` i tides Fourier-paneles —
  labelen er der, men `aria-label` ville hjulpet skjermlesere.
- Karusellen i meteor-guide har `aria-label` på pilene, men ikke på
  `carousel-track`. Vurder `role="region" aria-roledescription="carousel"
  aria-label="Mottatte bilder fra Meteor M2-3"`.

### 15. Mobilnav

På smale skjermer wrapper nav-en under logoen. Det er greit, men på et
visningsmåte under 380 px kan link-listen ende opp tonet ned. Vurder en
hamburger-meny under 480 px, eller minimer fra 5 til 3 lenker (`heim`,
`verktøy`, `om`) — siden CV-publikum primært vil til verktøyene og om-meg.

### 16. Print-stil

Du har et `@media print`-block som skjuler nav, footer og noise-overlay.
Bra. Men `tool-grid` kan brekke stygt på print fordi
`background: var(--rule-soft)` mellom kortene blir ikke print-rendret.
Sett `background: transparent` og legg `border` på `.tool` selv i
print-stylen.

### 17. Personlighet: forsiden er litt selvironisk, om-siden er litt formell

`index.html` har "elgjakt eller fisker fjellørret" (varmt, personlig).
`about.html` glir over i "Programdirektør, Orbit NTNU" og blir CV-aktig.
Den blandingen er greit — men hvis dette skal være en CV-link, bør
about-siden ha *minst* like mye personlighet. Et par anekdoter, et bilde
av deg ute, eller en kort historie om hvorfor du ble interessert i romfart
ville løftet helheten betydelig. Du har stor stilfølelse — bruk den her
også.

### 18. `404.html` kan bli en perle

"Tomrom i banen" er morsom — bygg videre. Et lite SVG-bilde av en
satellitt som forsvinner ut i mørket, eller en simpel ASCII-art-banekurve,
ville matchet stilen perfekt og gjort 404-siden minneverdig.

### 19. `wrangler.jsonc` — observability slått på, men ingen analytics-side

Du har `observability.enabled = true`. Bra. Men det finnes ingen privacy-page
som sier "siden samler ingen brukerdata utover Cloudflares server-side
metrics". Du markedsfører "ingen tracking, ingen innlogging, ingen
ventetid" på `tools.html`. Gjør det eksplisitt:

- Lag en `privacy.html` (kan være kort) som forteller akkurat hva som logges
  og hva som ikke gjør det.
- Lenk til den i footeren.

### 20. Kodekvalitet: en del duplisert head-blokk

Hver HTML-fil gjentar de samme 6 linjene med preconnect, fonts, stylesheet.
Cloudflare Workers støtter HTML-rewriter via `wrangler.jsonc`. Du kan
lage et `head.html`-snippet og inkludere det. Men det kan vente — ingen
bug, bare DRY.

---

## Ting som er *bra* og bør beholdes

- **Designspråket.** Terrakotta + off-white + monospace-tall er en sjelden
  god kombinasjon. Hold deg til det.
- **`tools/wind.html`** er en solid implementasjon — RK4, BC-tabell,
  Coriolis, spin-drift, energikrav for vilt. Det er noe en seriøs skytter
  vil finne nyttig.
- **`tools/space.html`** er imponerende mengde funksjonalitet i én side.
  Frekvens-DB-en pr. sat med utstyrkrav er noe du sjelden ser ferdiglagd.
- **`tools/dynamics.html`** — RK4-implementasjonen er ren og
  visualiseringen jevn. Tre-legeme og dobbel-pendel er gode demo-systemer.
- **`tools/meteor-guide.html`** — narrativen "her er bildene mine, fra best
  til verst, og hva jeg tror skjedde" er sjeldent god teknisk skriving. Det
  er den siden som beviser at du faktisk gjør dette.
- **`tools/tides.html` Fourier-sandkasse.** Pedagogisk perle.
- **Ingen build-steg, ingen npm.** Det er et statement i 2026 og passer
  fortellingen.

---

## Foreslått rekkefølge

Hvis du har 2 timer:

1. Fiks `sun.html` (bruk suncalc eller ny eqOfTime). 30 min.
2. Konverter meteor-bilder til WebP og resize. 30 min.
3. Oppdater `hunting.html` til 2026/27, eller gjør det programmatisk. 30 min.
4. Legg til OG-tags + favicon + `og-image.png`. 30 min.

Hvis du har en helg:

5. Self-host Google Fonts.
6. Skriv `privacy.html` og lenk i footer.
7. Legg LinkedIn-lenke i kontaktblokkene.
8. Polish about-siden med to-tre personlige anekdoter.
9. Gjør `_redirects` for de gamle tool-URL-ene.

Hvis du har en uke:

10. Lag dynamisk `seasons(year)`-funksjon for hunting.
11. Skriv test-suite (Node + assert) for de ikke-trivielle algoritmene
    (sun, wind ballistikk, fishing index, tide harmonics).
12. Sett opp Lighthouse-CI som GitHub Action — det fanger ytelses-regress
    automatisk.
