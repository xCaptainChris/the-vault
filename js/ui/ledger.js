import { byId, h, fmtDay } from './dom.js';
import { fmtCents, fmtSigned } from '../money.js';
import * as S from '../selectors.js';
import { openTxCard } from './txcard.js';

export const CAT_ICON_FALLBACK = { in: '💵', out: '💸' };
let openCtx = '';             // scroll resets on a change of kid page or user

export function catIcon(view, name, cents) {
  const c = S.catByName(view, name);
  return c ? c.emoji : (cents >= 0 ? CAT_ICON_FALLBACK.in : CAT_ICON_FALLBACK.out);
}

export function renderLedger(view, kid, parent) {
  const box = byId('kidLedger');
  const ctx = kid.id + '|' + (parent ? 'p' : 'k');
  if (ctx !== openCtx) { openCtx = ctx; box.scrollTop = 0; }
  const keepScroll = box.scrollTop;
  box.innerHTML = '';
  const rows = view.transactions.filter(t => t.kidId === kid.id && (parent || t.status !== 'void'));
  if (!rows.length) {
    box.append(h('div', { class: 'txrow empty' }, 'No entries yet — add the first one.'));
    return;
  }
  S.monthGroups(rows).forEach(g => {
    box.append(h('div', { class: 'monthhdr', testid: 'month-header' },
      h('span', {}, g.label),
      h('span', { class: 'num' }, h('span', { class: 'mi' }, fmtSigned(g.inCents)), ' / ', h('span', { class: 'mo' }, '−' + fmtCents(g.outCents)))));
    g.rows.forEach(t => box.append(txItem(view, t)));
  });
  box.scrollTop = keepScroll;
}

function txItem(view, t) {
  const dir = t.amountCents >= 0 ? 'in' : 'out';
  const local = t._local || t._pending;
  const cls = 'txrow' + (t.status === 'pending' ? ' pend' : '') + (t.status === 'void' ? ' voided' : '') + (t.status === 'denied' ? ' denied' : '');
  const desc = h('div', { class: 'txdesc' }, t.note || t.category || 'Entry');
  if (t.status === 'pending') desc.append(' ', h('span', { class: 'pendtag', testid: 'pending-tag' }, 'pending'));
  if (t.status === 'denied') desc.append(' ', h('span', { class: 'deniedtag', testid: 'denied-tag' }, 'denied'));
  if (t.status === 'void') desc.append(' ', h('span', { class: 'voidtag' }, 'void'));
  if (t.reason) desc.append(' ', h('span', { class: 'notetag', title: 'Has a note' }, '💬'));
  if (t.category === 'Tithing' && t.settledAt) desc.append(' ', h('span', { class: 'paidtag', testid: 'tithe-paid-tag' }, '✓ paid'));
  if (local) desc.append(' ', h('span', { class: 'localtag', testid: 'local-tag', title: 'Not synced yet' }, '⏳'));
  const row = h('div', { class: cls, testid: 'tx-row-' + t.id, role: 'button', tabindex: '0' },
    h('div', { class: 'txicon' }, catIcon(view, t.category, t.amountCents)),
    h('div', { class: 'txmain' }, desc, h('div', { class: 'txmeta' }, [fmtDay(S.when(t)), t.category].filter(Boolean).join(' · '))),
    h('div', { class: 'txamt num ' + dir, testid: 'tx-amount-' + t.id }, fmtSigned(t.amountCents)));
  const open = () => openTxCard(t.id);
  row.addEventListener('click', open);
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return h('div', { class: 'txwrap' }, row);
}
