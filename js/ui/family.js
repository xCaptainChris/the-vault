import { byId, h } from './dom.js';
import { openSheet, isOpen } from './sheet.js';
import { fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';

export function openFamily() { render(); openSheet('familySheet'); }
export function refreshFamily() { if (isOpen('familySheet')) render(); }

function render() {
  const sum = S.owedSummary(store.view);
  const body = byId('familySheet').querySelector('.body');
  body.innerHTML = '';
  body.append(h('h2', {}, 'What you’re holding'), h('p', { class: 'sheetnote' }, 'The kids’ money plus tithing you haven’t sent yet.'));
  sum.kids.forEach(({ kid, cents }) => body.append(h('div', { class: 'legrow', testid: 'family-row-' + kid.id },
    h('span', { class: 'dot', style: { background: kid.color } }),
    h('span', { class: 'lname' }, (kid.emoji ? kid.emoji + ' ' : '') + kid.name + (kid.archived ? ' (hidden)' : '')),
    h('span', { class: 'lval num' + (cents < 0 ? ' neg' : '') }, fmtCents(cents)))));
  body.append(
    h('div', { class: 'legrow totrow' }, h('span', { class: 'lname' }, 'Kids’ money'), h('span', { class: 'lval num', testid: 'family-kids-total' }, fmtCents(sum.kidsTotal))),
    h('div', { class: 'legrow' }, h('span', { class: 'lname' }, '⛪ Tithing to send'), h('span', { class: 'lval num', testid: 'family-tithe' }, fmtCents(sum.tithe))),
    h('div', { class: 'legrow totrow' }, h('span', { class: 'lname' }, 'Total you should be holding'), h('span', { class: 'lval num', testid: 'family-total' }, fmtCents(sum.total))));
}
