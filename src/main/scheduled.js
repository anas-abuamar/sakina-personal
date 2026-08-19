'use strict';
const store = require('./store');

/** Clock-time reminders, separate from the 20-minute cycle: "13:00, weekdays".
 *  Fires at most once per entry per minute, tracked by a local day+time stamp
 *  so a machine asleep through 13:00 does not fire a stale reminder on wake. */
class ScheduledReminders {
  constructor(onFire) {
    this.onFire = onFire;
    this.lastFired = new Map();
    this.timer = null;
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 20000);
    this.tick();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  tick() {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ` +
                  `${now.getHours()}:${now.getMinutes()}`;
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const clock = `${hh}:${mm}`;

    for (const entry of store.load().scheduled) {
      if (!entry.enabled) continue;
      if (entry.time !== clock) continue;
      if (Array.isArray(entry.days) && entry.days.length && !entry.days.includes(now.getDay())) continue;
      if (this.lastFired.get(entry.id) === stamp) continue;
      this.lastFired.set(entry.id, stamp);
      this.onFire(entry);
    }
  }
}

module.exports = ScheduledReminders;
