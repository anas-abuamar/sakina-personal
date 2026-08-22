'use strict';

const el = (id) => document.getElementById(id);
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const INTERVALS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180];
const DURATIONS = [10, 20, 30, 45, 60, 90, 120];

let state = null;
let draftDays = [];
let methods = [];
let searchSeq = 0;

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function commit(patch) {
  state.settings = await window.rest.set(patch);
  render();
}

/** Build an element and set text via textContent — user phrases are never
 *  parsed as markup. */
function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function fillSelect(node, values, current, format) {
  node.replaceChildren();
  for (const value of values) {
    const opt = make('option', null, format(value));
    opt.value = String(value);
    if (value === current) opt.selected = true;
    node.appendChild(opt);
  }
}

/** Text fields save on a short delay: committing on every keystroke would
 *  write settings.json and re-arm the scheduler once per character. */
let promptSaveTimer = null;
function savePromptsSoon(prompts) {
  if (promptSaveTimer) clearTimeout(promptSaveTimer);
  state.settings.prompts = prompts;
  promptSaveTimer = setTimeout(() => { commitQuiet({ prompts }); }, 450);
}

async function commitQuiet(patch) {
  state.settings = await window.rest.set(patch);
}

function renderPrompts() {
  const host = el('prompt-list');
  host.replaceChildren();

  state.settings.prompts.forEach((p, index) => {
    const card = make('div', `prompt${p.enabled ? '' : ' off'}`);

    const head = make('div', 'prompt-head');
    const title = document.createElement('input');
    title.type = 'text';
    title.value = p.title;
    title.placeholder = 'What to do — e.g. Stand up and walk';
    title.addEventListener('input', () => {
      const next = state.settings.prompts.map((x, i) =>
        (i === index ? { ...x, title: title.value } : x));
      savePromptsSoon(next);
    });

    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = !!p.enabled;
    on.title = 'Enable this prompt';
    on.addEventListener('change', () => commit({
      prompts: state.settings.prompts.map((x, i) =>
        (i === index ? { ...x, enabled: on.checked } : x)),
    }));

    head.append(title, on);

    const sub = document.createElement('input');
    sub.type = 'text';
    sub.value = p.subtitle || '';
    sub.placeholder = 'A line underneath (optional)';
    sub.addEventListener('input', () => {
      const next = state.settings.prompts.map((x, i) =>
        (i === index ? { ...x, subtitle: sub.value } : x));
      savePromptsSoon(next);
    });

    const when = make('div', 'prompt-when');
    const everyLabel = make('label');
    everyLabel.appendChild(document.createTextNode('every'));
    const every = document.createElement('select');
    fillSelect(every, INTERVALS, p.intervalMin, (v) => (v < 60 ? `${v} min` : `${v / 60} hr`));
    every.addEventListener('change', () => commit({
      prompts: state.settings.prompts.map((x, i) =>
        (i === index ? { ...x, intervalMin: Number(every.value) } : x)),
    }));
    everyLabel.appendChild(every);

    const forLabel = make('label');
    forLabel.appendChild(document.createTextNode('for'));
    const dur = document.createElement('select');
    fillSelect(dur, DURATIONS, p.durationSec, (v) => `${v} sec`);
    dur.addEventListener('change', () => commit({
      prompts: state.settings.prompts.map((x, i) =>
        (i === index ? { ...x, durationSec: Number(dur.value) } : x)),
    }));
    forLabel.appendChild(dur);
    when.append(everyLabel, forLabel);

    const foot = make('div', 'prompt-foot');
    const phraseLabel = make('label', 'inline');
    const phrase = document.createElement('input');
    phrase.type = 'checkbox';
    phrase.checked = p.showPhrase !== false;
    phrase.addEventListener('change', () => commit({
      prompts: state.settings.prompts.map((x, i) =>
        (i === index ? { ...x, showPhrase: phrase.checked } : x)),
    }));
    phraseLabel.append(phrase, make('span', null, 'Show a phrase'));

    const preview = make('button', 'link', 'Preview');
    preview.addEventListener('click', () => window.rest.preview(p.id));

    const remove = make('button', 'icon', 'Remove');
    remove.addEventListener('click', () => commit({
      prompts: state.settings.prompts.filter((_, i) => i !== index),
    }));

    foot.append(phraseLabel, make('div', 'spacer'), preview, remove);
    card.append(head, sub, when, foot);
    host.appendChild(card);
  });

  if (!state.settings.prompts.length) {
    host.appendChild(make('div', 'empty', 'No prompts yet — add one below.'));
  }
}

function renderCustom() {
  const list = el('custom-list');
  list.replaceChildren();
  const items = state.settings.customPhrases;

  if (!items.length) {
    list.appendChild(make('div', 'empty', 'Nothing yet — add a phrase below.'));
    return;
  }

  items.forEach((p) => {
    const row = make('div', 'entry');
    const body = make('div', 'body');
    const primary = make('b', null, p.primary);
    if (p.rtl) { primary.setAttribute('dir', 'rtl'); primary.lang = 'ar'; }
    body.appendChild(primary);
    const sub = [p.secondary, p.meaning].filter(Boolean).join(' · ');
    if (sub) body.appendChild(make('span', null, sub));

    const remove = make('button', 'icon', 'Remove');
    remove.title = 'Remove this phrase';
    remove.addEventListener('click', () => commit({
      customPhrases: state.settings.customPhrases.filter((x) => x.id !== p.id),
    }));

    row.append(body, remove);
    list.appendChild(row);
  });
}

function renderScheduled() {
  const list = el('sched-list');
  list.replaceChildren();
  const items = state.settings.scheduled;

  if (!items.length) {
    list.appendChild(make('div', 'empty', 'No timed reminders.'));
    return;
  }

  items.forEach((entry) => {
    const row = make('div', 'entry');
    const body = make('div', 'body');
    body.appendChild(make('b', null, entry.label));
    const days = (!entry.days || entry.days.length === 0 || entry.days.length === 7)
      ? 'every day'
      : entry.days.slice().sort().map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
    body.appendChild(make('span', null,
      `${entry.time} · ${days}${entry.fullScreen ? ' · covers the screen' : ' · notification'}`));

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!entry.enabled;
    toggle.addEventListener('change', () => commit({
      scheduled: state.settings.scheduled.map((x) =>
        (x.id === entry.id ? { ...x, enabled: toggle.checked } : x)),
    }));

    const remove = make('button', 'icon', 'Remove');
    remove.addEventListener('click', () => commit({
      scheduled: state.settings.scheduled.filter((x) => x.id !== entry.id),
    }));

    row.append(body, toggle, remove);
    list.appendChild(row);
  });
}

function renderDayPicker() {
  const host = el('s-days');
  host.replaceChildren();
  DAY_NAMES.forEach((name, index) => {
    const chip = make('div', `day${draftDays.includes(index) ? ' on' : ''}`, name);
    chip.addEventListener('click', () => {
      draftDays = draftDays.includes(index)
        ? draftDays.filter((d) => d !== index)
        : [...draftDays, index];
      renderDayPicker();
    });
    host.appendChild(chip);
  });
}

async function renderPrayerToday() {
  const host = el('prayer-today');
  const today = await window.rest.prayerToday();
  host.replaceChildren();
  if (!today) {
    host.appendChild(make('div', 'empty', 'Pick a location to see today\u2019s times.'));
    return;
  }
  host.appendChild(make('div', 'block-head',
    `Today \u00b7 ${today.location.name}`));
  const grid = make('div', 'times');
  for (const p of today.times) {
    const cell = make('div', `time${p.key === today.next ? ' next' : ''}${p.notAPrayer ? ' info' : ''}`);
    cell.appendChild(make('div', 'n', p.name));
    cell.appendChild(make('div', 'v', p.at));
    grid.appendChild(cell);
  }
  host.appendChild(grid);

  host.appendChild(make('div', 'block-head', 'Remind me at'));
  const toggles = make('div');
  for (const p of today.times.filter((x) => !x.notAPrayer)) {
    const row = make('div', 'row');
    const label = make('div', 'label');
    label.appendChild(make('b', null, `${p.name}  ${p.arabic}`));
    row.appendChild(label);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.settings.prayer.alerts[p.key] !== false;
    box.addEventListener('change', () => commit({
      prayer: { ...state.settings.prayer,
                alerts: { ...state.settings.prayer.alerts, [p.key]: box.checked } },
    }));
    row.appendChild(box);
    toggles.appendChild(row);
  }
  host.appendChild(toggles);
}

function renderCityResults(list) {
  const host = el('city-results');
  host.replaceChildren();
  for (const city of list) {
    const row = make('div', 'result');
    row.appendChild(document.createTextNode(city.name));
    row.appendChild(make('small', null,
      [city.region, city.country].filter(Boolean).join(', ') + ` · ${city.tz}`));
    row.addEventListener('click', async () => {
      await commit({ location: {
        name: city.name, region: city.region, country: city.country,
        lat: city.lat, lon: city.lon, tz: city.tz,
      } });
      el('city-search').value = '';
      host.replaceChildren();
    });
    host.appendChild(row);
  }
}

function renderPrayer() {
  const p = state.settings.prayer;
  el('prayer-enabled').checked = !!p.enabled;
  el('prayer-body').hidden = !p.enabled;

  fillSelect(el('prayer-method'), methods.map((m) => m[0]), p.method,
    (key) => (methods.find((m) => m[0] === key) || [key, key])[1]);
  el('prayer-madhab').value = p.madhab || 'shafi';
  el('prayer-style').value = p.style || 'notification';
  el('prayer-prewarn').value = String(p.preWarnMin ?? 10);
  el('prayer-menubar').checked = p.showInMenuBar !== false;
  el('menubar-note').textContent = state.platform === 'darwin'
    ? 'A countdown beside the icon, e.g. \u201cAsr in 42m\u201d.'
    : 'Windows has no room for text in the tray \u2014 it goes in the tooltip.';

  const current = el('city-current');
  current.replaceChildren();
  if (state.settings.location) {
    const loc = state.settings.location;
    current.appendChild(document.createTextNode('Using '));
    current.appendChild(make('b', null, loc.name));
    current.appendChild(document.createTextNode(
      ` — ${[loc.region, loc.country].filter(Boolean).join(', ')} · ${loc.tz}`));
  }

  if (p.enabled) renderPrayerToday();
}

function render() {
  const s = state.settings;

  // Defensive: a missing pack must not throw out of render() and leave every
  // other control on the page unset.
  const packSize = (name) => ((state.builtIn && state.builtIn[name]) || []).length;
  el('adhkar-count').textContent = `${packSize('adhkar')} short phrases in Arabic.`;
  el('custom-count').textContent = `${s.customPhrases.length} added.`;

  el('pack-adhkar').checked = s.packs.adhkar;
  el('pack-custom').checked = s.packs.custom;

  for (const key of ['skipWhenAway', 'waitWhilePresenting', 'strictMode', 'playSound', 'launchAtLogin']) {
    el(key).checked = !!s[key];
  }
  // macOS refuses to register a login item for an unsigned build, so say so
  // rather than leaving a toggle that silently does nothing.
  if (state.loginItemBlocked) {
    el('login-note').textContent =
      'macOS refused: this build is not signed. Add Sakina yourself under '
      + 'System Settings \u203a General \u203a Login Items.';
  }

  el('presenting-note').textContent = state.platform === 'darwin'
    ? 'Postpone while something holds the display awake — video, calls, screen sharing.'
    : 'Postpone during presentation mode, full-screen apps, and Focus Assist.';

  el('version').textContent = `Sakina ${state.version}`;

  renderPrompts();
  renderCustom();
  renderScheduled();
  renderDayPicker();
  renderPrayer();
}

function wire() {
  for (const [id, key] of [['pack-adhkar', 'adhkar'], ['pack-custom', 'custom']]) {
    el(id).addEventListener('change', (e) =>
      commit({ packs: { ...state.settings.packs, [key]: e.target.checked } }));
  }

  for (const key of ['skipWhenAway', 'waitWhilePresenting', 'strictMode', 'playSound', 'launchAtLogin']) {
    el(key).addEventListener('change', (e) => commit({ [key]: e.target.checked }));
  }

  el('c-add').addEventListener('click', () => {
    const primary = el('c-primary').value.trim();
    if (!primary) { el('c-primary').focus(); return; }
    commit({
      customPhrases: [...state.settings.customPhrases, {
        id: uid(),
        primary,
        secondary: el('c-secondary').value.trim(),
        meaning: el('c-meaning').value.trim(),
        rtl: el('c-rtl').checked,
      }],
    });
    for (const id of ['c-primary', 'c-secondary', 'c-meaning']) el(id).value = '';
    el('c-rtl').checked = false;
  });

  el('s-add').addEventListener('click', () => {
    const label = el('s-label').value.trim();
    if (!label) { el('s-label').focus(); return; }
    commit({
      scheduled: [...state.settings.scheduled, {
        id: uid(),
        label,
        time: el('s-time').value || '13:00',
        days: draftDays.slice(),
        fullScreen: el('s-full').checked,
        durationSec: 15,
        enabled: true,
      }],
    });
    el('s-label').value = '';
    el('s-full').checked = false;
    draftDays = [];
    renderDayPicker();
  });

  el('prayer-enabled').addEventListener('change', (e) =>
    commit({ prayer: { ...state.settings.prayer, enabled: e.target.checked } }));

  for (const [id, key, cast] of [
    ['prayer-method', 'method', String],
    ['prayer-madhab', 'madhab', String],
    ['prayer-style', 'style', String],
    ['prayer-prewarn', 'preWarnMin', Number],
  ]) {
    el(id).addEventListener('change', (e) =>
      commit({ prayer: { ...state.settings.prayer, [key]: cast(e.target.value) } }));
  }

  el('prayer-menubar').addEventListener('change', (e) =>
    commit({ prayer: { ...state.settings.prayer, showInMenuBar: e.target.checked } }));

  // Sequence-guarded: results from a stale keystroke must never overwrite the
  // list for what is currently typed.
  el('city-search').addEventListener('input', async (e) => {
    const seq = ++searchSeq;
    const query = e.target.value;
    if (query.trim().length < 2) { el('city-results').replaceChildren(); return; }
    let list;
    try {
      list = await window.rest.searchCities(query);
    } catch (err) {
      // Without this the rejection is unhandled and the field just stops
      // responding, with nothing on screen to say why.
      const box = el('city-results');
      box.replaceChildren();
      const note = document.createElement('div');
      note.className = 'result';
      note.textContent = 'Could not load the place list.';
      box.appendChild(note);
      return;
    }
    if (seq === searchSeq) renderCityResults(list);
  });

  el('prompt-add').addEventListener('click', () => {
    commit({
      prompts: [...state.settings.prompts, {
        id: uid(),
        title: '',
        subtitle: '',
        intervalMin: 30,
        durationSec: 30,
        showPhrase: false,
        enabled: true,
      }],
    });
  });

  el('preview').addEventListener('click', () => window.rest.preview());
  el('reveal').addEventListener('click', () => window.rest.openDataFile());
}

(async () => {
  state = await window.rest.get();
  methods = await window.rest.prayerMethods();
  wire();
  render();
})();
