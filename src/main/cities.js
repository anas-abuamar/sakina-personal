'use strict';
const fs = require('fs');
const path = require('path');

// ~2 MB of GeoNames data. Loaded on first search rather than at startup: most
// launches never open the location picker, and a tray app has no business
// parsing two megabytes to show a menu.
let data = null;

function load() {
  if (data) return data;
  const file = path.join(__dirname, '..', '..', 'data', 'cities.json');
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data;
}

const normalise = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Prefix search. The dataset is pre-sorted by population, so a plain scan
 *  returns the city someone probably meant first with no ranking at all. */
function search(query, limit = 12) {
  const q = normalise(String(query || '').trim());
  if (q.length < 2) return [];
  const db = load();
  const out = [];

  for (const c of db.cities) {
    const [name, ascii, region, country, lat, lon, tz] = c;
    if (normalise(name).startsWith(q) || (ascii && normalise(ascii).startsWith(q))) {
      out.push({
        name, region, country: db.countries[country] || country,
        countryCode: country, lat, lon, tz: db.timezones[tz],
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

module.exports = { search, attribution: () => load().attribution };
