// "Dad said yes!" — when a kid opens their page, a small card tells them what happened to their
// requests since they last looked (approved / denied, with the reason). Remembered per device.
import { byId, h } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { fmtSigned } from '../money.js';
import * as storage from '../storage.js';
import { openTxCard } from './txcard.js';
import { store } from '../store.js';

const viewRef = () => store.view;

const KEY = (kidId) => 'seenDecisions_' + kidId;
const FIRST_LOOK_MS = 3 * 24 * 3600 * 1000;      // first time on this device: only the last few days
let showing = null;

export function unseenDecisions(view, kidId, now = Date.now()) {
  const mark = storage.get(KEY(kidId), null);
  const since = mark ? Date.parse(mark) : now - FIRST_LOOK_MS;
  return view.transactions
    .filter(t => t.kidId === kidId && t.role === 'kid' && t.category !== 'Tithing' && t.actedAt
      && (t.status === 'approved' || t.status === 'denied') && Date.parse(t.actedAt) > since)
    .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1));
}

let timer = null;
export function maybeShowDecisions(view, kid) {
  if (showing || timer || !unseenDecisions(view, kid.id).length) return;
  // A beat after the page appears (and never on top of another card or the lock screen).
  timer = setTimeout(() => {
    timer = null;
    if (showing || isOpen() || document.documentElement.classList.contains('app-locked')) return;
    if (!location.hash.includes(encodeURIComponent(kid.id)) && !location.hash.includes(kid.id)) return;
    const list = unseenDecisions(viewRef(), kid.id);
    if (!list.length) return;
    showing = { kidId: kid.id, mark: list[0].actedAt };
    render(list);
    openSheet('decisionSheet', { onClose: markSeen });
  }, 700);
}

function markSeen() {
  if (showing) storage.set(KEY(showing.kidId), showing.mark);
  showing = null;
}

function render(list) {
  const body = byId('decisionSheet').querySelector('.body');
  body.innerHTML = '';
  const yes = list.filter(t => t.status === 'approved').length;
  const no = list.length - yes;
  const title = list.length === 1
    ? `${list[0].actedBy || 'Mom or Dad'} said ${list[0].status === 'approved' ? 'yes!' : 'no'}`
    : (no ? 'Your requests got answers' : 'Your requests were approved!');
  body.append(h('div', { class: 'cardhead' },
    h('div', { class: 'cardicon' }, no && !yes ? '✋' : '🎉'),
    h('div', { class: 'cardtitle' }, h('div', { class: 'ct1', testid: 'decision-title' }, title))));
  const rows = h('div', { class: 'declist', testid: 'decision-list' });
  list.slice(0, 4).forEach(t => {
    const ok = t.status === 'approved';
    const row = h('button', { class: 'decrow ' + (ok ? 'ok' : 'no'), testid: 'decision-' + t.id, onclick: () => { closeSheets(); setTimeout(() => openTxCard(t.id), 360); } },
      h('span', { class: 'dmark' }, ok ? '✓' : '✕'),
      h('span', { class: 'dmain' },
        h('span', { class: 'dnote' }, t.note || t.category || 'Request'),
        h('span', { class: 'dwho' }, `${ok ? 'Yes' : 'No'} from ${t.actedBy || 'a parent'}`)),
      h('span', { class: 'damt num' + (ok ? '' : ' struck') }, fmtSigned(t.amountCents)));
    rows.append(row);
    if (t.reason) rows.append(h('div', { class: 'dreason' }, h('span', { class: 'rq' }, '“'), t.reason, h('span', { class: 'rq' }, '”')));
  });
  if (list.length > 4) rows.append(h('div', { class: 'dmore' }, `+ ${list.length - 4} more in your history`));
  body.append(rows, h('button', { class: 'primary', testid: 'decision-ok', onclick: () => closeSheets() }, 'OK'));
}

export function initDecisions() {
  byId('decisionSheet').querySelector('.cardx').addEventListener('click', () => closeSheets());
}
