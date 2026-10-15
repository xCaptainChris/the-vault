import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../js/avatar.js';

test('serialize/parse round-trip and code format', () => {
  const s = A.normalize({ sex: 'g', hair: 'pny', hairColor: 4, skin: 2, eye: 2, acc: ['bow', 'glr', 'frk'] });
  const code = A.serialize(s);
  assert.equal(code, '2:g:pny:4:2:2:bow+glr+frk::');
  assert.match(code, A.CODE_RE);
  assert.deepEqual(A.parse(code), s);
});

test('one item per slot; toggling swaps within a slot and removes on second tap', () => {
  let s = A.normalize({ ...A.DEFAULT });
  s = A.toggleAcc(s, 'cap');
  s = A.toggleAcc(s, 'crn');             // same slot (head) → replaces the cap
  assert.deepEqual(s.acc, ['crn']);
  s = A.toggleAcc(s, 'glr');
  s = A.toggleAcc(s, 'frk');
  assert.deepEqual(s.acc.sort(), ['crn', 'frk', 'glr']);
  s = A.toggleAcc(s, 'glr');             // off again
  assert.deepEqual(s.acc.sort(), ['crn', 'frk']);
  assert.deepEqual(A.normalize({ acc: ['sun', 'glr', 'zzz'] }).acc, ['glr']);
});

test('bad codes are rejected; bad indexes are clamped', () => {
  for (const bad of ['', null, '3:b:spk:0:0:0:', '2:b:spk:0:0:0::FF00AA:', '2:b:spk:0:0:0:::#ff0000', '1:x:spk:0:0:0:', '1:b:spk:0:0:0:cap+', '<svg>', '1:b:spk:10:0:0:']) assert.equal(A.parse(bad), null, String(bad));
  const n = A.normalize({ sex: 'b', hair: 'nope', hairColor: 99, skin: -1, eye: 1.5 });
  assert.equal(n.hair, 'spk'); assert.equal(n.hairColor, 0); assert.equal(n.skin, 0); assert.equal(n.eye, 0);
});

test('every hair style and accessory renders a self-contained SVG', () => {
  for (const hh of A.HAIRS) for (const a of A.ACCESSORIES) {
    const svg = A.avatarSvg({ sex: hh.sex, hair: hh.id, acc: [a.id] }, { size: 40, bg: '#123456' });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(!/undefined|NaN/.test(svg), hh.id + ' ' + a.id);
  }
  let r = 1; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 200; i++) assert.match(A.serialize(A.random(rnd)), A.CODE_RE);
});

test('avatarFor uses the kid record and returns null without an avatar', () => {
  assert.equal(A.avatarFor({ id: 'k1', avatar: '' }), null);
  assert.ok(A.avatarFor({ id: 'k1', color: '#ff0000', avatar: '1:b:buz:0:0:0:' }).includes('#ff0000'));
});

test('v2: highlights + shirt colors round-trip, v1 codes still load, hand slot holds one item', () => {
  const s = A.normalize({ sex: 'g', hair: 'ice', hairColor: 6, skin: 0, eye: 3, acc: ['tia', 'wnd'], streak: '#FF5FA2', shirt: '3a3d48' });
  assert.equal(s.streak, '#ff5fa2'); assert.equal(s.shirt, '#3a3d48');
  const code = A.serialize(s);
  assert.equal(code, '2:g:ice:6:0:3:tia+wnd:ff5fa2:3a3d48');
  assert.deepEqual(A.parse(code), s);
  assert.ok(code.length <= 80);
  const v1 = A.parse('1:g:pny:3:2:2:cap+glr');
  assert.equal(v1.hair, 'pny'); assert.equal(v1.streak, ''); assert.equal(v1.shirt, '');
  assert.deepEqual(A.toggleAcc(s, 'tpt').acc, ['tia', 'tpt']);
  const svg = A.avatarSvg(s, { shirt: '#123456' });
  assert.ok(svg.includes('#3a3d48') && !svg.includes('#123456'), 'chosen shirt beats kid color');
  assert.ok(A.avatarSvg({ ...s, shirt: '' }, { shirt: '#123456' }).includes('#123456'), 'falls back to kid color');
  assert.ok(svg.includes('#ff5fa2'));
});
