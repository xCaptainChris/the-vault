// Snapshot (from server) + derived view = overlay(snapshot, outbox).
import * as storage from './storage.js';
import { api } from './api/index.js';
import { overlay } from './outbox.js';
import { identity } from './identity.js';

const EMPTY = { kids: [], parents: [], categories: [], transactions: [], settlements: [] };
let snapshot = storage.get('snapshot') || null;
let view = null;
let outbox = null;
const subs = new Set();
let refreshing = null;

function recompute() {
  view = overlay(snapshot || EMPTY, outbox ? outbox.raw() : []);
}

function upsertRows(list, rows) {
  rows.forEach(r => {
    const i = list.findIndex(x => x.id === r.id);
    if (i >= 0) list[i] = r; else list.push(r);
  });
}

export const store = {
  get view() { if (!view) recompute(); return view; },
  get hasData() { return !!snapshot; },
  get lastSynced() { return storage.get('lastSynced'); },
  setOutbox(ob) { outbox = ob; recompute(); },
  get outbox() { return outbox; },

  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  emit() { recompute(); subs.forEach(fn => { try { fn(view); } catch (e) { console.error(e); } }); },

  async refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const data = await api.load();
        snapshot = {
          kids: data.kids || [], parents: data.parents || [], categories: data.categories || [],
          transactions: data.transactions || [], settlements: data.settlements || [],
          serverTime: data.serverTime,
        };
        storage.set('snapshot', snapshot);
        storage.set('lastSynced', new Date().toISOString());
        store.emit();
        return true;
      } catch (e) {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },

  // Merge an op's response into the snapshot so nothing flickers before the next refresh.
  mergeResult(op, res) {
    if (!snapshot || !res) return;
    if (Array.isArray(res.txs)) upsertRows(snapshot.transactions, res.txs);
    if (res.kid) upsertRows(snapshot.kids, [res.kid]);
    if (op.action === 'settleTithing' && Array.isArray(res.settledIds)) {
      const t0 = new Date().toISOString();
      snapshot.transactions.forEach(t => {
        if (res.settledIds.indexOf(t.id) >= 0) { t.settledAt = t.settledAt || t0; t.settleId = res.settleId; }
      });
      if (res.count && !snapshot.settlements.some(s => s.id === res.settleId)) {
        snapshot.settlements.unshift({ id: res.settleId, ts: t0, totalCents: res.totalCents, count: res.count,
          perKid: '', user: op.who ? op.who.name : '', deviceName: op.body.deviceName || '' });
      }
    }
    storage.set('snapshot', snapshot);
  },

  // Build the common body and queue a write. Returns the op.
  queue(action, body, opts = {}) {
    const dev = identity.device;
    const user = identity.user;
    const full = { ...body, deviceId: dev.id, deviceName: dev.name, user: user ? { role: user.role, id: user.id, name: user.name } : null };
    const token = opts.token !== undefined ? opts.token : identity.token;
    const who = opts.who || (user ? { role: user.role, id: user.id, name: user.name } : null);
    const op = outbox.enqueue(action, full, token, who, opts);
    store.emit();
    return op;
  },
};
