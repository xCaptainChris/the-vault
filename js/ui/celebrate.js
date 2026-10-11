// One-time confetti per device per goal (CSS-only, skipped under reduced motion).
import * as storage from '../storage.js';
import { h } from './dom.js';

const COLORS = ['#4cd964', '#00d2ff', '#ffcc4d', '#c084fc', '#ff8a5c', '#ff6bb5', '#7ea6ff', '#34d1b2'];

export function maybeCelebrate(kid) {
  const key = `${kid.id}|${kid.goalName}|${kid.goalCents}`;
  const seen = storage.get('celebrated', {});
  if (seen[key]) return;
  seen[key] = Date.now();
  storage.set('celebrated', seen);
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = h('div', { class: 'confetti', testid: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = COLORS[i % COLORS.length];
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    s.style.animationDelay = Math.random() * 0.3 + 's';
    box.append(s);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1700);
}
