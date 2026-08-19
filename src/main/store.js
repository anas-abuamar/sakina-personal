'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  workIntervalMin: 20,
  breakDurationSec: 20,
  packs: { adhkar: true, quotes: true, custom: true },
  customPhrases: [],
  cursor: -1,
  skipWhenAway: true,
  awayThresholdMin: 5,
  waitWhilePresenting: true,
  playSound: false,
  launchAtLogin: false,
  strictMode: false,
  scheduled: [],
  firstRunComplete: false,

  // null until a city is chosen; { name, region, country, lat, lon, tz }
  location: null,
  prayer: {
    enabled: false,
    method: 'MuslimWorldLeague',
    madhab: 'shafi',
    alerts: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
    style: 'notification',   // or 'fullscreen'
    preWarnMin: 10,          // 0 turns the heads-up off
    showInMenuBar: true,
  },
};

let cache = null;
const file = () => path.join(app.getPath('userData'), 'settings.json');

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

/** Shallow-merge per key so a settings file written by an older version — or
 *  hand-edited and half-broken — still boots with sane values instead of
 *  throwing on a missing field. */
function merge(saved) {
  const out = { ...DEFAULTS, ...saved };
  out.packs = { ...DEFAULTS.packs, ...(saved.packs || {}) };
  out.prayer = { ...DEFAULTS.prayer, ...(saved.prayer || {}) };
  out.prayer.alerts = { ...DEFAULTS.prayer.alerts, ...((saved.prayer || {}).alerts || {}) };
  out.customPhrases = Array.isArray(saved.customPhrases) ? saved.customPhrases : [];
  out.scheduled = Array.isArray(saved.scheduled) ? saved.scheduled : [];

  // Scalars need range checks too, not just shape checks: a null or zero
  // workIntervalMin makes the scheduler compute nextAt = now and fire a
  // full-screen break on every single tick, forever.
  out.workIntervalMin = clamp(out.workIntervalMin, 1, 240, DEFAULTS.workIntervalMin);
  out.breakDurationSec = clamp(out.breakDurationSec, 3, 600, DEFAULTS.breakDurationSec);
  out.awayThresholdMin = clamp(out.awayThresholdMin, 1, 240, DEFAULTS.awayThresholdMin);
  out.prayer.preWarnMin = clamp(out.prayer.preWarnMin, 0, 120, DEFAULTS.prayer.preWarnMin);
  return out;
}

function load() {
  if (cache) return cache;
  try {
    cache = merge(JSON.parse(fs.readFileSync(file(), 'utf8')));
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

/** Apply a partial update.
 *
 *  Nested objects are merged against the CURRENT settings, not against
 *  DEFAULTS. Merging against defaults meant a patch like {prayer:{enabled:true}}
 *  silently reset the user's calculation method, madhab, and per-prayer
 *  toggles — merge() is written for the load path and is the wrong tool for a
 *  patch. The welcome handler used to hand-roll this fix in one place; it
 *  belongs here, where every caller gets it.
 */
function save(patch) {
  const current = load();
  const next = { ...current, ...patch };

  if (patch.packs) next.packs = { ...current.packs, ...patch.packs };
  if (patch.prayer) {
    next.prayer = { ...current.prayer, ...patch.prayer };
    if (patch.prayer.alerts) {
      next.prayer.alerts = { ...current.prayer.alerts, ...patch.prayer.alerts };
    }
  }

  cache = merge(next);
  write(cache);
  return cache;
}

/** Write via a temporary file and rename. A plain writeFileSync onto the live
 *  path leaves a truncated settings.json if the machine dies mid-write, and
 *  load() would then silently hand back DEFAULTS — losing the chosen city,
 *  custom phrases, and every scheduled reminder with no visible sign. */
function write(value) {
  const target = file();
  const temp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(value, null, 2));
    fs.renameSync(temp, target);
  } catch (err) {
    console.error('could not write settings:', err.message);
    try { fs.unlinkSync(temp); } catch { /* nothing to clean up */ }
  }
}

module.exports = { load, save, DEFAULTS, file };
