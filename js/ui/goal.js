import { byId, h } from './dom.js';
import { openSheet, closeSheets } from './sheet.js';
import { parseCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { identity } from '../identity.js';
import { write } from '../actions.js';

// Parents can set any kid's goal; a kid can set their own (a goal moves no money).
export function canEditGoal(kidId) {
  const u = identity.user;
  if (!u) return false;
  if (u.role === 'parent') return !!identity.session;
  return u.role === 'kid' && u.id === kidId;
}

export function openGoal(kidId) {
  const k = S.kidById(store.view, kidId);
  if (!k || !canEditGoal(kidId)) return;
  const own = identity.user && identity.user.role === 'kid';
  const body = byId('goalSheet').querySelector('.body');
  body.innerHTML = '';
  const name = h('input', { class: 'text-in', testid: 'goal-name', placeholder: 'New bike', maxlength: '40', value: k.goalName || '', enterkeyhint: 'next' });
  const amt = h('input', { class: 'amount-in num', testid: 'goal-amount', inputmode: 'decimal', placeholder: '$0.00',
    value: k.goalCents ? (k.goalCents / 100).toFixed(2) : '', enterkeyhint: 'done' });
  const err = h('div', { class: 'errline', testid: 'goal-error', hidden: true });
  const parts = [
    h('h2', {}, own ? 'My goal' : `${k.name}’s goal`),
    h('div', { class: 'flabel' }, own ? 'What are you saving for?' : 'Goal name'), name,
    h('div', { class: 'flabel' }, 'Target amount'), amt, err,
    h('button', { class: 'primary', testid: 'goal-save', onclick: () => {
      const c = parseCents(amt.value);
      const n = name.value.trim();
      if (!n) { err.hidden = false; err.textContent = 'Give the goal a name'; return; }
      if (!c) { err.hidden = false; err.textContent = 'Enter a target amount'; return; }
      closeSheets();
      write([['setGoal', { kidId: k.id, goalName: n, goalCents: c }]], 'Goal saved');
    } }, 'Save goal'),
  ];
  if (k.goalCents > 0) {
    parts.push(h('button', { class: 'primary ghost', testid: 'goal-clear', onclick: () => {
      closeSheets();
      write([['setGoal', { kidId: k.id, goalName: '', goalCents: 0 }]], 'Goal removed');
    } }, 'Remove goal'));
  }
  body.append(...parts);
  openSheet('goalSheet');
}
