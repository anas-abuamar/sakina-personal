'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// The one prompt every fresh install starts with. Everything about it is
// editable, including the words — "Look away" is a default, not a fixture.
const DEFAULT_PROMPT = {
  id: 'default-eyes',
  title: 'Look away',
  subtitle: 'Focus on something about 20 feet (6 m) away until the ring closes.',
  intervalMin: 20,
  durationSec: 20,
  showPhrase: true,
  enabled: true,
};

const DEFAULTS = {
  // Each prompt carries its own clock. See src/main/scheduler.js.
  prompts: [{ ...DEFAULT_PROMPT }],

  // Legacy single-timer fields. Kept only so an existing settings.json can be
  // migrated into a prompt on first load; nothing reads them afterwards.
  workIntervalMin: 20,
  breakDurationSec: 20,
  packs: { adhkar: true, sunnah: true, custom: true },
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

/** Prompts, sanitised. An older settings.json has no `prompts` at all, so the
 *  single interval it does have becomes the first prompt — nobody's existing
 *  cadence is silently reset by upgrading. */
function normalisePrompts(saved) {
  const list = Array.isArray(saved.prompts) ? saved.prompts : null;

  if (!list) {
    const migrated = { ...DEFAULT_PROMPT };
    if (Number.isFinite(Number(saved.workIntervalMin))) {
      migrated.intervalMin = Number(saved.workIntervalMin);
    }
    if (Number.isFinite(Number(saved.breakDurationSec))) {
      migrated.durationSec = Number(saved.breakDurationSec);
    }
    return [migrated];
  }

  const cleaned = list
    .filter((p) => p && typeof p === 'object')
    .map((p, i) => ({
      id: typeof p.id === 'string' && p.id ? p.id : `prompt-${i}`,
      title: String(p.title ?? '').slice(0, 120) || 'Take a break',
      subtitle: String(p.subtitle ?? '').slice(0, 300),
      // Clamped, because a zero interval fires a full-screen overlay on every
      // tick forever and there is no way back out of that from the UI.
      intervalMin: clamp(p.intervalMin, 1, 480, DEFAULT_PROMPT.intervalMin),
      durationSec: clamp(p.durationSec, 3, 900, DEFAULT_PROMPT.durationSec),
      showPhrase: p.showPhrase !== false,
      enabled: p.enabled !== false,
    }));

  return cleaned.length ? cleaned : [{ ...DEFAULT_PROMPT }];
}

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
  out.prompts = normalisePrompts(saved);

  // Scalars need range checks too, not just shape checks: a null or zero
  // workIntervalMin makes the scheduler compute nextAt = now and fire a
  // full-screen break on every single tick, forever.
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

module.exports = { load, save, DEFAULTS, DEFAULT_PROMPT, file };
