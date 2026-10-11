// Tap a history row → a small card pops up with the details: who asked/added it, who approved or
// denied it and why. Parents can approve/deny (with an optional reason), edit or void from here.
import { byId, h, fmtFull, fmtShortTime, fmtDayYear, confirmTwice } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { fmtSigned } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { identity } from '../identity.js';
import { write } from '../actions.js';
import { openEntryEdit } from './entry.js';
import { reasonField, DENY_PRESETS } from './reason.js';

let openId = null;
let draft = '';                // reason being typed (survives re-renders)

const STATUS = {
  pending: { label: 'Waiting for approval', cls: 'wait' },
  approved: { label: 'Approved', cls: 'ok' },
  denied: { label: 'Denied', cls: 'no' },
  void: { label: 'Voided', cls: 'void' },
};

export function openTxCard(txId) {
  openId = txId;
  draft = '';
  if (!render()) return;
  openSheet('txSheet', { onClose: () => { openId = null; draft = ''; } });
}

export function refreshTxCard() {
  if (!openId || !isOpen('txSheet')) return;
  const a = document.activeElement;
  if (a && a.tagName === 'INPUT' && byId('txSheet').contains(a)) return;   // don't yank the keyboard
  if (!render()) closeSheets();
}

function row(label, value, testid) {
  return h('div', { class: 'cardrow', testid }, h('span', { class: 'cl' }, label), h('span', { class: 'cv' }, value));
}

function decide(t, status) {
  const b = { id: t.id, status };
  const reason = draft.trim();
  if (reason) b.reason = reason;
  closeSheets();
  write([['setStatus', b]], status === 'approved' ? 'Approved' : 'Denied', status === 'approved' ? 'success' : 'warn');
}

function render() {
  const v = store.view;
  const t = v.transactions.find(x => x.id === openId);
  const body = byId('txSheet').querySelector('.body');
  body.innerHTML = '';
  if (!t) return false;
  const parent = identity.isParent;
  const kid = S.kidById(v, t.kidId);
  const cat = S.catByName(v, t.category);
  const st = STATUS[t.status] || STATUS.approved;
  const dir = t.amountCents >= 0 ? 'in' : 'out';
  const byKid = t.role === 'kid';

  const card = h('div', { class: 'txcard', testid: 'tx-detail-' + t.id });
  card.append(
    h('div', { class: 'cardhead' },
      h('div', { class: 'cardicon' }, cat ? cat.emoji : (dir === 'in' ? '💵' : '💸')),
      h('div', { class: 'cardtitle' }, h('div', { class: 'ct1' }, t.note || t.category || 'Entry'), h('div', { class: 'ct2' }, [t.category, kid ? kid.name : t.kidName].filter(Boolean).join(' · '))),
    ),
    h('div', { class: 'cardamt num ' + dir + (t.status === 'denied' || t.status === 'void' ? ' struck' : ''), testid: 'tx-card-amount' }, fmtSigned(t.amountCents)),
    h('div', { class: 'cardstatus ' + st.cls, testid: 'tx-card-status' }, st.label),
  );

  const info = h('div', { class: 'cardinfo' });
  const who = (byKid ? 'Asked' : 'Added') + (t.user ? ' by ' + t.user : '');
  info.append(row(who, fmtFull(S.when(t)), 'tx-card-entered'));
  if (t.deviceName || (parent && t.deviceId)) {
    const dev = h('span', {}, t.deviceName || '');
    if (parent && t.deviceId) dev.append(' ', h('span', { class: 'muted', testid: 'tx-device-id' }, '(' + t.deviceId + ')'));
    info.append(row('On', dev));
  }
  if (t.status !== 'pending' && t.actedBy) {
    const verb = { approved: 'Approved by', denied: 'Denied by', void: 'Voided by' }[t.status] || 'Updated by';
    info.append(row(verb + ' ' + t.actedBy, t.actedAt ? fmtShortTime(t.actedAt) : '', 'tx-card-acted'));
  }
  if (t.editedBy) info.append(row('Edited by ' + t.editedBy, t.editedAt ? fmtShortTime(t.editedAt) : ''));
  S.groupOf(v, t).filter(x => x.id !== t.id).forEach(x => {
    info.append(row(x.category === 'Tithing' ? 'Tithing' : 'Linked', fmtSigned(x.amountCents)));
  });
  if (t.settledAt) info.append(row('Sent to church', fmtDayYear(t.settledAt)));
  if (t._local || t._pending) info.append(row('⏳', 'Not synced yet'));
  card.append(info);

  if (t.reason) card.append(h('div', { class: 'cardreason', testid: 'tx-reason' }, h('span', { class: 'rq' }, '“'), t.reason, h('span', { class: 'rq' }, '”')));

  // Parent actions
  if (parent && !t.settledAt && t.status === 'pending') {
    const rf = reasonField({ kidName: kid ? kid.name : '', presets: DENY_PRESETS, value: draft, testid: 'tx-card-reason', onInput: (x) => { draft = x; } });
    card.append(rf.el,
      h('div', { class: 'approve-row' },
        h('button', { class: 'btn-ok', testid: 'tx-card-approve', onclick: () => decide(t, 'approved') }, 'Approve'),
        h('button', { class: 'btn-no', testid: 'tx-card-deny', onclick: () => decide(t, 'denied') }, 'Deny')),
      h('button', { class: 'linkbtn cardlink', testid: 'tx-edit', onclick: () => { closeSheets(); openEntryEdit(t.id); } }, '✎ Change amount or details'));
  } else if (parent && (t.status === 'approved') && t.settledAt) {
    card.append(h('div', { class: 'locked', testid: 'tx-settled-lock' }, 'Settled — can’t edit'));
  } else if (parent && t.status === 'approved') {
    const acts = h('div', { class: 'txactions' });
    acts.append(h('button', { testid: 'tx-edit', onclick: () => { closeSheets(); openEntryEdit(t.id); } }, '✎ Edit'));
    const vb = h('button', { class: 'voidbtn', testid: 'tx-void' }, 'Void');
    confirmTwice(vb, 'Tap again to void', () => { closeSheets(); write([['setStatus', { id: t.id, status: 'void' }]], 'Voided', 'warn'); });
    acts.append(vb);
    card.append(acts);
  }
  card.append(h('div', { class: 'cardid' }, 'ID ' + t.id));
  body.append(card);
  return true;
}

export function initTxCard() {
  byId('txSheet').querySelector('.cardx').addEventListener('click', () => closeSheets());
}
