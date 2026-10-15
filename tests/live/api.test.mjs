// Live API checks (PLAN §7d) against a deployed TEST copy of the backend.
//   VAULT_API_URL=https://script.google.com/macros/s/…/exec VAULT_PARENT_ID=p_xxxx VAULT_PIN=…
//   [VAULT_LOCK_PARENT_ID=p_throwaway] [VAULT_ALLOW_PROD=1]  node --test live/
// Skipped entirely when VAULT_API_URL is not set. Refuses to run against an instance whose
// INSTANCE_NAME does not contain "test" unless VAULT_ALLOW_PROD=1.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const URL_ = process.env.VAULT_API_URL;
const PID = process.env.VAULT_PARENT_ID;
const PIN = process.env.VAULT_PIN;
const LOCK_PID = process.env.VAULT_LOCK_PARENT_ID;
const skip = !URL_ || !PID || !PIN ? 'set VAULT_API_URL, VAULT_PARENT_ID and VAULT_PIN' : false;

const id = (p) => p + randomUUID();
const dev = { deviceId: 'livetest', deviceName: 'Live test' };
const now = () => new Date().toISOString();

async function get(q = '') {
  const r = await fetch(URL_ + '?t=' + Date.now() + q, { redirect: 'follow' });
  return JSON.parse(await r.text());
}
async function post(action, body = {}) {
  const r = await fetch(URL_, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...dev, token: null, user: null, ...body, action }) });
  return JSON.parse(await r.text());
}
function keysDeep(o, out = []) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push(k); keysDeep(v, out); } return out; }

let token = null;
const kidId = 'k_zz_' + Math.random().toString(36).slice(2, 8);
const created = [];
const tx = (amountCents, category, extra = {}) => ({ id: id('t_'), kidId, amountCents, category, note: 'live test', clientTime: now(), ...extra });

before(async () => {
  if (skip) return;
  const g = await get();
  assert.equal(g.ok, true);
  assert.equal(g.schema, 2);
  if (!/test/i.test(g.instance || '') && process.env.VAULT_ALLOW_PROD !== '1') throw new Error('Refusing: INSTANCE_NAME must contain "test" (or set VAULT_ALLOW_PROD=1)');
});

test('L01 GET shape: arrays, no pin key, integer cents', { skip }, async () => {
  const g = await get();
  for (const k of ['kids', 'parents', 'categories', 'transactions', 'settlements']) assert.ok(Array.isArray(g[k]), k);
  assert.deepEqual(keysDeep(g).filter(k => /^pin$/i.test(k)), []);
  for (const t of g.transactions) assert.ok(Number.isInteger(t.amountCents));
});

test('L02 login wrong/right, whoami', { skip }, async () => {
  assert.equal((await post('login', { parentId: PID, pin: 'nope-' + PIN })).code, 'AUTH');
  const r = await post('login', { parentId: PID, pin: PIN });
  assert.equal(r.ok, true);
  assert.ok(r.token.length >= 40);
  token = r.token;
  assert.equal((await post('whoami', { token })).parent.id, PID);
});

test('L03 upsertKid needs the token', { skip }, async () => {
  const kid = { id: kidId, name: 'ZZ Test ' + kidId.slice(-4), color: '#4cd964', emoji: '', archived: false };
  assert.equal((await post('upsertKid', { kid })).code, 'AUTH');
  assert.equal((await post('upsertKid', { token, kid })).ok, true);
});

test('L04/L05 no token or garbage token → pending, role kid', { skip }, async () => {
  const a = tx(100, 'Chores');
  const r = await post('add', { status: 'approved', user: { role: 'parent', name: 'Dad' }, txs: [a] });
  assert.equal(r.txs[0].status, 'pending');
  assert.equal(r.txs[0].role, 'kid');
  const b = tx(100, 'Chores');
  const r2 = await post('add', { token: 'x'.repeat(64), txs: [b] });
  assert.equal(r2.txs[0].status, 'pending');
  assert.equal((await post('setStatus', { token: 'x'.repeat(64), id: b.id, status: 'approved' })).code, 'AUTH');
  created.push(a.id, b.id);
});

test('L06 parent-only actions without a token → AUTH, nothing changes', { skip }, async () => {
  const before = await get();
  const target = created[0];
  for (const [action, body] of [['setStatus', { id: target, status: 'approved' }], ['setStatus', { id: target, status: 'void' }],
    ['update', { id: target, kidId, amountCents: 999, category: 'Chores', note: '' }], ['settleTithing', { settleId: id('s_'), txIds: [target] }],
    ['setGoal', { kidId, goalName: 'x', goalCents: 100 }], ['upsertKid', { kid: { id: kidId, name: 'Hacked', color: '#4cd964', emoji: '', archived: false } }]]) {
    assert.equal((await post(action, body)).code, 'AUTH', action);
  }
  const after = await get();
  assert.deepEqual(after.transactions.find(t => t.id === target), before.transactions.find(t => t.id === target));
  assert.deepEqual(after.kids.find(k => k.id === kidId), before.kids.find(k => k.id === kidId));
});

test('L07 parent add is approved and stamped with the session name', { skip }, async () => {
  const a = tx(100, 'Gift');
  const r = await post('add', { token, user: { role: 'parent', name: 'Mallory' }, txs: [a] });
  assert.equal(r.txs[0].status, 'approved');
  assert.notEqual(r.txs[0].user, 'Mallory');
  created.push(a.id);
});

test('L08 idempotent add', { skip }, async () => {
  const a = tx(100, 'Chores');
  await post('add', { token, txs: [a] });
  const r = await post('add', { token, txs: [a] });
  assert.equal(r.duplicate, true);
  assert.equal((await get()).transactions.filter(t => t.id === a.id).length, 1);
  created.push(a.id);
});

let titheId = null;
test('L09 group approve', { skip }, async () => {
  const g = id('g_');
  const a = tx(1000, 'Chores', { groupId: g });
  const b = tx(-100, 'Tithing', { groupId: g });
  const r = await post('add', { txs: [a, b] });
  assert.deepEqual(r.txs.map(t => t.status), ['pending', 'pending']);
  const s = await post('setStatus', { token, id: a.id, status: 'approved' });
  assert.deepEqual(s.txs.map(t => t.status).sort(), ['approved', 'approved']);
  titheId = b.id;
  created.push(a.id, b.id);
});

test('L10 transitions', { skip }, async () => {
  const a = tx(100, 'Chores');
  await post('add', { token, txs: [a] });
  assert.equal((await post('setStatus', { token, id: a.id, status: 'denied' })).code, 'CONFLICT');
  assert.equal((await post('setStatus', { token, id: a.id, status: 'void' })).ok, true);
  assert.equal((await post('setStatus', { token, id: a.id, status: 'void' })).ok, true);
  assert.equal((await post('setStatus', { token, id: a.id, status: 'approved' })).code, 'CONFLICT');
});

test('L11 settle is idempotent; settled rows are locked', { skip }, async () => {
  const settleId = id('s_');
  const r = await post('settleTithing', { token, settleId, txIds: [titheId] });
  assert.equal(r.count, 1);
  assert.equal(r.totalCents, 100);
  const r2 = await post('settleTithing', { token, settleId, txIds: [titheId] });
  assert.equal(r2.count, 1);
  assert.equal((await get()).settlements.filter(s => s.id === settleId).length, 1);
  assert.equal((await post('setStatus', { token, id: titheId, status: 'void' })).code, 'SETTLED');
  assert.equal((await post('update', { token, id: titheId, kidId, amountCents: -200, category: 'Tithing', note: '' })).code, 'SETTLED');
});

test('L12 validation', { skip }, async () => {
  const bad = [tx(1.5, 'Chores'), tx(0, 'Chores'), tx(100, 'Tithing'), { ...tx(100, 'Chores'), kidId: 'k_nope' }, { ...tx(100, 'Chores'), note: 'x'.repeat(81) }];
  for (const t of bad) assert.equal((await post('add', { token, txs: [t] })).code, 'BAD_INPUT');
});

test('L13 logout revokes immediately', { skip }, async () => {
  assert.equal((await post('logout', { token })).ok, true);
  assert.equal((await post('whoami', { token })).code, 'AUTH');
  assert.equal((await post('setGoal', { token, kidId, goalName: 'x', goalCents: 100 })).code, 'AUTH');
});

test('L14 lockout', { skip: skip || (!LOCK_PID && 'set VAULT_LOCK_PARENT_ID') }, async () => {
  let last;
  for (let i = 0; i < 5; i++) last = await post('login', { parentId: LOCK_PID, pin: 'wrong' + i });
  assert.equal(last.code, 'LOCKED');
  assert.equal((await post('login', { parentId: LOCK_PID, pin: 'wrong' })).code, 'LOCKED');
});

test('L15 cleanup: void test rows, archive test kid', { skip }, async () => {
  const t = (await post('login', { parentId: PID, pin: PIN })).token;
  for (const x of created) await post('setStatus', { token: t, id: x, status: 'void' });
  await post('upsertKid', { token: t, kid: { id: kidId, name: 'ZZ Test ' + kidId.slice(-4), color: '#4cd964', emoji: '', archived: true } });
  await post('logout', { token: t });
});

test('L16 ?diag=1 lists headers with no duplicates', { skip }, async () => {
  const d = await get('&diag=1');
  assert.equal(d.schema, 2);
  for (const [tab, headers] of Object.entries(d.tabs)) assert.equal(new Set(headers).size, headers.length, tab);
  assert.equal(d.transactions, undefined);
});
