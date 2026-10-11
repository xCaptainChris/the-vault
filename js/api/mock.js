// Mock adapter: same interface as remote.js, backed by mock-server.js.
// The db persists in sessionStorage so a reload keeps demo changes (per tab).
import { createServer } from './mock-server.js';
import { buildFixture } from './fixtures.js';
import { ApiError, unwrap } from './errors.js';
import { fixtureName } from '../env.js';

const KEY = 'vault_demo_db_' + fixtureName;
const CTRL_KEY = 'vault_demo_ctrl';
const clone = (o) => JSON.parse(JSON.stringify(o));

function loadDb() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return buildFixture(fixtureName, Date.now());
}
// Lazy: nothing is built unless the mock is actually used (live mode never touches it).
let db = null;
let server = null;
function ensure() { if (!db) { db = loadDb(); server = createServer(db); save(); } }
function save() { try { sessionStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } }

// Test controls persist across reloads (so "still offline" survives a reload).
let ctrl = { offline: false, latency: 120 };
try { Object.assign(ctrl, JSON.parse(sessionStorage.getItem(CTRL_KEY) || '{}')); } catch (e) { /* ignore */ }
const saveCtrl = () => { try { sessionStorage.setItem(CTRL_KEY, JSON.stringify(ctrl)); } catch (e) { /* ignore */ } };
let failQueue = []; // [{code, afterApply}]

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function gate() {
  ensure();
  await wait(ctrl.latency);
  if (ctrl.offline) throw new ApiError('NETWORK', 'Offline');
}

export const mockAdapter = {
  kind: 'mock',
  async load() {
    await gate();
    const data = clone(unwrap(server.get()));
    if (ctrl.loadLag) await wait(ctrl.loadLag);     // test hook: response arrives late (stale)
    return data;
  },
  async call(action, body) {
    await gate();
    const f = failQueue.length ? failQueue.shift() : null;
    if (f && !f.afterApply) throw new ApiError(f.code, f.code === 'BAD_INPUT' ? 'Rejected by test' : 'Simulated ' + f.code);
    const res = server.post(clone({ ...body, action }));
    save();
    if (f && f.afterApply) throw new ApiError(f.code, 'Simulated ' + f.code + ' after apply');
    return clone(unwrap(res));
  },
};

// Test hooks (exposed as window.__vault.mock in demo mode only).
export const mockHooks = {
  reset(name) {
    db = buildFixture(name || fixtureName, Date.now());
    server = createServer(db);
    failQueue = [];
    save();
  },
  setOffline(v) { ctrl.offline = !!v; saveCtrl(); },
  setLatency(ms) { ctrl.latency = Number(ms) || 0; saveCtrl(); },
  setLoadLag(ms) { ctrl.loadLag = Number(ms) || 0; saveCtrl(); },
  failNext(n = 1, code = 'NETWORK', opts = {}) {
    for (let i = 0; i < n; i++) failQueue.push({ code, afterApply: !!opts.afterApply });
  },
  db() { ensure(); return clone(db); },
  addTx(list) { ensure(); list.forEach(r => db.transactions.push(clone(r))); save(); },
  revokeAll() { ensure(); db.sessions.forEach(s => { if (!s.revokedAt) s.revokedAt = new Date().toISOString(); }); save(); },
  load() { ensure(); return clone(server.get()); },
};
