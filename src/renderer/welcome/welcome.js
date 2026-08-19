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

(async () => {
  const { platform } = await window.rest.get();
  el('where').textContent = platform === 'darwin' ? 'menu bar' : 'system tray';
  renderChoices();

  el('done').addEventListener('click', () => {
    window.rest.finishWelcome({
      workIntervalMin: interval,
      packs: {
        adhkar: el('pack-adhkar').checked,
        quotes: el('pack-quotes').checked,
        custom: true,
      },
      launchAtLogin: el('launchAtLogin').checked,
    });
  });
})();
