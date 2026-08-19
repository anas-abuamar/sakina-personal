'use strict';
const store = require('./store');
const prayer = require('./prayer');

const FRESH_MS = 90000;   // how late a moment may be noticed and still fire

/** Fires prayer notifications and the optional heads-up before each one.
 *
 *  Each firing is stamped with the prayer's OWN local calendar day, not with
 *  "today". Stamping by today is what made Isha silently never fire wherever it
 *  falls after local midnight — by the time 01:02 arrives, "today" has already
 *  rolled over and yesterday's Isha is in nobody's list. */
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
    // This runs inside a timer, so anything thrown here is an uncaught
    // main-process exception. A broken location must degrade to silence.
    try {
      this.check();
    } catch (err) {
      console.error('prayer alert check failed:', err && err.message);
    }
  }

  check() {
    const s = store.load();
    if (!s.prayer.enabled) return;
    if (!prayer.usableLocation(s.location)) return;

    const upcoming = prayer.around();
    if (!upcoming) return;

    const now = Date.now();
    const preMs = Math.max(0, Number(s.prayer.preWarnMin) || 0) * 60000;
    const fresh = (moment) => now >= moment && now - moment < FRESH_MS;

    for (const entry of upcoming) {
      if (!s.prayer.alerts[entry.key]) continue;
      const at = entry.time.getTime();
      const stamp = `${entry.day}:${entry.key}`;

      // The heads-up is suppressed unless the prayer itself is still ahead,
      // so nobody is told "Maghrib in 10 minutes" about a Maghrib that has
      // already gone by.
      if (preMs > 0 && at > now && fresh(at - preMs)) {
        this.fireOnce(`${stamp}:pre`, entry, true);
      }
      if (fresh(at)) this.fireOnce(stamp, entry, false);
    }

    this.prune(now);
  }

  /** Drop stamps that are far enough in the past that they can no longer be
   *  inside anything's freshness window. The previous version capped by COUNT,
   *  which could evict a stamp that was still live and fire it twice. */
  prune(now) {
    if (this.fired.size < 64) return;
    const cutoff = new Date(now - 36 * 3600 * 1000);
    const keepFrom = cutoff.toISOString().slice(0, 10);
    for (const stamp of this.fired) {
      if (stamp.slice(0, 10) < keepFrom) this.fired.delete(stamp);
    }
  }

  fireOnce(stamp, entry, isPreWarning) {
    if (this.fired.has(stamp)) return;
    this.fired.add(stamp);
    try {
      this.onFire(entry, isPreWarning);
    } catch (err) {
      // Un-stamp so a transient failure gets another attempt next tick rather
      // than silently swallowing the prayer for the rest of the day.
      this.fired.delete(stamp);
      console.error('prayer alert delivery failed:', err && err.message);
    }
  }
}

module.exports = PrayerAlerts;
