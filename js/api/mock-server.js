// Pure-JS copy of every Code.gs rule (auth, lockout, transitions, groups, settle, idempotency,
// validation) over an in-memory db. No DOM, no storage: mock.js handles persistence.
// Keep this in step with Code.gs — go through PLAN §4c line by line when changing either.

export const LOCK_MAX = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const MAX_CENTS = 1000000;
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
const TITHE_PCT = 10;

const iso = (ms) => new Date(ms).toISOString();
const err = (code, error) => ({ ok: false, code, error });
const isInt = (n) => typeof n === 'number' && Number.isInteger(n);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max == null ? 1000 : max);

function rid(n = 8) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function emptyDb() {
  return { kids: [], parents: [], categories: [], transactions: [], settlements: [], sessions: [], audit: [], fails: {} };
}

export function createServer(db, opts = {}) {
  const now = opts.now || (() => Date.now());

  function audit(action, targetId, actor, body, details) {
    db.audit.push({
      ts: iso(now()), action, targetId: targetId || '', user: actor.name || '', role: actor.role || '',
      deviceId: str(body.deviceId, 64), deviceName: str(body.deviceName, 60), details: JSON.stringify(details || {}),
    });
  }

  function auth(token) {
    if (!token || typeof token !== 'string') return null;
    const s = db.sessions.find(x => x.tokenHash === token && !x.revokedAt);
    if (!s) return null;
    const parent = db.parents.find(p => p.id === s.parentId);
    if (!parent) return null;            // deleting a parent row revokes their sessions
    s.lastSeenAt = iso(now());
    return { parentId: parent.id, name: parent.name };
  }

  const kidById = (id) => db.kids.find(k => k.id === id);
  const txById = (id) => db.transactions.find(t => t.id === id);
  const groupRows = (t) => (t.groupId ? db.transactions.filter(x => x.groupId === t.groupId) : [t]);
  const cat = (name) => db.categories.find(c => c.name === name);

  function publicKid(k) {
    return { id: k.id, name: k.name, color: k.color, emoji: k.emoji || '', goalName: k.goalName || '', goalCents: k.goalCents || 0, archived: !!k.archived, avatar: k.avatar || '' };
  }

  function get() {
    const sett = db.settlements.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 10)
      .map(s => ({ id: s.id, ts: s.ts, totalCents: s.totalCents, count: s.count, perKid: s.perKid, user: s.user, deviceName: s.deviceName }));
    return {
      ok: true, schema: 4, serverTime: iso(now()), instance: 'demo',
      kids: db.kids.map(publicKid),
      parents: db.parents.map(p => ({ id: p.id, name: p.name })),
      categories: db.categories.map(c => ({ ...c })),
      transactions: db.transactions.map(t => ({ ...t })),
      settlements: sett,
    };
  }

  // Shared validation for add/update. Returns an error string or null.
  function validateTx(t) {
    const k = kidById(t.kidId);
    if (!k) return 'Unknown kid';
    if (k.archived) return 'That kid is archived';
    if (!isInt(t.amountCents) || t.amountCents === 0 || Math.abs(t.amountCents) > MAX_CENTS) return 'Amount must be a whole number of cents, not zero, at most $10,000';
    const c = cat(t.category);
    if (!c || !c.active) return 'Unknown category';
    const dir = t.amountCents > 0 ? 'in' : 'out';
    if (c.dir !== 'both' && c.dir !== dir) return 'Category does not match direction';
    if (t.category === 'Tithing' && t.amountCents > 0) return 'Tithing must be money out';
    if (String(t.note == null ? '' : t.note).length > 80) return 'Note is too long';
    return null;
  }

  const actions = {
    login(b) {
      const parent = db.parents.find(p => p.id === b.parentId);
      const key = String(b.parentId || '');
      const f = db.fails[key];
      const t = now();
      if (f && f.until > t && f.count >= LOCK_MAX) return err('LOCKED', 'Too many tries — wait 15 min');
      if (!parent || String(parent.pin) !== String(b.pin == null ? '' : b.pin)) {
        const live = f && f.until > t;           // window is fixed from the first failure (as in Code.gs)
        const cur = live ? f.count : 0;
        db.fails[key] = { count: cur + 1, until: live ? f.until : t + LOCK_MS };
        audit('login_fail', key, { name: parent ? parent.name : '', role: 'parent' }, b, { count: cur + 1 });
        if (cur + 1 >= LOCK_MAX) return err('LOCKED', 'Too many tries — wait 15 min');
        return err('AUTH', 'Wrong PIN');
      }
      delete db.fails[key];
      const token = rid(32) + rid(32);
      db.sessions.push({ tokenHash: token, parentId: parent.id, name: parent.name, deviceId: str(b.deviceId, 64),
        deviceName: str(b.deviceName, 60), createdAt: iso(t), lastSeenAt: iso(t), revokedAt: '' });
      audit('login', parent.id, { name: parent.name, role: 'parent' }, b, {});
      return { ok: true, token, parent: { id: parent.id, name: parent.name } };
    },

    whoami(b, s) {
      return s ? { ok: true, parent: { id: s.parentId, name: s.name } } : err('AUTH', 'Please sign in again');
    },

    logout(b) {
      const row = b.token && db.sessions.find(x => x.tokenHash === b.token);
      if (row && !row.revokedAt) {
        row.revokedAt = iso(now());
        audit('logout', row.parentId, { name: row.name, role: 'parent' }, b, {});
      }
      return { ok: true };
    },

    add(b, s) {
      const txs = Array.isArray(b.txs) ? b.txs : null;
      if (!txs || txs.length < 1 || txs.length > 2) return err('BAD_INPUT', 'Send 1 or 2 entries');
      for (const t of txs) if (!t || typeof t.id !== 'string' || !t.id || t.id.length > 64) return err('BAD_INPUT', 'Missing id');
      const ids = txs.map(t => t.id);
      if (txs.length === 2 && ids[0] === ids[1]) return err('BAD_INPUT', 'Duplicate id');
      const existing = txs.map(t => txById(t.id));
      if (existing.every(Boolean)) return { ok: true, txs: existing.map(t => ({ ...t })), duplicate: true };
      // A group belongs to the one request that created it: never join someone else's group.
      for (const t of txs) {
        const gid = str(t.groupId, 64);
        if (gid && db.transactions.some(x => x.groupId === gid && ids.indexOf(x.id) < 0)) return err('BAD_INPUT', 'That group is already in use');
      }
      for (const t of txs) { const e = validateTx(t); if (e) return err('BAD_INPUT', e); }
      if (txs.length === 2) {
        const [a, c] = txs;
        if (a.kidId !== c.kidId || !a.groupId || a.groupId !== c.groupId) return err('BAD_INPUT', 'Linked entries must share kid and group');
        if (c.category !== 'Tithing' || c.amountCents >= 0) return err('BAD_INPUT', 'Second entry must be tithing');
      }
      const t0 = now();
      const actor = s ? { name: s.name, role: 'parent' } : { name: str(b.user && b.user.name, 40), role: 'kid' };
      const status = s ? 'approved' : 'pending';
      const out = [];
      txs.forEach((t, i) => {
        if (existing[i]) { out.push({ ...existing[i] }); return; }
        let ct = Date.parse(t.clientTime);
        if (!isFinite(ct)) ct = t0;
        if (ct > t0 + CLOCK_SKEW_MS) ct = t0 + CLOCK_SKEW_MS;
        const kid = kidById(t.kidId);
        const row = {
          id: t.id, ts: iso(t0), clientTime: iso(ct), kidId: kid.id, kidName: kid.name, amountCents: t.amountCents,
          category: t.category, note: str(t.note, 80), status, user: actor.name, role: actor.role,
          deviceId: str(b.deviceId, 64), deviceName: str(b.deviceName, 60),
          actedBy: s ? s.name : '', actedAt: s ? iso(t0) : '', actedDeviceName: s ? str(b.deviceName, 60) : '',
          editedBy: '', editedAt: '', settledAt: '', settleId: '', groupId: str(t.groupId, 64), reason: '',
        };
        db.transactions.push(row);
        out.push({ ...row });
        audit('add', row.id, actor, b, { after: row });
      });
      return { ok: true, txs: out, duplicate: false };
    },

    setStatus(b, s) {
      const target = b.status;
      if (['approved', 'denied', 'void'].indexOf(target) < 0) return err('BAD_INPUT', 'Bad status');
      const t = txById(b.id);
      if (!t) return err('NOT_FOUND', 'Entry not found');
      if (t.status === target) return { ok: true, txs: [{ ...t }], skipped: [] };
      if (t.settledAt) return err('SETTLED', 'Already sent — can’t change');
      const from = target === 'void' ? 'approved' : 'pending';
      if (t.status !== from) return err('CONFLICT', 'Can’t go from ' + t.status + ' to ' + target);
      const t0 = iso(now());
      const reason = str(b.reason, 140);
      const updated = [], skipped = [];
      for (const r of groupRows(t)) {
        if (r.status !== from) continue;
        if (r.settledAt) { skipped.push(r.id); continue; }
        const before = r.status;
        r.status = target; r.actedBy = s.name; r.actedAt = t0; r.actedDeviceName = str(b.deviceName, 60); r.reason = reason;
        updated.push({ ...r });
        audit('setStatus', r.id, { name: s.name, role: 'parent' }, b, reason ? { before, after: target, reason } : { before, after: target });
      }
      return { ok: true, txs: updated, skipped };
    },

    update(b, s) {
      const t = txById(b.id);
      if (!t) return err('NOT_FOUND', 'Entry not found');
      if (t.settledAt) return err('SETTLED', 'Already sent — can’t edit');
      if (t.status !== 'pending' && t.status !== 'approved') return err('CONFLICT', 'Can’t edit a ' + t.status + ' entry');
      const next = { kidId: b.kidId, amountCents: b.amountCents, category: b.category, note: b.note == null ? '' : b.note };
      const e = validateTx(next);
      if (e) return err('BAD_INPUT', e);
      const t0 = iso(now());
      const kid = kidById(next.kidId);
      const before = { kidId: t.kidId, amountCents: t.amountCents, category: t.category, note: t.note };
      Object.assign(t, { kidId: kid.id, kidName: kid.name, amountCents: next.amountCents, category: next.category,
        note: str(next.note, 80), editedBy: s.name, editedAt: t0 });
      audit('update', t.id, { name: s.name, role: 'parent' }, b, { before, after: next });
      const out = [{ ...t }];
      // Moving an entry to another kid moves its unsettled linked rows too (a group is one kid's).
      if (t.groupId && before.kidId !== kid.id) {
        db.transactions.forEach(x => {
          if (x.groupId !== t.groupId || x.id === t.id || x.settledAt || x.kidId === kid.id) return;
          if (x.status !== 'pending' && x.status !== 'approved') return;
          audit('update', x.id, { name: s.name, role: 'parent' }, b, { before: { kidId: x.kidId }, after: { kidId: kid.id }, linked: true });
          Object.assign(x, { kidId: kid.id, kidName: kid.name, editedBy: s.name, editedAt: t0 });
          out.push({ ...x });
        });
      }
      if (b.retithe && t.amountCents > 0 && t.groupId) {
        const tr = db.transactions.find(x => x.groupId === t.groupId && x.id !== t.id && x.category === 'Tithing' && !x.settledAt
          && (x.status === 'pending' || x.status === 'approved'));
        if (tr) {
          const tb = { amountCents: tr.amountCents, kidId: tr.kidId };
          tr.amountCents = -Math.ceil(t.amountCents * TITHE_PCT / 100);
          tr.kidId = kid.id; tr.kidName = kid.name; tr.editedBy = s.name; tr.editedAt = t0;
          audit('update', tr.id, { name: s.name, role: 'parent' }, b, { before: tb, after: { amountCents: tr.amountCents, kidId: tr.kidId }, retithe: true });
          const i = out.findIndex(x => x.id === tr.id);
          if (i >= 0) out[i] = { ...tr }; else out.push({ ...tr });
        }
      }
      return { ok: true, txs: out };
    },

    settleTithing(b, s) {
      const settleId = str(b.settleId, 64);
      if (!settleId) return err('BAD_INPUT', 'Missing settleId');
      const prev = db.settlements.find(x => x.id === settleId);
      if (prev) return { ok: true, settleId, count: prev.count, totalCents: prev.totalCents, settledIds: prev.txIds.slice() };
      const ids = Array.isArray(b.txIds) ? b.txIds.map(String) : [];
      const rows = db.transactions.filter(t => ids.indexOf(t.id) >= 0 && t.status === 'approved'
        && t.category === 'Tithing' && t.amountCents < 0 && !t.settledAt);
      if (!rows.length) return { ok: true, settleId, count: 0, totalCents: 0, settledIds: [] };
      const t0 = iso(now());
      const per = {};
      let total = 0;
      rows.forEach(t => {
        t.settledAt = t0; t.settleId = settleId;
        total += -t.amountCents;
        per[t.kidName] = (per[t.kidName] || 0) + -t.amountCents;
      });
      const perKid = Object.keys(per).map(n => n + ' $' + (per[n] / 100).toFixed(2)).join('; ');
      db.settlements.push({ id: settleId, ts: t0, totalCents: total, count: rows.length, perKid, user: s.name,
        deviceName: str(b.deviceName, 60), txIds: rows.map(r => r.id) });
      audit('settleTithing', settleId, { name: s.name, role: 'parent' }, b, { totalCents: total, txIds: rows.map(r => r.id) });
      return { ok: true, settleId, count: rows.length, totalCents: total, settledIds: rows.map(r => r.id) };
    },

    upsertKid(b, s) {
      const k = b.kid || {};
      const id = str(k.id, 64);
      const name = str(k.name, 1000);
      if (!id) return err('BAD_INPUT', 'Missing kid id');
      if (name.length < 1 || name.length > 20) return err('BAD_INPUT', 'Name must be 1–20 characters');
      if (db.kids.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return err('BAD_INPUT', 'That name is taken');
      const color = String(k.color || '');
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return err('BAD_INPUT', 'Bad color');
      const emoji = String(k.emoji == null ? '' : k.emoji);
      if (emoji.length > 8) return err('BAD_INPUT', 'Emoji too long');
      let row = kidById(id);
      const before = row ? publicKid(row) : null;
      if (!row) { row = { id, goalName: '', goalCents: 0 }; db.kids.push(row); }
      Object.assign(row, { name, color, emoji, archived: !!k.archived });
      audit('upsertKid', id, { name: s.name, role: 'parent' }, b, { before, after: publicKid(row) });
      return { ok: true, kid: publicKid(row) };
    },

    setEmoji(b, s) {
      if (!s && !(b.user && b.user.role === 'kid' && b.user.id === b.kidId)) {
        audit('auth_reject', b.kidId || '', { name: str(b.user && b.user.name, 40), role: 'kid' }, b, { action: 'setEmoji', reason: b.token ? 'bad token' : 'not own icon' });
        return err('AUTH', 'Parent sign-in needed');
      }
      const emoji = String(b.emoji == null ? '' : b.emoji).trim();
      if (emoji.length > 16) return err('BAD_INPUT', 'Emoji too long');
      const row = kidById(b.kidId);
      if (!row) return err('NOT_FOUND', 'Kid not found');
      const before = row.emoji;
      row.emoji = emoji;
      audit('setEmoji', row.id, s ? { name: s.name, role: 'parent' } : { name: row.name, role: 'kid' }, b, { before, after: emoji });
      return { ok: true, kid: publicKid(row) };
    },

    setAvatar(b, s) {
      if (!s && !(b.user && b.user.role === 'kid' && b.user.id === b.kidId)) {
        audit('auth_reject', b.kidId || '', { name: str(b.user && b.user.name, 40), role: 'kid' }, b, { action: 'setAvatar', reason: b.token ? 'bad token' : 'not own avatar' });
        return err('AUTH', 'Parent sign-in needed');
      }
      const code = String(b.avatar == null ? '' : b.avatar).trim();
      if (code && (code.length > 80 || !/^(1:[bg]:[a-z]{3}:\d:\d:\d:([a-z]{3}(\+[a-z]{3})*)?|2:[bg]:[a-z]{3}:\d{1,2}:\d{1,2}:\d{1,2}:([a-z]{3}(\+[a-z]{3})*)?:([0-9a-f]{6})?:([0-9a-f]{6})?)$/.test(code))) return err('BAD_INPUT', 'Bad avatar');
      const row = kidById(b.kidId);
      if (!row) return err('NOT_FOUND', 'Kid not found');
      const before = row.avatar || '';
      row.avatar = code;
      audit('setAvatar', row.id, s ? { name: s.name, role: 'parent' } : { name: row.name, role: 'kid' }, b, { before, after: code });
      return { ok: true, kid: publicKid(row) };
    },

    setGoal(b, s) {
      if (!s && !(b.user && b.user.role === 'kid' && b.user.id === b.kidId)) {
        audit('auth_reject', b.kidId || '', { name: str(b.user && b.user.name, 40), role: 'kid' }, b, { action: 'setGoal', reason: b.token ? 'bad token' : 'not own goal' });
        return err('AUTH', 'Parent sign-in needed');
      }
      const row = kidById(b.kidId);
      if (!row) return err('NOT_FOUND', 'Kid not found');
      const goalName = String(b.goalName == null ? '' : b.goalName).trim();
      if (goalName.length > 40) return err('BAD_INPUT', 'Goal name too long');
      const c = b.goalCents == null ? 0 : b.goalCents;
      if (!isInt(c) || c < 0 || c > MAX_CENTS) return err('BAD_INPUT', 'Bad goal amount');
      const before = { goalName: row.goalName, goalCents: row.goalCents };
      if (c === 0) { row.goalName = ''; row.goalCents = 0; } else { row.goalName = goalName; row.goalCents = c; }
      audit('setGoal', row.id, s ? { name: s.name, role: 'parent' } : { name: row.name, role: 'kid' }, b, { before, after: { goalName: row.goalName, goalCents: row.goalCents } });
      return { ok: true, kid: publicKid(row) };
    },
  };

  const PARENT_ONLY = { setStatus: 1, update: 1, settleTithing: 1, upsertKid: 1 };

  function post(body) {
    const b = body && typeof body === 'object' ? body : {};
    const fn = actions[b.action];
    if (!fn) return err('BAD_INPUT', 'Unknown action');
    let s = null;
    if (b.action !== 'login' && b.action !== 'logout') {
      s = auth(b.token);
      if (!s && b.token) audit('auth_reject', b.id || '', { name: str(b.user && b.user.name, 40), role: 'kid' }, b, { action: b.action, reason: 'bad token' });
      if (!s && PARENT_ONLY[b.action]) {
        if (!b.token) audit('auth_reject', b.id || '', { name: str(b.user && b.user.name, 40), role: 'kid' }, b, { action: b.action, reason: 'no token' });
        return err('AUTH', 'Parent sign-in needed');
      }
    }
    return fn(b, s);
  }

  return { get, post, auth };
}
