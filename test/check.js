#!/usr/bin/env node
'use strict';
/* ──────────────────────────────────────────────────────────────────────────
   hemingwestad.no — integritets- og fysikk-tester

   Kjør:  node test/check.js
   Exit 0 = alt grønt, exit 1 = minst én feil (CI-vennlig).

   To deler:
   1) INTEGRITET (alle HTML-filer): ikke-tom, ingen NUL-bytes, slutter med
      </html>, balanserte <script>-tagger, hver inline-JS kompilerer, og hver
      JSON-LD-blokk er gyldig JSON. Dette fanger «truncation»-bugen som har
      kuttet store filer midt i koden før de havner på deploy.
   2) FYSIKK (utvalgte verktøy): henter ut de rene funksjonene fra verktøyenes
      kildekode og sjekker dem mot kjente referanseverdier. Fanger
      kalibreringsfeil (som den i ballistikken) før de når brukeren.

   Utvid: legg til flere case nederst. Funksjoner hentes rett fra .html så
   testene følger den faktiske koden — ingen duplisert logikk å vedlikeholde.
   ────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log('  ✓ ' + name); }
function no(name, msg) { fail++; failures.push(name + (msg ? ' — ' + msg : '')); console.log('  ✗ ' + name + (msg ? ' — ' + msg : '')); }
function check(name, cond, msg) { cond ? ok(name) : no(name, msg || 'feilet'); }
function r2(x) { return Math.round(x * 100) / 100; }
function within(name, got, lo, hi) {
  check(`${name} (=${r2(got)}, forventet ${lo}…${hi})`, got >= lo && got <= hi, `utenfor [${lo}, ${hi}]`);
}
function near(name, got, want, tol) {
  check(`${name} (=${r2(got)}, forventet ${want}±${tol})`, Math.abs(got - want) <= tol, `avvik ${r2(Math.abs(got - want))}`);
}

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── HTML-fillister ─────────────────────────────────────────────────────── */
function htmlFiles() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) if (f.endsWith('.html')) out.push(f);
  const td = path.join(ROOT, 'tools');
  if (fs.existsSync(td)) for (const f of fs.readdirSync(td)) if (f.endsWith('.html')) out.push('tools/' + f);
  return out.sort();
}

/* ── Script-uthenting ───────────────────────────────────────────────────── */
function extractScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ attrs: m[1] || '', body: m[2] || '' });
  return out;
}
const isExternal = a => /\bsrc\s*=/i.test(a);
const typeOf = a => { const m = a.match(/type\s*=\s*["']([^"']+)["']/i); return m ? m[1].toLowerCase() : ''; };
const JSON_TYPES = ['application/json', 'application/ld+json', 'importmap', 'speculationrules'];

/* Hent ut en funksjonsdefinisjon ved navn (naiv brace-matching — ok for våre mål) */
function braceEnd(src, fromIdx) {
  let depth = 0, started = false;
  for (let k = src.indexOf('{', fromIdx); k < src.length; k++) {
    const c = src[k];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return k + 1; }
  }
  throw new Error('ubalanserte klammer fra ' + fromIdx);
}
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('fant ikke function ' + name);
  return src.slice(i, braceEnd(src, i));
}
function sliceFromTo(src, startStr, fnNameForEnd) {
  const a = src.indexOf(startStr);
  if (a < 0) throw new Error('fant ikke ' + startStr);
  const fi = src.indexOf('function ' + fnNameForEnd + '(', a);
  if (fi < 0) throw new Error('fant ikke function ' + fnNameForEnd);
  return src.slice(a, braceEnd(src, fi));
}
function runCtx(code, extra) {
  const ctx = Object.assign({ Math, Date, console }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

/* ════════════════════════════════════════════════════════════════════════
   1) INTEGRITET
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n── INTEGRITET (alle HTML-filer) ──');
for (const f of htmlFiles()) {
  const html = read(f);
  const tag = f.padEnd(26);
  check(tag + 'ikke-tom', html.length > 200, 'kun ' + html.length + ' tegn');
  check(tag + 'ingen NUL-bytes', !html.includes('\u0000'), 'inneholder 0x00');
  check(tag + 'slutter med </html>', html.trimEnd().endsWith('</html>'), 'avkuttet?');
  const open = (html.match(/<script\b/gi) || []).length;
  const close = (html.match(/<\/script>/gi) || []).length;
  check(tag + 'balanserte script-tagger', open === close, `${open} <script> vs ${close} </script>`);
  let scriptIdx = 0, scriptErr = null;
  for (const s of extractScripts(html)) {
    scriptIdx++;
    if (isExternal(s.attrs)) continue;
    const t = typeOf(s.attrs);
    try {
      if (JSON_TYPES.includes(t)) JSON.parse(s.body);              // importmap, ld+json, json
      else if (t === 'module') {                                   // ESM: vm.Script kan ikke import/export/top-await
        try { new vm.Script(s.body); }
        catch (e) { if (/Unexpected end of input/.test(e.message)) throw e; } // men fanger fortsatt avkutting
      } else new vm.Script(s.body, { filename: f + '#script' + scriptIdx });
    } catch (e) { scriptErr = scriptErr || ('script#' + scriptIdx + ' (' + (t || 'js') + '): ' + e.message); }
  }
  check(tag + 'inline-JS/JSON kompilerer', !scriptErr, scriptErr);
}

/* ════════════════════════════════════════════════════════════════════════
   2) FYSIKK
   ════════════════════════════════════════════════════════════════════════ */

/* ── Ballistikk (tools/wind.html) ──────────────────────────────────────── */
console.log('\n── FYSIKK: ballistikk (wind.html) ──');
try {
  const wind = read('tools/wind.html');
  // Regresjonsvakt på kalibreringen
  check('  wind: bruker fysisk konstant 6.853e-4', wind.includes('6.853e-4'), 'mangler');
  check('  wind: gammel feilkonstant 1.03e-4 borte', !wind.includes('1.03e-4'), 'fudge-konstant tilbake!');

  const code = sliceFromTo(wind, 'const G7_TABLE', 'simulate');
  const ctx = runCtx(code);
  const sim = ctx.simulate;
  const base = {
    sightHeight: 5, zero: 100, maxRange: 520, windSpeed: 0, windDir: 0,
    tempC: 15, pressureHPa: 1013.25, humidityPct: 0, altM: 0,
    inclineDeg: 0, azimuthDeg: 0, latDeg: 60, useCoriolis: false, useSpin: false,
    twistInch: 11, twistDir: 'right', diameterMM: 7.82, bulletLengthMM: 32
  };
  const at = (tr, R) => tr.reduce((b, p) => Math.abs(p.x - R) < Math.abs(b.x - R) ? p : b);
  const run = o => sim(Object.assign({}, base, o)).trajectory;

  const t308 = run({ bc: 0.232, muzzle: 805, drag: 'G7', weight: 180 });
  const v500_308 = at(t308, 500).v;
  within('  .308 180gr v@500m (m/s)', v500_308, 480, 545);          // fysisk ~505–520
  const d300 = at(t308, 300).y * 100, d500 = at(t308, 500).y * 100;
  within('  .308 180gr fall@300m (cm)', d300, -60, -38);
  check('  .308 180gr fall øker monotont med avstand', d500 < d300 && d300 < 0, `300:${r2(d300)} 500:${r2(d500)}`);

  const t65 = run({ bc: 0.326, muzzle: 820, drag: 'G7', weight: 140, diameterMM: 6.71, bulletLengthMM: 33 });
  const v500_65 = at(t65, 500).v;
  within('  6.5CM 140gr v@500m (m/s)', v500_65, 560, 630);
  check('  høyere BC beholder mer fart (6.5CM > .308)', v500_65 > v500_308, `${r2(v500_65)} vs ${r2(v500_308)}`);

  const t3030 = run({ bc: 0.186, muzzle: 720, drag: 'G1', weight: 150 });
  check('  G1-bane kjører (.30-30 gir tall)', isFinite(at(t3030, 300).v) && at(t3030, 300).v > 0, 'G1 feilet');
} catch (e) { no('  ballistikk-oppsett', e.message); }

/* ── Sol & måne (tools/sun.html, Meeus) ────────────────────────────────── */
console.log('\n── FYSIKK: sol & måne (sun.html) ──');
try {
  const sun = read('tools/sun.html');
  const code = sliceFromTo(sun, 'const RAD = Math.PI', 'moonIllumination');
  const c = runCtx(code);
  const T = d => c.jc(c.jd(d));
  const TRD = { lat: 63.43, lon: 10.39 };

  near('  soldeklinasjon sommersolverv (°)', c.sunDeclination(T(new Date('2025-06-21T12:00:00Z'))), 23.43, 0.4);
  near('  soldeklinasjon vintersolverv (°)', c.sunDeclination(T(new Date('2025-12-21T12:00:00Z'))), -23.43, 0.4);
  near('  tidsligning ~3. nov (min)', c.equationOfTime(T(new Date('2025-11-03T12:00:00Z'))), 16.4, 2.5);
  near('  tidsligning ~11. feb (min)', c.equationOfTime(T(new Date('2025-02-11T12:00:00Z'))), -14.2, 2.5);

  const dl = (date) => {
    const rise = c.timeForSunAlt(date, TRD.lat, TRD.lon, -0.833, true);
    const set = c.timeForSunAlt(date, TRD.lat, TRD.lon, -0.833, false);
    return (set - rise) / 3600000;
  };
  within('  Trondheim dagslengde 21. jun (t)', dl(new Date('2025-06-21T12:00:00Z')), 19.5, 21.5);
  within('  Trondheim dagslengde 21. des (t)', dl(new Date('2025-12-21T12:00:00Z')), 3.5, 5.5);

  // Månefase-formelens egen epoke: 2451550.1 = nymåne (~6. jan 2000)
  within('  måne-illuminasjon ved nymåne', c.moonIllumination(2451550.1), 0, 0.02);
  within('  måne-illuminasjon ved fullmåne', c.moonIllumination(2451550.1 + 29.530588853 / 2), 0.98, 1.0);
} catch (e) { no('  sol/måne-oppsett', e.message); }

/* ── Tid (tools/time.html) ─────────────────────────────────────────────── */
console.log('\n── FYSIKK: tid (time.html) ──');
try {
  const time = read('tools/time.html');
  const code = extractFn(time, 'jd') + '\n' + extractFn(time, 'gmst');
  const c = runCtx(code);
  near('  JD ved J2000-epoke', c.jd(new Date('2000-01-01T12:00:00Z')), 2451545.0, 1e-6);
  near('  JD ved Unix-epoke', c.jd(new Date('1970-01-01T00:00:00Z')), 2440587.5, 1e-6);
  near('  GMST ved J2000 (°)', c.gmst(new Date('2000-01-01T12:00:00Z')), 280.46, 0.1);
} catch (e) { no('  tid-oppsett', e.message); }

/* ── Oppsummering ──────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(52));
console.log(`Resultat: ${pass} bestått, ${fail} feilet`);
if (fail) {
  console.log('\nFEIL:');
  for (const f of failures) console.log('  • ' + f);
  process.exit(1);
}
console.log('Alt grønt ✓');
process.exit(0);
