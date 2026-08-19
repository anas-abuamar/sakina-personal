#!/usr/bin/env node
/**
 * Turns the GeoNames dumps into one compact, gzipped file the app ships, so
 * looking up a place never touches the network.
 *
 * Inputs (download from https://download.geonames.org/export/dump/):
 *   cities1000.txt   countryInfo.txt   admin1CodesASCII.txt
 *
 *   node scripts/build-cities.js <dir-holding-those> data/cities.json.gz
 *
 * cities1000 rather than cities15000: the 15000 cut excludes most small towns —
 * Boothbay, Maine (pop. 3,077) simply was not in the list, and neither was any
 * other town on that stretch of coast. Region and country names are interned
 * and the whole thing is gzipped, which is what keeps a 170k-row table down to
 * a couple of megabytes in the repo.
 *
 * Source data is GeoNames, CC BY 4.0 — see the attribution field it writes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const src = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '..', 'data', 'cities.json.gz');
if (!src) { console.error('usage: build-cities.js <src-dir> [out.json.gz]'); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(src, f), 'utf8').split('\n');

const countryNames = {};
for (const line of read('countryInfo.txt')) {
  if (!line || line[0] === '#') continue;
  const c = line.split('\t');
  if (c[0]) countryNames[c[0]] = c[4];
}

const admin1 = {};
for (const line of read('admin1CodesASCII.txt')) {
  if (!line) continue;
  const c = line.split('\t');
  if (c[0]) admin1[c[0]] = c[1];
}

// Intern the repeated strings: "Maine" appears in thousands of rows.
const pool = (table) => (value) => {
  if (!value) return -1;
  let i = table.indexOf(value);
  if (i === -1) { i = table.length; table.push(value); }
  return i;
};
const regions = [];
const countries = [];
const timezones = [];
const regionId = pool(regions);
const countryId = pool(countries);
const tzId = pool(timezones);

const rows = [];
for (const line of read('cities1000.txt')) {
  if (!line) continue;
  const c = line.split('\t');
  const [, name, ascii, , lat, lon] = c;
  const cc = c[8];
  const pop = parseInt(c[14], 10) || 0;
  const tz = c[17];
  if (!name || !lat || !lon || !tz) continue;

  rows.push([
    name,
    ascii && ascii !== name ? ascii : '',
    regionId(admin1[`${cc}.${c[10]}`] || ''),
    countryId(cc),
    // 3 decimals is ~110 m. Prayer times move by well under a second at that
    // scale, and it trims megabytes off the table.
    Math.round(parseFloat(lat) * 1e3) / 1e3,
    Math.round(parseFloat(lon) * 1e3) / 1e3,
    tzId(tz),
    pop,
  ]);
}

// Sorted by population so a plain prefix scan surfaces the place someone
// probably meant first, with no ranking logic at search time.
rows.sort((a, b) => b[7] - a[7]);
rows.forEach((r) => r.pop());

const payload = {
  v: 2,
  attribution: 'City data from GeoNames (https://www.geonames.org), CC BY 4.0.',
  fields: ['name', 'ascii', 'regionIdx', 'countryIdx', 'lat', 'lon', 'tzIdx'],
  regions,
  countries,
  countryNames,
  timezones,
  cities: rows,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
const json = Buffer.from(JSON.stringify(payload));
fs.writeFileSync(out, zlib.gzipSync(json, { level: 9 }));

console.log(`${rows.length} places, ${regions.length} regions, ${timezones.length} timezones`);
console.log(`raw ${(json.length / 1e6).toFixed(1)} MB -> gzip ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
