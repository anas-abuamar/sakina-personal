'use strict';
const { powerMonitor } = require('electron');
const store = require('./store');
const presence = require('./presence');

/** While something holds the display awake, retry soon rather than dropping the
 *  whole cycle — the break should land right after the video ends. */
const PRESENTING_RETRY_SEC = 60;
const TICK_MS = 1000;

class Scheduler {
  constructor({ onBreakDue, onChange }) {
    this.onBreakDue = onBreakDue;
    this.onChange = onChange || (() => {});
    this.paused = false;
    this.breakActive = false;
    this.nextAt = null;
    this.timer = null;
    this.checking = false;
  }

  start() {
    this.reset();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK_MS);

    // Waking or unlocking means an unknown stretch away from the screen, so
    // start the interval over rather than firing the instant the lid opens.
    const fresh = () => { if (!this.paused) { this.breakActive = false; this.reset(); } };
    powerMonitor.on('resume', fresh);
    powerMonitor.on('unlock-screen', fresh);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  reset(seconds) {
    const mins = store.load().workIntervalMin;
    this.nextAt = Date.now() + (seconds != null ? seconds : mins * 60) * 1000;
    this.onChange();
  }

  snooze(seconds) { this.breakActive = false; this.reset(seconds); }
  breakFinished() { this.breakActive = false; this.reset(); }

  setPaused(paused) {
    this.paused = paused;
    if (!paused) this.reset();
    this.onChange();
  }

  /** Seconds until the next break, or null while paused or mid-break. */
  remaining() {
    if (this.paused || this.breakActive || this.nextAt == null) return null;
    return Math.max(0, Math.round((this.nextAt - Date.now()) / 1000));
  }

  async tick() {
    if (this.paused || this.breakActive || this.checking) return;
    this.onChange();
    if (Date.now() < this.nextAt) return;

    this.checking = true;
    try {
      const s = store.load();

      // Deliberately a *long* threshold. Idle input is a poor proxy for rested
      // eyes: reading a page for four minutes without touching anything is peak
      // strain, and a short threshold would cancel the breaks most needed.
      if (s.skipWhenAway && presence.idleSeconds() >= s.awayThresholdMin * 60) {
        this.reset();
        return;
      }
      if (s.waitWhilePresenting && (await presence.isPresenting())) {
        this.reset(PRESENTING_RETRY_SEC);
        return;
      }

      this.breakActive = true;
      this.onBreakDue();
    } finally {
      this.checking = false;
    }
  }
}

module.exports = Scheduler;
