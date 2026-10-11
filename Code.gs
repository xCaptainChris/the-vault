/**
 * THE VAULT v1.0 — Family Bank backend (Google Apps Script, V8 runtime)
 *
 * Setup / upgrade (see SETUP.md):
 *   1. Paste this whole file into Extensions → Apps Script (replace the old code). Save.
 *   2. Run setup() once. It is safe to re-run: it creates missing tabs/columns, gives every
 *      kid a stable ID, links old rows to kids by name, and never deletes anything.
 *   3. Deploy → Manage deployments → edit the existing Web app → New version (URL unchanged).
 *      Execute as: Me. Who has access: Anyone.
 *
 * Money is integer cents in the API; the Sheet shows dollars ($0.00).
 * Columns are found by header name, so you can reorder or add your own columns safely.
 * Behaviour mirrors js/api/mock-server.js — change both together.
 */

var SCHEMA = 4;
var TITHE_PCT = 10;
var MAX_CENTS = 1000000;
var LOCK_MAX = 5;
var LOCK_SECONDS = 15 * 60;
var SESSION_CACHE_SECONDS = 600;
var CLOCK_SKEW_MS = 5 * 60 * 1000;
var DATE_FMT = 'yyyy-mm-dd hh:mm';

var TABS = {
  Transactions: ['ID', 'Timestamp', 'Child', 'Amount', 'Category', 'Note', 'Status', 'DeviceID', 'DeviceName', 'ActedBy',
    'Settled', 'User', 'KidID', 'Role', 'ClientTime', 'ActedAt', 'ActedDeviceName', 'EditedBy', 'EditedAt', 'GroupID', 'SettleID', 'Reason'],
  Kids: ['Name', 'Color', 'Goal Name', 'Goal Amount', 'KidID', 'Emoji', 'Archived', 'Avatar'],
  Parents: ['Name', 'PIN', 'ParentID'],
  Categories: ['Name', 'Emoji', 'Color', 'Direction', 'Active'],
  Sessions: ['TokenHash', 'ParentID', 'Name', 'DeviceID', 'DeviceName', 'CreatedAt', 'LastSeenAt', 'RevokedAt'],
  Settlements: ['SettleID', 'Timestamp', 'Total', 'Count', 'PerKid', 'User', 'DeviceName', 'TxIDs'],
  Audit: ['Timestamp', 'Action', 'TargetID', 'User', 'Role', 'DeviceID', 'DeviceName', 'Details'],
};
var TAB_ORDER = ['Transactions', 'Kids', 'Parents', 'Categories', 'Sessions', 'Settlements', 'Audit'];

var FORMATS = {
  Transactions: { Amount: '$0.00', Timestamp: DATE_FMT, ClientTime: DATE_FMT, ActedAt: DATE_FMT, EditedAt: DATE_FMT, Settled: DATE_FMT,
    ID: '@', DeviceID: '@', Note: '@', KidID: '@', GroupID: '@', SettleID: '@' },
  Kids: { 'Goal Amount': '$0.00', KidID: '@' },
  Parents: { PIN: '@', ParentID: '@' },
  Sessions: { TokenHash: '@', ParentID: '@', DeviceID: '@', CreatedAt: DATE_FMT, LastSeenAt: DATE_FMT, RevokedAt: DATE_FMT },
  Settlements: { SettleID: '@', Timestamp: DATE_FMT, Total: '$0.00', TxIDs: '@' },
  Audit: { Timestamp: DATE_FMT, TargetID: '@', DeviceID: '@' },
};

var SEED_KIDS = [
  ['Logan', '#4cd964', '🦖', false],
  ['Lizzy', '#00d2ff', '🦄', false],
  ['Jake', '#ffcc4d', '🚀', false],
  ['Baby', '#c084fc', '🍼', true],
];
var SEED_CATEGORIES = [
  ['Chores', '🧹', '#4cd964', 'in'],
  ['Gift', '🎁', '#ffcc4d', 'in'],
  ['Spending', '🛒', '#ff6b5e', 'out'],
  ['Digital', '🎮', '#c084fc', 'out'],
  ['Tithing', '⛪', '#7ea6ff', 'out'],
  ['Savings', '🏦', '#34d1b2', 'out'],
  ['Other', '➕', '#8a8a96', 'both'],
];

/* ======================================================================
 * setup(): idempotent and migration-safe
 * ==================================================================== */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summary = { created: [], addedColumns: {}, kidsAssigned: 0, parentsAssigned: 0, txLinked: 0, kidsCreated: 0, backfilled: 0 };
  var fresh = {};
  TAB_ORDER.forEach(function (name) {
    var r = ensureSheet_(ss, name, TABS[name]);
    if (r.created) { summary.created.push(name); fresh[name] = true; }
    if (r.added.length) summary.addedColumns[name] = r.added;
  });

  // Formats (re-applying the same format is a no-op)
  Object.keys(FORMATS).forEach(function (name) {
    var sh = sheet_(name);
    var map = colMap_(sh);
    var rows = sh.getMaxRows() - 1;
    if (rows < 1) return;
    Object.keys(FORMATS[name]).forEach(function (h) {
      if (map[h] == null) return;
      sh.getRange(2, map[h] + 1, rows, 1).setNumberFormat(FORMATS[name][h]);
    });
  });

  // Seeds (only when the tab was just created)
  if (fresh.Kids) {
    SEED_KIDS.forEach(function (k) {
      appendObj_(sheet_('Kids'), { Name: k[0], Color: k[1], 'Goal Name': '', 'Goal Amount': '', KidID: 'k_' + rand_(8), Emoji: k[2], Archived: k[3] });
    });
  }
  if (fresh.Parents) {
    appendObj_(sheet_('Parents'), { Name: 'Dad', PIN: '1234', ParentID: 'p_' + rand_(8) });
    appendObj_(sheet_('Parents'), { Name: 'Mom', PIN: '1234', ParentID: 'p_' + rand_(8) });
    Logger.log('WARNING: Parents seeded with PIN 1234 — change them in the Parents tab now.');
  }
  if (fresh.Categories) {
    SEED_CATEGORIES.forEach(function (c) {
      appendObj_(sheet_('Categories'), { Name: c[0], Emoji: c[1], Color: c[2], Direction: c[3], Active: true });
    });
  }

  // Kids: stable IDs, Archived defaults to FALSE
  var kt = table_('Kids');
  kt.rows.forEach(function (row, i) {
    var name = String(row[kt.map.Name] || '').trim();
    if (!name) return;
    var patch = {};
    if (!String(row[kt.map.KidID] || '').trim()) { patch.KidID = 'k_' + rand_(8); summary.kidsAssigned++; }
    if (row[kt.map.Archived] === '' || row[kt.map.Archived] == null) patch.Archived = false;
    if (Object.keys(patch).length) setCells_(kt.sheet, kt.map, i + 2, patch);
  });

  // Parents: stable IDs
  var pt = table_('Parents');
  pt.rows.forEach(function (row, i) {
    if (!String(row[pt.map.Name] || '').trim()) return;
    if (!String(row[pt.map.ParentID] || '').trim()) { setCells_(pt.sheet, pt.map, i + 2, { ParentID: 'p_' + rand_(8) }); summary.parentsAssigned++; }
  });

  // Transactions: link to kids by name; create archived kids for unknown names; backfill
  var kidsByName = {};
  readKids_().forEach(function (k) { kidsByName[k.name.trim().toLowerCase()] = k; });
  var tt = table_('Transactions');
  tt.rows.forEach(function (row, i) {
    if (!String(row[tt.map.ID] || '').trim()) return;
    var patch = {};
    if (!String(row[tt.map.KidID] || '').trim()) {
      var child = String(row[tt.map.Child] || '').trim();
      var key = child.toLowerCase();
      var kid = kidsByName[key];
      if (!kid) {
        kid = { id: 'k_' + rand_(8), name: child || 'Unknown' };
        appendObj_(sheet_('Kids'), { Name: kid.name, Color: '#8a8a96', KidID: kid.id, Emoji: '', Archived: true });
        kidsByName[key] = kid;
        summary.kidsCreated++;
      }
      patch.KidID = kid.id;
      summary.txLinked++;
    }
    if (row[tt.map.Role] === '' || row[tt.map.Role] == null) {
      if (String(row[tt.map.ActedBy] || '').trim()) patch.Role = 'parent';
    }
    if ((row[tt.map.ClientTime] === '' || row[tt.map.ClientTime] == null) && row[tt.map.Timestamp]) {
      patch.ClientTime = row[tt.map.Timestamp];
    }
    if (Object.keys(patch).length) { setCells_(tt.sheet, tt.map, i + 2, patch); summary.backfilled++; }
  });

  PropertiesService.getScriptProperties().setProperty('SCHEMA_VERSION', String(SCHEMA));
  Logger.log('setup() summary: ' + JSON.stringify(summary));
  return summary;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return { created: true, added: [] };
  }
  var lastCol = sh.getLastColumn();
  var have = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var added = headers.filter(function (h) { return have.indexOf(h) < 0; });
  if (added.length) {
    sh.getRange(1, have.length + 1, 1, added.length).setValues([added]).setFontWeight('bold');
    if (!have.length) sh.setFrozenRows(1);
  }
  return { created: false, added: added };
}

function ensureSchema_() {
  var v = Number(PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION') || 0);
  if (v >= SCHEMA) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    v = Number(PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION') || 0);
    if (v < SCHEMA) setup();
  } finally {
    lock.releaseLock();
  }
}

/* ======================================================================
 * HTTP entry points
 * ==================================================================== */
function doGet(e) {
  try {
    ensureSchema_();
    var p = (e && e.parameter) || {};
    if (String(p.diag) === '1') return json_(diag_());
    var settlements = readSettlements_().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 10)
      .map(function (s) { return { id: s.id, ts: s.ts, totalCents: s.totalCents, count: s.count, perKid: s.perKid, user: s.user, deviceName: s.deviceName }; });
    return json_({
      ok: true, schema: SCHEMA, serverTime: new Date().toISOString(),
      instance: PropertiesService.getScriptProperties().getProperty('INSTANCE_NAME') || '',
      kids: readKids_().map(publicKid_),
      parents: readParents_().map(function (x) { return { id: x.id, name: x.name }; }),
      categories: readCategories_(),
      transactions: readTx_().map(function (r) { return r.tx; }),
      settlements: settlements,
    });
  } catch (err) {
    return json_({ ok: false, code: 'BUSY', error: String(err && err.message || err) });
  }
}

function diag_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = {};
  TAB_ORDER.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lc = sh.getLastColumn();
    tabs[name] = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
  });
  return { ok: true, schema: SCHEMA, instance: PropertiesService.getScriptProperties().getProperty('INSTANCE_NAME') || '', tabs: tabs };
}

var PARENT_ONLY = { setStatus: 1, update: 1, settleTithing: 1, upsertKid: 1 };
var ACTIONS = {
  login: login_, whoami: whoami_, logout: logout_, add: add_, setStatus: setStatus_, update: update_,
  settleTithing: settleTithing_, upsertKid: upsertKid_, setGoal: setGoal_, setEmoji: setEmoji_, setAvatar: setAvatar_,
};

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, code: 'BAD_INPUT', error: 'Body must be JSON' });
  }
  if (!body || typeof body !== 'object') return json_({ ok: false, code: 'BAD_INPUT', error: 'Body must be an object' });
  try {
    ensureSchema_();
  } catch (err) {
    return json_({ ok: false, code: 'BUSY', error: String(err && err.message || err) });
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, code: 'BUSY', error: 'Busy — try again' });
  try {
    return json_(dispatch_(body));
  } catch (err) {
    return json_({ ok: false, code: 'BUSY', error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function dispatch_(b) {
  var fn = ACTIONS[b.action];
  if (!fn) return err_('BAD_INPUT', 'Unknown action');
  var s = null;
  if (b.action !== 'login' && b.action !== 'logout') {
    s = auth_(b.token);
    var claimed = { name: str_(b.user && b.user.name, 40), role: 'kid' };
    if (!s && b.token) audit_('auth_reject', b.id || '', claimed, b, { action: b.action, reason: 'bad token' });
    if (!s && PARENT_ONLY[b.action]) {
      if (!b.token) audit_('auth_reject', b.id || '', claimed, b, { action: b.action, reason: 'no token' });
      return err_('AUTH', 'Parent sign-in needed');
    }
  }
  return fn(b, s);
}

/* ======================================================================
 * Auth
 * ==================================================================== */
function login_(b) {
  var parentId = String(b.parentId || '');
  var cache = CacheService.getScriptCache();
  var key = 'fail:' + parentId;
  var f = parseJson_(cache.get(key));
  if (f && f.count >= LOCK_MAX) return err_('LOCKED', 'Too many tries — wait 15 min');
  var parent = null;
  readParents_().forEach(function (p) { if (p.id === parentId) parent = p; });
  if (!parent || String(parent.pin) !== String(b.pin == null ? '' : b.pin)) {
    var now = Date.now();
    var first = f ? f.first : now;
    var count = (f ? f.count : 0) + 1;
    var ttl = Math.max(1, LOCK_SECONDS - Math.floor((now - first) / 1000));
    cache.put(key, JSON.stringify({ count: count, first: first }), ttl);
    audit_('login_fail', parentId, { name: parent ? parent.name : '', role: 'parent' }, b, { count: count });
    if (count >= LOCK_MAX) return err_('LOCKED', 'Too many tries — wait 15 min');
    return err_('AUTH', 'Wrong PIN');
  }
  cache.remove(key);
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var t = new Date();
  appendObj_(sheet_('Sessions'), {
    TokenHash: sha256hex_(token), ParentID: parent.id, Name: parent.name, DeviceID: str_(b.deviceId, 64),
    DeviceName: str_(b.deviceName, 60), CreatedAt: t, LastSeenAt: t, RevokedAt: '',
  });
  audit_('login', parent.id, { name: parent.name, role: 'parent' }, b, {});
  return { ok: true, token: token, parent: { id: parent.id, name: parent.name } };
}

function whoami_(b, s) {
  return s ? { ok: true, parent: { id: s.parentId, name: s.name } } : err_('AUTH', 'Please sign in again');
}

function logout_(b) {
  if (!b.token || typeof b.token !== 'string') return { ok: true };
  var hash = sha256hex_(b.token);
  CacheService.getScriptCache().remove('s:' + hash);
  var t = table_('Sessions');
  for (var i = 0; i < t.rows.length; i++) {
    var row = t.rows[i];
    if (String(row[t.map.TokenHash]) === hash && !row[t.map.RevokedAt]) {
      setCells_(t.sheet, t.map, i + 2, { RevokedAt: new Date() });
      audit_('logout', String(row[t.map.ParentID]), { name: String(row[t.map.Name]), role: 'parent' }, b, {});
    }
  }
  return { ok: true };
}

// Returns {parentId, name} for a valid, unrevoked token whose parent still exists; else null.
function auth_(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  var hash = sha256hex_(token);
  var cache = CacheService.getScriptCache();
  var s = parseJson_(cache.get('s:' + hash));
  if (!s) {
    var t = table_('Sessions');
    for (var i = 0; i < t.rows.length; i++) {
      var row = t.rows[i];
      if (String(row[t.map.TokenHash]) === hash && !row[t.map.RevokedAt]) {
        s = { parentId: String(row[t.map.ParentID]), name: String(row[t.map.Name]), seenDay: dayOf_(row[t.map.LastSeenAt]) };
        break;
      }
    }
    if (!s) return null;
  }
  var parent = null;
  readParents_().forEach(function (p) { if (p.id === s.parentId) parent = p; });
  if (!parent) { cache.remove('s:' + hash); return null; }   // parent row deleted → sessions revoked
  s.name = parent.name;
  var today = dayOf_(new Date());
  if (s.seenDay !== today) {
    var st = table_('Sessions');
    for (var j = 0; j < st.rows.length; j++) {
      if (String(st.rows[j][st.map.TokenHash]) === hash) { setCells_(st.sheet, st.map, j + 2, { LastSeenAt: new Date() }); break; }
    }
    s.seenDay = today;
  }
  cache.put('s:' + hash, JSON.stringify(s), SESSION_CACHE_SECONDS);
  return { parentId: s.parentId, name: s.name };
}

function sha256hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

/* ======================================================================
 * Write actions
 * ==================================================================== */
function validateTx_(t, kidsById, catsByName) {
  var k = kidsById[t.kidId];
  if (!k) return 'Unknown kid';
  if (k.archived) return 'That kid is archived';
  if (!isInt_(t.amountCents) || t.amountCents === 0 || Math.abs(t.amountCents) > MAX_CENTS) return 'Amount must be a whole number of cents, not zero, at most $10,000';
  var c = catsByName[t.category];
  if (!c || !c.active) return 'Unknown category';
  var dir = t.amountCents > 0 ? 'in' : 'out';
  if (c.dir !== 'both' && c.dir !== dir) return 'Category does not match direction';
  if (t.category === 'Tithing' && t.amountCents > 0) return 'Tithing must be money out';
  if (String(t.note == null ? '' : t.note).length > 80) return 'Note is too long';
  return null;
}

function lookups_() {
  var kidsById = {};
  readKids_().forEach(function (k) { kidsById[k.id] = k; });
  var catsByName = {};
  readCategories_().forEach(function (c) { catsByName[c.name] = c; });
  return { kidsById: kidsById, catsByName: catsByName };
}

function add_(b, s) {
  var txs = Array.isArray(b.txs) ? b.txs : null;
  if (!txs || txs.length < 1 || txs.length > 2) return err_('BAD_INPUT', 'Send 1 or 2 entries');
  for (var i = 0; i < txs.length; i++) {
    if (!txs[i] || typeof txs[i].id !== 'string' || !txs[i].id || txs[i].id.length > 64) return err_('BAD_INPUT', 'Missing id');
  }
  var ids = txs.map(function (t) { return t.id; });
  if (txs.length === 2 && ids[0] === ids[1]) return err_('BAD_INPUT', 'Duplicate id');
  var all = readTx_();
  var byId = {};
  all.forEach(function (r) { byId[r.tx.id] = r; });
  var existing = txs.map(function (t) { return byId[t.id] ? byId[t.id].tx : null; });
  if (existing.every(function (x) { return !!x; })) return { ok: true, txs: existing, duplicate: true };
  // A group belongs to the one request that created it: never join someone else's group
  // (approving/voiding a group moves every row in it).
  for (var gi = 0; gi < txs.length; gi++) {
    var gid = str_(txs[gi].groupId, 64);
    if (gid && all.some(function (r) { return r.tx.groupId === gid && ids.indexOf(r.tx.id) < 0; })) return err_('BAD_INPUT', 'That group is already in use');
  }

  var L = lookups_();
  for (var j = 0; j < txs.length; j++) {
    var e = validateTx_(txs[j], L.kidsById, L.catsByName);
    if (e) return err_('BAD_INPUT', e);
  }
  if (txs.length === 2) {
    var a = txs[0], c = txs[1];
    if (a.kidId !== c.kidId || !a.groupId || a.groupId !== c.groupId) return err_('BAD_INPUT', 'Linked entries must share kid and group');
    if (c.category !== 'Tithing' || c.amountCents >= 0) return err_('BAD_INPUT', 'Second entry must be tithing');
  }

  var now = new Date();
  var actor = s ? { name: s.name, role: 'parent' } : { name: str_(b.user && b.user.name, 40), role: 'kid' };
  var status = s ? 'approved' : 'pending';
  var sh = sheet_('Transactions');
  var out = [];
  txs.forEach(function (t, idx) {
    if (existing[idx]) { out.push(existing[idx]); return; }
    var ct = Date.parse(t.clientTime);
    if (!isFinite(ct)) ct = now.getTime();
    if (ct > now.getTime() + CLOCK_SKEW_MS) ct = now.getTime() + CLOCK_SKEW_MS;
    var kid = L.kidsById[t.kidId];
    var tx = {
      id: t.id, ts: now.toISOString(), clientTime: new Date(ct).toISOString(), kidId: kid.id, kidName: kid.name,
      amountCents: t.amountCents, category: t.category, note: str_(t.note, 80), status: status, user: actor.name, role: actor.role,
      deviceId: str_(b.deviceId, 64), deviceName: str_(b.deviceName, 60),
      actedBy: s ? s.name : '', actedAt: s ? now.toISOString() : '', actedDeviceName: s ? str_(b.deviceName, 60) : '',
      editedBy: '', editedAt: '', settledAt: '', settleId: '', groupId: str_(t.groupId, 64), reason: '',
    };
    appendObj_(sh, txToRow_(tx));
    out.push(tx);
    audit_('add', tx.id, actor, b, { after: tx });
  });
  return { ok: true, txs: out, duplicate: false };
}

function setStatus_(b, s) {
  var target = b.status;
  if (['approved', 'denied', 'void'].indexOf(target) < 0) return err_('BAD_INPUT', 'Bad status');
  var all = readTx_();
  var hit = null;
  all.forEach(function (r) { if (r.tx.id === String(b.id)) hit = r; });
  if (!hit) return err_('NOT_FOUND', 'Entry not found');
  var t = hit.tx;
  if (t.status === target) return { ok: true, txs: [t], skipped: [] };
  if (t.settledAt) return err_('SETTLED', 'Already sent — can’t change');
  var from = target === 'void' ? 'approved' : 'pending';
  if (t.status !== from) return err_('CONFLICT', 'Can’t go from ' + t.status + ' to ' + target);
  var group = t.groupId ? all.filter(function (r) { return r.tx.groupId === t.groupId; }) : [hit];
  var sh = sheet_('Transactions');
  var map = colMap_(sh);
  var now = new Date();
  var reason = str_(b.reason, 140);                 // optional "why", shown to the kid
  var updated = [], skipped = [];
  group.forEach(function (r) {
    if (r.tx.status !== from) return;
    if (r.tx.settledAt) { skipped.push(r.tx.id); return; }
    setCells_(sh, map, r.rowNum, { Status: target, ActedBy: s.name, ActedAt: now, ActedDeviceName: str_(b.deviceName, 60), Reason: reason });
    var before = r.tx.status;
    r.tx.status = target; r.tx.actedBy = s.name; r.tx.actedAt = now.toISOString(); r.tx.actedDeviceName = str_(b.deviceName, 60); r.tx.reason = reason;
    updated.push(r.tx);
    var det = { before: before, after: target };
    if (reason) det.reason = reason;
    audit_('setStatus', r.tx.id, { name: s.name, role: 'parent' }, b, det);
  });
  return { ok: true, txs: updated, skipped: skipped };
}

function update_(b, s) {
  var all = readTx_();
  var hit = null;
  all.forEach(function (r) { if (r.tx.id === String(b.id)) hit = r; });
  if (!hit) return err_('NOT_FOUND', 'Entry not found');
  var t = hit.tx;
  if (t.settledAt) return err_('SETTLED', 'Already sent — can’t edit');
  if (t.status !== 'pending' && t.status !== 'approved') return err_('CONFLICT', 'Can’t edit a ' + t.status + ' entry');
  var next = { kidId: b.kidId, amountCents: b.amountCents, category: b.category, note: b.note == null ? '' : b.note };
  var L = lookups_();
  var e = validateTx_(next, L.kidsById, L.catsByName);
  if (e) return err_('BAD_INPUT', e);
  var kid = L.kidsById[next.kidId];
  var now = new Date();
  var sh = sheet_('Transactions');
  var map = colMap_(sh);
  var before = { kidId: t.kidId, amountCents: t.amountCents, category: t.category, note: t.note };
  setCells_(sh, map, hit.rowNum, { KidID: kid.id, Child: kid.name, Amount: next.amountCents / 100, Category: next.category,
    Note: str_(next.note, 80), EditedBy: s.name, EditedAt: now });
  t.kidId = kid.id; t.kidName = kid.name; t.amountCents = next.amountCents; t.category = next.category; t.note = str_(next.note, 80);
  t.editedBy = s.name; t.editedAt = now.toISOString();
  audit_('update', t.id, { name: s.name, role: 'parent' }, b, { before: before, after: next });
  var out = [t];
  // Moving an entry to another kid moves its unsettled linked rows too (a group is one kid's).
  if (t.groupId && before.kidId !== kid.id) {
    all.forEach(function (r) {
      var x = r.tx;
      if (x.groupId !== t.groupId || x.id === t.id || x.settledAt || x.kidId === kid.id) return;
      if (x.status !== 'pending' && x.status !== 'approved') return;
      setCells_(sh, map, r.rowNum, { KidID: kid.id, Child: kid.name, EditedBy: s.name, EditedAt: now });
      audit_('update', x.id, { name: s.name, role: 'parent' }, b, { before: { kidId: x.kidId }, after: { kidId: kid.id }, linked: true });
      x.kidId = kid.id; x.kidName = kid.name; x.editedBy = s.name; x.editedAt = now.toISOString();
      out.push(x);
    });
  }
  if (b.retithe && t.amountCents > 0 && t.groupId) {
    var tr = null;
    all.forEach(function (r) {
      if (!tr && r.tx.groupId === t.groupId && r.tx.id !== t.id && r.tx.category === 'Tithing' && !r.tx.settledAt
        && (r.tx.status === 'pending' || r.tx.status === 'approved')) tr = r;
    });
    if (tr) {
      var tb = { amountCents: tr.tx.amountCents, kidId: tr.tx.kidId };
      var amt = -Math.ceil(t.amountCents * TITHE_PCT / 100);
      setCells_(sh, map, tr.rowNum, { Amount: amt / 100, KidID: kid.id, Child: kid.name, EditedBy: s.name, EditedAt: now });
      tr.tx.amountCents = amt; tr.tx.kidId = kid.id; tr.tx.kidName = kid.name; tr.tx.editedBy = s.name; tr.tx.editedAt = now.toISOString();
      audit_('update', tr.tx.id, { name: s.name, role: 'parent' }, b, { before: tb, after: { amountCents: amt, kidId: kid.id }, retithe: true });
      if (out.indexOf(tr.tx) < 0) out.push(tr.tx);
    }
  }
  return { ok: true, txs: out };
}

function settleTithing_(b, s) {
  var settleId = str_(b.settleId, 64);
  if (!settleId) return err_('BAD_INPUT', 'Missing settleId');
  var prev = null;
  readSettlements_().forEach(function (x) { if (x.id === settleId) prev = x; });
  if (prev) return { ok: true, settleId: settleId, count: prev.count, totalCents: prev.totalCents, settledIds: prev.txIds };
  var ids = Array.isArray(b.txIds) ? b.txIds.map(String) : [];
  var rows = readTx_().filter(function (r) {
    var t = r.tx;
    return ids.indexOf(t.id) >= 0 && t.status === 'approved' && t.category === 'Tithing' && t.amountCents < 0 && !t.settledAt;
  });
  if (!rows.length) return { ok: true, settleId: settleId, count: 0, totalCents: 0, settledIds: [] };
  var now = new Date();
  var sh = sheet_('Transactions');
  var map = colMap_(sh);
  var per = {}, order = [], total = 0;
  rows.forEach(function (r) {
    setCells_(sh, map, r.rowNum, { Settled: now, SettleID: settleId });
    total += -r.tx.amountCents;
    if (per[r.tx.kidName] == null) { per[r.tx.kidName] = 0; order.push(r.tx.kidName); }
    per[r.tx.kidName] += -r.tx.amountCents;
  });
  var perKid = order.map(function (n) { return n + ' $' + (per[n] / 100).toFixed(2); }).join('; ');
  var settledIds = rows.map(function (r) { return r.tx.id; });
  appendObj_(sheet_('Settlements'), { SettleID: settleId, Timestamp: now, Total: total / 100, Count: rows.length, PerKid: perKid,
    User: s.name, DeviceName: str_(b.deviceName, 60), TxIDs: settledIds.join(',') });
  audit_('settleTithing', settleId, { name: s.name, role: 'parent' }, b, { totalCents: total, txIds: settledIds });
  return { ok: true, settleId: settleId, count: rows.length, totalCents: total, settledIds: settledIds };
}

function upsertKid_(b, s) {
  var k = b.kid || {};
  var id = str_(k.id, 64);
  var name = String(k.name == null ? '' : k.name).trim();
  if (!id) return err_('BAD_INPUT', 'Missing kid id');
  if (name.length < 1 || name.length > 20) return err_('BAD_INPUT', 'Name must be 1–20 characters');
  var t = table_('Kids');
  var all = readKids_();
  var clash = all.some(function (x) { return x.id !== id && x.name.toLowerCase() === name.toLowerCase(); });
  if (clash) return err_('BAD_INPUT', 'That name is taken');
  var color = String(k.color || '');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return err_('BAD_INPUT', 'Bad color');
  var emoji = String(k.emoji == null ? '' : k.emoji);
  if (emoji.length > 8) return err_('BAD_INPUT', 'Emoji too long');
  var rowNum = 0, before = null;
  all.forEach(function (x) { if (x.id === id) { rowNum = x.rowNum; before = publicKid_(x); } });
  var patch = { Name: name, Color: color, Emoji: emoji, Archived: !!k.archived };
  if (rowNum) setCells_(t.sheet, t.map, rowNum, patch);
  else { patch.KidID = id; patch['Goal Name'] = ''; patch['Goal Amount'] = ''; appendObj_(t.sheet, patch); }
  var after = null;
  readKids_().forEach(function (x) { if (x.id === id) after = publicKid_(x); });
  audit_('upsertKid', id, { name: s.name, role: 'parent' }, b, { before: before, after: after });
  return { ok: true, kid: after };
}

function setGoal_(b, s) {
  // Parents can set any goal; without a parent session, only the kid's own (a goal moves no money).
  if (!s && !(b.user && b.user.role === 'kid' && b.user.id === b.kidId)) {
    audit_('auth_reject', b.kidId || '', { name: str_(b.user && b.user.name, 40), role: 'kid' }, b, { action: 'setGoal', reason: b.token ? 'bad token' : 'not own goal' });
    return err_('AUTH', 'Parent sign-in needed');
  }
  var kid = null;
  readKids_().forEach(function (x) { if (x.id === b.kidId) kid = x; });
  if (!kid) return err_('NOT_FOUND', 'Kid not found');
  var goalName = String(b.goalName == null ? '' : b.goalName).trim();
  if (goalName.length > 40) return err_('BAD_INPUT', 'Goal name too long');
  var c = b.goalCents == null ? 0 : b.goalCents;
  if (!isInt_(c) || c < 0 || c > MAX_CENTS) return err_('BAD_INPUT', 'Bad goal amount');
  var t = table_('Kids');
  var before = { goalName: kid.goalName, goalCents: kid.goalCents };
  if (c === 0) setCells_(t.sheet, t.map, kid.rowNum, { 'Goal Name': '', 'Goal Amount': '' });
  else setCells_(t.sheet, t.map, kid.rowNum, { 'Goal Name': goalName, 'Goal Amount': c / 100 });
  var after = null;
  readKids_().forEach(function (x) { if (x.id === kid.id) after = publicKid_(x); });
  audit_('setGoal', kid.id, s ? { name: s.name, role: 'parent' } : { name: kid.name, role: 'kid' }, b, { before: before, after: { goalName: after.goalName, goalCents: after.goalCents } });
  return { ok: true, kid: after };
}

/* ======================================================================
 * Readers
 * ==================================================================== */
function readKids_() {
  var t = table_('Kids');
  var out = [];
  t.rows.forEach(function (row, i) {
    var name = String(row[t.map.Name] || '').trim();
    if (!name) return;
    var goal = Number(row[t.map['Goal Amount']] || 0);
    out.push({
      rowNum: i + 2, id: String(row[t.map.KidID] || '').trim(), name: name, color: String(row[t.map.Color] || '#4cd964'),
      emoji: String(row[t.map.Emoji] || ''), goalName: goal > 0 ? String(row[t.map['Goal Name']] || '') : '',
      goalCents: goal > 0 ? Math.round(goal * 100) : 0, archived: bool_(row[t.map.Archived]),
      avatar: t.map.Avatar == null ? '' : String(row[t.map.Avatar] || ''),
    });
  });
  return out;
}

// A kid may change their own emoji (no money involved); parents may change any.
function setEmoji_(b, s) {
  if (!s && !(b.user && b.user.role === 'kid' && b.user.id === b.kidId)) {
    audit_('auth_reject', b.kidId || '', { name: str_(b.user && b.user.name, 40), role: 'kid' }, b, { action: 'setEmoji', reason: b.token ? 'bad token' : 'not own icon' });
    return err_('AUTH', 'Parent sign-in needed');
  }
  var emoji = String(b.emoji == null ? '' : b.emoji).trim();
  if (emoji.length > 16) return err_('BAD_INPUT', 'Emoji too long');
  var kid = null;
  readKids_().forEach(function (x) { if (x.id === b.kidId) kid = x; });
  if (!kid) return err_('NOT_FOUND', 'Kid not found');
  var t = table_('Kids');
  var before = kid.emoji;
  setCells_(t.sheet, t.map, kid.rowNum, { Emoji: emoji });
  kid.emoji = emoji;
  audit_('setEmoji', kid.id, s ? { name: s.name, role: 'parent' } : { name: kid.name, role: 'kid' }, b, { before: before, after: emoji });
  return { ok: true, kid: publicKid_(kid) };
}

// Avatar code (see js/avatar.js). Same rule as the emoji: parents any kid, a kid only their own.
var AVATAR_RE = /^(1:[bg]:[a-z]{3}:\d:\d:\d:([a-z]{3}(\+[a-z]{3})*)?|2:[bg]:[a-z]{3}:\d{1,2}:\d{1,2}:\d{1,2}:([a-z]{3}(\+[a-z]{3})*)?:([0-9a-f]{6})?:([0-9a-f]{6})?)$/;
function setAvatar_(b, s) {
  if (!s && !(b.user && b.user.role === 'kid' && b.user.id === b.kidId)) {
    audit_('auth_reject', b.kidId || '', { name: str_(b.user && b.user.name, 40), role: 'kid' }, b, { action: 'setAvatar', reason: b.token ? 'bad token' : 'not own avatar' });
    return err_('AUTH', 'Parent sign-in needed');
  }
  var code = String(b.avatar == null ? '' : b.avatar).trim();
  if (code && (code.length > 80 || !AVATAR_RE.test(code))) return err_('BAD_INPUT', 'Bad avatar');
  var kid = null;
  readKids_().forEach(function (x) { if (x.id === b.kidId) kid = x; });
  if (!kid) return err_('NOT_FOUND', 'Kid not found');
  var t = table_('Kids');
  var before = kid.avatar;
  setCells_(t.sheet, t.map, kid.rowNum, { Avatar: code });
  kid.avatar = code;
  audit_('setAvatar', kid.id, s ? { name: s.name, role: 'parent' } : { name: kid.name, role: 'kid' }, b, { before: before, after: code });
  return { ok: true, kid: publicKid_(kid) };
}

function publicKid_(k) {
  return { id: k.id, name: k.name, color: k.color, emoji: k.emoji, goalName: k.goalName, goalCents: k.goalCents, archived: k.archived, avatar: k.avatar || '' };
}

function readParents_() {
  var t = table_('Parents');
  var out = [];
  t.rows.forEach(function (row) {
    var name = String(row[t.map.Name] || '').trim();
    var id = String(row[t.map.ParentID] || '').trim();
    if (name && id) out.push({ id: id, name: name, pin: String(row[t.map.PIN] == null ? '' : row[t.map.PIN]).trim() });
  });
  return out;
}

function readCategories_() {
  var t = table_('Categories');
  var out = [];
  t.rows.forEach(function (row) {
    var name = String(row[t.map.Name] || '').trim();
    if (!name) return;
    var dir = String(row[t.map.Direction] || 'both').trim().toLowerCase();
    out.push({ name: name, emoji: String(row[t.map.Emoji] || ''), color: String(row[t.map.Color] || '#8a8a96'),
      dir: dir === 'in' || dir === 'out' ? dir : 'both', active: row[t.map.Active] === '' ? true : bool_(row[t.map.Active]) });
  });
  return out;
}

function readTx_() {
  var t = table_('Transactions');
  var out = [];
  t.rows.forEach(function (row, i) {
    if (!String(row[t.map.ID] == null ? '' : row[t.map.ID]).trim()) return;
    out.push({ rowNum: i + 2, tx: rowToTx_(t.map, row) });
  });
  return out;
}

function readSettlements_() {
  var t = table_('Settlements');
  var out = [];
  t.rows.forEach(function (row) {
    var id = String(row[t.map.SettleID] || '').trim();
    if (!id) return;
    out.push({ id: id, ts: iso_(row[t.map.Timestamp]), totalCents: Math.round(Number(row[t.map.Total] || 0) * 100),
      count: Number(row[t.map.Count] || 0), perKid: String(row[t.map.PerKid] || ''), user: String(row[t.map.User] || ''),
      deviceName: String(row[t.map.DeviceName] || ''),
      txIds: String(row[t.map.TxIDs] || '').split(',').map(function (x) { return x.trim(); }).filter(String) });
  });
  return out;
}

function rowToTx_(map, row) {
  var g = function (h) { return map[h] == null ? '' : row[map[h]]; };
  var s = function (h) { var v = g(h); return v == null ? '' : String(v); };
  return {
    id: s('ID').trim(), ts: iso_(g('Timestamp')), clientTime: iso_(g('ClientTime')) || iso_(g('Timestamp')),
    kidId: s('KidID'), kidName: s('Child'), amountCents: Math.round(Number(g('Amount') || 0) * 100),
    category: s('Category'), note: s('Note'), status: s('Status') || 'approved', user: s('User'), role: s('Role'),
    deviceId: s('DeviceID'), deviceName: s('DeviceName'), actedBy: s('ActedBy'), actedAt: iso_(g('ActedAt')),
    actedDeviceName: s('ActedDeviceName'), editedBy: s('EditedBy'), editedAt: iso_(g('EditedAt')),
    settledAt: iso_(g('Settled')), settleId: s('SettleID'), groupId: s('GroupID'), reason: s('Reason'),
  };
}

function txToRow_(t) {
  return {
    ID: t.id, Timestamp: new Date(t.ts), Child: t.kidName, Amount: t.amountCents / 100, Category: t.category, Note: t.note,
    Status: t.status, DeviceID: t.deviceId, DeviceName: t.deviceName, ActedBy: t.actedBy, Settled: '', User: t.user,
    KidID: t.kidId, Role: t.role, ClientTime: new Date(t.clientTime), ActedAt: t.actedAt ? new Date(t.actedAt) : '',
    ActedDeviceName: t.actedDeviceName, EditedBy: '', EditedAt: '', GroupID: t.groupId, SettleID: '', Reason: '',
  };
}

/* ======================================================================
 * Sheet helpers (columns by header name)
 * ==================================================================== */
function sheet_(name) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Run setup() first — missing sheet: ' + name);
  return s;
}

function colMap_(sh) {
  var lc = sh.getLastColumn();
  var map = {};
  if (!lc) return map;
  sh.getRange(1, 1, 1, lc).getValues()[0].forEach(function (h, i) {
    var k = String(h).trim();
    if (k && map[k] == null) map[k] = i;
  });
  return map;
}

function table_(name) {
  var sh = sheet_(name);
  var map = colMap_(sh);
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  var rows = lr > 1 && lc ? sh.getRange(2, 1, lr - 1, lc).getValues() : [];
  return { sheet: sh, map: map, rows: rows };
}

// Reads only the ID column (cheap lookup for one row).
function findRowById_(sh, map, id) {
  var lr = sh.getLastRow();
  if (lr < 2 || map.ID == null) return 0;
  var ids = sh.getRange(2, map.ID + 1, lr - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function appendObj_(sh, obj) {
  var map = colMap_(sh);
  var width = sh.getLastColumn();
  var row = [];
  for (var i = 0; i < width; i++) row.push('');
  Object.keys(obj).forEach(function (h) { if (map[h] != null) row[map[h]] = cell_(obj[h]); });
  sh.appendRow(row);
}

function setCells_(sh, map, rowNum, obj) {
  Object.keys(obj).forEach(function (h) {
    if (map[h] == null) return;
    sh.getRange(rowNum, map[h] + 1).setValue(cell_(obj[h]));
  });
}

// Text from the web (notes, device names, kid-claimed names) must never become a formula:
// a leading apostrophe makes Sheets store it as plain text (and getValues() returns it without the apostrophe).
function cell_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function audit_(action, targetId, actor, body, details) {
  try {
    appendObj_(sheet_('Audit'), {
      Timestamp: new Date(), Action: action, TargetID: String(targetId || ''), User: actor.name || '', Role: actor.role || '',
      DeviceID: str_(body && body.deviceId, 64), DeviceName: str_(body && body.deviceName, 60),
      Details: JSON.stringify(details || {}).slice(0, 45000),
    });
  } catch (e) { /* never block a write on audit */ }
}

/* ======================================================================
 * Small utilities
 * ==================================================================== */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function err_(code, error) { return { ok: false, code: code, error: error }; }
function isInt_(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 1000); }
function bool_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
function iso_(v) {
  if (v === '' || v == null) return '';
  if (isDate_(v)) return v.toISOString();
  var d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function dayOf_(v) { return v ? iso_(v).slice(0, 10) : ''; }
function parseJson_(s) { if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
function rand_(n) {
  return Utilities.getUuid().replace(/-/g, '').slice(0, n || 8);
}
