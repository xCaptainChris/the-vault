import { byId, h, esc } from './dom.js';
import { fmtCents, fmtSigned } from '../money.js';
import * as S from '../selectors.js';
import { identity } from '../identity.js';
import { renderLedger } from './ledger.js';
import { openDonut } from './donut.js';
import { openGoal, canEditGoal } from './goal.js';
import { maybeCelebrate } from './celebrate.js';
import { canEditEmoji } from './emoji.js';
import { openAvatarBuilder } from './avatarBuilder.js';
import { avatarFor } from '../avatar.js';
import { kidTithePill } from './tithe.js';
import { maybeShowDecisions } from './decisions.js';

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
  // Face: the avatar, else the emoji in a circle. Tapping it (when allowed) opens the avatar builder.
  const av = avatarFor(k, 84, { bg: 'rgba(255,255,255,.25)', id: 'avhero' });
  const face = av
    ? (editIcon
      ? `<button class="heroav" data-testid="hero-avatar" aria-label="Change avatar">${av}<span class="avedit">✎</span></button>`
      : `<div class="heroav" data-testid="hero-avatar">${av}</div>`)
    : (editIcon
      ? `<button class="heroav heroemo" data-testid="hero-icon-btn" aria-label="Make an avatar">${esc(k.emoji || '🙂')}<span class="avedit">✎</span></button>`
      : (k.emoji ? `<div class="heroav heroemo">${esc(k.emoji)}</div>` : ''));
  hero.innerHTML = `<div class="herotop">${face}<div class="herobal">` +
    `<div class="label">${esc(k.name)}</div>` +
    `<div class="big num${bal < 0 ? ' neg' : ''}" data-testid="hero-balance">${fmtCents(bal)}</div>` +
    (pend ? `<div class="pendline" data-testid="hero-pending">${fmtSigned(pend.cents)} pending</div>` : '') +
    `</div></div>`;
  if (editIcon) hero.querySelectorAll('button.heroav').forEach(b => { b.onclick = () => openAvatarBuilder(k.id); });
  const goalEdit = canEditGoal(k.id)
    ? h('button', { class: 'goalbtn', testid: 'goal-edit-btn', 'aria-label': g.has ? 'Edit goal' : 'Set goal', onclick: () => openGoal(k.id) },
      h('span', { class: 'gpill' }, g.has ? '✎ Edit' : '＋ Set goal'))
    : null;
  if (g.has) {
    hero.append(h('div', { class: 'goalbar' + (g.reached ? ' reached' : ''), testid: 'goal-bar' },
      h('div', { class: 'gtext' },
        h('span', { class: 'gname' }, g.name, goalEdit),
        g.reached
          ? h('span', { class: 'greached', testid: 'goal-reached' }, '🎉 Reached!')
          : h('span', { class: 'num' }, `${fmtCents(bal)} / ${fmtCents(g.target)}`)),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: g.pct + '%' } }))));
  } else if (goalEdit) {
    hero.append(h('div', { class: 'goalnone' }, goalEdit));
  }
  if (g.reached) maybeCelebrate(k);

  const pill = byId('pillSlot');
  pill.innerHTML = '';
  const tp = kidTithePill(view, k);
  if (tp) pill.append(tp);
  if (S.hasDigital(view, k.id)) {
    const d = S.digitalSpend(view, k.id, 30);
    pill.append(h('button', { class: 'pill', testid: 'digital-pill', onclick: () => openDonut(k.id, 'out', 30) },
      '🎮 ', h('b', { class: 'num', testid: 'digital-amount' }, fmtCents(d)), ' on games', h('span', { class: 'sub' }, '30 days'),
      h('span', { class: 'more' }, '›')));
  }

  const ins = S.catTotals(view, k.id, 'in', 0);
  const outs = S.catTotals(view, k.id, 'out', 0);
  renderCats('catIn', ins, 'var(--credit)');
  renderCats('catOut', outs, 'var(--debit)');
  byId('totIn').textContent = fmtCents(ins.reduce((a, e) => a + e.cents, 0));
  byId('totOut').textContent = fmtCents(outs.reduce((a, e) => a + e.cents, 0));
  byId('panelIn').onclick = () => openDonut(k.id, 'in', 0);       // the panels show all-time totals
  byId('panelOut').onclick = () => openDonut(k.id, 'out', 0);

  if (identity.user && identity.user.role === 'kid' && identity.user.id === k.id) maybeShowDecisions(view, k);
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
