/* ============================================================
   common.js — Tema-bytte og SVG-kart
   ============================================================ */

// ----- TEMA-SWITCHER -----
const THEMES = ['terminal', 'lab', 'cyber', 'brutalist'];

function getTheme() {
  return localStorage.getItem('hw_theme') || 'terminal';
}

function setTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'terminal';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('hw_theme', theme);
  // Oppdater knapper
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === theme);
  });
}

function initThemePicker() {
  // Sett initial tema
  setTheme(getTheme());

  // Wire up knapper
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.bg));
  });
}

// Set tema FØR DOMContentLoaded for å unngå flash
(function() {
  const t = localStorage.getItem('hw_theme') || 'terminal';
  document.documentElement.setAttribute('data-theme', t);
})();

document.addEventListener('DOMContentLoaded', initThemePicker);

// ============================================================
// SVG VERDENSKART
// Bruker forenklede land-data og equirectangular projeksjon
// ============================================================

// Forenklet land-data fra Natural Earth 110m, manuelt forenklet til lat/lon-polygoner.
// Format: array av polygoner. Hver polygon er array av [lon, lat]-par.
// Disse er GROVE - bevisst lavoppløselige for "kart-skisse"-stil.
const CONTINENTS = [
  // Nord-Amerika hovedsakelig
  [[-168,66],[-165,60],[-152,58],[-141,60],[-130,55],[-128,52],[-125,49],[-124,40],[-117,32],[-114,32],[-110,31],[-105,30],[-100,28],[-97,26],[-97,21],[-95,18],[-92,15],[-90,14],[-86,16],[-84,11],[-82,9],[-78,8],[-77,8],[-75,11],[-65,18],[-65,21],[-71,21],[-77,26],[-80,32],[-76,38],[-75,40],[-72,41],[-67,45],[-60,45],[-56,46],[-52,48],[-55,52],[-60,56],[-64,60],[-78,72],[-78,80],[-95,80],[-105,78],[-130,72],[-150,71],[-168,66]],
  // Sør-Amerika
  [[-81,8],[-77,7],[-71,4],[-66,1],[-58,-1],[-50,1],[-46,-1],[-43,-3],[-38,-7],[-34,-7],[-37,-13],[-39,-17],[-42,-22],[-48,-25],[-56,-34],[-63,-39],[-67,-46],[-69,-50],[-71,-55],[-73,-55],[-74,-52],[-72,-45],[-72,-37],[-72,-30],[-71,-22],[-70,-15],[-77,-8],[-80,-3],[-80,2],[-78,5],[-81,8]],
  // Europa
  [[-9,38],[-6,37],[-3,36],[2,38],[8,38],[12,37],[15,40],[19,40],[24,41],[28,41],[35,36],[38,40],[40,42],[36,42],[34,42],[27,46],[22,45],[18,46],[15,46],[12,45],[12,46],[8,46],[6,49],[2,51],[-1,49],[-5,50],[-2,55],[2,57],[7,58],[10,58],[12,55],[16,56],[20,55],[23,56],[25,60],[22,63],[22,66],[26,68],[30,70],[34,69],[40,68],[44,66],[40,64],[33,62],[30,60],[28,58],[33,55],[37,55],[39,52],[40,49],[40,46],[37,47],[28,45],[22,42],[18,41],[12,38],[8,37],[2,36],[-2,36],[-7,36],[-9,38]],
  // Afrika
  [[-17,15],[-16,21],[-12,28],[-6,35],[-2,35],[5,32],[10,33],[15,32],[22,32],[28,31],[33,28],[35,22],[37,16],[39,12],[42,11],[44,12],[46,11],[51,11],[51,5],[42,-2],[40,-5],[40,-12],[40,-19],[35,-25],[32,-29],[28,-34],[22,-34],[17,-32],[14,-26],[11,-18],[12,-12],[8,-5],[5,-2],[5,4],[2,5],[-2,5],[-6,5],[-10,5],[-13,9],[-16,12],[-17,15]],
  // Asia (kjempestor)
  [[35,42],[36,45],[37,47],[40,46],[40,49],[40,52],[44,55],[48,57],[55,60],[60,68],[68,72],[80,72],[100,75],[120,73],[140,72],[160,68],[170,68],[178,72],[180,68],[180,53],[160,55],[150,58],[145,58],[145,52],[140,50],[140,42],[140,36],[133,33],[125,32],[122,30],[120,22],[115,22],[110,20],[108,15],[107,11],[107,15],[100,13],[100,8],[103,1],[97,5],[88,8],[80,8],[78,8],[80,15],[72,20],[68,24],[62,24],[58,25],[53,25],[50,28],[48,30],[45,33],[44,36],[42,37],[40,38],[35,42]],
  // Australia
  [[113,-22],[115,-32],[118,-34],[123,-34],[129,-32],[132,-32],[136,-35],[138,-35],[140,-38],[145,-38],[147,-43],[150,-37],[153,-28],[151,-23],[145,-15],[141,-12],[135,-12],[131,-12],[129,-15],[125,-14],[121,-19],[114,-22],[113,-22]],
  // Grønland
  [[-50,60],[-43,60],[-40,65],[-32,65],[-22,70],[-22,80],[-32,83],[-50,82],[-58,80],[-55,72],[-50,60]],
  // Storbritannia
  [[-5,50],[-3,51],[-1,51],[0,52],[0,54],[-1,55],[-3,58],[-5,58],[-6,55],[-5,50]],
  // Irland
  [[-10,52],[-6,52],[-6,55],[-10,55],[-10,52]],
  // Madagaskar
  [[44,-12],[50,-15],[50,-25],[45,-25],[44,-12]],
  // Japan
  [[130,32],[133,32],[140,35],[142,40],[145,42],[145,45],[141,45],[138,42],[133,38],[130,32]],
  // New Zealand
  [[166,-46],[174,-41],[178,-37],[173,-35],[168,-43],[166,-46]],
  // Island
  [[-24,63],[-13,63],[-13,67],[-24,67],[-24,63]],
  // Antarktis (forenklet bånd)
  [[-180,-65],[180,-65],[180,-85],[-180,-85],[-180,-65]],
];

// Equirectangular projection: konverterer lat/lon til SVG x/y
function project(lat, lon, width, height) {
  const x = (lon + 180) * (width / 360);
  const y = (90 - lat) * (height / 180);
  return [x, y];
}

// Splitt en sekvens av punkter ved dato-grense
function splitDateline(points) {
  if (points.length === 0) return [];
  const segments = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].lon - points[i-1].lon) > 180) {
      segments.push([]);
    }
    segments[segments.length - 1].push(points[i]);
  }
  return segments;
}

// Hoved-funksjon for å lage SVG verdenskart
function renderWorldMap(opts) {
  const width = opts.width || 1000;
  const height = width / 2;
  const points = opts.points || [];
  const stations = opts.stations || [];
  const satellites = opts.satellites || [];
  const showGraticule = opts.graticule !== false;

  // Hent farger fra CSS-variabler hvis vi er i browser
  const cs = (typeof window !== 'undefined' && window.getComputedStyle)
    ? window.getComputedStyle(document.documentElement)
    : null;
  const accentColor = cs ? (cs.getPropertyValue('--accent').trim() || '#d97843') : '#d97843';
  const goodColor = cs ? (cs.getPropertyValue('--good').trim() || '#6fb07b') : '#6fb07b';
  const badColor = cs ? (cs.getPropertyValue('--bad').trim() || '#c95d4a') : '#c95d4a';
  const fgColor = cs ? (cs.getPropertyValue('--fg').trim() || '#e8e6df') : '#e8e6df';
  const lineColor = cs ? (cs.getPropertyValue('--line').trim() || '#2a2e36') : '#2a2e36';
  const bgColor = cs ? (cs.getPropertyValue('--bg').trim() || '#0e1014') : '#0e1014';

  let svg = `<svg class="world-map" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="color: ${fgColor};">`;

  // Land-paths
  let landPath = '';
  for (const polygon of CONTINENTS) {
    polygon.forEach((pt, i) => {
      const [x, y] = project(pt[1], pt[0], width, height);
      landPath += (i === 0 ? 'M' : 'L') + ` ${x.toFixed(1)},${y.toFixed(1)} `;
    });
    landPath += 'Z ';
  }
  // Beregn en mellomtone for land - vi vil at det skal være synlig men subtilt
  // Fg er for kontrastfull, så vi tar en blanding mellom bg og fg
  function blendColors(c1, c2, ratio) {
    const hex2rgb = h => {
      h = h.replace('#', '').trim();
      if (h.length === 3) h = h.split('').map(c=>c+c).join('');
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    };
    const [r1,g1,b1] = hex2rgb(c1);
    const [r2,g2,b2] = hex2rgb(c2);
    const r = Math.round(r1 * (1-ratio) + r2 * ratio);
    const g = Math.round(g1 * (1-ratio) + g2 * ratio);
    const b = Math.round(b1 * (1-ratio) + b2 * ratio);
    return `rgb(${r},${g},${b})`;
  }
  let landFill, landStroke;
  try {
    landFill = blendColors(bgColor, fgColor, 0.18);
    landStroke = blendColors(bgColor, fgColor, 0.45);
  } catch (e) {
    landFill = fgColor; landStroke = fgColor;
  }
  svg += `<path class="land" d="${landPath}" fill="${landFill}" stroke="${landStroke}" stroke-width="0.7" stroke-linejoin="round" />`;

  // Graticule
  if (showGraticule) {
    let graticule = '';
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      const [x1, y] = project(lat, -180, width, height);
      const [x2] = project(lat, 180, width, height);
      graticule += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${lineColor}" stroke-width="0.4" stroke-dasharray="2 3" />`;
    }
    for (let lon = -150; lon <= 150; lon += 30) {
      if (lon === 0) continue;
      const [x, y1] = project(85, lon, width, height);
      const [, y2] = project(-85, lon, width, height);
      graticule += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${lineColor}" stroke-width="0.4" stroke-dasharray="2 3" />`;
    }
    svg += graticule;
    const [x1, eqY] = project(0, -180, width, height);
    const [x2] = project(0, 180, width, height);
    svg += `<line x1="${x1}" y1="${eqY}" x2="${x2}" y2="${eqY}" stroke="${lineColor}" stroke-width="0.7" opacity="0.6" />`;
  }

  // Track
  if (points.length > 1) {
    const segments = splitDateline(points);
    for (const seg of segments) {
      if (seg.length < 2) continue;
      let d = '';
      seg.forEach((p, i) => {
        const [x, y] = project(p.lat, p.lon, width, height);
        d += (i === 0 ? 'M' : 'L') + ` ${x.toFixed(1)},${y.toFixed(1)} `;
      });
      svg += `<path d="${d}" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    const [sx, sy] = project(points[0].lat, points[0].lon, width, height);
    const [ex, ey] = project(points[points.length-1].lat, points[points.length-1].lon, width, height);
    svg += `<circle cx="${sx}" cy="${sy}" r="4" fill="${goodColor}" stroke="${bgColor}" stroke-width="1.5" />`;
    svg += `<circle cx="${ex}" cy="${ey}" r="4" fill="${badColor}" stroke="${bgColor}" stroke-width="1.5" />`;
  }

  // Bakkestasjoner
  for (const s of stations) {
    const [x, y] = project(s.lat, s.lon, width, height);
    svg += `<g>
      <circle cx="${x}" cy="${y}" r="5" fill="${accentColor}" stroke="${bgColor}" stroke-width="1.5" />
      ${s.name ? `<text x="${x + 8}" y="${y + 3}" font-family="monospace" font-size="9" fill="${fgColor}">${s.name}</text>` : ''}
    </g>`;
  }

  // Satellitter
  for (const s of satellites) {
    const [x, y] = project(s.lat, s.lon, width, height);
    svg += `<g>
      <circle cx="${x}" cy="${y}" r="4" fill="${accentColor}" stroke="${bgColor}" stroke-width="1.5" />
      ${s.name ? `<text x="${x + 7}" y="${y + 3}" font-family="monospace" font-size="9" fill="${fgColor}">${s.name}</text>` : ''}
    </g>`;
  }

  svg += '</svg>';
  return svg;
}

window.HW = window.HW || {};
window.HW.theme = { setTheme, getTheme };
window.HW.map = { renderWorldMap, project, splitDateline };
