import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCents, fmtCents, fmtSigned, titheCents } from '../../js/money.js';

test('parseCents accepts dollars in common shapes', () => {
  assert.equal(parseCents('5'), 500);
  assert.equal(parseCents('2.5'), 250);
  assert.equal(parseCents('2.50'), 250);
  assert.equal(parseCents('.75'), 75);
  assert.equal(parseCents('$1,000.50'), 100050);
  assert.equal(parseCents(' 20 '), 2000);
  assert.equal(parseCents('10000'), 1000000);
  assert.equal(parseCents('0.01'), 1);
});
test('parseCents rejects junk, zero, >2 decimals, negatives and > $10,000', () => {
  for (const bad of ['abc', '0', '0.00', '1.234', '-5', '', null, undefined, '1e3', '10000.01', '$', '1.2.3', '12abc'])
    assert.equal(parseCents(bad), null, String(bad));
});
test('fmtCents / fmtSigned', () => {
  assert.equal(fmtCents(123450), '$1,234.50');
  assert.equal(fmtCents(-240), '−$2.40');
  assert.equal(fmtCents(0), '$0.00');
  assert.equal(fmtSigned(500), '+$5.00');
  assert.equal(fmtSigned(-80), '−$0.80');
});
test('titheCents rounds up', () => {
  assert.equal(titheCents(2000), 200);
  assert.equal(titheCents(2001), 201);
  assert.equal(titheCents(5), 1);
  assert.equal(titheCents(-1000), 100);
  assert.equal(titheCents(1000, 15), 150);
});
