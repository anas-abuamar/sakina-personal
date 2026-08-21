'use strict';

const el = (id) => document.getElementById(id);
const CIRCUMFERENCE = 2 * Math.PI * 90;

let endsAt = null;
let finished = false;
let strict = false;

/** Size the phrase by how much of it there is, then shrink until it fits.
 *  A two-word dhikr wants display size; a full sentence at that size stops
 *  being glanceable and turns the break into more reading — which is exactly
 *  what the break is for avoiding. */
function fitPrimary(node, text) {
  const H = window.innerHeight;
  const len = text.length;
  let size = len <= 26 ? H * 0.048 : len <= 64 ? H * 0.034 : H * 0.026;
  size = Math.max(20, Math.min(size, 52));

  const apply = () => node.style.setProperty('--primary-size', `${size}px`);
  apply();

  const limitW = window.innerWidth * 0.86;
  const limitH = H * 0.28;
  let guard = 40;
  while (guard-- > 0 && size > 15) {
    if (node.scrollWidth <= limitW && node.scrollHeight <= limitH) break;
    size -= 2;
    apply();
  }
}

function paint(payload) {
  el('title').textContent = payload.title || 'Look away';
  el('subtitle').textContent = payload.subtitle || '';

  const p = payload.phrase;
  if (p && p.primary) {
    // textContent, never innerHTML: custom phrases are user-authored text and
    // must never be parsed as markup.
    const primary = el('primary');
    primary.textContent = p.primary;
    primary.setAttribute('dir', p.rtl ? 'rtl' : 'ltr');
    if (p.rtl) primary.lang = 'ar';
    el('secondary').textContent = p.secondary || '';
    el('meaning').textContent = p.meaning || '';
    el('phrase').hidden = false;
    fitPrimary(primary, p.primary);
  } else {
    el('phrase').hidden = true;
  }

  strict = !!payload.strictMode;
  el('hint').hidden = strict;

  const duration = Math.max(1, payload.durationSec || 20);
  endsAt = Date.now() + duration * 1000;
  el('count').textContent = String(duration);

  const ring = el('ring');
  ring.style.transition = 'none';
  ring.style.strokeDashoffset = '0';
  // Force a reflow so the transition starts from a committed 0 offset rather
  // than being collapsed into the same frame as the target value.
  void ring.getBoundingClientRect();
  ring.style.transition = `stroke-dashoffset ${duration}s linear`;
  ring.style.strokeDashoffset = String(CIRCUMFERENCE);

  requestAnimationFrame(() => document.body.classList.add('visible'));
  tick();
}

function tick() {
  if (finished || endsAt == null) return;
  const left = Math.ceil((endsAt - Date.now()) / 1000);
  el('count').textContent = String(Math.max(0, left));
  if (left <= 0) {
    finished = true;
    window.rest.finished();
    return;
  }
  setTimeout(tick, 200);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !strict && !finished) {
    finished = true;
    window.rest.skipped();
  }
});

window.rest.onShow(paint);
