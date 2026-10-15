// Backend tests: Code.gs running in a vm with fake Apps Script services.
// Run: node --test tests/apps-script-harness/
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, FakeSpreadsheet } from './harness.mjs';

let env;
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';
const dev = { deviceId: 'dev-kid', deviceName: "Lizzy's iPad" };
const kidUser = (name = 'Lizzy') => ({ role: 'kid', id: 'x', name });
let kids;      // name → id
let tid = 0;
const newTx = (kidId, amountCents, category, note = '', extra = {}) =>
  ({ id: 't_' + (++tid) + '_' + Math.random().toString(36).slice(2, 8), kidId, amountCents, category, note, clientTime: new Date().toISOString(), ...extra });

function fresh() {
  env = createEnv({ properties: { INSTANCE_NAME: 'test' } });
  env.setup();
  kids = Object.fromEntries(env.get().kids.map(k => [k.name, k.id]));
}

function hasKeyDeep(o, re) {
  if (!o || typeof o !== 'object') return false;
  return Object.keys(o).some(k => re.test(k) || hasKeyDeep(o[k], re));
}

describe('setup()', () => {
  test('creates every tab with headers, seeds kids/parents/categories and sets SCHEMA_VERSION', () => {
    fresh();
    for (const t of ['Transactions', 'Kids', 'Parents', 'Categories', 'Sessions', 'Settlements', 'Audit']) assert.ok(env.sheet(t), t);
    assert.deepEqual(env.sheet('Transactions').headers().slice(0, 12),
      ['ID', 'Timestamp', 'Child', 'Amount', 'Category', 'Note', 'Status', 'DeviceID', 'DeviceName', 'ActedBy', 'Settled', 'User']);
    const k = env.rows('Kids');
    assert.deepEqual(k.map(r => r.Name), ['Logan', 'Lizzy', 'Jake', 'Baby']);
    assert.deepEqual(k.map(r => r.Archived), [false, false, false, true]);
    assert.deepEqual(k.map(r => r.Emoji), ['🦖', '🦄', '🚀', '🍼']);
    assert.ok(k.every(r => /^k_[0-9a-f]{8}$/.test(r.KidID)));
    const p = env.rows('Parents');
    assert.deepEqual(p.map(r => [r.Name, r.PIN]), [['Dad', '1234'], ['Mom', '1234']]);
    assert.equal(typeof p[0].PIN, 'string', 'PIN stays text');
    assert.ok(env.logs.some(l => /change/i.test(l) && /PIN/.test(l)), 'warns to change PINs');
    assert.deepEqual(env.rows('Categories').map(r => r.Name), ['Chores', 'Gift', 'Spending', 'Digital', 'Tithing', 'Savings', 'Other']);
    assert.ok(!env.rows('Categories').some(r => r.Name === 'Allowance'));
    assert.equal(env.props.get('SCHEMA_VERSION'), '4');
    assert.equal(env.sheet('Kids').frozen, 1);
  });

  test('running setup() twice is a no-op', () => {
    fresh();
    const snap = () => JSON.stringify(env.ss.sheets.map(s => [s.name, s.data, s.colFormats]));
    const before = snap();
    const writes = env.ss.sheets.map(s => s.writes);
    const summary = env.setup();
    assert.equal(snap(), before);
    assert.deepEqual(env.ss.sheets.map(s => s.writes), writes, 'no cell or format writes');
    assert.deepEqual(summary.created, []);
    assert.deepEqual(summary.addedColumns, {});
    assert.equal(summary.kidsAssigned + summary.txLinked + summary.kidsCreated, 0);
  });

  test('migrates an old-format sheet (old headers, kids keyed by name)', () => {
    const ss = new FakeSpreadsheet();
    const d = (s) => new Date(s);
    ss.addSheet('Transactions', ['ID', 'Timestamp', 'Child', 'Amount', 'Category', 'Note', 'Status', 'DeviceID', 'DeviceName', 'ActedBy', 'Settled', 'User'], [
      ['a1b2c3d4', d('2026-09-01T15:00:00Z'), 'Logan', 20, 'Chores', 'Mowed', 'approved', 'dev1', "Dad's phone", 'Dad', '', 'Dad'],
      ['b2c3d4e5', d('2026-09-01T15:01:00Z'), 'logan ', -2, 'Tithing', 'Tithing', 'approved', 'dev1', "Dad's phone", 'Dad', d('2026-09-07T12:00:00Z'), 'Dad'],
      ['c3d4e5f6', d('2026-09-02T10:00:00Z'), 'Lizzy', 10, 'Allowance', 'Weekly', 'approved', 'dev1', "Dad's phone", '', '', ''],
      ['d4e5f6a7', d('2026-09-03T10:00:00Z'), 'Grandkid', 5, 'Gift', '', 'pending', 'dev2', 'Tablet', '', '', 'Grandkid'],
      [12345678, d('2026-09-04T10:00:00Z'), 'Jake', -3.5, 'Spending', 'Candy', 'approved', 'dev1', "Mom's phone", 'Mom', '', 'Mom'],
    ]);
    ss.addSheet('Kids', ['Name', 'Color', 'Goal Name', 'Goal Amount'], [
      ['Logan', '#4cd964', 'Switch game', 60], ['Lizzy', '#00d2ff', '', ''], ['Jake', '#ffcc4d', '', ''], ['Baby', '#c084fc', '', ''],
    ]);
    ss.addSheet('Parents', ['Name', 'PIN'], [['Dad', '0042'], ['Mom', '9876']], { PIN: '@' });
    env = createEnv({ spreadsheet: ss });

    const summary = env.setup();
    assert.deepEqual(summary.created.sort(), ['Audit', 'Categories', 'Sessions', 'Settlements']);
    assert.deepEqual(summary.addedColumns.Transactions,
      ['KidID', 'Role', 'ClientTime', 'ActedAt', 'ActedDeviceName', 'EditedBy', 'EditedAt', 'GroupID', 'SettleID', 'Reason']);
    assert.deepEqual(summary.addedColumns.Kids, ['KidID', 'Emoji', 'Archived', 'Avatar']);
    assert.deepEqual(summary.addedColumns.Parents, ['ParentID']);
    assert.equal(summary.kidsAssigned, 4);
    assert.equal(summary.txLinked, 5);
    assert.equal(summary.kidsCreated, 1);

    // existing column order untouched
    assert.deepEqual(env.sheet('Transactions').headers().slice(0, 12),
      ['ID', 'Timestamp', 'Child', 'Amount', 'Category', 'Note', 'Status', 'DeviceID', 'DeviceName', 'ActedBy', 'Settled', 'User']);
    // no seeds into existing tabs
    const kidRows = env.rows('Kids');
    assert.deepEqual(kidRows.map(r => r.Name), ['Logan', 'Lizzy', 'Jake', 'Baby', 'Grandkid']);
    assert.equal(kidRows[4].Archived, true, 'unknown name becomes an archived kid');
    assert.deepEqual(kidRows.slice(0, 4).map(r => r.Archived), [false, false, false, false], 'blank Archived → FALSE');
    assert.deepEqual(env.rows('Parents').map(r => r.PIN), ['0042', '9876']);

    const g = env.get();
    assert.equal(g.ok, true);
    const byName = Object.fromEntries(g.kids.map(k => [k.name, k]));
    const tx = Object.fromEntries(g.transactions.map(t => [t.id, t]));
    assert.equal(tx.a1b2c3d4.kidId, byName.Logan.id);
    assert.equal(tx.b2c3d4e5.kidId, byName.Logan.id, 'trimmed, case-insensitive match');
    assert.equal(tx.d4e5f6a7.kidId, byName.Grandkid.id);
    assert.equal(tx['12345678'].amountCents, -350);
    assert.equal(tx.a1b2c3d4.amountCents, 2000);
    assert.equal(tx.a1b2c3d4.role, 'parent', 'ActedBy present → parent');
    assert.equal(tx.c3d4e5f6.role, '', 'no ActedBy → blank role');
    assert.equal(tx.a1b2c3d4.clientTime, '2026-09-01T15:00:00.000Z', 'ClientTime backfilled from Timestamp');
    assert.equal(tx.b2c3d4e5.settledAt, '2026-09-07T12:00:00.000Z');
    assert.equal(tx.c3d4e5f6.category, 'Allowance', 'old Allowance rows still readable');
    assert.equal(byName.Logan.goalCents, 6000);
    // balances survive migration
    const bal = (id) => g.transactions.filter(t => t.kidId === id && t.status === 'approved').reduce((s, t) => s + t.amountCents, 0);
    assert.equal(bal(byName.Logan.id), 1800);
    assert.equal(bal(byName.Jake.id), -350);

    // and re-running after migration changes nothing
    const snap = JSON.stringify(env.ss.sheets.map(s => [s.name, s.data]));
    env.setup();
    assert.equal(JSON.stringify(env.ss.sheets.map(s => [s.name, s.data])), snap);

    // migrated parents can log in with their text PIN
    const dad = g.parents.find(p => p.name === 'Dad');
    assert.equal(env.post({ action: 'login', parentId: dad.id, pin: '0042' }).ok, true);
  });

  test('doGet/doPost auto-run setup() when SCHEMA_VERSION is behind', () => {
    const ss = new FakeSpreadsheet();
    ss.addSheet('Transactions', ['ID', 'Timestamp', 'Child', 'Amount', 'Category', 'Note', 'Status', 'DeviceID', 'DeviceName', 'ActedBy', 'Settled', 'User'], []);
    ss.addSheet('Kids', ['Name', 'Color', 'Goal Name', 'Goal Amount'], [['Logan', '#4cd964', '', '']]);
    ss.addSheet('Parents', ['Name', 'PIN'], [['Dad', '1234']], { PIN: '@' });
    env = createEnv({ spreadsheet: ss });
    assert.equal(env.props.get('SCHEMA_VERSION'), undefined);
    const g = env.get();
    assert.equal(g.ok, true);
    assert.equal(g.schema, 4);
    assert.equal(env.props.get('SCHEMA_VERSION'), '4');
    assert.ok(g.kids[0].id.startsWith('k_'));
  });

  test('?diag=1 returns tab header lists only', () => {
    fresh();
    const d = env.get({ diag: '1' });
    assert.equal(d.ok, true);
    assert.deepEqual(Object.keys(d.tabs).sort(), ['Audit', 'Categories', 'Kids', 'Parents', 'Sessions', 'Settlements', 'Transactions']);
    assert.equal(d.tabs.Parents.join(','), 'Name,PIN,ParentID');
    assert.equal(d.transactions, undefined);
  });
});

describe('GET', () => {
  beforeEach(fresh);
  test('shape, integer cents, instance, never a PIN', () => {
    const t = env.login();
    env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 1234, 'Chores', 'x')] });
    const g = env.get();
    assert.equal(g.ok, true);
    assert.equal(g.schema, 4);
    assert.equal(g.instance, 'test');
    for (const k of ['kids', 'parents', 'categories', 'transactions', 'settlements']) assert.ok(Array.isArray(g[k]), k);
    assert.ok(g.transactions.every(x => Number.isInteger(x.amountCents)));
    assert.equal(g.transactions[0].amountCents, 1234);
    assert.equal(hasKeyDeep(g, /^pin$/i), false);
    assert.ok(!JSON.stringify(g).includes('1234"'), 'no PIN value leaks');
    assert.deepEqual(Object.keys(g.parents[0]).sort(), ['id', 'name']);
    assert.equal(env.rawGet().getMimeType(), 'application/json');
  });
  test('Sheet stores dollars, not cents', () => {
    const t = env.login();
    env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 1050, 'Chores')] });
    assert.equal(env.rows('Transactions')[0].Amount, 10.5);
  });
});

describe('login / whoami / logout / lockout', () => {
  beforeEach(fresh);
  const dadId = () => env.get().parents.find(p => p.name === 'Dad').id;
  const momId = () => env.get().parents.find(p => p.name === 'Mom').id;

  test('wrong PIN → AUTH; right PIN → token; Sessions stores only the SHA-256 hash', () => {
    const bad = env.post({ action: 'login', parentId: dadId(), pin: '0000' });
    assert.equal(bad.code, 'AUTH');
    assert.equal(bad.error, 'Wrong PIN');
    const ok = env.post({ action: 'login', parentId: dadId(), pin: '1234', deviceId: 'd1', deviceName: 'Phone' });
    assert.equal(ok.ok, true);
    assert.ok(ok.token.length >= 40);
    assert.deepEqual(ok.parent, { id: dadId(), name: 'Dad' });
    const s = env.rows('Sessions');
    assert.equal(s.length, 1);
    assert.notEqual(s[0].TokenHash, ok.token);
    assert.match(s[0].TokenHash, /^[0-9a-f]{64}$/);
    const { createHash } = awaitImportCrypto();
    assert.equal(s[0].TokenHash, createHash('sha256').update(ok.token).digest('hex'));
    assert.equal(s[0].Name, 'Dad');
    assert.equal(s[0].DeviceName, 'Phone');
    const w = env.post({ action: 'whoami', token: ok.token });
    assert.deepEqual(w, { ok: true, parent: { id: dadId(), name: 'Dad' } });
    const audit = env.rows('Audit').map(a => a.Action);
    assert.ok(audit.includes('login_fail') && audit.includes('login'));
  });

  test('PIN compared as a string; unknown parent → AUTH', () => {
    assert.equal(env.post({ action: 'login', parentId: dadId(), pin: 1234 }).ok, true);
    assert.equal(env.post({ action: 'login', parentId: 'p_nobody', pin: '1234' }).code, 'AUTH');
  });

  test('lockout after 5 bad PINs; correct PIN rejected while locked; clears after 15 min', () => {
    const id = momId();
    for (let i = 1; i <= 4; i++) assert.equal(env.post({ action: 'login', parentId: id, pin: '0000' }).code, 'AUTH', 'try ' + i);
    assert.equal(env.post({ action: 'login', parentId: id, pin: '0000' }).code, 'LOCKED', '5th');
    const locked = env.post({ action: 'login', parentId: id, pin: '1234' });
    assert.equal(locked.code, 'LOCKED');
    assert.match(locked.error, /Too many tries/);
    // Dad is unaffected
    assert.equal(env.post({ action: 'login', parentId: dadId(), pin: '1234' }).ok, true);
    env.clock.advance(15 * 60 * 1000 + 1000);
    assert.equal(env.post({ action: 'login', parentId: id, pin: '1234' }).ok, true);
  });

  test('successful login clears the fail counter', () => {
    const id = dadId();
    for (let i = 0; i < 4; i++) env.post({ action: 'login', parentId: id, pin: '0000' });
    assert.equal(env.post({ action: 'login', parentId: id, pin: '1234' }).ok, true);
    for (let i = 0; i < 4; i++) assert.equal(env.post({ action: 'login', parentId: id, pin: '0000' }).code, 'AUTH');
  });

  test('logout revokes immediately and is idempotent', () => {
    const t = env.login();
    assert.deepEqual(env.post({ action: 'logout', token: t }), { ok: true });
    assert.ok(isDate(env.rows('Sessions')[0].RevokedAt));
    assert.equal(env.post({ action: 'whoami', token: t }).code, 'AUTH');
    assert.equal(env.post({ action: 'setGoal', token: t, kidId: kids.Logan, goalName: 'x', goalCents: 100 }).code, 'AUTH');
    assert.deepEqual(env.post({ action: 'logout', token: t }), { ok: true });
    assert.deepEqual(env.post({ action: 'logout', token: 'nope' }), { ok: true });
    assert.deepEqual(env.post({ action: 'logout', token: null }), { ok: true });
  });

  test('revoking by editing the Sheet takes effect once the 10-min cache expires', () => {
    const t = env.login();
    assert.equal(env.post({ action: 'whoami', token: t }).ok, true);   // now cached
    const sh = env.sheet('Sessions');
    const map = sh.headers();
    sh.data[1][map.indexOf('RevokedAt')] = new Date();                 // Chris edits the Sheet
    assert.equal(env.post({ action: 'whoami', token: t }).ok, true, 'still cached');
    env.clock.advance(601 * 1000);
    assert.equal(env.post({ action: 'whoami', token: t }).code, 'AUTH');
  });

  test('deleting a Sessions row revokes (after cache), deleting the parent row revokes at once', () => {
    const t = env.login();
    env.sheet('Sessions').data.splice(1, 1);
    env.clock.advance(601 * 1000);
    assert.equal(env.post({ action: 'whoami', token: t }).code, 'AUTH');
    const t2 = env.login();
    assert.equal(env.post({ action: 'whoami', token: t2 }).ok, true);
    const ps = env.sheet('Parents');
    ps.data = ps.data.filter((r, i) => i === 0 || r[0] !== 'Dad');
    assert.equal(env.post({ action: 'whoami', token: t2 }).code, 'AUTH');
  });

  test('renaming a parent row updates the stamped name', () => {
    const t = env.login();
    const ps = env.sheet('Parents');
    ps.data.find(r => r[0] === 'Dad')[0] = 'Chris';
    env.cache.clear();
    const r = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 100, 'Chores')] });
    assert.equal(r.txs[0].user, 'Chris');
  });

  test('LastSeenAt is updated at most once per day', () => {
    const t = env.login();
    const sh = env.sheet('Sessions');
    const col = sh.headers().indexOf('LastSeenAt');
    sh.data[1][col] = new Date(Date.now() - 3 * 864e5);
    env.cache.clear();
    env.post({ action: 'whoami', token: t });
    const first = sh.data[1][col];
    assert.ok(Date.now() - first.getTime() < 5000);
    const w = sh.writes;
    env.post({ action: 'whoami', token: t });
    env.post({ action: 'whoami', token: t });
    assert.equal(sh.writes, w, 'no further writes the same day');
  });
});

function awaitImportCrypto() { return { createHash: (a) => globalThis.__nodeCrypto.createHash(a) }; }
globalThis.__nodeCrypto = await import('node:crypto');

describe('add', () => {
  beforeEach(fresh);

  test('no token → forced pending, role kid, even with client status/user claims', () => {
    const r = env.post({ action: 'add', token: null, ...dev, status: 'approved', user: { role: 'parent', id: 'p', name: 'Dad' },
      txs: [{ ...newTx(kids.Lizzy, 500, 'Chores', 'Laundry'), status: 'approved' }] });
    assert.equal(r.ok, true);
    assert.equal(r.duplicate, false);
    assert.equal(r.txs[0].status, 'pending');
    assert.equal(r.txs[0].role, 'kid');
    assert.equal(r.txs[0].user, 'Dad', 'claimed name kept (kids are unauthenticated) but role is kid');
    assert.equal(r.txs[0].actedBy, '');
    assert.equal(env.rows('Transactions')[0].Status, 'pending');
  });

  test('garbage token → still pending, plus an auth_reject audit row', () => {
    const r = env.post({ action: 'add', token: 'x'.repeat(64), ...dev, user: kidUser(), txs: [newTx(kids.Lizzy, 500, 'Chores')] });
    assert.equal(r.txs[0].status, 'pending');
    assert.ok(env.rows('Audit').some(a => a.Action === 'auth_reject'));
  });

  test('valid token → approved, user/actedBy stamped from the session, not the body', () => {
    const t = env.login();
    const r = env.post({ action: 'add', token: t, deviceId: 'd1', deviceName: "Dad's phone", user: { role: 'parent', id: 'p', name: 'Mallory' },
      txs: [newTx(kids.Logan, 2000, 'Chores', 'Mowed')] });
    assert.equal(r.txs[0].status, 'approved');
    assert.equal(r.txs[0].user, 'Dad');
    assert.equal(r.txs[0].role, 'parent');
    assert.equal(r.txs[0].actedBy, 'Dad');
    assert.equal(r.txs[0].kidName, 'Logan');
    assert.equal(r.txs[0].deviceName, "Dad's phone");
    const row = env.rows('Transactions')[0];
    assert.equal(row.User, 'Dad');
    assert.equal(row.Child, 'Logan');
    assert.equal(row.KidID, kids.Logan);
  });

  test('kid name is clipped to 40 chars', () => {
    const r = env.post({ action: 'add', ...dev, user: kidUser('L'.repeat(60)), txs: [newTx(kids.Lizzy, 100, 'Chores')] });
    assert.equal(r.txs[0].user.length, 40);
  });

  test('idempotent: same tx id twice → duplicate:true, one row', () => {
    const t = env.login();
    const tx = newTx(kids.Logan, 300, 'Chores');
    const a = env.post({ action: 'add', token: t, ...dev, txs: [tx] });
    const b = env.post({ action: 'add', token: t, ...dev, txs: [tx] });
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.deepEqual(b.txs[0], a.txs[0]);
    assert.equal(env.rows('Transactions').length, 1);
    assert.equal(env.get().transactions.filter(x => x.id === tx.id).length, 1);
  });

  test('idempotent with a pair: retry after partial history returns both, no duplicate rows', () => {
    const g = 'g1';
    const pair = [newTx(kids.Logan, 1000, 'Chores', 'x', { groupId: g }), newTx(kids.Logan, -100, 'Tithing', '', { groupId: g })];
    env.post({ action: 'add', ...dev, txs: pair });
    const again = env.post({ action: 'add', ...dev, txs: pair });
    assert.equal(again.duplicate, true);
    assert.equal(env.rows('Transactions').length, 2);
  });

  test('group: +1000 with −100 tithing, both pending without a token', () => {
    const g = 'g_' + Date.now();
    const r = env.post({ action: 'add', ...dev, user: kidUser(), txs: [newTx(kids.Lizzy, 1000, 'Chores', 'x', { groupId: g }), newTx(kids.Lizzy, -100, 'Tithing', '', { groupId: g })] });
    assert.deepEqual(r.txs.map(x => x.status), ['pending', 'pending']);
    assert.deepEqual(r.txs.map(x => x.groupId), [g, g]);
  });

  test('validation → BAD_INPUT, all or nothing', () => {
    const t = env.login();
    const bad = (txs, msg) => {
      const n = env.rows('Transactions').length;
      const r = env.post({ action: 'add', token: t, ...dev, txs });
      assert.equal(r.code, 'BAD_INPUT', msg + ' → ' + JSON.stringify(r));
      assert.equal(env.rows('Transactions').length, n, msg + ' wrote nothing');
    };
    bad([newTx(kids.Logan, 1.5, 'Chores')], 'fractional cents');
    bad([newTx(kids.Logan, 0, 'Chores')], 'zero');
    bad([newTx(kids.Logan, 1000001, 'Gift')], 'too big');
    bad([newTx(kids.Logan, '500', 'Chores')], 'string amount');
    bad([newTx(kids.Logan, 100, 'Tithing')], 'positive tithing');
    bad([newTx('k_nope', 100, 'Chores')], 'unknown kid');
    bad([newTx(kids.Baby, 100, 'Chores')], 'archived kid');
    bad([newTx(kids.Logan, 100, 'Chores', 'x'.repeat(81))], 'note 81 chars');
    bad([newTx(kids.Logan, -100, 'Chores')], 'Chores is money in');
    bad([newTx(kids.Logan, 100, 'Spending')], 'Spending is money out');
    bad([newTx(kids.Logan, 100, 'Allowance')], 'Allowance not a category');
    bad([], 'empty');
    bad([newTx(kids.Logan, 100, 'Chores'), newTx(kids.Logan, -10, 'Tithing'), newTx(kids.Logan, -10, 'Tithing')], 'three');
    bad([newTx(kids.Logan, 100, 'Chores', '', { groupId: 'g' }), newTx(kids.Jake, -10, 'Tithing', '', { groupId: 'g' })], 'pair different kids');
    bad([newTx(kids.Logan, 100, 'Chores', '', { groupId: 'g' }), newTx(kids.Logan, -10, 'Tithing', '', { groupId: 'h' })], 'pair different groups');
    bad([newTx(kids.Logan, 100, 'Chores', '', { groupId: 'g' }), newTx(kids.Logan, -10, 'Spending', '', { groupId: 'g' })], 'second not tithing');
    bad([newTx(kids.Logan, 100, 'Chores', '', { groupId: 'g' }), { ...newTx(kids.Logan, -10, 'Tithing', '', { groupId: 'g' }), id: '' }], 'missing id');
    // 80 chars and 'Other' both directions are fine
    assert.equal(env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 100, 'Chores', 'x'.repeat(80))] }).ok, true);
    assert.equal(env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, -100, 'Other')] }).ok, true);
    assert.equal(env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 100, 'Other')] }).ok, true);
  });

  test('inactive category is rejected', () => {
    const sh = env.sheet('Categories');
    const h = sh.headers();
    sh.data.find(r => r[0] === 'Gift')[h.indexOf('Active')] = false;
    assert.equal(env.post({ action: 'add', ...dev, txs: [newTx(kids.Logan, 100, 'Gift')] }).code, 'BAD_INPUT');
  });

  test('clientTime clamped to ≤ server time + 5 min', () => {
    const future = new Date(Date.now() + 3 * 864e5).toISOString();
    const r = env.post({ action: 'add', ...dev, txs: [{ ...newTx(kids.Logan, 100, 'Chores'), clientTime: future }] });
    const ct = Date.parse(r.txs[0].clientTime);
    assert.ok(ct <= Date.now() + 5 * 60 * 1000 + 1000);
    const past = '2026-01-01T00:00:00.000Z';
    const r2 = env.post({ action: 'add', ...dev, txs: [{ ...newTx(kids.Logan, 100, 'Chores'), clientTime: past }] });
    assert.equal(r2.txs[0].clientTime, past);
  });

  test('audit row per added tx', () => {
    const t = env.login();
    env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 100, 'Chores', '', { groupId: 'g' }), newTx(kids.Logan, -10, 'Tithing', '', { groupId: 'g' })] });
    const adds = env.rows('Audit').filter(a => a.Action === 'add');
    assert.equal(adds.length, 2);
    assert.equal(adds[0].User, 'Dad');
    assert.equal(adds[0].Role, 'parent');
    assert.ok(JSON.parse(adds[0].Details).after);
  });
});

describe('parent-only actions reject kids / no token / bad token', () => {
  beforeEach(fresh);
  const cases = (ids) => [
    ['setStatus approve', { action: 'setStatus', id: ids.pending, status: 'approved' }],
    ['setStatus deny', { action: 'setStatus', id: ids.pending, status: 'denied' }],
    ['setStatus void', { action: 'setStatus', id: ids.approved, status: 'void' }],
    ['update', { action: 'update', id: ids.approved, kidId: kids.Logan, amountCents: 1, category: 'Chores', note: '' }],
    ['settleTithing', { action: 'settleTithing', settleId: 's_x', txIds: [ids.tithe] }],
    ['setGoal', { action: 'setGoal', kidId: kids.Logan, goalName: 'Hack', goalCents: 100 }],
    ['upsertKid (new)', { action: 'upsertKid', kid: { id: 'k_new', name: 'Mallory', color: '#4cd964', emoji: '', archived: false } }],
    ['upsertKid (archive)', { action: 'upsertKid', kid: { id: kids.Logan, name: 'Logan', color: '#4cd964', emoji: '', archived: true } }],
  ];
  function seed() {
    const t = env.login();
    const g = 'g1';
    const a = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 1000, 'Chores', '', { groupId: g }), newTx(kids.Logan, -100, 'Tithing', '', { groupId: g })] });
    const p = env.post({ action: 'add', ...dev, user: kidUser(), txs: [newTx(kids.Lizzy, 500, 'Chores')] });
    return { approved: a.txs[0].id, tithe: a.txs[1].id, pending: p.txs[0].id };
  }
  for (const [label, tok] of [['no token', undefined], ['null token', null], ['garbage token', 'x'.repeat(64)], ['revoked token', 'REVOKED']]) {
    test(label + ': every parent action → AUTH and nothing changes', () => {
      const ids = seed();
      let token = tok;
      if (tok === 'REVOKED') { token = env.login('Mom', '1234'); env.post({ action: 'logout', token }); }
      const before = JSON.stringify(env.get().transactions) + JSON.stringify(env.get().kids) + JSON.stringify(env.rows('Settlements'));
      for (const [name, body] of cases(ids)) {
        const r = env.post({ ...body, ...dev, user: { role: 'parent', id: 'p', name: 'Dad' }, ...(token === undefined ? {} : { token }) });
        assert.equal(r.code, 'AUTH', name);
      }
      const after = JSON.stringify(env.get().transactions) + JSON.stringify(env.get().kids) + JSON.stringify(env.rows('Settlements'));
      assert.equal(after, before);
      const rejects = env.rows('Audit').filter(a => a.Action === 'auth_reject');
      assert.ok(rejects.length >= cases(ids).length, 'every rejected attempt is audited');
    });
  }
  test('whoami without token → AUTH', () => {
    assert.equal(env.post({ action: 'whoami' }).code, 'AUTH');
  });
});

describe('setStatus', () => {
  let t;
  beforeEach(() => { fresh(); t = env.login(); });
  const pend = (kid = kids.Lizzy, cents = 500, extra) => env.post({ action: 'add', ...dev, user: kidUser(), txs: [newTx(kid, cents, cents > 0 ? 'Chores' : 'Spending', 'x', extra)] }).txs[0];
  const set = (id, status, tok = t) => env.post({ action: 'setStatus', token: tok, deviceId: 'd9', deviceName: "Mom's phone", id, status });

  test('optional reason is stored on the row (and its linked rows), returned, and formula-safe', () => {
    const g = 'g_r';
    const a = env.post({ action: 'add', ...dev, user: kidUser(), txs: [newTx(kids.Lizzy, 500, 'Chores', 'x', { groupId: g }), newTx(kids.Lizzy, -50, 'Tithing', 'x', { groupId: g })] });
    const r = env.post({ action: 'setStatus', token: t, ...dev, id: a.txs[0].id, status: 'denied', reason: '  Chore isn’t done yet  ' });
    assert.equal(r.ok, true);
    assert.equal(r.txs.length, 2);
    assert.ok(r.txs.every(x => x.status === 'denied' && x.reason === 'Chore isn’t done yet'));
    const got = env.get().transactions.filter(x => x.groupId === g);
    assert.ok(got.every(x => x.reason === 'Chore isn’t done yet'));
    const p2 = pend();
    env.post({ action: 'setStatus', token: t, ...dev, id: p2.id, status: 'approved', reason: '=HYPERLINK("x")' + 'y'.repeat(200) });
    const row = env.rows('Transactions').find(x => x.ID === p2.id);
    assert.ok(!(row.Reason && typeof row.Reason === 'object' && row.Reason.formula), 'stored as text, not a formula');
    assert.ok(String(row.Reason).startsWith('=HYPERLINK'));
    assert.equal(env.get().transactions.find(x => x.id === p2.id).reason.length, 140);
    const p3 = pend();
    assert.equal(set(p3.id, 'approved').txs[0].reason, '');
  });

  test('pending → approved stamps ActedBy/ActedAt/ActedDeviceName from the session', () => {
    const p = pend();
    const r = set(p.id, 'approved');
    assert.equal(r.ok, true);
    assert.equal(r.txs[0].status, 'approved');
    assert.equal(r.txs[0].actedBy, 'Dad');
    assert.equal(r.txs[0].actedDeviceName, "Mom's phone");
    const row = env.rows('Transactions').find(x => x.ID === p.id);
    assert.equal(row.ActedBy, 'Dad');
    assert.ok(isDate(row.ActedAt));
  });
  test('pending → denied; approved → void; same status is a no-op', () => {
    const p = pend();
    assert.equal(set(p.id, 'denied').txs[0].status, 'denied');
    assert.equal(set(p.id, 'denied').ok, true);
    const q = pend();
    set(q.id, 'approved');
    assert.equal(set(q.id, 'void').txs[0].status, 'void');
    const w = env.sheet('Transactions').writes;
    assert.equal(set(q.id, 'void').ok, true);
    assert.equal(env.sheet('Transactions').writes, w, 'no-op wrote nothing');
  });
  test('illegal transitions → CONFLICT', () => {
    const p = pend();
    assert.equal(set(p.id, 'void').code, 'CONFLICT', 'pending → void');
    set(p.id, 'approved');
    assert.equal(set(p.id, 'denied').code, 'CONFLICT', 'approved → denied');
    set(p.id, 'void');
    assert.equal(set(p.id, 'approved').code, 'CONFLICT', 'void → approved');
    const d = pend();
    set(d.id, 'denied');
    assert.equal(set(d.id, 'approved').code, 'CONFLICT', 'denied → approved');
  });
  test('bad status / unknown id', () => {
    assert.equal(set('nope', 'approved').code, 'NOT_FOUND');
    assert.equal(set(pend().id, 'pending').code, 'BAD_INPUT');
  });
  test('group: approving one approves the linked row', () => {
    const g = 'g_grp';
    const r = env.post({ action: 'add', ...dev, user: kidUser(), txs: [newTx(kids.Lizzy, 1000, 'Chores', 'x', { groupId: g }), newTx(kids.Lizzy, -100, 'Tithing', '', { groupId: g })] });
    const a = set(r.txs[0].id, 'approved');
    assert.equal(a.txs.length, 2);
    assert.deepEqual(env.get().transactions.filter(x => x.groupId === g).map(x => x.status), ['approved', 'approved']);
  });
  test('group void skips settled rows and reports them; settled row itself → SETTLED', () => {
    const g = 'g_s';
    const r = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 1000, 'Chores', 'x', { groupId: g }), newTx(kids.Logan, -100, 'Tithing', '', { groupId: g })] });
    env.post({ action: 'settleTithing', token: t, settleId: 's1', txIds: [r.txs[1].id] });
    assert.equal(set(r.txs[1].id, 'void').code, 'SETTLED');
    const v = set(r.txs[0].id, 'void');
    assert.deepEqual(v.skipped, [r.txs[1].id]);
    assert.equal(v.txs.length, 1);
    const all = env.get().transactions;
    assert.equal(all.find(x => x.id === r.txs[1].id).status, 'approved');
  });
  test('audit records before/after', () => {
    const p = pend();
    set(p.id, 'approved');
    const a = env.rows('Audit').filter(x => x.Action === 'setStatus').pop();
    assert.deepEqual(JSON.parse(a.Details), { before: 'pending', after: 'approved' });
  });
});

describe('update', () => {
  let t;
  beforeEach(() => { fresh(); t = env.login(); });
  const addPair = (cents = 2000) => {
    const g = 'g_' + Math.random();
    return env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, cents, 'Chores', 'Mowed', { groupId: g }), newTx(kids.Logan, -Math.ceil(cents / 10), 'Tithing', '', { groupId: g })] }).txs;
  };
  const upd = (body) => env.post({ action: 'update', token: t, ...dev, ...body });

  test('edits fields, stamps EditedBy/EditedAt, audits before/after', () => {
    const [a] = addPair();
    const r = upd({ id: a.id, kidId: kids.Jake, amountCents: 1500, category: 'Gift', note: 'Fixed' });
    assert.equal(r.ok, true);
    assert.equal(r.txs[0].kidId, kids.Jake);
    assert.equal(r.txs[0].kidName, 'Jake');
    assert.equal(r.txs[0].amountCents, 1500);
    assert.equal(r.txs[0].editedBy, 'Dad');
    const row = env.rows('Transactions').find(x => x.ID === a.id);
    assert.equal(row.Amount, 15);
    assert.equal(row.Child, 'Jake');
    const au = env.rows('Audit').filter(x => x.Action === 'update' && x.TargetID === a.id).pop();
    const d = JSON.parse(au.Details);
    assert.equal(d.before.amountCents, 2000);
    assert.equal(d.after.amountCents, 1500);
    // the linked tithing row follows the entry to the new kid (a group is one kid's)
    assert.equal(r.txs.length, 2);
    assert.equal(env.rows('Transactions').filter(x => x.KidID === kids.Jake).length, 2);
  });
  test('retithe updates the linked unsettled tithing row (rounded up)', () => {
    const [a, tr] = addPair(2000);
    const r = upd({ id: a.id, kidId: kids.Logan, amountCents: 3001, category: 'Chores', note: 'Mowed', retithe: true });
    assert.equal(r.txs.length, 2);
    assert.equal(env.get().transactions.find(x => x.id === tr.id).amountCents, -301);
  });
  test('without retithe the tithing row is untouched', () => {
    const [a, tr] = addPair(2000);
    upd({ id: a.id, kidId: kids.Logan, amountCents: 3000, category: 'Chores', note: '' });
    assert.equal(env.get().transactions.find(x => x.id === tr.id).amountCents, -200);
  });
  test('retithe skips a settled tithing row', () => {
    const [a, tr] = addPair(2000);
    env.post({ action: 'settleTithing', token: t, settleId: 's1', txIds: [tr.id] });
    const r = upd({ id: a.id, kidId: kids.Logan, amountCents: 3000, category: 'Chores', note: '', retithe: true });
    assert.equal(r.txs.length, 1);
    assert.equal(env.get().transactions.find(x => x.id === tr.id).amountCents, -200);
  });
  test('settled → SETTLED; void/denied → CONFLICT; unknown → NOT_FOUND; validation → BAD_INPUT', () => {
    const [a, tr] = addPair();
    env.post({ action: 'settleTithing', token: t, settleId: 's1', txIds: [tr.id] });
    assert.equal(upd({ id: tr.id, kidId: kids.Logan, amountCents: -50, category: 'Tithing', note: '' }).code, 'SETTLED');
    env.post({ action: 'setStatus', token: t, id: a.id, status: 'void' });
    assert.equal(upd({ id: a.id, kidId: kids.Logan, amountCents: 50, category: 'Chores', note: '' }).code, 'CONFLICT');
    assert.equal(upd({ id: 'zzz', kidId: kids.Logan, amountCents: 50, category: 'Chores', note: '' }).code, 'NOT_FOUND');
    const p = env.post({ action: 'add', ...dev, txs: [newTx(kids.Lizzy, 500, 'Chores')] }).txs[0];
    assert.equal(upd({ id: p.id, kidId: kids.Lizzy, amountCents: 0, category: 'Chores', note: '' }).code, 'BAD_INPUT');
    assert.equal(upd({ id: p.id, kidId: kids.Baby, amountCents: 100, category: 'Chores', note: '' }).code, 'BAD_INPUT');
    assert.equal(upd({ id: p.id, kidId: kids.Lizzy, amountCents: 100, category: 'Tithing', note: '' }).code, 'BAD_INPUT');
    // edit pending keeps it pending
    assert.equal(upd({ id: p.id, kidId: kids.Lizzy, amountCents: 400, category: 'Chores', note: '' }).txs[0].status, 'pending');
  });
});

describe('settleTithing', () => {
  let t;
  beforeEach(() => { fresh(); t = env.login(); });
  test('settles exactly the given eligible rows, writes Settlements, idempotent by settleId', () => {
    const g1 = 'g1', g2 = 'g2';
    const a = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 1000, 'Chores', '', { groupId: g1 }), newTx(kids.Logan, -100, 'Tithing', '', { groupId: g1 })] }).txs;
    const b = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Lizzy, 800, 'Chores', '', { groupId: g2 }), newTx(kids.Lizzy, -80, 'Tithing', '', { groupId: g2 })] }).txs;
    const later = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Jake, -40, 'Tithing')] }).txs;
    const pendT = env.post({ action: 'add', ...dev, txs: [newTx(kids.Jake, -10, 'Tithing')] }).txs;
    const r = env.post({ action: 'settleTithing', token: t, ...dev, settleId: 's_1', txIds: [a[1].id, b[1].id, a[0].id, pendT[0].id] });
    assert.deepEqual({ ok: r.ok, count: r.count, totalCents: r.totalCents }, { ok: true, count: 2, totalCents: 180 });
    assert.deepEqual(r.settledIds.sort(), [a[1].id, b[1].id].sort());
    const s = env.rows('Settlements');
    assert.equal(s.length, 1);
    assert.equal(s[0].Total, 1.8);
    assert.equal(s[0].PerKid, 'Logan $1.00; Lizzy $0.80');
    assert.equal(s[0].User, 'Dad');
    const g = env.get();
    assert.ok(g.transactions.find(x => x.id === a[1].id).settledAt);
    assert.equal(g.transactions.find(x => x.id === later[0].id).settledAt, '', 'not in the list → untouched');
    assert.equal(g.settlements[0].totalCents, 180);
    // repeat → same result, no second row
    const again = env.post({ action: 'settleTithing', token: t, settleId: 's_1', txIds: [a[1].id, b[1].id, later[0].id] });
    assert.deepEqual({ count: again.count, totalCents: again.totalCents }, { count: 2, totalCents: 180 });
    assert.equal(env.rows('Settlements').length, 1);
    assert.equal(env.get().transactions.find(x => x.id === later[0].id).settledAt, '');
    // settled row can't be voided or edited; balances unchanged by settling
    assert.equal(env.post({ action: 'setStatus', token: t, id: a[1].id, status: 'void' }).code, 'SETTLED');
  });
  test('nothing eligible → count 0 and no Settlements row', () => {
    const r = env.post({ action: 'settleTithing', token: t, settleId: 's_empty', txIds: ['nope'] });
    assert.deepEqual({ ok: r.ok, count: r.count, totalCents: r.totalCents }, { ok: true, count: 0, totalCents: 0 });
    assert.equal(env.rows('Settlements').length, 0);
  });
  test('missing settleId → BAD_INPUT', () => {
    assert.equal(env.post({ action: 'settleTithing', token: t, txIds: [] }).code, 'BAD_INPUT');
  });
});

describe('upsertKid / setGoal', () => {
  let t;
  beforeEach(() => { fresh(); t = env.login(); });
  const up = (kid) => env.post({ action: 'upsertKid', token: t, ...dev, kid });

  test('insert, rename (history keeps KidID, Child snapshot not rewritten), archive', () => {
    const add = env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Logan, 100, 'Chores')] }).txs[0];
    const r = up({ id: 'k_test', name: 'Test', color: '#34d1b2', emoji: '🐢', archived: false });
    assert.deepEqual(r.kid, { id: 'k_test', name: 'Test', color: '#34d1b2', emoji: '🐢', goalName: '', goalCents: 0, archived: false, avatar: '' });
    const ren = up({ id: kids.Logan, name: 'Lo', color: '#4cd964', emoji: '🦖', archived: false });
    assert.equal(ren.kid.name, 'Lo');
    const g = env.get();
    assert.equal(g.kids.filter(k => k.id === kids.Logan).length, 1);
    assert.equal(g.transactions.find(x => x.id === add.id).kidId, kids.Logan);
    assert.equal(env.rows('Transactions').find(x => x.ID === add.id).Child, 'Logan', 'snapshot kept');
    up({ id: kids.Jake, name: 'Jake', color: '#ffcc4d', emoji: '🚀', archived: true });
    assert.equal(env.get().kids.find(k => k.id === kids.Jake).archived, true);
    assert.equal(env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Jake, 100, 'Chores')] }).code, 'BAD_INPUT');
    // unarchive + rename Baby
    const b = up({ id: kids.Baby, name: 'Emma', color: '#c084fc', emoji: '🍼', archived: false });
    assert.equal(b.kid.archived, false);
    assert.equal(env.post({ action: 'add', token: t, ...dev, txs: [newTx(kids.Baby, 100, 'Gift')] }).txs[0].kidName, 'Emma');
  });
  test('validation', () => {
    const bad = (kid, msg) => assert.equal(up(kid).code, 'BAD_INPUT', msg);
    bad({ id: 'k_a', name: '', color: '#ffffff', emoji: '' }, 'empty name');
    bad({ id: 'k_a', name: 'x'.repeat(21), color: '#ffffff', emoji: '' }, 'long name');
    bad({ id: 'k_a', name: 'logan', color: '#ffffff', emoji: '' }, 'duplicate name (case-insensitive)');
    bad({ id: 'k_a', name: 'Ann', color: 'red', emoji: '' }, 'bad color');
    bad({ id: 'k_a', name: 'Ann', color: '#fff', emoji: '' }, 'short color');
    bad({ id: 'k_a', name: 'Ann', color: '#ffffff', emoji: '123456789' }, 'emoji too long');
    bad({ id: '', name: 'Ann', color: '#ffffff', emoji: '' }, 'no id');
    assert.equal(up({ id: kids.Logan, name: 'LOGAN', color: '#4cd964', emoji: '' }).ok, true, 'same kid may change case');
  });
  test('setGoal writes dollars; 0 clears both; validation', () => {
    const r = env.post({ action: 'setGoal', token: t, ...dev, kidId: kids.Jake, goalName: 'Lego', goalCents: 1000 });
    assert.equal(r.kid.goalCents, 1000);
    assert.equal(r.kid.goalName, 'Lego');
    const row = env.rows('Kids').find(k => k.Name === 'Jake');
    assert.equal(row['Goal Amount'], 10);
    const c = env.post({ action: 'setGoal', token: t, ...dev, kidId: kids.Jake, goalName: 'Lego', goalCents: 0 });
    assert.deepEqual([c.kid.goalName, c.kid.goalCents], ['', 0]);
    const row2 = env.rows('Kids').find(k => k.Name === 'Jake');
    assert.deepEqual([row2['Goal Name'], row2['Goal Amount']], ['', '']);
    assert.equal(env.post({ action: 'setGoal', token: t, kidId: 'k_x', goalName: 'a', goalCents: 1 }).code, 'NOT_FOUND');
    assert.equal(env.post({ action: 'setGoal', token: t, kidId: kids.Jake, goalName: 'x'.repeat(41), goalCents: 1 }).code, 'BAD_INPUT');
    assert.equal(env.post({ action: 'setGoal', token: t, kidId: kids.Jake, goalName: 'a', goalCents: 1.5 }).code, 'BAD_INPUT');
    assert.equal(env.post({ action: 'setGoal', token: t, kidId: kids.Jake, goalName: 'a', goalCents: -5 }).code, 'BAD_INPUT');
    assert.ok(env.rows('Audit').some(a => a.Action === 'setGoal'));
  });

  test('a kid (no token) can set and clear their own goal, but not a sibling\'s', () => {
    const own = env.post({ action: 'setGoal', ...dev, user: { role: 'kid', id: kids.Jake, name: 'Jake' }, kidId: kids.Jake, goalName: 'Power Wheels', goalCents: 10000 });
    assert.equal(own.ok, true);
    assert.equal(own.kid.goalCents, 10000);
    const cleared = env.post({ action: 'setGoal', ...dev, user: { role: 'kid', id: kids.Jake, name: 'Jake' }, kidId: kids.Jake, goalName: '', goalCents: 0 });
    assert.equal(cleared.kid.goalCents, 0);
    const sib = env.post({ action: 'setGoal', ...dev, user: { role: 'kid', id: kids.Jake, name: 'Jake' }, kidId: kids.Logan, goalName: 'Hack', goalCents: 100 });
    assert.equal(sib.code, 'AUTH');
    const last = env.rows('Audit').filter(a => a.Action === 'setGoal').pop();
    assert.ok(last);
  });
});

describe('setAvatar', () => {
  beforeEach(fresh);
  test('own avatar for kids, any for parents, strict code format, preserved by upsertKid', () => {
    const jake = { role: 'kid', id: kids.Jake, name: 'Jake' };
    const r = env.post({ action: 'setAvatar', ...dev, user: jake, kidId: kids.Jake, avatar: '2:g:ice:12:2:2:tia+wnd:ff5fa2:3a3d48' });
    assert.equal(r.ok, true);
    assert.equal(env.get().kids.find(k => k.id === kids.Jake).avatar, '2:g:ice:12:2:2:tia+wnd:ff5fa2:3a3d48');
    assert.equal(env.post({ action: 'setAvatar', ...dev, user: jake, kidId: kids.Logan, avatar: '1:b:spk:0:0:0:' }).code, 'AUTH');
    for (const bad of ['=HYPERLINK("x")', '<svg/onload=1>', '1:b:spk:0:0:0:cap+', '1:z:spk:0:0:0:', '2:b:spk:0:0:0::#ff0000:', '2:b:spk:0:0:0:', 'x'.repeat(100)]) {
      assert.equal(env.post({ action: 'setAvatar', ...dev, user: jake, kidId: kids.Jake, avatar: bad }).code, 'BAD_INPUT', bad);
    }
    assert.equal(env.post({ action: 'setAvatar', ...dev, user: jake, kidId: kids.Jake, avatar: '' }).kid.avatar, '');
    const t = env.login();
    env.post({ action: 'setAvatar', token: t, ...dev, kidId: kids.Logan, avatar: '1:b:buz:0:0:0:' });
    env.post({ action: 'upsertKid', token: t, ...dev, kid: { id: kids.Logan, name: 'Logan', color: '#4cd964', emoji: '🦖', archived: false } });
    assert.equal(env.get().kids.find(k => k.id === kids.Logan).avatar, '1:b:buz:0:0:0:');
    assert.ok(env.rows('Audit').some(a => a.Action === 'setAvatar'));
  });
});

describe('setEmoji', () => {
  beforeEach(fresh);
  test('a kid can set their own icon; not a sibling’s; a parent can set anyone’s', () => {
    const own = env.post({ action: 'setEmoji', ...dev, user: { role: 'kid', id: kids.Jake, name: 'Jake' }, kidId: kids.Jake, emoji: '🦖' });
    assert.equal(own.ok, true);
    assert.equal(own.kid.emoji, '🦖');
    assert.equal(env.get().kids.find(k => k.id === kids.Jake).emoji, '🦖');
    const sib = env.post({ action: 'setEmoji', ...dev, user: { role: 'kid', id: kids.Jake, name: 'Jake' }, kidId: kids.Logan, emoji: '🐸' });
    assert.equal(sib.code, 'AUTH');
    assert.ok(env.rows('Audit').some(a => a.Action === 'auth_reject'));
    const t = env.login();
    assert.equal(env.post({ action: 'setEmoji', token: t, ...dev, kidId: kids.Logan, emoji: '🐸' }).kid.emoji, '🐸');
    assert.equal(env.post({ action: 'setEmoji', token: t, ...dev, kidId: kids.Logan, emoji: 'x'.repeat(17) }).code, 'BAD_INPUT');
    assert.equal(env.post({ action: 'setEmoji', token: t, ...dev, kidId: 'k_nope', emoji: '🐸' }).code, 'NOT_FOUND');
  });
});

describe('transport', () => {
  beforeEach(fresh);
  test('lock busy → BUSY (retryable), nothing written', () => {
    env.lockState.busy = true;
    const r = env.post({ action: 'add', ...dev, txs: [newTx(kids.Logan, 100, 'Chores')] });
    assert.equal(r.code, 'BUSY');
    env.lockState.busy = false;
    assert.equal(env.rows('Transactions').length, 0);
  });
  test('lock is released after every POST', () => {
    env.post({ action: 'add', ...dev, txs: [newTx(kids.Logan, 100, 'Chores')] });
    env.post({ action: 'nope' });
    assert.equal(env.lockState.held, false);
  });
  test('bad JSON / unknown action → BAD_INPUT', () => {
    assert.equal(env.post('not json').code, 'BAD_INPUT');
    assert.equal(env.post({ action: 'dropTables' }).code, 'BAD_INPUT');
  });
  test('every response is ok:true or ok:false with code+error', () => {
    const r = env.post({ action: 'setStatus', id: 'x', status: 'approved' });
    assert.equal(r.ok, false);
    assert.equal(typeof r.code, 'string');
    assert.equal(typeof r.error, 'string');
  });
});

describe('QA regressions', () => {
  beforeEach(fresh);
  const now = () => new Date().toISOString();

  test('a request cannot join another request\'s group (approving one card would approve the forged row)', () => {
    const g = 'g_lizzy';
    assert.equal(env.post({ action: 'add', token: null, user: kidUser('Lizzy'), txs: [newTx(kids.Lizzy, 500, 'Chores', '', { groupId: g }), newTx(kids.Lizzy, -50, 'Tithing', '', { groupId: g })] }).ok, true);
    const forged = env.post({ action: 'add', token: null, user: kidUser('Logan'), txs: [newTx(kids.Logan, 100000, 'Gift', '', { groupId: g })] });
    assert.equal(forged.code, 'BAD_INPUT');
    assert.equal(env.get().transactions.length, 2);
  });

  test('retrying the same group request is still idempotent', () => {
    const g = 'g_r';
    const txs = [newTx(kids.Jake, 500, 'Chores', '', { groupId: g }), newTx(kids.Jake, -50, 'Tithing', '', { groupId: g })];
    env.post({ action: 'add', token: null, user: kidUser('Jake'), txs });
    const again = env.post({ action: 'add', token: null, user: kidUser('Jake'), txs });
    assert.equal(again.ok, true);
    assert.equal(again.duplicate, true);
    assert.equal(env.get().transactions.length, 2);
  });

  test('two txs with the same id in one request → BAD_INPUT, nothing written', () => {
    const a = newTx(kids.Jake, 500, 'Chores', '', { groupId: 'gd' });
    const r = env.post({ action: 'add', token: null, user: kidUser('Jake'), txs: [a, { ...a, amountCents: -50, category: 'Tithing' }] });
    assert.equal(r.code, 'BAD_INPUT');
    assert.equal(env.get().transactions.length, 0);
  });

  test('moving a grouped entry to another kid moves its unsettled tithing row too', () => {
    const t = env.login();
    const g = 'g_m';
    const [a, tr] = env.post({ action: 'add', token: t, txs: [newTx(kids.Logan, 2000, 'Chores', '', { groupId: g }), newTx(kids.Logan, -200, 'Tithing', '', { groupId: g })] }).txs;
    const r = env.post({ action: 'update', token: t, id: a.id, kidId: kids.Jake, amountCents: 3000, category: 'Chores', note: '', retithe: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.txs.map(x => x.id).sort(), [a.id, tr.id].sort());
    const g2 = env.get().transactions.find(x => x.id === tr.id);
    assert.equal(g2.kidId, kids.Jake);
    assert.equal(g2.amountCents, -300);
  });

  test('text that looks like a formula is stored as plain text', () => {
    const r = env.post({ action: 'add', token: null, deviceName: '=HYPERLINK("x")', user: kidUser('=1+1'),
      txs: [newTx(kids.Jake, 100, 'Chores', '=IMPORTXML("http://evil","//a")')] });
    assert.equal(r.ok, true);
    const row = env.rows('Transactions')[0];
    assert.equal(row.Note, '=IMPORTXML("http://evil","//a")');
    assert.equal(row.DeviceName, '=HYPERLINK("x")');
    assert.equal(row.User, '=1+1');
    for (const n of ['Transactions', 'Audit']) {
      env.rows(n).forEach(x => Object.values(x).forEach(v => assert.ok(!(v && typeof v === 'object' && v.formula), n + ' has a formula: ' + JSON.stringify(v))));
    }
    assert.equal(env.get().transactions[0].note, '=IMPORTXML("http://evil","//a")');
  });

  test('negative amounts still round-trip as numbers', () => {
    const t = env.login();
    env.post({ action: 'add', token: t, txs: [newTx(kids.Jake, -250, 'Spending', '-Candy')] });
    const row = env.rows('Transactions')[0];
    assert.equal(row.Amount, -2.5);
    assert.equal(row.Note, '-Candy');
    assert.equal(env.get().transactions[0].amountCents, -250);
  });
});
