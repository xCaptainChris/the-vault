// Account menu, Settings (kids, device, sync, sheet link, sign out) and the kid editor.
import { byId, h, ago, snackbar } from './dom.js';
import { bioAvailable, bioFor, forgetBio, bioName } from '../bio.js';
import { setupBio } from './lock.js';
import { openSheet, closeSheets, isOpen } from './sheet.js';
import { identity } from '../identity.js';
import { store } from '../store.js';
import { CONFIG } from '../config.js';
import { isDemo } from '../env.js';
import { newId } from '../ids.js';
import { write } from '../actions.js';
import { openWho, signOut, showDeviceModal } from './who.js';
import { openExternal } from '../platform.js';

const COLORS = ['#4cd964', '#00d2ff', '#ffcc4d', '#c084fc', '#ff8a5c', '#ff6bb5', '#7ea6ff', '#34d1b2'];
const EMOJIS = ['🦖', '🦄', '🚀', '🍼', '🐢', '🦊', '🐼', '🦁', '🐬', '⚽', '🎨', '🌟'];

export function openAccount() {
  const parent = identity.isParent;
  const u = identity.user;
  const body = byId('accountSheet').querySelector('.body');
  body.innerHTML = '';
  body.append(h('h2', {}, u ? u.name : 'Not signed in'));
  body.append(h('button', { class: 'menu-btn', testid: 'menu-switch', onclick: () => openWho() }, '👥 Switch user'));
  if (parent) {
    body.append(
      bioToggle(),
      h('button', { class: 'menu-btn', testid: 'menu-settings', onclick: openSettings }, '⚙️ Settings'),
      h('button', { class: 'menu-btn', testid: 'menu-signout', onclick: () => signOut() }, '🚪 Sign out'));
  }
  openSheet('accountSheet');
}

export function openSettings() { renderSettings(); openSheet('settingsSheet'); }
export function refreshSettings() { if (isOpen('settingsSheet')) renderSettings(); }

function renderSettings() {
  const v = store.view;
  const body = byId('settingsSheet').querySelector('.body');
  const keep = body.parentElement.scrollTop;
  body.innerHTML = '';
  body.append(h('h2', {}, 'Settings'));

  body.append(h('div', { class: 'flabel' }, 'Kids'));
  const kl = h('div', { testid: 'settings-kids' });
  v.kids.forEach(k => kl.append(h('button', { class: 'menu-btn', testid: 'settings-kid-' + k.id, onclick: () => openKidEditor(k.id) },
    h('span', {}, k.emoji || '•'), h('span', {}, k.name), k.archived && h('span', { class: 'tag' }, 'archived'))));
  kl.append(h('button', { class: 'menu-btn', testid: 'settings-add-kid', onclick: () => openKidEditor(null) }, '＋ Add kid'));
  body.append(kl);

  const dev = identity.device;
  body.append(h('div', { class: 'flabel' }, 'This device'),
    h('div', { class: 'setrow' }, h('span', { class: 'grow', testid: 'settings-device-name' }, dev.name || '(unnamed)'),
      h('button', { class: 'linkbtn', testid: 'settings-device-rename', onclick: () => showDeviceModal(true) }, 'Rename')),
    h('div', { class: 'small' }, 'ID ' + dev.id));

  const ops = store.outbox.list();
  const unsent = ops.filter(o => o.state === 'queued' || o.state === 'sending').length;
  const needAuth = ops.filter(o => o.state === 'needs-auth');
  const failed = ops.filter(o => o.state === 'failed');
  const last = store.lastSynced;
  body.append(h('div', { class: 'flabel' }, 'Sync'),
    h('div', { class: 'setrow' },
      h('span', { class: 'grow', testid: 'settings-sync-status' }, `Last synced ${last ? ago(last) : 'never'} · ${unsent} unsent`),
      h('button', { class: 'linkbtn', testid: 'settings-sync-now', onclick: async () => { await store.outbox.drain({ force: true }); await store.refresh(); refreshSettings(); } }, 'Sync now')));
  if (needAuth.length) {
    const names = [...new Set(needAuth.map(o => (o.who && o.who.name) || 'a parent'))];
    names.forEach(n => {
      const c = needAuth.filter(o => ((o.who && o.who.name) || 'a parent') === n).length;
      body.append(h('div', { class: 'failrow', testid: 'settings-needs-auth' }, h('span', { class: 'grow' }, `${c} change${c > 1 ? 's' : ''} by ${n} need ${n} to sign in`)));
    });
  }
  failed.forEach(o => body.append(h('div', { class: 'failrow', testid: 'settings-failed' },
    h('span', { class: 'grow' }, `${describe(o)} — ${o.error || 'failed'}`),
    h('button', { class: 'linkbtn', testid: 'settings-dismiss', onclick: () => { store.outbox.dismiss(o.opId); store.emit(); } }, 'Dismiss'))));

  if (CONFIG.SHEET_URL) body.append(h('button', { class: 'primary plain', testid: 'settings-open-sheet', onclick: () => openExternal(CONFIG.SHEET_URL) }, 'Open the Sheet'));
  body.append(h('button', { class: 'primary ghost', testid: 'settings-signout', onclick: () => signOut() }, 'Sign out'));
  body.append(h('div', { class: 'version', testid: 'settings-version' }, `v${CONFIG.APP_VERSION} · ${isDemo ? 'demo' : 'live'}`));
  body.append(h('div', { class: 'version', testid: 'settings-screen' }, screenInfo()));
  body.parentElement.scrollTop = keep;
}

// Screen numbers for troubleshooting the iPhone Home Screen layout (screenshot this line).
function screenInfo() {
  const probe = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;' + css; document.body.appendChild(d); const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); document.body.removeChild(d); return { h: Math.round(r.height), pt: parseFloat(cs.paddingTop) || 0, pb: parseFloat(cs.paddingBottom) || 0 }; };
  const vh = probe('height:100vh').h, dvh = probe('height:100dvh').h, lvh = probe('height:100lvh').h;
  const ins = probe('height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)');
  const vv = window.visualViewport ? Math.round(visualViewport.height) : '-';
  return `screen ${screen.width}×${screen.height} · inner ${innerHeight} · vv ${vv} · vh ${vh}/${dvh}/${lvh} · inset ${ins.pt}/${ins.pb} · gap ${getComputedStyle(document.documentElement).getPropertyValue('--gap') || 0} · ${navigator.standalone ? 'app' : 'browser'}`;
}

function describe(o) {
  const b = o.body || {};
  if (o.action === 'add') return 'New entry' + (b.txs && b.txs[0] && b.txs[0].note ? ' “' + b.txs[0].note + '”' : '');
  return { setStatus: 'Status change', update: 'Edit', settleTithing: 'Tithing settle', upsertKid: 'Kid change', setGoal: 'Goal change', logout: 'Sign out' }[o.action] || o.action;
}

/* ---- kid editor ---- */
export function openKidEditor(kidId) {
  const v = store.view;
  const k = kidId ? v.kids.find(x => x.id === kidId) : null;
  const st = { color: k ? k.color : COLORS[v.kids.length % COLORS.length], archived: k ? !!k.archived : false };
  const body = byId('kidEditSheet').querySelector('.body');
  body.innerHTML = '';
  const name = h('input', { class: 'text-in', testid: 'kid-edit-name', maxlength: '20', placeholder: 'Name', value: k ? k.name : '' });
  const emoji = h('input', { class: 'text-in', testid: 'kid-edit-emoji', maxlength: '8', placeholder: '🙂', value: k ? (k.emoji || '') : '' });
  const err = h('div', { class: 'errline', testid: 'kid-edit-error', hidden: true });
  const swatches = h('div', { class: 'chips' });
  const drawSw = () => {
    swatches.innerHTML = '';
    COLORS.forEach(c => swatches.append(h('button', { class: 'swatch' + (st.color === c ? ' sel' : ''), testid: 'kid-edit-color-' + c.slice(1),
      style: { background: c }, 'aria-label': 'Color ' + c, onclick: () => { st.color = c; drawSw(); } })));
  };
  drawSw();
  const arch = h('button', { class: 'toggle', testid: 'kid-edit-archive' });
  const drawArch = () => {
    arch.className = 'toggle' + (st.archived ? ' on' : '');
    arch.setAttribute('aria-pressed', String(st.archived));
    arch.innerHTML = '';
    arch.append(h('span', { class: 'box' }, st.archived ? '✓' : ''), h('span', {}, 'Hide (archive)'));
  };
  arch.addEventListener('click', () => { st.archived = !st.archived; drawArch(); });
  drawArch();
  body.append(h('h2', {}, k ? 'Edit ' + k.name : 'Add kid'),
    h('div', { class: 'flabel' }, 'Name'), name,
    h('div', { class: 'flabel' }, 'Emoji'), emoji,
    h('div', { class: 'chips quick' }, EMOJIS.map(e => h('button', { class: 'chip-btn', onclick: () => { emoji.value = e; } }, e))),
    h('div', { class: 'flabel' }, 'Color'), swatches, arch, err,
    h('button', { class: 'primary', testid: 'kid-edit-save', onclick: () => {
      const n = name.value.trim();
      if (!n || n.length > 20) { err.hidden = false; err.textContent = 'Name must be 1–20 characters'; return; }
      if (v.kids.some(x => x.id !== (k && k.id) && x.name.toLowerCase() === n.toLowerCase())) { err.hidden = false; err.textContent = 'That name is taken'; return; }
      const em = firstGrapheme(emoji.value.trim());
      const kid = { id: k ? k.id : newId('k_').slice(0, 14), name: n, color: st.color, emoji: em, archived: st.archived };
      write([['upsertKid', { kid }]], k ? 'Saved' : 'Added ' + n);
      openSettings();
    } }, 'Save'));
  openSheet('kidEditSheet');
}

function firstGrapheme(s) {
  if (!s) return '';
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const first = seg.segment(s)[Symbol.iterator]().next().value;
    return first ? first.segment.slice(0, 8) : '';
  } catch (e) {
    return Array.from(s)[0] || '';
  }
}


// Parents: turn Face ID unlock on/off for this phone (shown only where the phone supports it).
function bioToggle() {
  const s = identity.session;
  if (!bioAvailable() || !s || !s.parent) return null;
  const on = !!bioFor(s.parent.id);
  return h('button', { class: 'menu-btn', testid: 'menu-bio', onclick: async () => {
    if (on) { forgetBio(); snackbar(bioName() + ' is off'); closeSheets(); return; }
    closeSheets();
    await setupBio(s.parent);
  } }, '🙂 ' + bioName() + ' unlock', h('span', { class: 'tag' }, on ? 'On' : 'Off'));
}
