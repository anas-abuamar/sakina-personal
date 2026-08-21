'use strict';
const { powerMonitor } = require('electron');
const store = require('./store');
const presence = require('./presence');

/** While something holds the display awake, retry soon rather than dropping the
 *  whole cycle — the break should land right after the video ends. */
const PRESENTING_RETRY_SEC = 60;

/** When two prompts come due together, the loser waits this long rather than
 *  firing the instant the first one closes. Three full-screen overlays
 *  back-to-back is worse than any of them arriving late, and with intervals
 *  like 20/60/90 minutes they genuinely do coincide. */
const STAGGER_SEC = 150;

const TICK_MS = 1000;

/**
 * Runs one clock per prompt.
 *
 * Each prompt has its own interval, so "Look away" every 20 minutes and
 * "Stand and walk" every hour advance independently. Only one may be on screen
 * at a time; the rest wait their turn.
 */
class Scheduler {
  constructor({ onDue, onChange }) {
    this.onDue = onDue;
    this.onChange = onChange || (() => {});
    this.paused = false;
    this.activeId = null;
    this.due = new Map();   // prompt id -> timestamp it next fires
    this.timer = null;
    this.checking = false;
  }

  start() {
    this.resetAll();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK_MS);

    // Waking or unlocking means an unknown stretch away from the screen, so
    // start every clock over rather than firing the instant the lid opens.
    const fresh = () => { if (!this.paused) { this.activeId = null; this.resetAll(); } };
    powerMonitor.on('resume', fresh);
    powerMonitor.on('unlock-screen', fresh);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  prompts() {
    return store.load().prompts.filter((p) => p.enabled);
  }

  /** Re-arm every clock. Called on start, on wake, and whenever the prompt list
   *  changes — a prompt whose interval was just edited should time from now. */
  resetAll() {
    const now = Date.now();
    const next = new Map();
    for (const p of this.prompts()) {
      // Keep an existing countdown if the interval is unchanged, so editing one
      // prompt does not silently restart all the others.
      const existing = this.due.get(p.id);
      const fresh = now + p.intervalMin * 60000;
      next.set(p.id, existing && existing <= fresh ? existing : fresh);
    }
    this.due = next;
    this.onChange();
  }

  resetOne(id, seconds) {
    const p = this.prompts().find((x) => x.id === id);
    if (!p) return;
    this.due.set(id, Date.now() + (seconds != null ? seconds : p.intervalMin * 60) * 1000);
    this.onChange();
  }

  snoozeAll(seconds) {
    this.activeId = null;
    const now = Date.now();
    for (const [id, at] of this.due) {
      this.due.set(id, Math.max(at, now + seconds * 1000));
    }
    this.onChange();
  }

  /** A prompt's break ended: re-arm it, and push anything already overdue out
   *  by the stagger so the user is not hit twice in a row. */
  finished(id) {
    this.activeId = null;
    const now = Date.now();
    this.resetOne(id);
    for (const [otherId, at] of this.due) {
      if (otherId !== id && at <= now) this.due.set(otherId, now + STAGGER_SEC * 1000);
    }
    this.onChange();
  }

  setPaused(paused) {
    this.paused = paused;
    this.activeId = null;
    if (!paused) this.resetAll();
    this.onChange();
  }

  /** Seconds until a given prompt fires, or null if it is not armed. */
  remainingFor(id) {
    const at = this.due.get(id);
    if (this.paused || at == null) return null;
    return Math.max(0, Math.round((at - Date.now()) / 1000));
  }

  /** The soonest prompt, for the menu and the tray. */
  nextUp() {
    if (this.paused) return null;
    let best = null;
    for (const p of this.prompts()) {
      const at = this.due.get(p.id);
      if (at == null) continue;
      if (!best || at < best.at) best = { prompt: p, at };
    }
    if (!best) return null;
    return { prompt: best.prompt, seconds: Math.max(0, Math.round((best.at - Date.now()) / 1000)) };
  }

  async tick() {
    if (this.paused || this.activeId || this.checking) return;
    this.onChange();

    const now = Date.now();
    // Most overdue first, so a prompt that lost a collision is not starved.
    const ready = this.prompts()
      .filter((p) => (this.due.get(p.id) ?? Infinity) <= now)
      .sort((a, b) => this.due.get(a.id) - this.due.get(b.id));
    if (!ready.length) return;

    this.checking = true;
    try {
      const s = store.load();

      // Deliberately a *long* threshold. Idle input is a poor proxy for rested
      // eyes: reading a page for four minutes without touching anything is peak
      // strain, and a short threshold would cancel the breaks most needed.
      if (s.skipWhenAway && presence.idleSeconds() >= s.awayThresholdMin * 60) {
        for (const p of ready) this.resetOne(p.id);
        return;
      }
      if (s.waitWhilePresenting && (await presence.isPresenting())) {
        for (const p of ready) this.resetOne(p.id, PRESENTING_RETRY_SEC);
        return;
      }

      const chosen = ready[0];
      this.activeId = chosen.id;
      this.onDue(chosen);
    } finally {
      this.checking = false;
    }
  }
}

module.exports = Scheduler;
