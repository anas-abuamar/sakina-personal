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
  ['Egyptian', 'Egyptian General Authority of Survey'],
  ['UmmAlQura', 'Umm al-Qura (Makkah)'],
  ['Karachi', 'University of Islamic Sciences, Karachi'],
  ['Dubai', 'Dubai'],
  ['Qatar', 'Qatar'],
  ['Kuwait', 'Kuwait'],
  ['Singapore', 'Singapore'],
  ['Turkey', 'Diyanet (Turkey) — approximation'],
  ['Tehran', 'Institute of Geophysics, Tehran'],
  ['MoonsightingCommittee', 'Moonsighting Committee'],
];

// Duck-typed rather than `instanceof Date`: a Date built in another realm (or
// under a test clock) is still a perfectly good Date, and instanceof says no.
const valid = (d) => Object.prototype.toString.call(d) === '[object Date]'
  && !Number.isNaN(d.getTime());

/** A location is only usable if it has real coordinates AND a timezone this
 *  machine's ICU can resolve. Without this check an unknown tz throws a
 *  RangeError out of Intl — from inside a 20-second timer, where it would be an
 *  uncaught main-process exception rather than a missing feature. */
function usableLocation(loc) {
  if (!loc) return null;
  if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  if (Math.abs(loc.lat) > 90 || Math.abs(loc.lon) > 180) return null;
  if (typeof loc.tz !== 'string' || !loc.tz) return null;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: loc.tz }).format(new Date());
  } catch {
    return null;
  }
  return loc;
}

/** YYYY-MM-DD for an instant, as seen in `timeZone`. */
function dayKey(instant, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}

/** The calendar date *where the user is*, as a local Date — adhan reads
 *  year/month/day off the local clock, so this is the shape it wants. */
function dateInZone(timeZone, when = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(when).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-` +
                        `${String(d.getDate()).padStart(2, '0')}`;

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

/**
 * Every prayer instant in a window of days around today, sorted.
 *
 * This spans neighbouring days rather than computing "today" because a single
 * adhan day does not line up with a local calendar day in two real cases:
 *
 *   - Isha can fall *after* local midnight (London, ~2 months a year; also
 *     Oslo, Berlin, Moscow, Anchorage). Keyed to "today" it belongs to
 *     yesterday's list, so by the time it happens nothing is looking for it.
 *   - At UTC+13/+14 (Kiritimati, Apia, Tongatapu, Chatham) adhan's day is a
 *     whole local day off, because solar noon at those longitudes lands on the
 *     next local date.
 *
 * Computing a span and then selecting by actual instant makes both fall out.
 */
function span(loc, settings, back = 1, forward = 1) {
  const params = parameters(settings);
  const coords = new adhan.Coordinates(loc.lat, loc.lon);
  const base = dateInZone(loc.tz);
  const out = [];
  const seen = new Set();

  for (let offset = -back; offset <= forward; offset += 1) {
    const day = new Date(base);
    day.setDate(day.getDate() + offset);
    const times = new adhan.PrayerTimes(coords, day, params);
    for (const p of PRAYERS) {
      const time = times[p.key];
      if (!valid(time)) continue;
      const id = `${p.key}@${time.getTime()}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ ...p, time, day: dayKey(time, loc.tz) });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Everything happening on one local calendar day, whichever adhan day each
 *  instant was actually computed from. */
function timesFor(dayOffset = 0) {
  const settings = store.load();
  const loc = usableLocation(settings.location);
  if (!loc) return null;

  const target = new Date(dateInZone(loc.tz));
  target.setDate(target.getDate() + dayOffset);
  const wanted = localKey(target);

  const list = span(loc, settings, 1 + Math.max(0, -dayOffset), 1 + Math.max(0, dayOffset))
    .filter((p) => p.day === wanted);
  return list.length ? list : null;
}

/** Every prayer instant near now, for code that cares about moments rather
 *  than calendar days — the alert poller in particular. */
function around() {
  const settings = store.load();
  const loc = usableLocation(settings.location);
  if (!loc) return null;
  return span(loc, settings, 1, 1).filter((p) => !p.notAPrayer);
}

/** The next upcoming prayer, looking across the day boundary in both
 *  directions rather than assuming it lives in today's list. */
function next(from = new Date()) {
  const settings = store.load();
  const loc = usableLocation(settings.location);
  if (!loc) return null;
  return span(loc, settings, 1, 2).find((p) => !p.notAPrayer && p.time > from) || null;
}

function formatTime(date, tz) {
  try {
    return new Intl.DateTimeFormat([], {
      hour: 'numeric', minute: '2-digit', timeZone: tz,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(date);
  }
}

/** "Asr in 42m" / "Maghrib in 2h 05m" — short enough for a menu bar. */
function countdownLabel(from = new Date()) {
  const upcoming = next(from);
  if (!upcoming) return null;
  const seconds = Math.max(0, Math.round((upcoming.time - from) / 1000));
  if (seconds < 60) return `${upcoming.name} now`;
  const mins = Math.round(seconds / 60);
  const text = mins < 60
    ? `${mins}m`
    : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  return `${upcoming.name} in ${text}`;
}

module.exports = {
  PRAYERS, METHODS, timesFor, around, next, formatTime, countdownLabel,
  usableLocation, dayKey,
};
