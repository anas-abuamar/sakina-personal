<div align="center">
  <img src="build/icon.png" width="104" alt="">
  <h1>Sakina · سكينة</h1>
  <p><em>Stillness, on a timer.</em></p>
</div>

Sakina is a menu-bar / system-tray app for **macOS and Windows** that interrupts
you on purpose. You write the prompts and set how often each one fires. Every
display dims, a ring counts down, and your own words sit in the middle of it.

*Look away* every 20 minutes. *Stand up and walk* every hour. *Say what you just
read, out loud* every 90 minutes. Each on its own clock, in your own words.

It also knows the five prayer times where you are, and can tell you before each
one arrives.

All of it exists for one reason: nothing about staring at a screen reminds you
to stop staring at a screen.

![A break screen showing a dhikr](docs/screenshots/break-adhkar.png)

![A custom movement prompt](docs/screenshots/break-walk.png)

## Install

Grab a build from [Releases](../../releases), or build it yourself:

```bash
npm install && npm start
```

To produce installers — `.dmg` for macOS, `.exe` for Windows:

```bash
npm run dist
```

Neither build is code-signed, so first launch needs *Open Anyway* in
**System Settings → Privacy & Security** on macOS, or *More info → Run anyway*
on Windows SmartScreen.

## What it does

| | |
| --- | --- |
| **Your prompts** | Any words you like, each with its own interval and length. Every display, above full-screen apps. |
| **Prayer times** | Fajr through Isha for your city, with a heads-up before each. |
| **Phrases** | 9 adhkar with transliteration, plus anything you add, shown under a prompt. |
| **Timed reminders** | Your own, at a clock time — as a notification or a full screen. |
| **Skips** | Won't interrupt you when you're away, presenting, or on a call. |
| **Strict mode** | Removes the Esc shortcut when you don't trust yourself. |

**Esc** skips a break. The overlay takes keyboard focus on purpose, so whatever
you type during a break lands nowhere instead of in your document.

**Nothing leaves your machine.** No account, no network call, no analytics —
prayer times are computed locally and the city list ships with the app. Settings
are a JSON file you can open from the settings window.

## Prayer times

Computed on-device with [adhan](https://github.com/batoulapps/adhan-js), so they
work on a plane with the wifi off.

- **13 calculation methods** — Muslim World League, ISNA, Umm al-Qura, Karachi,
  Diyanet, and the rest. Use whichever your local mosque follows.
- **Both Asr opinions** — standard (Shafiʼi, Maliki, Hanbali) or Hanafi.
- **Per-prayer** toggles, so Fajr can stay silent while the rest don't.
- **A heads-up** 5–20 minutes before, as a notification, so you can find a
  stopping point instead of being interrupted cold.
- **In the menu bar** — "Asr in 42m" beside the icon. macOS only; Windows has no
  room for text in the tray, so it goes in the tooltip.

![Prayer times in settings](docs/screenshots/settings-3.png)

Your city is chosen from a bundled list of ~34,000 places, matched by prefix and
insensitive to accents, so *krako* finds *Kraków*. The list loads on first
search rather than at startup — a tray app has no business parsing two megabytes
to show a menu.

## Prompts

A prompt is a title, an optional line underneath, an interval, and a duration.
That is the whole model. The default one says *Look away* every 20 minutes for
20 seconds, and every part of it is editable, including the words.

Each prompt runs its own clock, so they drift in and out of step naturally.
When two come due at once only one fires; the other waits a couple of minutes
rather than stacking a second full-screen overlay on top of the first.

A prompt can optionally show a rotating **phrase** underneath its title:

- **Adhkar** — 9 short phrases in Arabic, with transliteration and translation,
  short enough to say two or three times with your eyes off the screen.
- **Your own** — any text, with an optional right-to-left toggle.

Phrases rotate **in order** so you see the whole set instead of the same two
lines all morning.

## The two guards

A full-screen overlay is an unusually rude thing to get wrong, so it checks
before covering anything:

- **Away** — skipped if there's been no keyboard or mouse input for *five*
  minutes. The long threshold is deliberate. Idle input is a poor proxy for
  rested eyes: reading a page for four minutes without touching anything is
  peak strain, and a thirty-second threshold would cancel exactly the breaks
  you most need.
- **Presenting** — postponed while you're on a call, sharing a screen, or
  watching something. Rather than dropping the cycle it retries every 60
  seconds, so the break lands as soon as you're free.

Waking, unlocking, or returning from sleep restarts the interval instead of
firing a break the instant the lid opens.

Each platform answers "is now a bad time" differently:

| | macOS | Windows |
| --- | --- | --- |
| Idle | `powerMonitor.getSystemIdleTime` | same |
| Presenting | `pmset -g assertions` — display-sleep assertions | `SHQueryUserNotificationState` — presentation mode, full-screen D3D, Focus Assist |

Both fail *open*: if the check errors, the break happens. The worst case is a
break you'd rather have deferred, never a break that silently stops happening.

## Platform status

**macOS** — developed and verified here. The overlay is confirmed reaching the
screen at screen-saver level across every display and clearing afterwards. The
prayer engine has been checked against an independent NOAA solar-position
implementation across 16 cities and 4 dates: every time agrees within about two
minutes, and the result is byte-identical whatever timezone the machine itself
is set to.

Known limits: inside the polar circles the times are adhan's *Aqrab Balad*
approximation — ordered and usable, but at Tromsø in December they compress into
a 71-minute notional day (Dhuhr 11:43, Asr 11:47). That is inherent to the
problem, not a bug, but do not rely on it above the Arctic Circle.

**Windows** — built from the documented APIs but **not yet exercised on a
Windows machine**. Everything except the presenting check is platform-neutral
Electron. If you run it there and something is off, that's the first place to
look. Cross-building the `.exe` from macOS also needs Wine; building on
Windows itself needs nothing extra.

## Development

```bash
npm start                        # run it
npm test                         # the test suite (runs under Electron)
npm run icons                    # regenerate icons from assets/*.svg
npx electron scripts/shoot.js    # screenshot every window to shots/
```

Every case in `test/run.js` is there because something was actually broken —
Isha silently never firing in London, no alerts at all at UTC+14, the scheduler
wedging permanently after an overlay collision. Run it before you touch the
scheduler or the prayer engine.

That last one matters more than it looks. The only other way to check the break
screen is to black out every display and wait twenty seconds, which is useless
when you're iterating on a layout — it's how the phrase-sizing bug and a
show/hide bug in these screenshots got caught.

```
src/main/       per-prompt scheduler, tray, overlay windows, prayer engine
src/preload/    the narrow bridge into each renderer
src/renderer/   break screen, settings, first-run
data/           bundled city list (see Credits)
test/           the suite behind `npm test`
macos-native/   see below
```

`adhan` is pinned to **4.4.3** on purpose: 4.4.4 ships `"type": "module"` while
its own CommonJS build still uses `require()`, so `require('adhan')` throws
*"exports is not defined in ES module scope"* in Electron's main process.

To rebuild the city list, download `cities15000.txt`, `countryInfo.txt`, and
`admin1CodesASCII.txt` from [GeoNames](https://download.geonames.org/export/dump/),
then:

```bash
node scripts/build-cities.js <dir-with-those-files> data/cities.json.gz
```

## macos-native

A separate, self-contained Swift/AppKit implementation of the eye-break half,
written before the cross-platform one. ~700 lines, no runtime, launches
instantly:

```bash
cd macos-native && make run
```

It has one fixed break cycle, the adhkar and the two guards — but no custom
prompts, prayer times, timed reminders, or settings window. Keep it if you want the lighter
native thing on a Mac; ignore it otherwise.

## Credits

- Prayer times: [adhan-js](https://github.com/batoulapps/adhan-js) by Batoul Apps (MIT).
- City data: [GeoNames](https://www.geonames.org), licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

MIT — see [LICENSE](LICENSE).
