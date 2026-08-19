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
};

let cache = null;
const file = () => path.join(app.getPath('userData'), 'settings.json');

/** Shallow-merge per key so a settings file written by an older version — or
 *  hand-edited and half-broken — still boots with sane values instead of
 *  throwing on a missing field. */
function merge(saved) {
  const out = { ...DEFAULTS, ...saved };
  out.packs = { ...DEFAULTS.packs, ...(saved.packs || {}) };
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
