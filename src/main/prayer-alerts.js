'use strict';
const store = require('./store');
const prayer = require('./prayer');

/** Fires prayer notifications and the optional heads-up before each one.
 *
 *  Every firing is stamped with the local calendar day plus the prayer key, so
 *  a machine asleep through Asr wakes up and stays quiet about it rather than
 *  announcing a prayer whose time has passed. */
class PrayerAlerts {
  constructor(onFire) {
    this.onFire = onFire;
    this.fired = new Set();
    this.timer = null;
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 20000);
    this.tick();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  tick() {
    const s = store.load();
    if (!s.prayer.enabled || !s.location) return;

    const times = prayer.timesFor(0);
    if (!times) return;

    const now = Date.now();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: s.location.tz }).format(new Date());
    const preMs = Math.max(0, s.prayer.preWarnMin) * 60000;

    for (const entry of times) {
      if (entry.notAPrayer) continue;
      if (!s.prayer.alerts[entry.key]) continue;
      const at = entry.time.getTime();

      // Only fire inside a short window after the moment passes; anything older
      // is stale (asleep, or the app was not running).
      const fresh = (moment) => now >= moment && now - moment < 90000;

      if (preMs > 0 && fresh(at - preMs)) this.fireOnce(`${day}:${entry.key}:pre`, entry, true);
      if (fresh(at)) this.fireOnce(`${day}:${entry.key}`, entry, false);
    }

    if (this.fired.size > 40) this.fired = new Set([...this.fired].slice(-20));
  }

  fireOnce(stamp, entry, isPreWarning) {
    if (this.fired.has(stamp)) return;
    this.fired.add(stamp);
    this.onFire(entry, isPreWarning);
  }
}

module.exports = PrayerAlerts;
