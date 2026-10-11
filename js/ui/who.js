// First-run device modal, "Who's here?" sheet, and parent PIN modal.
import { byId, h, snackbar } from './dom.js';
import { openSheet, closeSheets } from './sheet.js';
import { identity } from '../identity.js';
import { store } from '../store.js';
import { api } from '../api/index.js';
import { isDemo } from '../env.js';
import * as S from '../selectors.js';
import { router } from '../router.js';

let hooks = { onUserChanged: () => {} };
export function initWho(h2) { hooks = { ...hooks, ...h2 }; wire(); }

/* ---- device modal ---- */
export function showDeviceModal(cancellable = false) {
  const m = byId('deviceModal');
  byId('deviceInput').value = identity.device.name || '';
  byId('devIdLine').textContent = 'This device: ' + identity.device.id;
  m.dataset.cancellable = cancellable ? '1' : '';
  m.classList.add('show');
}

function saveDevice() {
  const v = byId('deviceInput').value.trim();
  if (!v) { snackbar('Give it a name'); return; }
  identity.setDeviceName(v);
  byId('deviceModal').classList.remove('show');
  hooks.onUserChanged();
  if (!identity.user) openWho();
}

/* ---- who's here ---- */
export function openWho(message) {
  const v = store.view;
  const body = byId('whoSheet').querySelector('.body');
  body.innerHTML = '';
  const u = identity.user;
  body.append(h('h2', {}, 'Who’s here?'));
  if (message) body.append(h('p', { class: 'sheetnote', testid: 'who-message' }, message));
  body.append(h('div', { class: 'flabel' }, 'Parents'));
  const pc = h('div', { class: 'chips', testid: 'who-parents' });
  (v.parents || []).forEach(p => pc.append(h('button', {
    class: 'chip-btn' + (u && u.role === 'parent' && u.id === p.id && identity.isParent ? ' sel' : ''), testid: 'who-parent-' + p.id,
    onclick: () => openPin(p),
  }, '🔑 ' + p.name)));
  if (!(v.parents || []).length) pc.append(h('div', { class: 'empty' }, 'Loading…'));
  body.append(pc, h('div', { class: 'flabel' }, 'Kids'));
  const kc = h('div', { class: 'chips', testid: 'who-kids' });
  S.visibleKids(v).forEach(k => kc.append(h('button', {
    class: 'chip-btn' + (u && u.role === 'kid' && u.id === k.id ? ' sel' : ''), testid: 'who-kid-' + k.id,
    onclick: () => chooseKid(k),
  }, (k.emoji ? k.emoji + ' ' : '') + k.name)));
  body.append(kc);
  openSheet('whoSheet', { locked: !identity.user });
}

export function refreshWho() {
  const el = byId('whoSheet');
  if (el.classList.contains('show')) {
    const msg = el.querySelector('[data-testid="who-message"]');
    openWho(msg ? msg.textContent : undefined);
  }
}

// Switching away from a parent queues logout behind everything already in the outbox.
function leaveParent() {
  const s = identity.session;
  if (s && s.token) store.queue('logout', {}, { token: s.token, immediate: true });
  identity.setSession(null);
}

function chooseKid(k) {
  leaveParent();
  identity.setUser({ role: 'kid', id: k.id, name: k.name, emoji: k.emoji || '' });
  hooks.onUserChanged();
  router.go('#/kid/' + encodeURIComponent(k.id));   // also closes the Who's here sheet
  closeSheets(false, true);
  snackbar('Hi, ' + k.name + '!');
}

/* ---- PIN ---- */
let pinFor = null;
function openPin(p) {
  pinFor = p;
  byId('pinTitle').textContent = p.name;
  byId('pinInput').value = '';
  byId('pinError').hidden = true;
  byId('pinHint').hidden = !isDemo;
  byId('pinModal').classList.add('show');
  setTimeout(() => byId('pinInput').focus(), 30);
}
function closePin() { byId('pinModal').classList.remove('show'); pinFor = null; }

async function submitPin() {
  const p = pinFor;
  if (!p) return;
  const btn = byId('pinBtn');
  const errEl = byId('pinError');
  const pin = byId('pinInput').value.trim();
  if (!pin) { errEl.hidden = false; errEl.textContent = 'Enter your PIN'; return; }
  btn.disabled = true;
  try {
    const dev = identity.device;
    const res = await api.call('login', { parentId: p.id, pin, deviceId: dev.id, deviceName: dev.name, token: null, user: null });
    const prev = identity.user;
    if (!(prev && prev.role === 'parent' && prev.id === res.parent.id)) leaveParent();
    identity.setSession({ token: res.token, parent: res.parent });
    identity.setUser({ role: 'parent', id: res.parent.id, name: res.parent.name });
    store.outbox.reauth(res.parent.id, res.token);
    closePin();
    closeSheets(false, true);
    hooks.onUserChanged();
    snackbar('Hi, ' + res.parent.name + '!');
    store.outbox.drain();
  } catch (e) {
    errEl.hidden = false;
    if (e.code === 'LOCKED') errEl.textContent = 'Too many tries — wait 15 min';
    else if (e.code === 'AUTH') errEl.textContent = 'Wrong PIN';
    else if (e.code === 'NETWORK') errEl.textContent = 'Can’t verify PIN offline';
    else errEl.textContent = e.message || 'Something went wrong';
    byId('pinInput').select();
  } finally {
    btn.disabled = false;
  }
}

export function signOut() {
  leaveParent();
  identity.setUser(null);
  hooks.onUserChanged();
  router.go('#/');
  openWho();
}

function wire() {
  byId('deviceBtn').addEventListener('click', saveDevice);
  byId('deviceInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveDevice(); });
  byId('deviceModal').addEventListener('click', (e) => {
    if (e.target === byId('deviceModal') && byId('deviceModal').dataset.cancellable && identity.device.name) byId('deviceModal').classList.remove('show');
  });
  byId('pinBtn').addEventListener('click', submitPin);
  byId('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
  byId('pinCancel').addEventListener('click', closePin);
  byId('pinModal').addEventListener('click', (e) => { if (e.target === byId('pinModal')) closePin(); });
}
