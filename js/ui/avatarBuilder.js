// Avatar builder: big live preview on top, simple pickers below. Kids edit their own; parents anyone's.
import { byId, h } from './dom.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { identity } from '../identity.js';
import { write } from '../actions.js';
import * as A from '../avatar.js';
import { openEmoji, canEditEmoji } from './emoji.js';

let kidId = null;
let spec = null;
let original = '';

export function openAvatarBuilder(id) {
  const k = S.kidById(store.view, id);
  if (!k || !canEditEmoji(id)) return;
  kidId = id;
  original = k.avatar || '';
  spec = A.parse(k.avatar) || A.normalize({ ...A.DEFAULT });
  render();
  openSheet('avatarSheet', { onClose: () => { kidId = null; spec = null; } });
  byId('avatarSheet').scrollTop = 0;
}

export function refreshAvatarBuilder() { /* local edits only; nothing to sync while open */ }

function set(next) { spec = A.normalize(next); render(); }

const thumb = (k, s, id) => h('span', { class: 'avthumb', html: A.avatarSvg(s, { size: 56, bg: '#2a2a34', shirt: k.color, id }) });
const previewSvg = (k) => A.avatarSvg(spec, { size: 132, bg: k.color + '55', shirt: k.color, id: 'avp' });

// Live-update just the big preview while a color picker is being dragged (a full re-render
// would destroy the open <input type=color>); the full render happens on 'change'.
function preview(next) {
  spec = A.normalize(next);
  const k = S.kidById(store.view, kidId);
  const el = document.querySelector('#avatarSheet .avpreview');
  if (k && el) el.innerHTML = previewSvg(k);
}

// Swatch row for a free color (hex or ''): optional "none/default" swatch, presets, and a custom picker.
function colorRow(key, tid, list, first) {
  const cur = spec[key];
  const custom = cur && !list.includes(cur);
  const row = h('div', { class: 'swrow', testid: 'avatar-' + tid });
  if (first) row.append(h('button', {
    class: 'avsw ' + first.cls + (cur ? '' : ' sel'), testid: `avatar-${tid}-none`, 'aria-label': first.label, 'aria-pressed': String(!cur),
    style: first.bg ? { background: first.bg } : {}, onclick: () => set({ ...spec, [key]: '' }),
  }, first.text || ''));
  list.forEach((c, i) => row.append(h('button', {
    class: 'avsw' + (cur === c ? ' sel' : ''), testid: `avatar-${tid}-${i}`, 'aria-label': c, 'aria-pressed': String(cur === c),
    style: { background: c }, onclick: () => set({ ...spec, [key]: c }),
  })));
  const input = h('input', { type: 'color', testid: `avatar-${tid}-custom`, 'aria-label': 'Pick any color' });
  input.value = cur || list[0];
  input.addEventListener('input', () => preview({ ...spec, [key]: input.value }));
  input.addEventListener('change', () => set({ ...spec, [key]: input.value }));
  row.append(h('label', { class: 'avsw avpick' + (custom ? ' sel' : ''), style: custom ? { background: cur } : {}, title: 'Pick any color' }, input, custom ? '' : h('span', { class: 'plus' }, '+')));
  return row;
}

function render() {
  const k = S.kidById(store.view, kidId);
  const body = byId('avatarSheet').querySelector('.body');
  const keepScroll = byId('avatarSheet').scrollTop;
  body.innerHTML = '';
  if (!k) return;
  const own = identity.user && identity.user.role === 'kid' && identity.user.id === k.id;

  const top = h('div', { class: 'avtop' }, h('div', { class: 'avpreview', testid: 'avatar-preview', html: previewSvg(k) }),
    h('div', { class: 'avtopside' },
      h('h2', {}, own ? 'Make your avatar' : `${k.name}’s avatar`),
      h('button', { class: 'chip-btn', testid: 'avatar-random', onclick: () => set(A.random()) }, '🎲 Surprise me')));

  const seg = h('div', { class: 'seg', testid: 'avatar-sex' }, A.SEXES.map(x => h('button', {
    class: spec.sex === x.id ? 'sel avsel' : '', testid: 'avatar-sex-' + x.id,
    onclick: () => {
      if (spec.sex === x.id) return;
      const hairOk = A.HAIRS.find(hh => hh.id === spec.hair && hh.sex === x.id);
      set({ ...spec, sex: x.id, hair: hairOk ? spec.hair : A.HAIRS.find(hh => hh.sex === x.id).id });
    },
  }, x.label)));

  const hairs = h('div', { class: 'avgrid', testid: 'avatar-hairs' }, A.HAIRS.filter(x => x.sex === spec.sex).map(x => h('button', {
    class: 'avopt' + (spec.hair === x.id ? ' sel' : ''), testid: 'avatar-hair-' + x.id, 'aria-label': x.label, 'aria-pressed': String(spec.hair === x.id),
    onclick: () => set({ ...spec, hair: x.id }),
  }, thumb(k, { ...spec, hair: x.id, acc: [] }, 'avh' + x.id), h('span', { class: 'avlbl' }, x.label))));

  const swatches = (list, key, tid) => h('div', { class: 'swrow', testid: 'avatar-' + tid }, list.map((x, i) => h('button', {
    class: 'avsw' + (spec[key] === i ? ' sel' : ''), testid: `avatar-${tid}-${i}`, 'aria-label': x.label, 'aria-pressed': String(spec[key] === i),
    style: { background: x.c }, onclick: () => set({ ...spec, [key]: i }),
  })));

  const extras = h('div', { class: 'avgrid extras', testid: 'avatar-extras' }, A.ACCESSORIES.map(x => {
    const on = spec.acc.includes(x.id);
    return h('button', {
      class: 'avopt' + (on ? ' sel' : ''), testid: 'avatar-acc-' + x.id, 'aria-label': x.label, 'aria-pressed': String(on),
      onclick: () => set(A.toggleAcc(spec, x.id)),
    }, thumb(k, A.toggleAcc({ ...spec, acc: spec.acc.filter(a => a !== x.id) }, x.id), 'ave' + x.id), h('span', { class: 'avlbl' }, x.label));
  }));

  const code = A.serialize(spec);
  const save = h('button', { class: 'primary', testid: 'avatar-save', onclick: () => {
    closeSheets();
    if (code === original) return;
    write([['setAvatar', { kidId: k.id, avatar: code }]], own ? 'Looking good! 😎' : 'Avatar saved');
  } }, 'Save avatar');

  const foot = h('div', { class: 'avfoot' },
    h('button', { class: 'linkbtn', testid: 'avatar-use-emoji', onclick: () => {
      closeSheets();
      if (original) write([['setAvatar', { kidId: k.id, avatar: '' }]], 'Using an emoji');
      setTimeout(() => openEmoji(k.id), 380);
    } }, 'Use an emoji instead'));

  body.append(top,
    h('div', { class: 'flabel' }, 'I’m a'), seg,
    h('div', { class: 'flabel' }, 'Hair'), hairs,
    h('div', { class: 'flabel' }, 'Hair color'), swatches(A.HAIR_COLORS, 'hairColor', 'haircolor'),
    h('div', { class: 'flabel' }, 'Highlights'), colorRow('streak', 'streak', A.STREAKS, { cls: 'avnone', label: 'No highlights', text: '✕' }),
    h('div', { class: 'flabel' }, 'Skin'), swatches(A.SKINS, 'skin', 'skin'),
    h('div', { class: 'flabel' }, 'Eyes'), swatches(A.EYES, 'eye', 'eyes'),
    h('div', { class: 'flabel' }, 'Shirt'), colorRow('shirt', 'shirt', A.SHIRTS.filter(c => c !== (k.color || '').toLowerCase()), { cls: 'avmine', label: 'My color', bg: k.color }),
    h('div', { class: 'flabel' }, 'Extras'), extras,
    save, foot);
  byId('avatarSheet').scrollTop = keepScroll;
}

export function isBuilderOpen() { return isOpen('avatarSheet'); }
