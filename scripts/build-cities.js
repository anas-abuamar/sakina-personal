#!/usr/bin/env node
/**
 * Turns the GeoNames dumps into one compact JSON the app ships, so looking up
 * a city never touches the network.
 *
 * Inputs (download once from https://download.geonames.org/export/dump/):
 *   cities15000.txt  countryInfo.txt  admin1CodesASCII.txt
 *
 *   node scripts/build-cities.js <dir-holding-those-three> data/cities.json
 *
 * Source data is GeoNames, CC BY 4.0 — see the attribution field it writes.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '..', 'data', 'cities.json');
if (!src) { console.error('usage: build-cities.js <src-dir> [out.json]'); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(src, f), 'utf8').split('\n');

const countries = {};
for (const line of read('countryInfo.txt')) {
  if (!line || line[0] === '#') continue;
  const c = line.split('\t');
  if (c[0]) countries[c[0]] = c[4];
}

const admin1 = {};
for (const line of read('admin1CodesASCII.txt')) {
  if (!line) continue;
  const c = line.split('\t');
  if (c[0]) admin1[c[0]] = c[1];
}

const tzIndex = new Map();
const rows = [];

for (const line of read('cities15000.txt')) {
  if (!line) continue;
  const c = line.split('\t');
  const [, name, ascii, , lat, lon] = c;
  const cc = c[8];
  const adm = c[10];
  const pop = parseInt(c[14], 10) || 0;
  const tz = c[17];
  if (!name || !lat || !lon || !tz) continue;

  if (!tzIndex.has(tz)) tzIndex.set(tz, tzIndex.size);
  const region = admin1[`${cc}.${adm}`] || '';

  rows.push([
    name,
    ascii && ascii !== name ? ascii : '',
    region,
    cc,
    Math.round(parseFloat(lat) * 1e4) / 1e4,
    Math.round(parseFloat(lon) * 1e4) / 1e4,
    tzIndex.get(tz),
    pop,
  ]);
}

// Sorted by population so a plain prefix scan surfaces the city someone
// actually meant first, with no ranking logic at search time.
rows.sort((a, b) => b[7] - a[7]);
rows.forEach((r) => r.pop());

const payload = {
  v: 1,
  attribution: 'City data from GeoNames (https://www.geonames.org), CC BY 4.0.',
  fields: ['name', 'ascii', 'region', 'country', 'lat', 'lon', 'tz'],
  timezones: [...tzIndex.keys()],
  countries,
  cities: rows,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`${rows.length} cities, ${tzIndex.size} timezones -> ${out}`);
console.log(`${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
