'use strict';
const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification,
} = require('electron');

const store = require('./store');
const reminders = require('./reminders');
const Scheduler = require('./scheduler');
const ScheduledReminders = require('./scheduled');
const Overlay = require('./overlay');
const prayer = require('./prayer');
const PrayerAlerts = require('./prayer-alerts');
const cities = require('./cities');

const isMac = process.platform === 'darwin';
const asset = (...p) => path.join(__dirname, '..', '..', 'assets', ...p);

let tray = null;
let settingsWindow = null;
let welcomeWindow = null;
let scheduler = null;
let scheduledReminders = null;
let prayerAlerts = null;
const overlay = new Overlay();

// A second copy would mean two trays and two sets of breaks.
if (!app.requestSingleInstanceLock()) app.quit();

// ---------------------------------------------------------------- breaks

function startBreak() {
  const s = store.load();
  const phrase = reminders.advance();
  overlay.show(
    {
      durationSec: s.breakDurationSec,
      phrase,
      strictMode: s.strictMode,
      playSound: s.playSound,
      title: 'Look away',
      subtitle: 'Focus on something about 20 feet (6 m) away until the ring closes.',
    },
    () => { scheduler.breakFinished(); refreshTray(); },
  );
  refreshTray();
}

function fireScheduled(entry) {
  if (entry.fullScreen) {
    if (overlay.active) return;
    overlay.show(
      {
        durationSec: Math.max(5, entry.durationSec || 15),
        phrase: { primary: entry.label, secondary: '', meaning: '', rtl: !!entry.rtl },
        strictMode: false,
        playSound: store.load().playSound,
        title: 'Reminder',
        subtitle: entry.time,
      },
      () => refreshTray(),
    );
  } else if (Notification.isSupported()) {
    new Notification({ title: 'Sakina', body: entry.label, silent: !store.load().playSound }).show();
  }
}

function firePrayer(entry, isPreWarning) {
  const s = store.load();
  const at = prayer.formatTime(entry.time, s.location.tz);
  const body = isPreWarning
    ? `${entry.name} at ${at} — ${s.prayer.preWarnMin} minutes`
    : `${entry.name} · ${at}`;

  // A heads-up is meant to let you find a stopping point, so it stays a
  // notification even when the prayer itself takes the screen.
  if (s.prayer.style === 'fullscreen' && !isPreWarning) {
    if (overlay.active) return;
    overlay.show(
      {
        durationSec: 20,
        phrase: { primary: entry.arabic, secondary: entry.name, meaning: at, rtl: true },
        strictMode: false,
        playSound: s.playSound,
        title: 'Prayer',
        subtitle: `${s.location.name} · ${at}`,
      },
      () => refreshTray(),
    );
    return;
  }

  if (Notification.isSupported()) {
    new Notification({
      title: isPreWarning ? 'Sakina — coming up' : 'Sakina',
      body,
      silent: !s.playSound,
    }).show();
  }
}

// ---------------------------------------------------------------- windows

function createWindow(file, opts, ref) {
  if (ref && !ref.isDestroyed()) { ref.show(); ref.focus(); return ref; }
  const win = new BrowserWindow({
    width: opts.width,
    height: opts.height,
    minWidth: opts.minWidth || 520,
    minHeight: opts.minHeight || 480,
    title: opts.title,
    show: false,
    backgroundColor: '#12151F',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    icon: isMac ? undefined : path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(file);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  return win;
}

function openSettings() {
  settingsWindow = createWindow(
    path.join(__dirname, '..', 'renderer', 'settings', 'index.html'),
    { width: 720, height: 760, title: 'Sakina Settings' },
    settingsWindow,
  );
  settingsWindow.on('closed', () => { settingsWindow = null; });
  if (isMac) app.dock?.show();
}

function openWelcome() {
  welcomeWindow = createWindow(
    path.join(__dirname, '..', 'renderer', 'welcome', 'index.html'),
    { width: 640, height: 680, title: 'Welcome to Sakina' },
    welcomeWindow,
  );
  welcomeWindow.on('closed', () => { welcomeWindow = null; });
  if (isMac) app.dock?.show();
}

/** No visible windows left → drop back to a menu-bar-only app. */
function maybeHideDock() {
  if (!isMac) return;
  const visible = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible());
  if (!visible && !overlay.active) app.dock?.hide();
}

// ---------------------------------------------------------------- tray

function trayImage(paused) {
  if (isMac) {
    const img = nativeImage.createFromPath(
      asset('tray', paused ? 'trayPausedTemplate.png' : 'trayTemplate.png'));
    img.setTemplateImage(true); // let macOS tint it for light/dark menu bars
    return img;
  }
  return nativeImage.createFromPath(
    asset('tray', paused ? 'tray-win-paused.png' : 'tray-win.png'));
}

function statusLine() {
  if (scheduler.paused) return 'Paused';
  const left = scheduler.remaining();
  if (left == null) return 'Break in progress';
  if (left < 60) return `Next break in ${left}s`;
  return `Next break in ${Math.ceil(left / 60)} min`;
}

function prayerMenuItems() {
  const s = store.load();
  if (!s.prayer.enabled || !s.location) return [];
  const times = prayer.timesFor(0);
  if (!times) return [];

  const upcoming = prayer.next();
  const items = times.map((p) => ({
    label: `${p.notAPrayer ? '  ' : ''}${p.name}${'\u2003'}${prayer.formatTime(p.time, s.location.tz)}` +
           (upcoming && upcoming.key === p.key ? '   ←' : ''),
    enabled: false,
  }));

  return [
    { type: 'separator' },
    { label: `${s.location.name} · ${prayer.countdownLabel() || ''}`, enabled: false },
    ...items,
  ];
}

function refreshTray() {
  if (!tray) return;
  tray.setImage(trayImage(scheduler.paused));

  const s = store.load();
  const countdown = (s.prayer.enabled && s.prayer.showInMenuBar && s.location)
    ? prayer.countdownLabel() : null;

  // Only macOS puts text beside a tray icon; on Windows it goes in the tooltip.
  if (isMac) tray.setTitle(countdown ? ` ${countdown}` : '');
  tray.setToolTip(countdown ? `Sakina — ${statusLine()} · ${countdown}`
                            : `Sakina — ${statusLine()}`);

  const next = reminders.peek();
  const menu = Menu.buildFromTemplate([
    { label: statusLine(), enabled: false },
    { type: 'separator' },
    { label: 'Take a Break Now', click: () => { if (!overlay.active) startBreak(); } },
    { label: 'Snooze 5 Minutes', click: () => { overlay.close(false); scheduler.snooze(300); refreshTray(); } },
    {
      label: scheduler.paused ? 'Resume' : 'Pause',
      click: () => { if (!scheduler.paused) overlay.close(false); scheduler.setPaused(!scheduler.paused); refreshTray(); },
    },
    { type: 'separator' },
    next
      ? { label: `Next: ${(next.secondary || next.primary).slice(0, 42)}`, enabled: false }
      : { label: 'No phrases enabled', enabled: false },
    ...prayerMenuItems(),
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Quit Sakina', accelerator: isMac ? 'Command+Q' : undefined, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ---------------------------------------------------------------- ipc

ipcMain.handle('settings:get', () => ({
  settings: store.load(),
  builtIn: { adhkar: reminders.ADHKAR, quotes: reminders.QUOTES },
  platform: process.platform,
  version: app.getVersion(),
}));

ipcMain.handle('settings:set', (_e, patch) => {
  const before = store.load();
  const after = store.save(patch);
  if (patch.workIntervalMin != null && patch.workIntervalMin !== before.workIntervalMin) {
    scheduler.reset();
  }
  if (patch.launchAtLogin != null) {
    app.setLoginItemSettings({ openAtLogin: !!patch.launchAtLogin, openAsHidden: true });
  }
  refreshTray();
  return after;
});

ipcMain.handle('cities:search', (_e, query) => cities.search(query));

ipcMain.handle('prayer:today', () => {
  const s = store.load();
  if (!s.location) return null;
  const times = prayer.timesFor(0);
  if (!times) return null;
  return {
    location: s.location,
    next: (prayer.next() || {}).key || null,
    times: times.map((p) => ({
      key: p.key, name: p.name, arabic: p.arabic, notAPrayer: !!p.notAPrayer,
      at: prayer.formatTime(p.time, s.location.tz),
    })),
  };
});

ipcMain.handle('prayer:methods', () => prayer.METHODS);

ipcMain.handle('settings:preview', () => { if (!overlay.active) startBreak(); });
ipcMain.handle('settings:openDataFile', () => shell.showItemInFolder(store.file()));
ipcMain.handle('welcome:done', (_e, patch) => {
  // The welcome screen sends only the handful of fields it asks about, so the
  // nested prayer object is merged rather than replaced.
  const merged = { ...patch, firstRunComplete: true };
  if (patch.prayer) merged.prayer = { ...store.load().prayer, ...patch.prayer };
  if (patch.location == null) delete merged.location;
  store.save(merged);
  if (patch.launchAtLogin != null) {
    app.setLoginItemSettings({ openAtLogin: !!patch.launchAtLogin, openAsHidden: true });
  }
  scheduler.reset();
  refreshTray();
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
});

ipcMain.on('break:finished', () => overlay.close(true));
ipcMain.on('break:skipped', () => overlay.close(false));

// ---------------------------------------------------------------- lifecycle

app.on('second-instance', openSettings);
app.on('window-all-closed', (e) => { e.preventDefault?.(); maybeHideDock(); });
app.on('browser-window-closed', maybeHideDock);

app.whenReady().then(() => {
  if (isMac) app.dock?.hide(); // menu-bar app, no Dock icon
  if (!isMac) app.setAppUserModelId('com.anasabuamar.sakina');

  scheduler = new Scheduler({ onBreakDue: startBreak, onChange: () => {} });
  scheduler.start();

  scheduledReminders = new ScheduledReminders(fireScheduled);
  scheduledReminders.start();

  prayerAlerts = new PrayerAlerts(firePrayer);
  prayerAlerts.start();

  tray = new Tray(trayImage(false));
  refreshTray();
  if (!isMac) tray.on('click', () => tray.popUpContextMenu());

  // Refresh the countdown in the tooltip without rebuilding the menu every
  // second — the menu is rebuilt only when it can actually be seen.
  setInterval(() => {
    if (!tray) return;
    const s = store.load();
    const countdown = (s.prayer.enabled && s.prayer.showInMenuBar && s.location)
      ? prayer.countdownLabel() : null;
    if (isMac) tray.setTitle(countdown ? ` ${countdown}` : '');
    tray.setToolTip(countdown ? `Sakina — ${statusLine()} · ${countdown}`
                              : `Sakina — ${statusLine()}`);
  }, 20000);

  if (!store.load().firstRunComplete) openWelcome();
});

app.on('before-quit', () => {
  scheduler?.stop();
  scheduledReminders?.stop();
  prayerAlerts?.stop();
});
