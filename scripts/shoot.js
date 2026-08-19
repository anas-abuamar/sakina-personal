'use strict';
// Renders each window to a PNG so the design can be reviewed without opening
// the real app — the Electron equivalent of the Swift build's `--probe overlay`.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const reminders = require('../src/main/reminders');

const out = process.env.REST_SHOT_DIR || path.join(__dirname, '..', 'shots');
const root = path.join(__dirname, '..');

const state = {
  settings: {
    workIntervalMin: 20, breakDurationSec: 20,
    packs: { adhkar: true, quotes: true, custom: true },
    customPhrases: [
      { id: 'a', primary: 'اللَّهُمَّ بَارِكْ لِي فِي وَقْتِي', secondary: 'Allāhumma bārik lī fī waqtī', meaning: 'O Allah, bless my time', rtl: true },
      { id: 'b', primary: 'Ship it, then rest.', secondary: 'me, 2 a.m.', meaning: '', rtl: false },
    ],
    scheduled: [
      { id: 's1', label: 'Dhuhr', time: '13:00', days: [], fullScreen: true, enabled: true },
      { id: 's2', label: 'Stand up and stretch', time: '16:30', days: [1, 2, 3, 4, 5], fullScreen: false, enabled: false },
    ],
    skipWhenAway: true, waitWhilePresenting: true, strictMode: false,
    playSound: false, launchAtLogin: true, cursor: 0, firstRunComplete: true,
  },
  builtIn: { adhkar: reminders.ADHKAR, quotes: reminders.QUOTES },
  platform: process.platform,
  version: '1.0.0',
};

const shots = [
  ['break-adhkar', 'src/renderer/break/index.html', 1440, 900, {
    durationSec: 20, strictMode: false, title: 'Look away',
    subtitle: 'Focus on something about 20 feet (6 m) away until the ring closes.',
    phrase: reminders.ADHKAR[8],
  }],
  ['break-quote', 'src/renderer/break/index.html', 1440, 900, {
    durationSec: 20, strictMode: false, title: 'Look away',
    subtitle: 'Focus on something about 20 feet (6 m) away until the ring closes.',
    phrase: reminders.QUOTES[1],
  }],
  ['settings', 'src/renderer/settings/index.html', 720, 860, null],
  ['welcome', 'src/renderer/welcome/index.html', 640, 760, null],
];

app.commandLine.appendSwitch('force-color-profile', 'srgb');

// Destroying the only window otherwise ends the run: with no listener, Electron
// quits the app when the last window closes.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  try {
  for (const [name, file, width, height, breakPayload] of shots) {
    process.env.REST_FIXTURE = JSON.stringify({ state, breakPayload });
    const win = new BrowserWindow({
      width, height, show: false, backgroundColor: '#12151F',
      webPreferences: {
        preload: path.join(__dirname, 'shoot-preload.js'),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    // Query string differs per shot: loading the identical file:// URL twice
    // back-to-back intermittently returns ERR_FAILED.
    await win.loadFile(path.join(root, file), { query: { shot: name } });
    await new Promise((r) => setTimeout(r, 900));
    // A window taller than the display gets clamped, so long pages are
    // captured as a series of scrolled viewports instead of one tall shot.
    const pages = await win.webContents.executeJavaScript(
      'Math.ceil(document.body.scrollHeight / window.innerHeight)');
    for (let i = 0; i < Math.min(pages, 4); i += 1) {
      await win.webContents.executeJavaScript(`window.scrollTo(0, ${i} * window.innerHeight)`);
      await new Promise((r) => setTimeout(r, 220));
      const img = await win.webContents.capturePage();
      const suffix = pages > 1 ? `-${i + 1}` : '';
      fs.writeFileSync(path.join(out, `${name}${suffix}.png`), img.toPNG());
    }
    console.log('shot:', name, pages > 1 ? `(${Math.min(pages, 4)} parts)` : '');
    win.destroy();
    await new Promise((r) => setTimeout(r, 250));
  }
  } catch (err) { console.error('SHOOT FAILED:', err && err.message, err && err.stack); }
  app.quit();
});
