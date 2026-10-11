import { byId, h, confirmTwice, fmtDay } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { write } from '../actions.js';
import { newId } from '../ids.js';

export function openTithe() { render(); openSheet('titheSheet'); }
export function refreshTithe() { if (isOpen('titheSheet')) render(); }

function render() {
  const v = store.view;
  const owed = S.titheOwed(v);
  const body = byId('titheSheet').querySelector('.body');
  body.innerHTML = '';
  body.append(h('h2', {}, 'Tithing to send'), h('p', { class: 'sheetnote' }, 'Set aside by the kids since you last sent tithing.'));
  if (!owed.total) {
    body.append(h('div', { class: 'empty', testid: 'tithe-empty' }, 'Nothing set aside right now'));
  } else {
    Object.entries(owed.per).sort((a, b) => b[1] - a[1]).forEach(([kidId, cents]) => {
      const k = S.kidById(v, kidId);
      body.append(h('div', { class: 'legrow', testid: 'tithe-row-' + kidId },
        h('span', { class: 'dot', style: { background: (k && k.color) || '#7ea6ff' } }),
        h('span', { class: 'lname' }, k ? k.name : kidId), h('span', { class: 'lval num' }, fmtCents(cents))));
    });
    body.append(h('div', { class: 'legrow totrow' }, h('span', { class: 'dot', style: { background: '#7ea6ff' } }),
      h('span', { class: 'lname' }, 'Total'), h('span', { class: 'lval num', testid: 'tithe-total' }, fmtCents(owed.total))));
    const btn = h('button', { class: 'primary', testid: 'tithe-mark' }, `Mark ${fmtCents(owed.total)} as sent`);
    const ids = owed.txIds.slice();
    const total = owed.total;
    confirmTwice(btn, 'Tap again to confirm', () => {
      closeSheets();
      write([['settleTithing', { settleId: newId('s_'), txIds: ids, totalCents: total }]], 'Marked as sent 🙌', 'success');
    });
    body.append(btn);
  }
  const last = v.settlements.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 3);
  if (last.length) {
    body.append(h('div', { class: 'flabel' }, 'Last sent'));
    const list = h('div', { testid: 'tithe-last' });
    last.forEach(s => list.append(h('div', { class: 'legrow sub' }, h('span', { class: 'lname' }, `${fmtDay(s.ts)} · ${s.user || ''}`),
      h('span', { class: 'lval num' }, fmtCents(s.totalCents)))));
    body.append(list);
  }
}
