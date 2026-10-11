import { byId, h, esc } from './dom.js';
import { fmtCents, fmtSigned } from '../money.js';
import * as S from '../selectors.js';
import { identity } from '../identity.js';
import { renderLedger } from './ledger.js';
import { openDonut } from './donut.js';
import { openGoal, canEditGoal } from './goal.js';
import { maybeCelebrate } from './celebrate.js';
import { openEmoji, canEditEmoji } from './emoji.js';
import { kidTithePill } from './tithe.js';

let currentKid = null;
export const kidPage = { get id() { return currentKid; } };

export function renderKid(view, kidId) {
  currentKid = kidId;
  const k = S.kidById(view, kidId);
  const hero = byId('kidHero');
  if (!k) { hero.innerHTML = '<div class="label">Not found</div>'; return; }
  const parent = identity.isParent;
  const bal = S.balanceOf(view, k.id);
  const pend = S.pendingByKid(view)[k.id];
  const g = S.goalState(k, bal);

  hero.style.background = `linear-gradient(160deg, ${k.color}, ${k.color}aa)`;
  const editIcon = canEditEmoji(k.id);
  hero.innerHTML = (editIcon
    ? `<button class="label labelbtn" data-testid="hero-icon-btn" aria-label="Change icon"><span class="heroemoji">${esc(k.emoji || '🙂')}</span> ${esc(k.name)}</button>`
    : `<div class="label">${esc(k.emoji || '')} ${esc(k.name)}</div>`) +
    `<div class="big num${bal < 0 ? ' neg' : ''}" data-testid="hero-balance">${fmtCents(bal)}</div>` +
    (pend ? `<div class="pendline" data-testid="hero-pending">${fmtSigned(pend.cents)} pending</div>` : '');
  if (editIcon) hero.querySelector('.labelbtn').onclick = () => openEmoji(k.id);
  if (g.has) {
    hero.append(h('div', { class: 'goalbar', testid: 'goal-bar' },
      h('div', { class: 'gtext' }, h('span', {}, g.name), h('span', { class: 'num' }, `${fmtCents(bal)} / ${fmtCents(g.target)}`)),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: g.pct + '%' } }))));
    if (g.reached) hero.append(h('div', { class: 'goalreached', testid: 'goal-reached' }, '🎉 Goal reached'));
  }
  if (canEditGoal(k.id)) {
    hero.append(h('div', {}, h('button', { class: 'goalbtn', testid: 'goal-edit-btn', onclick: () => openGoal(k.id) },
      '✎ ' + (g.has ? 'Edit goal' : 'Set goal'))));
  }
  if (g.reached) maybeCelebrate(k);

  const pill = byId('pillSlot');
  pill.innerHTML = '';
  const tp = kidTithePill(view, k);
  if (tp) pill.append(tp);
  if (S.hasDigital(view, k.id)) {
    const d = S.digitalSpend(view, k.id, 30);
    pill.append(h('button', { class: 'pill', testid: 'digital-pill', onclick: () => openDonut(k.id, 'out', 30) },
      '🎮 ', h('b', { class: 'num', testid: 'digital-amount' }, fmtCents(d)), ' on games · last 30 days',
      h('span', { class: 'more' }, 'chart ›')));
  }

  renderCats('catIn', S.catTotals(view, k.id, 'in', 0), 'var(--credit)');
  renderCats('catOut', S.catTotals(view, k.id, 'out', 0), 'var(--debit)');
  byId('panelIn').onclick = () => openDonut(k.id, 'in', 30);
  byId('panelOut').onclick = () => openDonut(k.id, 'out', 30);

  renderLedger(view, k, parent);
}

function renderCats(id, entries, color) {
  const el = byId(id);
  if (!entries.length) { el.innerHTML = '<div class="empty">Nothing yet</div>'; return; }
  const max = entries[0].cents;
  el.innerHTML = entries.slice(0, 5).map(({ cat, cents }) =>
    `<div class="catrow"><span class="cname">${esc(cat)}</span>` +
    `<span class="ctrack"><span class="cfill" style="width:${(cents / max) * 100}%;background:${color}"></span></span>` +
    `<span class="cval num">${fmtCents(cents)}</span></div>`).join('');
}
