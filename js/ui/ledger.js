import { byId, h, esc, fmtDay, fmtFull, fmtShortTime, fmtDayYear, confirmTwice } from './dom.js';
import { fmtCents, fmtSigned } from '../money.js';
import * as S from '../selectors.js';
import { write } from '../actions.js';
import { openEntryEdit } from './entry.js';

export const CAT_ICON_FALLBACK = { in: '💵', out: '💸' };
let openTxId = null;          // expanded row survives re-renders…
let openCtx = '';             // …but not a change of kid page or user

export function catIcon(view, name, cents) {
  const c = S.catByName(view, name);
  return c ? c.emoji : (cents >= 0 ? CAT_ICON_FALLBACK.in : CAT_ICON_FALLBACK.out);
}

export function renderLedger(view, kid, parent) {
  const box = byId('kidLedger');
  const ctx = kid.id + '|' + (parent ? 'p' : 'k');
  if (ctx !== openCtx) { openCtx = ctx; openTxId = null; box.scrollTop = 0; }
  const keepScroll = box.scrollTop;
  box.innerHTML = '';
  const rows = view.transactions.filter(t => t.kidId === kid.id && t.status !== 'denied' && (parent || t.status !== 'void'));
  if (!rows.length) {
    box.append(h('div', { class: 'txrow empty' }, 'No entries yet — add the first one.'));
    return;
  }
  S.monthGroups(rows).forEach(g => {
    box.append(h('div', { class: 'monthhdr', testid: 'month-header' },
      h('span', {}, g.label),
      h('span', { class: 'num' }, h('span', { class: 'mi' }, fmtSigned(g.inCents)), ' / ', h('span', { class: 'mo' }, '−' + fmtCents(g.outCents)))));
    g.rows.forEach(t => box.append(txItem(view, t, parent)));
  });
  box.scrollTop = keepScroll;
}

function txItem(view, t, parent) {
  const dir = t.amountCents >= 0 ? 'in' : 'out';
  const local = t._local || t._pending;
  const cls = 'txrow' + (t.status === 'pending' ? ' pend' : '') + (t.status === 'void' ? ' voided' : '');
  const desc = h('div', { class: 'txdesc' }, t.note || t.category || 'Entry');
  if (t.status === 'pending') desc.append(' ', h('span', { class: 'pendtag', testid: 'pending-tag' }, 'pending'));
  if (t.status === 'void') desc.append(' ', h('span', { class: 'voidtag' }, 'void'));
  if (local) desc.append(' ', h('span', { class: 'localtag', testid: 'local-tag', title: 'Not synced yet' }, '⏳'));
  const row = h('div', { class: cls, testid: 'tx-row-' + t.id, role: 'button', tabindex: '0', 'aria-expanded': String(openTxId === t.id) },
    h('div', { class: 'txicon' }, catIcon(view, t.category, t.amountCents)),
    h('div', { class: 'txmain' }, desc, h('div', { class: 'txmeta' }, [fmtDay(S.when(t)), t.category].filter(Boolean).join(' · '))),
    h('div', { class: 'txamt num ' + dir, testid: 'tx-amount-' + t.id }, fmtSigned(t.amountCents)));
  const wrap = h('div', { class: 'txwrap' }, row);
  const toggle = () => { openTxId = openTxId === t.id ? null : t.id; const d = wrap.querySelector('.txdetail'); if (d) d.remove(); else wrap.append(detail(view, t, parent)); row.setAttribute('aria-expanded', String(openTxId === t.id)); };
  row.addEventListener('click', toggle);
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  if (openTxId === t.id) wrap.append(detail(view, t, parent));
  return wrap;
}

function detail(view, t, parent) {
  const lines = [];
  let entered = 'Entered ' + esc(fmtFull(S.when(t)));
  if (t.user) entered += ' by ' + esc(t.user);
  if (t.deviceName) entered += ' on ' + esc(t.deviceName);
  if (parent && t.deviceId) entered += ` <span data-testid="tx-device-id">(${esc(t.deviceId)})</span>`;
  lines.push(entered);
  if (t.status === 'pending') lines.push('Waiting for approval');
  if (t.actedBy && t.status !== 'pending') {
    const verb = { approved: 'Approved', denied: 'Denied', void: 'Voided' }[t.status] || 'Updated';
    lines.push(`${verb} by ${esc(t.actedBy)}${t.actedAt ? ' · ' + esc(fmtShortTime(t.actedAt)) : ''}`);
  }
  if (t.editedBy) lines.push(`Edited by ${esc(t.editedBy)}${t.editedAt ? ' · ' + esc(fmtShortTime(t.editedAt)) : ''}`);
  if (t.settledAt) lines.push('Sent to church ' + esc(fmtDayYear(t.settledAt)));
  S.groupOf(view, t).filter(x => x.id !== t.id).forEach(x => {
    lines.push(`${x.category === 'Tithing' ? 'Tithing' : 'Part of'}: ${esc(fmtSigned(x.amountCents))} ${esc(x.note || x.category)}`);
  });
  if (t._local || t._pending) lines.push('⏳ Not synced yet');
  lines.push('ID ' + esc(t.id));
  const d = h('div', { class: 'txdetail', testid: 'tx-detail-' + t.id, html: lines.join('<br>') });

  if (parent && (t.status === 'approved' || t.status === 'pending')) {
    if (t.settledAt) {
      d.append(h('div', { class: 'locked', testid: 'tx-settled-lock' }, 'Settled — can’t edit'));
    } else {
      const acts = h('div', { class: 'txactions' });
      acts.append(h('button', { testid: 'tx-edit', onclick: (e) => { e.stopPropagation(); openEntryEdit(t.id); } }, '✎ Edit'));
      if (t.status === 'approved') {
        const vb = h('button', { class: 'voidbtn', testid: 'tx-void' }, 'Void');
        confirmTwice(vb, 'Tap again to void', () => {
          openTxId = null;
          write([['setStatus', { id: t.id, status: 'void' }]], 'Voided', 'warn');
        });
        acts.append(vb);
      }
      d.append(acts);
    }
  }
  return d;
}
