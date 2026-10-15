// The same QA regressions, against js/api/mock-server.js (must behave like Code.gs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../js/api/mock-server.js';
import { testFixture } from '../../js/api/fixtures.js';

const fresh = () => { const db = testFixture(Date.now()); return { db, s: createServer(db) }; };
const tx = (id, kidId, amountCents, category, groupId = '') => ({ id, kidId, amountCents, category, note: '', clientTime: new Date().toISOString(), groupId });

test('mock: cannot join another request\'s group; retry of own group is idempotent', () => {
  const { s, db } = fresh();
  const n = db.transactions.length;
  assert.equal(s.post({ action: 'add', user: { name: 'Logan' }, txs: [tx('x', 'k_logan', 100000, 'Gift', 'gZ1')] }).code, 'BAD_INPUT');
  const pair = [tx('a', 'k_jake', 500, 'Chores', 'gq'), tx('b', 'k_jake', -50, 'Tithing', 'gq')];
  assert.equal(s.post({ action: 'add', user: { name: 'Jake' }, txs: pair }).ok, true);
  assert.equal(s.post({ action: 'add', user: { name: 'Jake' }, txs: pair }).duplicate, true);
  assert.equal(db.transactions.length, n + 2);
});

test('mock: same id twice in one request → BAD_INPUT', () => {
  const { s } = fresh();
  assert.equal(s.post({ action: 'add', user: { name: 'Jake' }, txs: [tx('d', 'k_jake', 500, 'Chores', 'gd'), tx('d', 'k_jake', -50, 'Tithing', 'gd')] }).code, 'BAD_INPUT');
});

test('mock: moving a grouped entry to another kid moves the tithing row', () => {
  const { s, db } = fresh();
  const token = s.post({ action: 'login', parentId: 'p_dad', pin: '1234' }).token;
  const r = s.post({ action: 'update', token, id: 'L1', kidId: 'k_jake', amountCents: 3000, category: 'Chores', note: 'Mowed', retithe: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.txs.map(x => x.id), ['L1', 'L2']);
  const l2 = db.transactions.find(x => x.id === 'L2');
  assert.equal(l2.kidId, 'k_jake');
  assert.equal(l2.amountCents, -300);
});
