// Pick-your-icon sheet. Kids can change their own; parents can change anyone's.
// (A stand-in until the avatar builder.)
import { byId, h } from './dom.js';
import { openSheet, closeSheets } from './sheet.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { identity } from '../identity.js';
import { write } from '../actions.js';

export const EMOJI_CHOICES = [
  '🦖', '🦄', '🐶', '🐱', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧',
  '🐢', '🐬', '🦈', '🐙', '🦋', '🐝', '🐞', '🦉', '🐲', '🌈', '⭐', '🌸',
  '🌻', '🍓', '🍕', '🍩', '⚽', '🏀', '🏈', '⚾', '🎮', '🎨', '🎸', '🚀',
  '🚒', '🚜', '🏎️', '✈️', '👑', '💎', '🔥', '⚡', '🤖', '👾', '🧸', '🎀',
];

export function canEditEmoji(kidId) {
  const u = identity.user;
  if (!u) return false;
  if (u.role === 'parent') return !!identity.session;
  return u.role === 'kid' && u.id === kidId;
}

export function openEmoji(kidId) {
  const k = S.kidById(store.view, kidId);
  if (!k || !canEditEmoji(kidId)) return;
  const own = identity.user && identity.user.role === 'kid';
  const body = byId('emojiSheet').querySelector('.body');
  body.innerHTML = '';
  const grid = h('div', { class: 'emojigrid', testid: 'emoji-grid' });
  EMOJI_CHOICES.forEach((e, i) => grid.append(h('button', {
    class: 'emojibtn' + (k.emoji === e ? ' sel' : ''), testid: 'emoji-' + i, 'aria-label': e,
    onclick: () => {
      closeSheets();
      if (e === k.emoji) return;
      write([['setEmoji', { kidId: k.id, emoji: e }]], 'Icon updated');
    },
  }, e)));
  body.append(h('h2', {}, own ? 'Pick your icon' : `Pick ${k.name}’s icon`), grid);
  openSheet('emojiSheet');
}
