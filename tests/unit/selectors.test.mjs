// Selectors against the deterministic 'test' fixture (PLAN §7b expected values).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../js/selectors.js';
import { testFixture } from '../../js/api/fixtures.js';

const NOW = Date.parse('2026-10-10T18:00:00Z');
const v = testFixture(NOW);

test('balances', () => {
  const b = S.balances(v);
  assert.equal(b.k_logan, 700);
  assert.equal(b.k_lizzy, 370);
  assert.equal(b.k_jake, 360);
  assert.equal(b.k_baby, 0);
});
test('visibleKids hides archived Baby', () => {
  assert.deepEqual(S.visibleKids(v).map(k => k.name), ['Logan', 'Lizzy', 'Jake']);
});
test('owedSummary: holding $17.50 = kids $14.30 + tithing $3.20', () => {
  const s = S.owedSummary(v);
  assert.equal(s.kidsTotal, 1430);
  assert.equal(s.tithe, 320);
  assert.equal(s.total, 1750);
  assert.deepEqual(s.kids.map(r => r.kid.name), ['Logan', 'Lizzy', 'Jake'], 'archived with zero balance excluded');
});
test('titheOwed per kid', () => {
  const t = S.titheOwed(v);
  assert.deepEqual(t.per, { k_logan: 200, k_lizzy: 80, k_jake: 40 });
  assert.deepEqual(t.txIds.sort(), ['J2', 'L2', 'Z2']);
});
test('requests: 2 groups', () => {
  assert.equal(S.requestGroups(v).length, 2);
  const p = S.pendingByKid(v);
  assert.deepEqual(p.k_lizzy, { count: 1, cents: 500 });
  assert.deepEqual(p.k_jake, { count: 1, cents: -600 });
});
test('requestGroups merges linked rows', () => {
  const w = structuredClone(v);
  w.transactions.push({ ...w.transactions.find(t => t.id === 'Z4'), id: 'Z5', amountCents: -50, category: 'Tithing', groupId: 'gZ4' });
  w.transactions.find(t => t.id === 'Z4').groupId = 'gZ4';
  const g = S.requestGroups(w);
  assert.equal(g.length, 2);
  const z = g.find(x => x.main.id === 'Z4');
  assert.equal(z.tithe.id, 'Z5');
});
test('Logan digital spend 30d $15 · 90d $15 · all $20', () => {
  assert.equal(S.digitalSpend(v, 'k_logan', 30, NOW), 1500);
  assert.equal(S.digitalSpend(v, 'k_logan', 90, NOW), 1500);
  assert.equal(S.digitalSpend(v, 'k_logan', 0, NOW), 2000);
  assert.equal(S.hasDigital(v, 'k_logan'), true);
  assert.equal(S.hasDigital(v, 'k_lizzy'), false);
  assert.equal(S.hasDigital(v, 'k_jake'), false, 'only approved game spends count (v1.1.1)');
});
test('catTotals out for Logan', () => {
  assert.deepEqual(S.catTotals(v, 'k_logan', 'out', 30, NOW), [{ cat: 'Digital', cents: 1500 }, { cat: 'Tithing', cents: 200 }]);
  assert.deepEqual(S.catTotals(v, 'k_logan', 'out', 0, NOW), [{ cat: 'Digital', cents: 2000 }, { cat: 'Tithing', cents: 300 }]);
  assert.deepEqual(S.catTotals(v, 'k_logan', 'in', 0, NOW), [{ cat: 'Chores', cents: 2000 }, { cat: 'Gift', cents: 1000 }]);
});
test('goalState', () => {
  const k = (id) => v.kids.find(x => x.id === id);
  assert.deepEqual(S.goalState(k('k_logan'), 700), { has: true, pct: 11, reached: false, name: 'Switch game', target: 6000 });
  assert.equal(S.goalState(k('k_lizzy'), 370).reached, true);
  assert.equal(S.goalState(k('k_lizzy'), 370).pct, 100);
  assert.equal(S.goalState(k('k_jake'), 360).has, false);
  assert.equal(S.goalState({ goalCents: 1000 }, 360).pct, 36);
  assert.equal(S.goalState({ goalCents: 1000 }, -50).pct, 0);
});
test('recentSuggestions: distinct, newest first, direction-filtered, no tithing, falls back to all kids', () => {
  const r = S.recentSuggestions(v, 'k_logan', 'in');
  assert.deepEqual(r.map(x => x.note), ['Mowed the lawn', 'Birthday from Grandma']);
  assert.deepEqual(r[0], { note: 'Mowed the lawn', category: 'Chores', amountCents: 2000 });
  assert.deepEqual(S.recentSuggestions(v, 'k_logan', 'out').map(x => x.note), ['Robux', 'Minecraft']);
  const fb = S.recentSuggestions(v, 'k_lizzy', 'out');
  assert.deepEqual(fb.map(x => x.note), ['Ice cream']);
  const none = S.recentSuggestions(v, 'k_baby', 'in');
  assert.ok(none.length >= 3, 'falls back to all kids');
  const dup = structuredClone(v);
  for (let i = 0; i < 10; i++) dup.transactions.push({ ...dup.transactions[0], id: 'x' + i, note: 'n' + i });
  assert.equal(S.recentSuggestions(dup, 'k_logan', 'in').length, 6);
});
test('monthGroups: newest first with approved in/out totals', () => {
  const rows = v.transactions.filter(t => t.kidId === 'k_logan');
  const g = S.monthGroups(rows);
  assert.equal(g[0].label, 'October 2026');
  assert.equal(g[0].outCents, 1500);
  assert.equal(g[0].rows[0].id, 'L3');
  const sum = g.reduce((s, x) => s + x.inCents - x.outCents, 0);
  assert.equal(sum, 700);
});
test('looksDigital keywords', () => {
  for (const s of ['Roblox gift card', 'ROBUX', 'v-bucks', 'Steam sale', 'App Store', 'new game']) assert.ok(S.looksDigital(s), s);
  for (const s of ['Ice cream', 'Mowed the lawn', '']) assert.ok(!S.looksDigital(s), s);
});
test('groupOf', () => {
  assert.deepEqual(S.groupOf(v, v.transactions.find(t => t.id === 'L1')).map(t => t.id), ['L1', 'L2']);
  assert.deepEqual(S.groupOf(v, v.transactions.find(t => t.id === 'L3')).map(t => t.id), ['L3']);
});
