// Parent app lock: a signed-in parent must re-enter their PIN every time the app is opened
// (cold start, or coming back after LOCK_AFTER_MS in the background). Kids are never locked.
// The PIN is checked against a salted hash saved at sign-in, so unlocking works offline; if that
// fails (or no hash yet) and we're online, the server checks it and the hash is refreshed.
import { byId, snackbar } from './dom.js';
import { bioFor, verifyBio, enrollBio, bioAvailable, forgetBio, bioName } from '../bio.js';
import { identity } from '../identity.js';
import * as storage from '../storage.js';
import { api } from '../api/index.js';
import { store } from '../store.js';
import { closeSheets } from './sheet.js';

export const LOCK_AFTER_MS = 30 * 1000;
const MAX_TRIES = 5;
let hooks = { onSwitchUser: () => {}, onSignedOut: () => {} };
let locked = false;
let hiddenAt = 0;
let tries = 0;

async function hashPin(parentId, pin) {
  const data = new TextEncoder().encode('vault|' + identity.device.id + '|' + parentId + '|' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Called after every successful PIN sign-in.
export async function rememberPin(parentId, pin) {
  try { storage.set('pinCheck', { parentId, hash: await hashPin(parentId, pin) }); } catch (e) { /* no crypto: server check only */ }
}
// Face ID stays set up through sign-outs and switching to a kid; only the menu (or too many wrong PINs) turns it off.
export function forgetPin() { storage.del('pinCheck'); }

export function isLocked() { return locked; }

export function lockNow() {
  if (!identity.isParent) return false;
  const s = identity.session;
  locked = true;
  tries = 0;
  closeSheets(false, true);
  byId('lockName').textContent = s && s.parent ? s.parent.name : 'Parent';
  byId('lockInput').value = '';
  byId('lockError').hidden = true;
  document.documentElement.classList.add('app-locked');
  byId('lockModal').classList.add('show');
  const bio = s && s.parent && bioFor(s.parent.id);
  const bb = byId('lockBio');
  bb.hidden = !bio;
  bb.textContent = 'Unlock with ' + bioName();
  if (bio) setTimeout(() => tryBio(true), 250);           // pops Face ID straight away when iOS allows it
  else setTimeout(() => byId('lockInput').focus(), 60);
  return true;
}

let bioBusy = false;
async function tryBio(auto) {
  const s = identity.session;
  if (!locked || bioBusy || !s || !s.parent) return;
  bioBusy = true;
  try {
    if (await verifyBio(s.parent.id)) { unlock(); return; }
  } catch (e) {
    // Cancelled, or iOS wants a tap first (auto attempt): the button and the PIN both still work.
    if (!auto && e && e.name !== 'NotAllowedError') { const err = byId('lockError'); err.hidden = false; err.textContent = bioName() + ' didn’t work — use your PIN'; }
  } finally { bioBusy = false; }
}

// After a PIN unlock: offer Face ID once per device (the account menu can turn it on any time).
function maybeOfferBio() {
  const s = identity.session;
  if (!s || !s.parent || !bioAvailable() || bioFor(s.parent.id) || storage.get('bioOffered')) return;
  storage.set('bioOffered', true);
  const parent = s.parent;
  setTimeout(() => snackbar(`Unlock with ${bioName()} next time?`, { action: 'Turn on', ms: 9000, onAction: () => setupBio(parent) }), 600);
}

export async function setupBio(parent) {
  try {
    if (await enrollBio(parent)) { snackbar(bioName() + ' is on for this phone'); return true; }
  } catch (e) { snackbar(bioName() + ' wasn’t set up'); }
  return false;
}

function unlock() {
  locked = false;
  tries = 0;
  document.documentElement.classList.remove('app-locked');
  byId('lockModal').classList.remove('show');
  byId('lockInput').blur();
}

async function submit() {
  const input = byId('lockInput');
  const err = byId('lockError');
  const btn = byId('lockBtn');
  const pin = input.value.trim();
  const s = identity.session;
  if (!s || !s.parent) { unlock(); return; }
  if (!pin) { err.hidden = false; err.textContent = 'Enter your PIN'; return; }
  if (btn.disabled) return;
  err.hidden = true;
  btn.disabled = true;
  try {
    const saved = storage.get('pinCheck');
    if (saved && saved.parentId === s.parent.id && saved.hash === await hashPin(s.parent.id, pin)) { unlock(); maybeOfferBio(); return; }
    // Local check failed (or no hash yet): ask the server — the PIN may have changed in the Sheet.
    try {
      const dev = identity.device;
      const res = await api.call('login', { parentId: s.parent.id, pin, deviceId: dev.id, deviceName: dev.name, token: null, user: null });
      const old = s.token;
      identity.setSession({ token: res.token, parent: res.parent });
      store.outbox.reauth(res.parent.id, res.token);
      if (old && old !== res.token) store.queue('logout', {}, { token: old, immediate: true });
      await rememberPin(res.parent.id, pin);
      unlock();
      maybeOfferBio();
      store.outbox.drain();
      return;
    } catch (e) {
      if (e.code === 'NETWORK' && !saved) { err.hidden = false; err.textContent = 'Can’t check your PIN offline'; return; }
      if (e.code === 'LOCKED') { tries = MAX_TRIES; }    // server lockout: sign out below
      if (e.code !== 'AUTH' && e.code !== 'NETWORK' && e.code !== 'LOCKED') { err.hidden = false; err.textContent = e.message || 'Something went wrong'; return; }
    }
    tries = Math.min(MAX_TRIES, tries + 1);
    if (tries >= MAX_TRIES) {
      unlock();
      forgetPin();
      forgetBio();
      hooks.onSignedOut('Too many wrong PINs — signed out');
      return;
    }
    err.hidden = false;
    err.textContent = 'Wrong PIN';
    input.select();
  } finally {
    btn.disabled = false;
  }
}

export function initLock(h2) {
  hooks = { ...hooks, ...h2 };
  byId('lockBtn').addEventListener('click', submit);
  byId('lockBio').addEventListener('click', () => tryBio(false));
  byId('lockInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  byId('lockSwitch').addEventListener('click', () => { unlock(); hooks.onSwitchUser(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= LOCK_AFTER_MS) lockNow();
    hiddenAt = 0;
  });
  // iOS can restore a page from the back/forward cache without a visibility change.
  window.addEventListener('pageshow', (e) => { if (e.persisted) lockNow(); });
}
