'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ~170k places from GeoNames, gzipped to about 3 MB. Decompressed on first
// search rather than at startup: most launches never open the location picker,
// and a tray app has no business unpacking eight megabytes to show a menu.
let data = null;
let keys = null;   // pre-normalised search text, one entry per city

const normalise = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function load() {
  if (data) return data;
  const file = path.join(__dirname, '..', '..', 'data', 'cities.json.gz');
  data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  // Normalising 170k names on every keystroke costs ~60ms and makes the field
  // feel laggy; doing it once at load costs the same 60ms exactly once.
  keys = data.cities.map((row) => (row[1]
    ? `${normalise(row[0])}\n${normalise(row[1])}`
    : normalise(row[0])));
  return data;
}

function expand(db, row) {
  const [name, ascii, regionIdx, countryIdx, lat, lon, tzIdx] = row;
  const code = db.countries[countryIdx] || '';
  return {
    name,
    region: regionIdx >= 0 ? db.regions[regionIdx] : '',
    country: db.countryNames[code] || code,
    countryCode: code,
    lat,
    lon,
    tz: db.timezones[tzIdx],
  };
}

/** Prefix search over name and ascii name. The table is pre-sorted by
 *  population, so a plain scan returns the place someone probably meant first
 *  with no ranking logic at all. */
function search(query, limit = 12) {
  const q = normalise(String(query || '').trim());
  if (q.length < 2) return [];
  const db = load();
  const out = [];

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    // Either the name itself, or the ascii alias after the newline.
    if (key.startsWith(q) || key.includes(`\n${q}`)) {
      out.push(expand(db, db.cities[i]));
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Nearest known place to a pair of coordinates — used to name a location the
 *  user typed in by hand, so the menu says "Boothbay Harbor" rather than a pair
 *  of numbers. Equirectangular distance is plenty at this scale. */
function nearest(lat, lon) {
  const db = load();
  let best = null;
  let bestD = Infinity;
  const rad = Math.PI / 180;
  const cosLat = Math.cos(lat * rad);

  for (const row of db.cities) {
    const dx = (row[5] - lon) * cosLat;
    const dy = row[4] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = row; }
  }
  if (!best) return null;
  return { ...expand(db, best), distanceKm: Math.sqrt(bestD) * 111.32 };
}

module.exports = { search, nearest, attribution: () => load().attribution };
