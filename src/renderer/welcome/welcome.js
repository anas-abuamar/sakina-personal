'use strict';

const el = (id) => document.getElementById(id);
const CHOICES = [20, 30, 45];
let interval = 20;

function renderChoices() {
  const host = el('intervals');
  host.replaceChildren();
  for (const value of CHOICES) {
    const node = document.createElement('div');
    node.className = `choice${value === interval ? ' on' : ''}`;
    const big = document.createElement('b');
    big.textContent = String(value);
    const small = document.createElement('span');
    small.textContent = 'minutes';
    node.append(big, small);
    node.addEventListener('click', () => { interval = value; renderChoices(); });
    host.appendChild(node);
  }
}

let chosenCity = null;
let searchSeq = 0;

function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function showCurrent() {
  const host = el('city-current');
  host.replaceChildren();
  if (!chosenCity) return;
  host.appendChild(document.createTextNode('Using '));
  host.appendChild(make('b', null, chosenCity.name));
  host.appendChild(document.createTextNode(
    ` — ${[chosenCity.region, chosenCity.country].filter(Boolean).join(', ')}`));
}

function wirePrayer() {
  const toggle = el('prayer-enabled');
  toggle.addEventListener('change', () => { el('prayer-where').hidden = !toggle.checked; });

  el('city-search').addEventListener('input', async (e) => {
    const seq = ++searchSeq;
    const query = e.target.value;
    const host = el('city-results');
    if (query.trim().length < 2) { host.replaceChildren(); return; }
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
    if (seq !== searchSeq) return;
    host.replaceChildren();
    for (const city of list) {
      const row = make('div', 'result');
      row.appendChild(document.createTextNode(city.name));
      row.appendChild(make('small', null,
        [city.region, city.country].filter(Boolean).join(', ')));
      row.addEventListener('click', () => {
        chosenCity = city;
        el('city-search').value = '';
        host.replaceChildren();
        showCurrent();
      });
      host.appendChild(row);
    }
  });
}

(async () => {
  const { platform } = await window.rest.get();
  el('where').textContent = platform === 'darwin' ? 'menu bar' : 'system tray';
  renderChoices();
  wirePrayer();

  el('done').addEventListener('click', () => {
    window.rest.finishWelcome({
      workIntervalMin: interval,
      packs: {
        adhkar: el('pack-adhkar').checked,
        quotes: el('pack-quotes').checked,
        custom: true,
      },
      launchAtLogin: el('launchAtLogin').checked,
      location: chosenCity ? {
        name: chosenCity.name, region: chosenCity.region, country: chosenCity.country,
        lat: chosenCity.lat, lon: chosenCity.lon, tz: chosenCity.tz,
      } : null,
      // Only actually on if a location was chosen — prayer times without a
      // place would silently do nothing.
      prayer: { enabled: el('prayer-enabled').checked && !!chosenCity },
    });
  });
})();
