'use strict';

const el = (id) => document.getElementById(id);
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const INTERVALS = [15, 20, 25, 30, 45, 60];
const DURATIONS = [20, 30, 45, 60];

let state = null;
let draftDays = [];

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

function render() {
  const s = state.settings;

  fillSelect(el('interval'), INTERVALS, s.workIntervalMin, (v) => `${v} minutes`);
  fillSelect(el('duration'), DURATIONS, s.breakDurationSec, (v) => `${v} seconds`);

  el('adhkar-count').textContent = `${state.builtIn.adhkar.length} short phrases in Arabic.`;
  el('quotes-count').textContent = `${state.builtIn.quotes.length} lines on rest and attention.`;
  el('custom-count').textContent = `${s.customPhrases.length} added.`;

  el('pack-adhkar').checked = s.packs.adhkar;
  el('pack-quotes').checked = s.packs.quotes;
  el('pack-custom').checked = s.packs.custom;

  for (const key of ['skipWhenAway', 'waitWhilePresenting', 'strictMode', 'playSound', 'launchAtLogin']) {
    el(key).checked = !!s[key];
  }

  el('presenting-note').textContent = state.platform === 'darwin'
    ? 'Postpone while something holds the display awake — video, calls, screen sharing.'
    : 'Postpone during presentation mode, full-screen apps, and Focus Assist.';

  el('version').textContent = `Rest ${state.version}`;

  renderCustom();
  renderScheduled();
  renderDayPicker();
}

function wire() {
  el('interval').addEventListener('change', (e) =>
    commit({ workIntervalMin: Number(e.target.value) }));
  el('duration').addEventListener('change', (e) =>
    commit({ breakDurationSec: Number(e.target.value) }));

  for (const [id, key] of [['pack-adhkar', 'adhkar'], ['pack-quotes', 'quotes'], ['pack-custom', 'custom']]) {
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

  el('preview').addEventListener('click', () => window.rest.preview());
  el('reveal').addEventListener('click', () => window.rest.openDataFile());
}

(async () => {
  state = await window.rest.get();
  wire();
  render();
})();
