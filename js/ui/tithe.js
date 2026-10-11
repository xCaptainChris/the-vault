import { byId, h, confirmTwice, fmtDay, fmtShortTime } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { identity } from '../identity.js';
import { write } from '../actions.js';
import { newId } from '../ids.js';

// ---- Parents: everything waiting to go to church; pay all at once or one kid at a time ----
export function openTithe() { render(); openSheet('titheSheet'); }
export function refreshTithe() {
  if (isOpen('titheSheet')) render();
  if (kidOpen && isOpen('kidTitheSheet')) renderKid();
}

function pay(txIds, cents, label) {
  closeSheets();
  write([['settleTithing', { settleId: newId('s_'), txIds: txIds.slice(), totalCents: cents }]], label, 'success');
}

function render() {
  const v = store.view;
  const owed = S.titheOwed(v);
  const body = byId('titheSheet').querySelector('.body');
  body.innerHTML = '';
  body.append(h('h2', {}, 'Tithing to pay'), h('p', { class: 'sheetnote' }, 'Set aside by the kids and not paid to church yet. Mark it paid when it’s turned in or paid online.'));
  if (!owed.total) {
    body.append(h('div', { class: 'empty', testid: 'tithe-empty' }, 'All paid up 🙌'));
  } else {
    Object.entries(owed.per).sort((a, b) => b[1] - a[1]).forEach(([kidId, cents]) => {
      const k = S.kidById(v, kidId);
      const kt = S.kidTithe(v, kidId);
      const btn = h('button', { class: 'paybtn', testid: 'tithe-pay-' + kidId }, 'Mark paid');
      confirmTwice(btn, 'Confirm', () => pay(kt.txIds, kt.owedCents, `${k ? k.name + '’s' : ''} tithing marked paid 🙌`));
      body.append(h('div', { class: 'legrow titherow', testid: 'tithe-row-' + kidId },
        h('span', { class: 'dot', style: { background: (k && k.color) || '#7ea6ff' } }),
        h('span', { class: 'lname' }, k ? k.name : kidId), h('span', { class: 'lval num' }, fmtCents(cents)), btn));
    });
    body.append(h('div', { class: 'legrow totrow' }, h('span', { class: 'dot', style: { background: '#7ea6ff' } }),
      h('span', { class: 'lname' }, 'Total'), h('span', { class: 'lval num', testid: 'tithe-total' }, fmtCents(owed.total))));
    const kidsWithTithe = Object.keys(owed.per).length;
    const btn = h('button', { class: 'primary', testid: 'tithe-mark' }, kidsWithTithe > 1 ? `Mark all ${fmtCents(owed.total)} paid` : `Mark ${fmtCents(owed.total)} paid`);
    const ids = owed.txIds.slice();
    const total = owed.total;
    confirmTwice(btn, 'Tap again to confirm', () => pay(ids, total, 'Marked as paid 🙌'));
    body.append(btn);
  }
  const last = v.settlements.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 5);
  if (last.length) {
    body.append(h('div', { class: 'flabel' }, 'Paid to church'));
    const list = h('div', { testid: 'tithe-last' });
    last.forEach(s => list.append(h('div', { class: 'legrow sub' },
      h('span', { class: 'lname' }, `${fmtDay(s.ts)} · ${s.user || ''}${s.perKid ? ' · ' + s.perKid.replace(/ \$[\d.]+/g, '').replace(/;/g, ',') : ''}`),
      h('span', { class: 'lval num' }, fmtCents(s.totalCents)))));
    body.append(list);
  }
}

// ---- One kid: "has my tithing been paid?" (kids and parents) ----
let kidOpen = null;

// Small pill under the hero. Null when the kid has never set aside tithing.
export function kidTithePill(view, kid) {
  const kt = S.kidTithe(view, kid.id);
  if (!kt.owedCents && !kt.paid.length) return null;
  const text = kt.owedCents
    ? [h('b', { class: 'num' }, fmtCents(kt.owedCents)), ' tithing waiting']
    : ['Tithing paid ', h('b', {}, '✓'), kt.paid[0] ? ' · ' + fmtDay(kt.paid[0].at) : ''];
  return h('button', { class: 'pill tithepill' + (kt.owedCents ? ' owed' : ' paid'), testid: 'kid-tithe-pill', onclick: () => openKidTithe(kid.id) },
    '⛪ ', ...text, h('span', { class: 'more' }, '›'));
}

export function openKidTithe(kidId) {
  kidOpen = kidId;
  renderKid();
  openSheet('kidTitheSheet', { onClose: () => { kidOpen = null; } });
}

function renderKid() {
  const v = store.view;
  const k = S.kidById(v, kidOpen);
  const body = byId('kidTitheSheet').querySelector('.body');
  body.innerHTML = '';
  if (!k) return;
  const kt = S.kidTithe(v, k.id);
  const own = identity.user && identity.user.role === 'kid' && identity.user.id === k.id;
  body.append(h('div', { class: 'cardhead' }, h('div', { class: 'cardicon' }, '⛪'),
    h('div', { class: 'cardtitle' }, h('div', { class: 'ct1' }, own ? 'My tithing' : k.name + '’s tithing'), h('div', { class: 'ct2' }, 'Goes to church, not to Mom & Dad'))));
  body.append(h('div', { class: 'cardamt num out', testid: 'kid-tithe-owed' }, fmtCents(kt.owedCents)),
    h('div', { class: 'cardstatus ' + (kt.owedCents ? 'wait' : 'ok'), testid: 'kid-tithe-status' }, kt.owedCents ? 'Waiting to be paid' : 'All paid ✓'));
  if (kt.owedRows.length) {
    const info = h('div', { class: 'cardinfo' });
    kt.owedRows.slice(0, 8).forEach(t => info.append(h('div', { class: 'cardrow' },
      h('span', { class: 'cl' }, fmtDay(t.clientTime || t.ts) + ' · ' + (t.note || 'Tithing').replace(/^Tithing · /, '')),
      h('span', { class: 'cv num' }, fmtCents(-t.amountCents)))));
    if (kt.owedRows.length > 8) info.append(h('div', { class: 'cardrow' }, h('span', { class: 'cl' }, `+ ${kt.owedRows.length - 8} more`), h('span')));
    body.append(info);
    if (identity.isParent) {
      const btn = h('button', { class: 'primary', testid: 'kid-tithe-pay' }, `Mark ${fmtCents(kt.owedCents)} paid`);
      confirmTwice(btn, 'Tap again to confirm', () => pay(kt.txIds, kt.owedCents, `${k.name}’s tithing marked paid 🙌`));
      body.append(btn);
    }
  }
  if (kt.paid.length) {
    body.append(h('div', { class: 'flabel' }, 'Paid to church'));
    const list = h('div', { class: 'cardinfo', testid: 'kid-tithe-paid' });
    kt.paid.slice(0, 6).forEach(p => list.append(h('div', { class: 'cardrow' },
      h('span', { class: 'cl' }, fmtShortTime(p.at) + (p.by ? ' · ' + p.by : '')), h('span', { class: 'cv num' }, fmtCents(p.cents)))));
    body.append(list, h('div', { class: 'cardid' }, `${fmtCents(kt.paidCents)} paid to church so far`));
  }
}

export function initKidTithe() {
  byId('kidTitheSheet').querySelector('.cardx').addEventListener('click', () => closeSheets());
}
