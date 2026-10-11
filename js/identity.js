// Device identity and the signed-in user. Persisted per device (prefixed storage).
import * as storage from './storage.js';
import { shortId } from './ids.js';

let deviceId = storage.get('deviceId');
if (!deviceId) { deviceId = shortId(8); storage.set('deviceId', deviceId); }

export const identity = {
  get device() { return { id: deviceId, name: storage.get('deviceName', '') }; },
  setDeviceName(name) { storage.set('deviceName', String(name).trim().slice(0, 30)); },

  // user: {role:'parent'|'kid', id, name, emoji?}
  get user() { return storage.get('user'); },
  setUser(u) { if (u) storage.set('user', u); else storage.del('user'); },

  // session: {token, parent:{id,name}} — parents only
  get session() { return storage.get('session'); },
  get token() { const s = storage.get('session'); return s ? s.token : null; },
  setSession(s) { if (s) storage.set('session', s); else storage.del('session'); },

  get isParent() { const u = storage.get('user'); return !!(u && u.role === 'parent' && storage.get('session')); },
};

export function prefs() { return storage.get('prefs', {}); }
export function setPref(k, v) { const p = prefs(); p[k] = v; storage.set('prefs', p); }
