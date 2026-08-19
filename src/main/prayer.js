'use strict';
const adhan = require('adhan');
const store = require('./store');

// adhan 4.4.3 is pinned deliberately: 4.4.4 ships "type": "module" while its
// own CommonJS build still uses require(), so `require('adhan')` throws
// "exports is not defined in ES module scope" in Electron's main process.

const PRAYERS = [
  { key: 'fajr', name: 'Fajr', arabic: 'الفجر' },
  { key: 'sunrise', name: 'Sunrise', arabic: 'الشروق', notAPrayer: true },
  { key: 'dhuhr', name: 'Dhuhr', arabic: 'الظهر' },
  { key: 'asr', name: 'Asr', arabic: 'العصر' },
  { key: 'maghrib', name: 'Maghrib', arabic: 'المغرب' },
  { key: 'isha', name: 'Isha', arabic: 'العشاء' },
];

const METHODS = [
  ['MuslimWorldLeague', 'Muslim World League'],
  ['NorthAmerica', 'ISNA (North America)'],
  ['Egyptian', 'Egyptian General Authority'],
  ['UmmAlQura', 'Umm al-Qura (Makkah)'],
  ['Karachi', 'University of Islamic Sciences, Karachi'],
  ['Dubai', 'Dubai'],
  ['Qatar', 'Qatar'],
  ['Kuwait', 'Kuwait'],
  ['Singapore', 'Singapore'],
  ['Turkey', 'Diyanet (Turkey)'],
  ['Tehran', 'Institute of Geophysics, Tehran'],
  ['MoonsightingCommittee', 'Moonsighting Committee'],
];

/** The calendar date *where the user is*, which is not always the date on this
 *  machine — picking a city in another timezone would otherwise compute the
 *  wrong day's times near midnight. */
function dateInZone(timeZone, when = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(when).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  // Built as a local Date because adhan reads year/month/day off the local clock.
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

function parameters(settings) {
  const cfg = settings.prayer || {};
  const factory = adhan.CalculationMethod[cfg.method] || adhan.CalculationMethod.MuslimWorldLeague;
  const params = factory();
  params.madhab = cfg.madhab === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  // Without this, locations inside the polar circles return invalid dates for
  // part of the year rather than a usable approximation.
  params.polarCircleResolution = adhan.PolarCircleResolution.AqrabBalad;
  return params;
}

const valid = (d) => d instanceof Date && !Number.isNaN(d.getTime());

/** Today's times for the saved location, or null if no location is set. */
function timesFor(dayOffset = 0) {
  const settings = store.load();
  const loc = settings.location;
  if (!loc) return null;

  const day = dateInZone(loc.tz);
  day.setDate(day.getDate() + dayOffset);

  const times = new adhan.PrayerTimes(
    new adhan.Coordinates(loc.lat, loc.lon), day, parameters(settings));

  return PRAYERS
    .map((p) => ({ ...p, time: times[p.key] }))
    .filter((p) => valid(p.time));
}

/** The next upcoming prayer, rolling into tomorrow's Fajr after Isha. */
function next(from = new Date()) {
  const today = timesFor(0);
  if (!today) return null;
  const upcoming = today.find((p) => !p.notAPrayer && p.time > from);
  if (upcoming) return upcoming;
  const tomorrow = timesFor(1);
  return tomorrow ? tomorrow.find((p) => !p.notAPrayer) || null : null;
}

function formatTime(date, tz) {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric', minute: '2-digit', timeZone: tz,
  }).format(date);
}

/** "Asr in 42m" / "Maghrib in 2h 05m" — short enough for a menu bar. */
function countdownLabel(from = new Date()) {
  const upcoming = next(from);
  if (!upcoming) return null;
  const mins = Math.max(0, Math.round((upcoming.time - from) / 60000));
  const text = mins < 60
    ? `${mins}m`
    : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  return `${upcoming.name} in ${text}`;
}

module.exports = { PRAYERS, METHODS, timesFor, next, formatTime, countdownLabel };
