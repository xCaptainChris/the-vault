import { byId, h, esc } from './dom.js';
import { openSheet, isOpen } from './sheet.js';
import { fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';

const PERIODS = [[30, '30 days'], [90, '90 days'], [0, 'All time']];
let ds = { kidId: null, dir: 'out', days: 30 };

export function openDonut(kidId, dir, days = 30) {
  ds = { kidId, dir, days };
  render();
  openSheet('donutSheet');
}
export function refreshDonut() { if (isOpen('donutSheet')) render(); }

function render() {
  const v = store.view;
  const k = S.kidById(v, ds.kidId);
  const body = byId('donutSheet').querySelector('.body');
  body.innerHTML = '';
  body.append(h('h2', { testid: 'donut-title' }, `${k ? k.name : ''} — money ${ds.dir}`));
  body.append(h('div', { class: 'chips', style: { marginBottom: '10px' } }, PERIODS.map(([d, label]) =>
    h('button', { class: 'chip-btn' + (ds.days === d ? ' sel' : ''), testid: 'donut-period-' + d, onclick: () => { ds.days = d; render(); } }, label))));
  const entries = S.catTotals(v, ds.kidId, ds.dir, ds.days);
  if (!entries.length) { body.append(h('div', { class: 'empty', testid: 'donut-empty' }, 'Nothing in this period')); return; }
  const total = entries.reduce((s, e) => s + e.cents, 0);
  const C = 2 * Math.PI * 70;
  let acc = 0;
  let segs = '';
  const legend = h('div', { testid: 'donut-legend' });
  entries.forEach(({ cat, cents }) => {
    const c = S.catByName(v, cat);
    const color = c ? c.color : '#8a8a96';
    const frac = cents / total;
    const len = Math.max(0.5, frac * C - (entries.length > 1 ? 2 : 0));
    segs += `<circle cx="100" cy="100" r="70" fill="none" stroke="${esc(color)}" stroke-width="26" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 100 100)"/>`;
    acc += frac;
    legend.append(h('div', { class: 'legrow', testid: 'donut-leg-' + cat, dataset: { cents: String(cents) } },
      h('span', { class: 'dot', style: { background: color } }),
      h('span', { class: 'lname' }, (c ? c.emoji : '•') + ' ' + cat),
      h('span', { class: 'lpct num' }, Math.round(frac * 100) + '%'),
      h('span', { class: 'lval num' }, fmtCents(cents))));
  });
  const wrap = h('div', { class: 'donut-wrap' });
  wrap.innerHTML = `<svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">${segs}</svg>` +
    `<div class="donut-center"><div><div class="dt">${ds.dir === 'in' ? 'Total in' : 'Total out'}</div><div class="dv num" data-testid="donut-total">${fmtCents(total)}</div></div></div>`;
  body.append(wrap, legend);
}
