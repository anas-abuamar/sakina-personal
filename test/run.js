'use strict';
/**
 * Sakina's test suite. Runs under Electron because the modules under test use
 * app.getPath and powerMonitor:
 *
 *     npm test
 *
 * Every case here exists because something was actually broken. The prayer
 * day-boundary cases in particular came from an audit that found Isha silently
 * never firing in London and no alerts at all at UTC+14.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.on('window-all-closed', () => {});

const results = [];
const ok = (label, pass, detail = '') => results.push([pass, label, detail]);

const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'sakina-test-'));
app.setPath('userData', UD);

const RealDate = Date;
/** A Proxy over the real constructor, not a subclass: instances stay real Dates
 *  so `instanceof Date` keeps working inside adhan and the app. */
function setClock(iso) {
  const fixed = new RealDate(iso).getTime();
  global.Date = new Proxy(RealDate, {
    construct: (T, a) => (a.length ? new T(...a) : new T(fixed)),
    get: (T, prop, r) => (prop === 'now' ? () => fixed : Reflect.get(T, prop, r)),
  });
}
const realClock = () => { global.Date = RealDate; };

app.whenReady().then(async () => {
  const store = require('../src/main/store');
  const prayer = require('../src/main/prayer');
  const PrayerAlerts = require('../src/main/prayer-alerts');
  const Scheduler = require('../src/main/scheduler');

  const setLoc = (name, lat, lon, tz, method = 'MuslimWorldLeague') => store.save({
    location: { name, lat, lon, tz },
    prayer: {
      enabled: true, method, madhab: 'shafi', preWarnMin: 10,
      alerts: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
      style: 'notification', showInMenuBar: true,
    },
  });

  const runAlerts = (fromIso, hours, stepMin = 1) => {
    const fires = [];
    const alerts = new PrayerAlerts((e, pre) => fires.push(e.key + (pre ? ':pre' : '')));
    let t = new RealDate(fromIso).getTime();
    for (let i = 0; i < (hours * 60) / stepMin; i += 1) {
      setClock(new RealDate(t).toISOString());
      alerts.check();
      t += stepMin * 60000;
    }
    realClock();
    return fires;
  };

  // --- prayer: Isha after local midnight ---------------------------------
  setLoc('London', 51.5074, -0.1278, 'Europe/London');
  {
    const fires = runAlerts('2027-06-20T00:00:00Z', 72);
    const isha = fires.filter((f) => f === 'isha').length;
    ok('London Isha fires when it crosses local midnight', isha >= 3, `${isha} fires`);
  }

  // --- prayer: UTC+14 --------------------------------------------------
  setLoc('Kiritimati', 1.8721, -157.4278, 'Pacific/Kiritimati');
  {
    setClock('2026-08-19T19:28:00Z');            // 09:28 local on Aug 20
    const days = [...new Set((prayer.timesFor(0) || []).map((p) => p.day))];
    realClock();
    ok('UTC+14 resolves the correct local day', days.length === 1 && days[0] === '2026-08-20',
       JSON.stringify(days));
    const fires = runAlerts('2026-08-19T10:00:00Z', 48);
    ok('UTC+14 receives prayer alerts', fires.length >= 5, `${fires.length} fires`);
  }

  // --- prayer: exactly once, with heads-up -------------------------------
  setLoc('Mecca', 21.4225, 39.8262, 'Asia/Riyadh');
  {
    const fires = runAlerts('2026-08-19T00:00:00Z', 24, 0.5);
    const counts = {};
    fires.forEach((f) => { counts[f] = (counts[f] || 0) + 1; });
    ok('no prayer fires twice', Object.values(counts).every((n) => n === 1), JSON.stringify(counts));
    ok('heads-up fires', fires.some((f) => f.endsWith(':pre')));
  }

  // --- prayer: bad input must degrade, not throw -------------------------
  store.save({ location: { name: 'Bad', lat: 1, lon: 1, tz: 'Not/AZone' } });
  try {
    new PrayerAlerts(() => {}).tick();
    ok('unresolvable timezone does not throw', prayer.timesFor(0) === null);
  } catch (e) { ok('unresolvable timezone does not throw', false, e.message); }

  store.save({ location: { name: 'NoCoords', tz: 'America/New_York' } });
  ok('location without coordinates is rejected',
     prayer.timesFor(0) === null && prayer.next() === null);

  // --- store: patches must not clobber siblings --------------------------
  store.save({
    location: { name: 'X', lat: 10, lon: 10, tz: 'UTC' },
    prayer: { enabled: true, method: 'Karachi', madhab: 'hanafi',
              alerts: { fajr: false, dhuhr: true, asr: true, maghrib: true, isha: true } },
  });
  store.save({ prayer: { enabled: false } });
  const after = store.load().prayer;
  ok('partial patch keeps method', after.method === 'Karachi', after.method);
  ok('partial patch keeps madhab', after.madhab === 'hanafi', after.madhab);
  ok('partial patch keeps per-prayer toggles', after.alerts.fajr === false);
  ok('settings write leaves no temp file', !fs.existsSync(path.join(UD, 'settings.json.tmp')));

  // --- prompts: independent clocks ---------------------------------------
  store.save({
    prompts: [
      { id: 'a', title: 'Look away', intervalMin: 1, durationSec: 5, enabled: true },
      { id: 'b', title: 'Walk', intervalMin: 3, durationSec: 5, enabled: true },
      { id: 'c', title: 'Off', intervalMin: 1, durationSec: 5, enabled: false },
    ],
    skipWhenAway: false, waitWhilePresenting: false,
  });
  {
    const fired = [];
    let sched;
    sched = new Scheduler({ onDue: (p) => { fired.push(p.id); sched.finished(p.id); }, onChange: () => {} });
    sched.resetAll();
    for (let m = 0; m < 12; m += 1) {
      for (const [id, at] of sched.due) sched.due.set(id, at - 60000);
      await sched.tick();
    }
    const a = fired.filter((x) => x === 'a').length;
    const b = fired.filter((x) => x === 'b').length;
    ok('a shorter interval fires more often', a > b && b >= 1, `a=${a} b=${b}`);
    ok('a disabled prompt never fires', !fired.includes('c'));
  }

  // --- prompts: collisions are staggered ---------------------------------
  {
    const fired = [];
    let s2;
    s2 = new Scheduler({ onDue: (p) => { fired.push(p.id); s2.finished(p.id); }, onChange: () => {} });
    s2.resetAll();
    const now = RealDate.now();
    s2.due.set('a', now - 1000);
    s2.due.set('b', now - 1000);
    await s2.tick();
    await s2.tick();
    ok('two due at once fire one at a time', fired.length === 1, `${fired.length}`);
    const loser = s2.due.get(fired[0] === 'a' ? 'b' : 'a');
    ok('the other is staggered, not immediate', loser - RealDate.now() > 60000);
  }

  // --- prompts: an overlay collision must not wedge the scheduler --------
  {
    let busy = true;
    let started = 0;
    let s3;
    const onDue = () => { if (busy) { s3.snoozeAll(60); return; } started += 1; s3.finished('a'); };
    s3 = new Scheduler({ onDue, onChange: () => {} });
    s3.resetAll();
    s3.due.set('a', 0);
    await s3.tick();
    ok('scheduler recovers from an overlay collision', s3.activeId === null);
    busy = false;
    s3.due.set('a', 0);
    await s3.tick();
    ok('breaks resume once the screen is free', started === 1, `${started}`);
  }

  // --- prompts: migration and clamps -------------------------------------
  store.save({ prompts: [{ id: 'z', title: 'Bad', intervalMin: 0, durationSec: 0, enabled: true }] });
  ok('a zero interval is clamped', store.load().prompts[0].intervalMin >= 1);
  store.save({ prompts: [] });
  ok('an empty prompt list falls back to a default', store.load().prompts.length === 1);

  {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakina-legacy-'));
    fs.writeFileSync(path.join(legacyDir, 'settings.json'),
      JSON.stringify({ workIntervalMin: 45, breakDurationSec: 30 }));
    const saved = app.getPath('userData');
    app.setPath('userData', legacyDir);
    delete require.cache[require.resolve('../src/main/store')];
    const fresh = require('../src/main/store');
    const p = fresh.load().prompts[0];
    ok('a pre-prompts settings file keeps its cadence',
       p.intervalMin === 45 && p.durationSec === 30, JSON.stringify(p));
    app.setPath('userData', saved);
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }

  // --- cities ------------------------------------------------------------
  {
    const cities = require('../src/main/cities');
    const hits = cities.search('boothbay');
    ok('small towns are findable', hits.some((c) => c.name === 'Boothbay Harbor'),
       hits.map((c) => c.name).join(', '));
    ok('search ignores diacritics', cities.search('krako').some((c) => c.name === 'Kraków'));
    ok('a one-character query returns nothing', cities.search('a').length === 0);
  }

  // --- report ------------------------------------------------------------
  const failed = results.filter((r) => !r[0]);
  for (const [pass, label, detail] of results) {
    console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '  — ' + detail : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);

  fs.rmSync(UD, { recursive: true, force: true });
  app.exit(failed.length ? 1 : 0);
});
