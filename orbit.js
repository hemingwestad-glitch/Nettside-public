/* ============================================================
   orbit.js — Orbital mekanikk
   Web-port av Hemings Python-verktøy
   ============================================================ */

const MU_EARTH = 398600.4418;     // km^3/s^2
const WGS84_A = 6378.137;          // km
const WGS84_F = 1.0 / 298.257223563;
const WGS84_E2 = WGS84_F * (2.0 - WGS84_F);
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ----- TID -----
function datetimeToJD(date) {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const mn = date.getUTCMinutes();
  const s = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const dayFrac = (h + mn / 60 + s / 3600) / 24;
  return Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    d + dayFrac + B - 1524.5;
}

function gmstRad(date) {
  const jd = datetimeToJD(date);
  const T = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - (T*T*T) / 38710000.0;
  g = ((g % 360) + 360) % 360;
  return g * DEG2RAD;
}

// ----- KEPLER -----
function solveKepler(M, e, tol = 1e-12, maxIter = 50) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1.0 - e * Math.cos(E);
    const dE = -f / fp;
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function trueToMean(nuDeg, e) {
  const nu = nuDeg * DEG2RAD;
  const E = 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(nu / 2),
    Math.sqrt(1 + e) * Math.cos(nu / 2)
  );
  let M = E - e * Math.sin(E);
  M = M * RAD2DEG;
  return ((M % 360) + 360) % 360;
}

// ----- ROTASJONSMATRISER -----
function rotZ(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1]
  ];
}
function rotX(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c]
  ];
}
function matMul(A, B) {
  const r = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        r[i][j] += A[i][k] * B[k][j];
  return r;
}
function matVec(A, v) {
  return [
    A[0][0]*v[0] + A[0][1]*v[1] + A[0][2]*v[2],
    A[1][0]*v[0] + A[1][1]*v[1] + A[1][2]*v[2],
    A[2][0]*v[0] + A[2][1]*v[1] + A[2][2]*v[2]
  ];
}
function transpose(A) {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]]
  ];
}

// ----- COE TIL ECI -----
function coeToEciMatrix(raan, inc, argp) {
  // R3(-raan) @ R1(-inc) @ R3(-argp)
  return matMul(matMul(rotZ(raan), rotX(inc)), rotZ(argp));
}

// ----- PROPAGER -----
function propagateECI(elements, tSec) {
  const a = elements.a;
  const e = elements.e;
  const inc = elements.inc * DEG2RAD;
  const raan = elements.raan * DEG2RAD;
  const argp = elements.argp * DEG2RAD;
  const M0 = elements.M0 * DEG2RAD;
  const n = Math.sqrt(MU_EARTH / (a*a*a));

  const M = ((M0 + n * tSec) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(M, e);
  const xPf = a * (Math.cos(E) - e);
  const yPf = a * (Math.sqrt(1 - e*e) * Math.sin(E));

  const Q = coeToEciMatrix(raan, inc, argp);
  return matVec(Q, [xPf, yPf, 0]);
}

function eciToEcef(rEci, date) {
  const theta = gmstRad(date);
  return matVec(rotZ(-theta), rEci);
}

// ----- ECEF TIL GEODETISK -----
function ecefToGeodetic(x, y, z) {
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x*x + y*y);
  if (p < 1e-12) {
    return { lat: z >= 0 ? 90 : -90, lon: lon * RAD2DEG, alt: Math.abs(z) - WGS84_A * (1 - WGS84_F) };
  }
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  let N = WGS84_A;
  for (let i = 0; i < 10; i++) {
    const sl = Math.sin(lat);
    N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
    const latNew = Math.atan2(z + WGS84_E2 * N * sl, p);
    if (Math.abs(latNew - lat) < 1e-13) { lat = latNew; break; }
    lat = latNew;
  }
  const sl = Math.sin(lat);
  N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
  const alt = p / Math.cos(lat) - N;
  return { lat: lat * RAD2DEG, lon: lon * RAD2DEG, alt: alt };
}

// ----- GROUND STATION -----
function stationECEF(latDeg, lonDeg, altM) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const altKm = altM / 1000;
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
  return [
    (N + altKm) * cl * Math.cos(lon),
    (N + altKm) * cl * Math.sin(lon),
    (N * (1 - WGS84_E2) + altKm) * sl
  ];
}

function enuBasis(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  return {
    east: [-Math.sin(lon), Math.cos(lon), 0],
    north: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
    up: [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  };
}

function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function norm(v) { return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]); }

function topocentric(satEcef, station) {
  const rho = sub(satEcef, station.ecef);
  const e = dot(rho, station.basis.east);
  const n = dot(rho, station.basis.north);
  const u = dot(rho, station.basis.up);
  const slant = norm(rho);
  const elev = Math.atan2(u, Math.sqrt(e*e + n*n)) * RAD2DEG;
  const az = ((Math.atan2(e, n) * RAD2DEG) + 360) % 360;
  return { elev, az, slant };
}

// ----- HOVED-API -----
function computeGroundTrack(elements, epoch, durationS, stepS) {
  const points = [];
  for (let t = 0; t <= durationS; t += stepS) {
    const rEci = propagateECI(elements, t);
    const date = new Date(epoch.getTime() + t * 1000);
    const rEcef = eciToEcef(rEci, date);
    const geo = ecefToGeodetic(rEcef[0], rEcef[1], rEcef[2]);
    points.push({ t, ...geo, time: date });
  }
  return points;
}

function elevAt(elements, epoch, stationData, tSec) {
  const rEci = propagateECI(elements, tSec);
  const date = new Date(epoch.getTime() + tSec * 1000);
  const rEcef = eciToEcef(rEci, date);
  return topocentric(rEcef, stationData);
}

// Bisection for å finne nøyaktig tidspunkt der elev = target
function refineCrossing(elements, epoch, stationData, t1, t2, target, tol = 0.01) {
  let lo = t1, hi = t2;
  let f1 = elevAt(elements, epoch, stationData, lo).elev - target;
  if (f1 === 0) return lo;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = elevAt(elements, epoch, stationData, mid).elev - target;
    if (Math.abs(hi - lo) < tol) return mid;
    if ((f1 <= 0 && fm >= 0) || (f1 >= 0 && fm <= 0)) {
      hi = mid;
    } else {
      lo = mid;
      f1 = fm;
    }
  }
  return (lo + hi) / 2;
}

// Golden-section search for maksimum elevasjon i [t1, t2]
function refinePeak(elements, epoch, stationData, t1, t2, tol = 0.05) {
  let a = Math.min(t1, t2), b = Math.max(t1, t2);
  if (b - a <= tol) {
    const t = (a + b) / 2;
    const r = elevAt(elements, epoch, stationData, t);
    return { t, ...r };
  }
  const phi = (1 + Math.sqrt(5)) / 2;
  const invPhi = 1 / phi;
  const invPhiSq = invPhi * invPhi;
  let c = a + invPhiSq * (b - a);
  let d = a + invPhi * (b - a);
  let fc = elevAt(elements, epoch, stationData, c).elev;
  let fd = elevAt(elements, epoch, stationData, d).elev;
  while (b - a > tol) {
    if (fc < fd) {
      a = c; c = d; fc = fd;
      d = a + invPhi * (b - a);
      fd = elevAt(elements, epoch, stationData, d).elev;
    } else {
      b = d; d = c; fd = fc;
      c = a + invPhiSq * (b - a);
      fc = elevAt(elements, epoch, stationData, c).elev;
    }
  }
  const t = (a + b) / 2;
  const r = elevAt(elements, epoch, stationData, t);
  return { t, ...r };
}

function findPasses(elements, epoch, station, durationS, stepS, minElev) {
  const stationData = {
    ecef: stationECEF(station.lat, station.lon, station.alt),
    basis: enuBasis(station.lat, station.lon)
  };

  const samples = [];
  for (let t = 0; t <= durationS; t += stepS) {
    const rEci = propagateECI(elements, t);
    const date = new Date(epoch.getTime() + t * 1000);
    const rEcef = eciToEcef(rEci, date);
    const topo = topocentric(rEcef, stationData);
    samples.push({ t, ...topo, date });
  }

  const passes = [];
  let i = 0;
  while (i < samples.length) {
    if (samples[i].elev < minElev) { i++; continue; }
    const segStart = i;
    while (i + 1 < samples.length && samples[i+1].elev >= minElev) i++;
    const segEnd = i;

    // Refine rise og set med bisection
    let riseT = samples[segStart].t;
    let setT = samples[segEnd].t;
    if (segStart > 0) {
      riseT = refineCrossing(elements, epoch, stationData,
        samples[segStart - 1].t, samples[segStart].t, minElev);
    }
    if (segEnd < samples.length - 1) {
      setT = refineCrossing(elements, epoch, stationData,
        samples[segEnd].t, samples[segEnd + 1].t, minElev);
    }

    // Coarse peak
    let maxIdx = segStart;
    for (let j = segStart; j <= segEnd; j++) {
      if (samples[j].elev > samples[maxIdx].elev) maxIdx = j;
    }

    // Refine peak med golden-section over en bredere region
    const leftIdx = Math.max(segStart, maxIdx - 1);
    const rightIdx = Math.min(segEnd, maxIdx + 1);
    let tcaResult;
    if (rightIdx <= leftIdx) {
      tcaResult = { t: samples[maxIdx].t, elev: samples[maxIdx].elev,
                    az: samples[maxIdx].az, slant: samples[maxIdx].slant };
    } else {
      tcaResult = refinePeak(elements, epoch, stationData,
        samples[leftIdx].t, samples[rightIdx].t);
    }

    const riseDate = new Date(epoch.getTime() + riseT * 1000);
    const setDate = new Date(epoch.getTime() + setT * 1000);
    const tcaDate = new Date(epoch.getTime() + tcaResult.t * 1000);

    passes.push({
      rise: riseDate,
      tca: tcaDate,
      set: setDate,
      maxElev: tcaResult.elev,
      maxAz: tcaResult.az,
      slant: tcaResult.slant,
      duration: (setDate - riseDate) / 1000
    });
    i = segEnd + 1;
  }
  return passes;
}

// ----- PARSER FOR ORBITAL ELEMENT FILER -----
function parseOrbitalFile(text) {
  const lines = text.split('\n');
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes(':')) continue;
    const [keyRaw, ...rest] = trimmed.split(':');
    const key = keyRaw.trim();
    const value = rest.join(':').trim();
    if (key === 'Spacecraft') result.name = value;
    else if (key === 'UTC time at deployment') {
      let v = value.endsWith('Z') ? value : value + 'Z';
      result.epoch = new Date(v);
    }
    else if (key === 'Semi-major axis (km)') result.a = parseFloat(value);
    else if (key === 'Eccentricity (-)') result.e = parseFloat(value);
    else if (key === 'Inclination (deg)') result.inc = parseFloat(value);
    else if (key === 'RAAN (deg)') result.raan = parseFloat(value);
    else if (key === 'Argument of perigee (deg)') result.argp = parseFloat(value);
    else if (key === 'True anomaly (deg)') result.nu = parseFloat(value);
    else if (key === 'Period (s)') result.period = parseFloat(value);
  }
  if (result.nu !== undefined && result.e !== undefined) {
    result.M0 = trueToMean(result.nu, result.e);
  }
  return result;
}

window.HW = window.HW || {};
window.HW.orbit = {
  parseOrbitalFile,
  computeGroundTrack,
  findPasses,
  propagateECI,
  eciToEcef,
  ecefToGeodetic,
  trueToMean,
  MU_EARTH, WGS84_A
};
