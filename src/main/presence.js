'use strict';
const { execFile } = require('child_process');
const { powerMonitor } = require('electron');

/** Seconds since the last keyboard or mouse input. Electron implements this on
 *  both macOS and Windows, so it is the one guard that needs no platform code. */
function idleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0; // assume present — a missed skip is better than a missed break
  }
}

const run = (cmd, args, timeout = 4000) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });

/** macOS: any process holding the display awake — video, screen sharing, calls.
 *  `pmset -g assertions` needs no privileges. */
async function macPresenting() {
  const out = await run('/usr/bin/pmset', ['-g', 'assertions']);
  if (out === null) return false;
  return /^\s*PreventUserIdleDisplaySleep\s+1/m.test(out) ||
         /^\s*NoDisplaySleepAssertion\s+1/m.test(out);
}

/** Windows: SHQueryUserNotificationState is the OS's own answer to "is now a
 *  bad time to interrupt" — it reports presentation mode, full-screen D3D, and
 *  Focus Assist. Anything other than ACCEPTS_NOTIFICATIONS (5) means wait.
 *
 *  NOTE: written against the documented API but not exercised on Windows from
 *  this machine. It fails open: any error is treated as "fine to interrupt",
 *  so the worst case is a break you would rather have deferred, never a
 *  break that silently stops happening. */
async function winPresenting() {
  const script = `
$sig = '[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);'
$t = Add-Type -MemberDefinition $sig -Name Q -Namespace W -PassThru
$s = 0
[void]$t::SHQueryUserNotificationState([ref]$s)
Write-Output $s`.trim();
  const out = await run('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  if (out === null) return false;
  const state = parseInt(String(out).trim(), 10);
  if (!Number.isInteger(state) || state <= 0) return false;
  const ACCEPTS_NOTIFICATIONS = 5;
  return state !== ACCEPTS_NOTIFICATIONS;
}

async function isPresenting() {
  try {
    if (process.platform === 'darwin') return await macPresenting();
    if (process.platform === 'win32') return await winPresenting();
  } catch {
    /* fall through */
  }
  return false;
}

module.exports = { idleSeconds, isPresenting };
