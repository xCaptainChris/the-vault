import { byId, h, ago } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { fmtSigned, fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { write } from '../actions.js';
import { openEntryEdit } from './entry.js';

export function openApprovals() {
  render();
  openSheet('approveSheet');
}

export function refreshApprovals() {
  if (!isOpen('approveSheet')) return;
  if (!S.requestGroups(store.view).length) { closeSheets(); return; }
  render();
}

function render() {
  const v = store.view;
  const body = byId('approveSheet').querySelector('.body');
  body.innerHTML = '';
  const groups = S.requestGroups(v);
  body.append(h('h2', {}, 'Waiting for approval'));
  if (!groups.length) { body.append(h('div', { class: 'empty', testid: 'approvals-empty' }, 'All caught up 🎉')); return; }
  if (groups.length >= 2) {
    body.append(h('button', { class: 'primary apall', testid: 'approve-all', onclick: () => {
      write(groups.map(g => ['setStatus', { id: g.main.id, status: 'approved' }]), `Approved ${groups.length}`, 'success');
      closeSheets();
    } }, `Approve all (${groups.length})`));
  }
  groups.forEach(g => {
    const t = g.main;
    const kid = S.kidById(v, t.kidId);
    const catEmoji = S.catByName(v, t.category)?.emoji || '';
    const meta = [t.deviceName ? 'requested on ' + t.deviceName : (t.user ? 'by ' + t.user : ''), ago(S.when(t))].filter(Boolean).join(' · ');
    const card = h('div', { class: 'apcard', testid: 'approval-card-' + t.id },
      h('button', { class: 'apbody', testid: 'approval-body-' + t.id, onclick: () => openEntryEdit(t.id) },
        h('div', { class: 'aptop' },
          h('span', {}, `${kid ? (kid.emoji ? kid.emoji + ' ' : '') + kid.name : t.kidName} · ${catEmoji} ${t.category}`),
          h('span', { class: 'num ' + (t.amountCents >= 0 ? 'txamt in' : 'txamt out') }, fmtSigned(t.amountCents))),
        h('div', {}, t.note || ''),
        g.tithe && h('div', { class: 'apmeta', testid: 'approval-tithe-' + t.id }, `(−${fmtCents(-g.tithe.amountCents)} tithing)`),
        h('div', { class: 'apmeta' }, meta)),
      h('div', { class: 'approve-row' },
        h('button', { class: 'btn-ok', testid: 'approve-' + t.id, onclick: () => write([['setStatus', { id: t.id, status: 'approved' }]], 'Approved', 'success') }, 'Approve'),
        h('button', { class: 'btn-no', testid: 'deny-' + t.id, onclick: () => write([['setStatus', { id: t.id, status: 'denied' }]], 'Denied', 'warn') }, 'Deny')));
    body.append(card);
  });
}
