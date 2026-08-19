'use strict';
const path = require('path');
const { BrowserWindow, screen } = require('electron');

/** One borderless window per display, floating above full-screen apps.
 *  Windows are created fresh each break and destroyed after: keeping them
 *  around costs a process per display for 20 seconds of use every 20 minutes,
 *  and going stale across display changes is a real bug (unplug a monitor
 *  mid-day and a cached window is sized for hardware that is gone). */
class Overlay {
  constructor() {
    this.windows = [];
    this.onFinish = null;
    this.timer = null;
  }

  get active() { return this.windows.length > 0; }

  show(payload, onFinish) {
    if (this.active) return;
    this.onFinish = onFinish;

    for (const display of screen.getAllDisplays()) {
      const win = new BrowserWindow({
        ...display.bounds,
        frame: false,
        transparent: false,
        backgroundColor: '#000000',
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        alwaysOnTop: true,
        webPreferences: {
          preload: path.join(__dirname, '..', 'preload', 'break.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      // 'screen-saver' is the level that clears full-screen apps on both
      // platforms; visibleOnFullScreen is the macOS half of the same idea.
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.loadFile(path.join(__dirname, '..', 'renderer', 'break', 'index.html'));
      win.once('ready-to-show', () => {
        win.showInactive();
        win.webContents.send('break:show', payload);
      });
      this.windows.push(win);
    }

    // Focus the primary so Esc reaches us — anything typed during a break
    // should land nowhere rather than in whatever document was in front.
    if (this.windows[0] && !payload.strictMode) {
      this.windows[0].focus();
    }

    // Backstop: the renderer drives the countdown, but a wedged renderer must
    // never leave every display covered.
    const ms = (payload.durationSec + 3) * 1000;
    this.timer = setTimeout(() => this.close(true), ms);
  }

  close(completed) {
    if (!this.active) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const closing = this.windows;
    this.windows = [];
    for (const win of closing) {
      if (!win.isDestroyed()) win.destroy();
    }
    const done = this.onFinish;
    this.onFinish = null;
    if (done) done(!!completed);
  }
}

module.exports = Overlay;
