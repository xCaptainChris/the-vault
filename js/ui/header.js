import { byId } from './dom.js';
import { isDemo } from '../env.js';
import { identity } from '../identity.js';
import { store } from '../store.js';
import { avatarFor } from '../avatar.js';
import * as S from '../selectors.js';

export function renderHeader() {
  byId('logoSub').textContent = isDemo ? 'Family Bank · Demo' : 'Family Bank';
  const u = identity.user;
  const acct = byId('acctBtn');
  const kid = u && u.role === 'kid' ? S.kidById(store.view, u.id) : null;
  const av = kid ? avatarFor(kid, 34, { id: 'avhdr' }) : null;
  if (av) acct.innerHTML = av;
  else acct.textContent = !u ? '🔒' : (u.role === 'parent' ? u.name.charAt(0).toUpperCase() : ((kid && kid.emoji) || u.emoji || u.name.charAt(0).toUpperCase()));
  acct.classList.toggle('hasav', !!av);
  acct.classList.toggle('active', identity.isParent);
  acct.setAttribute('aria-label', u ? 'Account: ' + u.name : 'Choose who is here');

  const ops = store.outbox ? store.outbox.list() : [];
  const waiting = ops.filter(o => o.state !== 'failed').length;
  const failed = ops.some(o => o.state === 'failed');
  const badge = byId('syncBadge');
  badge.hidden = !waiting && !failed;
  badge.textContent = waiting ? String(waiting) : '';
  badge.classList.toggle('fail', failed);
  badge.classList.toggle('dot', failed && !waiting);
}
