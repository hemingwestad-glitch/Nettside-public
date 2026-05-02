/* ============================================================
   astro.js — Astronomiske beregninger (sol, måne, fasade)
   Basert på "Astronomical Algorithms" (Meeus) — forenklet for browser.
   Returnerer alltid UTC; konverter til lokal tid utenfor.
   ============================================================ */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// ----- TID -----
function toJulian(date) {
  return date.valueOf() / 86400000 - 0.5 + 2440588;
}
function fromJulian(j) {
  return new Date((j + 0.5 - 2440588) * 86400000);
}
function toDays(date) {
  return toJulian(date) - 2451545;
}

// ----- SOLENS POSISJON -----
const e = RAD * 23.4397;

function rightAscension(l, b) {
  return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
}
function declination(l, b) {
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
}
function azimuth(H, phi, dec) {
  return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}
function altitude(H, phi, dec) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}
function siderealTime(d, lw) {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

function solarMeanAnomaly(d) {
  return RAD * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(M) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function getSunPosition(date, lat, lng) {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return {
    azimuth: azimuth(H, phi, c.dec) * DEG + 180,
    altitude: altitude(H, phi, c.dec) * DEG
  };
}

// ----- SOLOPPGANG / SOLNEDGANG -----
const J0 = 0.0009;

function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * Math.PI)); }
function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * Math.PI) + n; }
function solarTransitJ(ds, M, L) { return 2451545 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L); }
function hourAngle(h, phi, d) {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
}

function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

function getSunTimes(date, lat, lng) {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const times = {};
  // h0 er sentrum av sola; ulike høyder gir ulike events
  const events = [
    [-0.833, 'sunrise', 'sunset'],   // soloppgang/-nedgang
    [-0.3, 'sunriseEnd', 'sunsetStart'],
    [-6, 'dawn', 'dusk'],            // sivil tussmørke
    [-12, 'nauticalDawn', 'nauticalDusk'],
    [-18, 'nightEnd', 'night'],      // astronomisk tussmørke
    [6, 'goldenHourEnd', 'goldenHour'] // gullen time
  ];
  for (const [angle, riseName, setName] of events) {
    const h = RAD * angle;
    try {
      const Jset = getSetJ(h, lw, phi, dec, n, M, L);
      const Jrise = Jnoon - (Jset - Jnoon);
      times[riseName] = fromJulian(Jrise);
      times[setName] = fromJulian(Jset);
    } catch (err) {
      times[riseName] = null;
      times[setName] = null;
    }
  }
  times.solarNoon = fromJulian(Jnoon);
  return times;
}

// ----- MÅNENS POSISJON & FASE -----
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return {
    ra: rightAscension(l, b),
    dec: declination(l, b),
    dist: dt
  };
}

function getMoonPosition(date, lat, lng) {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  // refraksjons-korreksjon
  h = h + RAD * 0.017 / Math.tan(h + RAD * 10.26 / (h + RAD * 5.10));
  return {
    azimuth: azimuth(H, phi, c.dec) * DEG + 180,
    altitude: h * DEG,
    distance: c.dist
  };
}

function getMoonIllumination(date) {
  const d = toDays(date || new Date());
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) +
    Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
  );
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) -
    Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
    angle: angle
  };
}

function moonPhaseName(phase) {
  // phase 0..1 (0 = nymåne, 0.5 = fullmåne)
  if (phase < 0.03 || phase > 0.97) return 'Nymåne';
  if (phase < 0.22) return 'Voksende månesigd';
  if (phase < 0.28) return 'Første kvarter';
  if (phase < 0.47) return 'Voksende halvmåne';
  if (phase < 0.53) return 'Fullmåne';
  if (phase < 0.72) return 'Avtagende halvmåne';
  if (phase < 0.78) return 'Siste kvarter';
  return 'Avtagende månesigd';
}

function moonPhaseIcon(phase) {
  // Returnerer SVG-friendly emoji som faktisk ser bra ut
  if (phase < 0.03 || phase > 0.97) return '●';
  if (phase < 0.22) return '◐';
  if (phase < 0.28) return '◐';
  if (phase < 0.47) return '◑';
  if (phase < 0.53) return '○';
  if (phase < 0.72) return '◑';
  if (phase < 0.78) return '◒';
  return '◓';
}

// ----- HJELP -----
function formatTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('no-NO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatDate(date, opts = {}) {
  return date.toLocaleDateString('no-NO', {
    weekday: opts.weekday || 'short',
    day: 'numeric',
    month: 'short'
  });
}

function daysBetween(a, b) {
  const ms = b.setHours(0,0,0,0) - a.setHours(0,0,0,0);
  return Math.round(ms / 86400000);
}

// Eksponer globalt
window.HW = window.HW || {};
window.HW.astro = {
  getSunPosition, getSunTimes,
  getMoonPosition, getMoonIllumination,
  moonPhaseName, moonPhaseIcon,
  formatTime, formatDate, daysBetween
};
