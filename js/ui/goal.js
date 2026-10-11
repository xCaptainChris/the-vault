import { byId, h } from './dom.js';
import { openSheet, closeSheets } from './sheet.js';
import { parseCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { write } from '../actions.js';

export function openGoal(kidId) {
  const k = S.kidById(store.view, kidId);
  if (!k) return;
  const body = byId('goalSheet').querySelector('.body');
  body.innerHTML = '';
  const name = h('input', { class: 'text-in', testid: 'goal-name', placeholder: 'New bike', maxlength: '40', value: k.goalName || '' });
  const amt = h('input', { class: 'amount-in num', testid: 'goal-amount', inputmode: 'decimal', placeholder: '$0.00',
    value: k.goalCents ? (k.goalCents / 100).toFixed(2) : '' });
  const err = h('div', { class: 'errline', testid: 'goal-error', hidden: true });
  body.append(h('h2', {}, `${k.name}’s goal`),
    h('div', { class: 'flabel' }, 'Goal name'), name,
    h('div', { class: 'flabel' }, 'Target amount'), amt, err,
    h('button', { class: 'primary', testid: 'goal-save', onclick: () => {
      const c = parseCents(amt.value);
      const n = name.value.trim();
      if (!c) { err.hidden = false; err.textContent = 'Enter a target amount'; return; }
      if (!n) { err.hidden = false; err.textContent = 'Give the goal a name'; return; }
      closeSheets();
      write([['setGoal', { kidId: k.id, goalName: n, goalCents: c }]], 'Goal saved');
    } }, 'Save goal'),
    k.goalCents > 0 && h('button', { class: 'primary ghost', testid: 'goal-clear', onclick: () => {
      closeSheets();
      write([['setGoal', { kidId: k.id, goalName: '', goalCents: 0 }]], 'Goal removed');
    } }, 'Remove goal'));
  openSheet('goalSheet');
}
