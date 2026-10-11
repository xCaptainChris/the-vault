// Offline outbox: ordered queue of ops, layered over the server snapshot (PLAN §6).
// No DOM or env imports so it can be unit-tested in Node; app.js wires in storage/api.

export const BACKOFF_S = [2, 5, 15, 30, 60];
const TITHE_PCT = 10;
const clone = (o) => JSON.parse(JSON.stringify(o));
const APPLIED = { queued: 1, sending: 1, 'needs-auth': 1 };

/* ---------------- overlay (pure) ---------------- */

function patchTx(view, id, fn) {
  const t = view.transactions.find(x => x.id === id);
  if (t) { fn(t); t._pending = true; }
  return t;
}

const APPLY = {
  add(view, op) {
    const isParent = !!op.token;
    (op.body.txs || []).forEach(tx => {
      if (view.transactions.some(t => t.id === tx.id)) return;
      const kid = view.kids.find(k => k.id === tx.kidId);
      view.transactions.push({
        id: tx.id, ts: tx.clientTime, clientTime: tx.clientTime, kidId: tx.kidId, kidName: kid ? kid.name : '',
        amountCents: tx.amountCents, category: tx.category, note: tx.note || '',
        status: isParent ? 'approved' : 'pending',
        user: op.body.user ? op.body.user.name : '', role: isParent ? 'parent' : 'kid',
        deviceId: op.body.deviceId || '', deviceName: op.body.deviceName || '',
        actedBy: isParent && op.body.user ? op.body.user.name : '', actedAt: isParent ? tx.clientTime : '', actedDeviceName: '',
        editedBy: '', editedAt: '', settledAt: '', settleId: '', groupId: tx.groupId || '',
        _local: true,
      });
    });
  },
  setStatus(view, op) {
    const target = op.body.status;
    const t = view.transactions.find(x => x.id === op.body.id);
    if (!t || t.status === target || t.settledAt) return;
    const from = target === 'void' ? 'approved' : 'pending';
    if (t.status !== from) return;
    const rows = t.groupId ? view.transactions.filter(x => x.groupId === t.groupId) : [t];
    rows.forEach(r => {
      if (r.status === from && !r.settledAt) patchTx(view, r.id, x => { x.status = target; x.actedBy = op.body.user ? op.body.user.name : ''; x.actedAt = op.createdAt; x.reason = op.body.reason || ''; });
    });
  },
  update(view, op) {
    const b = op.body;
    const kid = view.kids.find(k => k.id === b.kidId);
    const t = patchTx(view, b.id, x => {
      if (x.settledAt) return;
      Object.assign(x, { kidId: b.kidId, kidName: kid ? kid.name : x.kidName, amountCents: b.amountCents, category: b.category, note: b.note || '' });
    });
    if (t && t.groupId && !t.settledAt) {
      view.transactions.forEach(x => {
        if (x.groupId === t.groupId && x.id !== t.id && !x.settledAt && x.kidId !== t.kidId && (x.status === 'pending' || x.status === 'approved')) {
          patchTx(view, x.id, y => { y.kidId = t.kidId; y.kidName = t.kidName; });
        }
      });
    }
    if (t && b.retithe && t.amountCents > 0 && t.groupId) {
      const tr = view.transactions.find(x => x.groupId === t.groupId && x.id !== t.id && x.category === 'Tithing' && !x.settledAt
        && (x.status === 'pending' || x.status === 'approved'));
      if (tr) patchTx(view, tr.id, x => { x.amountCents = -Math.ceil(t.amountCents * TITHE_PCT / 100); x.kidId = t.kidId; x.kidName = t.kidName; });
    }
  },
  settleTithing(view, op) {
    const ids = op.body.txIds || [];
    view.transactions.forEach(t => {
      if (ids.indexOf(t.id) >= 0 && t.status === 'approved' && t.category === 'Tithing' && t.amountCents < 0 && !t.settledAt) {
        patchTx(view, t.id, x => { x.settledAt = op.createdAt; x.settleId = op.body.settleId; });
      }
    });
    if (!view.settlements.some(s => s.id === op.body.settleId)) {
      view.settlements.unshift({ id: op.body.settleId, ts: op.createdAt, totalCents: op.body.totalCents || 0, count: ids.length,
        perKid: '', user: op.body.user ? op.body.user.name : '', deviceName: op.body.deviceName || '', _local: true });
    }
  },
  upsertKid(view, op) {
    const k = op.body.kid;
    let row = view.kids.find(x => x.id === k.id);
    if (!row) { row = { id: k.id, goalName: '', goalCents: 0 }; view.kids.push(row); }
    Object.assign(row, { name: k.name, color: k.color, emoji: k.emoji, archived: !!k.archived, _pending: true });
  },
  setEmoji(view, op) {
    const row = view.kids.find(x => x.id === op.body.kidId);
    if (!row) return;
    row.emoji = op.body.emoji || '';
    row._pending = true;
  },
  setGoal(view, op) {
    const row = view.kids.find(x => x.id === op.body.kidId);
    if (!row) return;
    if (!op.body.goalCents) { row.goalName = ''; row.goalCents = 0; } else { row.goalName = op.body.goalName || ''; row.goalCents = op.body.goalCents; }
    row._pending = true;
  },
  logout() {},
};

export function overlay(snapshot, ops) {
  const view = clone(snapshot);
  view.transactions = view.transactions || [];
  view.kids = view.kids || [];
  view.settlements = view.settlements || [];
  (ops || []).forEach(op => {
    if (!APPLIED[op.state]) return;
    const fn = APPLY[op.action];
    if (fn) fn(view, op);
  });
  return view;
}

/* ---------------- stateful queue ---------------- */

// deps: { load(): ops[], save(ops), api, now(), undoMs, newId(), onSent(op,res), onAuthLost(op), onFailed(op), onChange() }
export function createOutbox(deps) {
  let ops = deps.load() || [];
  // An op left 'sending' by a closed tab goes back to the queue (ids make the resend safe).
  ops.forEach(op => { if (op.state === 'sending') op.state = 'queued'; });
  let draining = false;
  let timer = null;
  const now = () => deps.now();

  function persist() { deps.save(ops); if (deps.onChange) deps.onChange(); }

  function enqueue(action, body, token, who, opts = {}) {
    const t = now();
    const op = {
      opId: deps.newId(), action, body, token: token || null, who: who || null,
      createdAt: new Date(t).toISOString(), notBefore: opts.immediate ? 0 : t + deps.undoMs,
      attempts: 0, nextAttemptAt: 0, state: 'queued', error: null,
    };
    ops.push(op);
    persist();
    schedule();
    return op;
  }

  function cancel(opId) {
    const i = ops.findIndex(o => o.opId === opId && o.state === 'queued' && o.notBefore > now());
    if (i < 0) return false;
    ops.splice(i, 1);
    persist();
    return true;
  }

  function dismiss(opId) {
    const i = ops.findIndex(o => o.opId === opId && (o.state === 'failed' || o.state === 'needs-auth'));
    if (i < 0) return false;
    ops.splice(i, 1);
    persist();
    schedule();
    return true;
  }

  // Same parent signed in again: give their stuck ops the new token and retry.
  function reauth(parentId, token) {
    let n = 0;
    ops.forEach(o => {
      if (o.who && o.who.role === 'parent' && o.who.id === parentId && o.action !== 'logout' && (o.state === 'needs-auth' || o.state === 'queued')) {
        if (o.state === 'needs-auth') { o.state = 'queued'; o.nextAttemptAt = 0; n++; }
        o.token = token;
      }
    });
    persist();
    schedule();
    return n;
  }

  function flushUndo() {
    ops.forEach(o => { if (o.state === 'queued') o.notBefore = 0; });
    persist();
  }

  function list() { return ops.map(o => ({ ...o })); }
  function raw() { return ops; }

  function schedule() {
    clearTimeout(timer);
    const head = ops.find(o => o.state !== 'failed');
    if (!head || head.state !== 'queued') return;
    const at = Math.max(head.notBefore, head.nextAttemptAt);
    timer = setTimeout(() => drain(), Math.max(0, at - now()) + 5);
  }

  async function runDrain(force) {
    let sent = 0;
    for (;;) {
      const op = ops.find(o => o.state !== 'failed');
      if (!op || op.state !== 'queued') break;               // empty, or head needs-auth: strict FIFO
      const t = now();
      if (op.notBefore > t) break;
      if (op.nextAttemptAt > t && !force) break;
      op.state = 'sending';
      persist();
      try {
        const res = await deps.api.call(op.action, { ...op.body, token: op.token });
        // Fold the server's answer into the snapshot BEFORE dropping the op, so the very next
        // render (from persist) already shows the saved row — no blink back to the old value.
        if (deps.onSent) { try { deps.onSent(op, res); } catch (e) { /* never block the queue */ } }
        const i = ops.indexOf(op);
        if (i >= 0) ops.splice(i, 1);
        sent++;
        persist();
      } catch (e) {
        const code = (e && e.code) || 'NETWORK';
        if (code === 'NETWORK' || code === 'BUSY') {
          op.state = 'queued';
          op.attempts++;
          op.nextAttemptAt = now() + BACKOFF_S[Math.min(op.attempts - 1, BACKOFF_S.length - 1)] * 1000;
          op.error = e.message || code;
          persist();
          break;
        } else if (code === 'AUTH') {
          op.state = 'needs-auth';
          op.error = e.message || 'Sign in again';
          persist();
          if (deps.onAuthLost) deps.onAuthLost(op);
          break;
        } else {
          op.state = 'failed';
          op.error = (e && e.message) || code;
          persist();
          if (deps.onFailed) deps.onFailed(op);
        }
      }
    }
    return sent;
  }

  async function drain(opts = {}) {
    if (draining) return 0;
    draining = true;
    let sent = 0;
    try {
      if (opts.force) ops.forEach(o => { if (o.state === 'queued') o.nextAttemptAt = 0; });
      const locks = typeof navigator !== 'undefined' && navigator.locks;
      sent = locks ? await locks.request('vault-outbox', () => runDrain(opts.force)) : await runDrain(opts.force);
    } finally {
      draining = false;
    }
    if (sent && deps.onDrained) deps.onDrained(sent);
    schedule();
    return sent;
  }

  return { enqueue, cancel, dismiss, reauth, flushUndo, list, raw, drain, schedule };
}
