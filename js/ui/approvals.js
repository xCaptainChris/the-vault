import { byId, h, ago } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { fmtSigned, fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { write } from '../actions.js';
import { openEntryEdit } from './entry.js';
import { reasonField, DENY_PRESETS } from './reason.js';

// Per-card UI state survives re-renders (polls/syncs): mode 'deny' | 'note', and the typed reason.
const cardState = new Map();
const stateOf = (id) => cardState.get(id) || {};

export function openApprovals() {
  cardState.clear();
  render();
  openSheet('approveSheet');
}

export function refreshApprovals() {
  if (!isOpen('approveSheet')) return;
  if (!S.requestGroups(store.view).length) { closeSheets(); return; }
  // Don't yank the keyboard away while someone is typing a reason.
  const a = document.activeElement;
  if (a && a.tagName === 'INPUT' && byId('approveSheet').contains(a)) return;
  render();
}

function decide(t, status) {
  const reason = (stateOf(t.id).text || '').trim();
  cardState.delete(t.id);
  const body = { id: t.id, status };
  if (reason) body.reason = reason;
  write([['setStatus', body]], status === 'approved' ? 'Approved' : 'Denied', status === 'approved' ? 'success' : 'warn');
}

function setMode(id, mode) {
  cardState.set(id, { ...stateOf(id), mode });
  render();
  const inp = byId('approveSheet').querySelector(`[data-testid="reason-${id}"]`);
  if (inp) setTimeout(() => inp.focus(), 30);
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
    const kidName = kid ? kid.name : t.kidName;
    const catEmoji = S.catByName(v, t.category)?.emoji || '';
    const meta = [t.deviceName ? 'requested on ' + t.deviceName : (t.user ? 'by ' + t.user : ''), ago(S.when(t))].filter(Boolean).join(' · ');
    const st = stateOf(t.id);
    const card = h('div', { class: 'apcard' + (st.mode === 'deny' ? ' denying' : ''), testid: 'approval-card-' + t.id },
      h('button', { class: 'apbody', testid: 'approval-body-' + t.id, onclick: () => openEntryEdit(t.id) },
        h('div', { class: 'aptop' },
          h('span', {}, `${kid ? (kid.emoji ? kid.emoji + ' ' : '') + kid.name : t.kidName} · ${catEmoji} ${t.category}`),
          h('span', { class: 'num ' + (t.amountCents >= 0 ? 'txamt in' : 'txamt out') }, fmtSigned(t.amountCents))),
        h('div', {}, t.note || ''),
        g.tithe && h('div', { class: 'apmeta', testid: 'approval-tithe-' + t.id }, `(−${fmtCents(-g.tithe.amountCents)} tithing)`),
        balLine(v, t, g),
        h('div', { class: 'apmeta' }, meta)));

    if (st.mode) {
      const rf = reasonField({ kidName, presets: st.mode === 'deny' ? DENY_PRESETS : [], value: st.text || '', testid: 'reason-' + t.id,
        onInput: (val) => cardState.set(t.id, { ...stateOf(t.id), text: val }) });
      card.append(rf.el);
    }
    if (st.mode === 'deny') {
      card.append(h('div', { class: 'approve-row' },
        h('button', { class: 'btn-deny-go', testid: 'deny-confirm-' + t.id, onclick: () => decide(t, 'denied') }, 'Deny'),
        h('button', { class: 'btn-no plain', testid: 'deny-cancel-' + t.id, onclick: () => { cardState.delete(t.id); render(); } }, 'Cancel')));
    } else {
      card.append(h('div', { class: 'approve-row' },
        h('button', { class: 'btn-ok', testid: 'approve-' + t.id, onclick: () => decide(t, 'approved') }, 'Approve'),
        h('button', { class: 'btn-no', testid: 'deny-' + t.id, onclick: () => setMode(t.id, 'deny') }, 'Deny…')));
      if (!st.mode) card.append(h('button', { class: 'linkbtn addnote', testid: 'add-reason-' + t.id, onclick: () => setMode(t.id, 'note') }, '＋ Add a note'));
    }
    body.append(card);
  });
}

// Spends show what the balance would become, so a parent can't approve a kid below zero by accident.
function balLine(v, t, g) {
  if (t.amountCents >= 0) return null;
  const before = S.balanceOf(v, t.kidId);
  const after = before + t.amountCents + (g.tithe ? g.tithe.amountCents : 0);
  return h('div', { class: 'apbal' + (after < 0 ? ' neg' : ''), testid: 'approval-bal-' + t.id },
    'Balance ', h('b', { class: 'num' }, fmtCents(before)), ' → ', h('b', { class: 'num' }, fmtCents(after)), after < 0 ? ' ⚠️' : '');
}
