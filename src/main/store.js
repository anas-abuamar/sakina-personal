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

function save(patch) {
  cache = merge({ ...load(), ...patch });
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('could not write settings:', err.message);
  }
  return cache;
}

module.exports = { load, save, DEFAULTS, file };
