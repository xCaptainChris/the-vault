import { byId, h, esc } from './dom.js';
import { fmtCents } from '../money.js';
import * as S from '../selectors.js';
import { identity } from '../identity.js';
import { router } from '../router.js';
import { openFamily } from './family.js';
import { openTithe } from './tithe.js';
import { openApprovals } from './approvals.js';

export function renderHome(view) {
  const parent = identity.isParent;
  const top = byId('homeTop');
  top.innerHTML = '';
  if (parent && view.kids.length) {
    const sum = S.owedSummary(view);
    const reqs = S.requestGroups(view).length;
    top.append(h('div', { class: 'strip', testid: 'family-strip' },
      h('button', { class: 'hold', testid: 'strip-holding', onclick: openFamily },
        h('span', { class: 'sl' }, 'Holding'), h('span', { class: 'sv num' }, fmtCents(sum.total))),
      // Always shown (even at $0.00) so the "Last sent" history stays one tap away.
      h('button', { class: 'tit', testid: 'strip-tithe', onclick: openTithe },
        h('span', { class: 'sl' }, '⛪ Tithing'), h('span', { class: 'sv num' }, fmtCents(sum.tithe))),
      reqs > 0 && h('button', { class: 'req', testid: 'strip-requests', onclick: openApprovals },
        h('span', { class: 'sl' }, 'Waiting'), h('span', { class: 'sv' }, reqs + (reqs === 1 ? ' request' : ' requests'))),
    ));
  }
  const grid = byId('cardGrid');
  grid.innerHTML = '';
  if (!view.kids.length) {
    grid.append(h('div', { class: 'empty', testid: 'home-loading' }, 'Loading…'));
    return;
  }
  const bal = S.balances(view);
  const pend = S.pendingByKid(view);
  S.visibleKids(view).forEach(k => {
    const b = bal[k.id] || 0;
    const g = S.goalState(k, b);
    let goal = '';
    if (g.reached) goal = h('div', { class: 'kgoal', testid: 'kid-goal-' + k.id }, '🎉 Goal reached');
    else if (g.has) goal = h('div', { class: 'kgoal', testid: 'kid-goal-' + k.id }, g.name + ' · ' + g.pct + '%');
    const card = h('button', {
      class: 'bankcard', testid: 'kid-card-' + k.id, dataset: { kid: k.id },
      style: { background: `linear-gradient(135deg, ${k.color}, ${k.color}bb)` },
      onclick: () => router.go('#/kid/' + encodeURIComponent(k.id)),
      'aria-label': `${k.name}, balance ${fmtCents(b)}`,
    });
    card.innerHTML = `<div class="kemoji">${esc(k.emoji || '')}</div><div class="dots">•••• ${esc(k.name.slice(0, 4).toUpperCase())}</div>`;
    if (pend[k.id]) card.append(h('span', { class: 'pdot', testid: 'kid-pending-' + k.id, title: 'Pending request' }));
    card.append(h('div', { class: 'kfoot' },
      h('div', {}, h('div', { class: 'kname' }, k.name),
        h('div', { class: 'kbal num' + (b < 0 ? ' neg' : ''), testid: 'kid-balance-' + k.id }, fmtCents(b))),
      goal));
    grid.append(card);
  });
}
