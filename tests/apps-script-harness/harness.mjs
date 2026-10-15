// Loads ../../Code.gs into a Node vm context with in-memory fakes of the Apps Script services
// it uses (SpreadsheetApp, LockService, Utilities, PropertiesService, CacheService, ContentService,
// Session, Logger), so doGet/doPost/setup can be unit-tested without deploying.
//
// Fidelity notes (things real Sheets does that matter to Code.gs):
//   - Values written into a cell are coerced like the Sheets UI/API would: numeric-looking strings
//     become numbers, "TRUE"/"FALSE" become booleans — unless the column is text-formatted ('@').
//   - getValues() returns '' for empty cells and Date objects for dates.
//   - New sheets have 1000 rows / 26 columns; getLastRow/getLastColumn reflect content only.
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const CODE_PATH = join(here, '..', '..', 'Code.gs');

/* ---------------- Spreadsheet fakes ---------------- */
function coerce(v, fmt) {
  if (v === null || v === undefined) return '';
  // Sheets: a leading apostrophe forces plain text and is not part of the stored value.
  if (typeof v === 'string' && v.startsWith("'")) return v.slice(1);
  // Sheets would turn these into live formulas; flag them so tests can assert it never happens.
  if (typeof v === 'string' && /^[=+]/.test(v) && fmt !== '@') return { formula: v };
  if (fmt === '@') return v instanceof Date ? v : String(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^-?\d+(\.\d+)?$/.test(s) && s !== '') return Number(s);
    if (/^true$/i.test(s)) return true;
    if (/^false$/i.test(s)) return false;
  }
  return v;
}

function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export class FakeSheet {
  constructor(name) {
    this.name = name;
    this.data = [];           // array of rows (arrays); row 0 is the header row
    this.colFormats = {};     // col index (0-based) → number format for rows ≥ 2
    this.frozen = 0;
    this.maxRows = 1000;
    this.bold = new Set();
    this.writes = 0;          // count of cell writes (to prove setup() is a no-op on re-run)
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some(v => v !== '' && v != null)) return r + 1;
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.data.forEach(row => { for (let c = (row || []).length - 1; c >= 0; c--) if (row[c] !== '' && row[c] != null) { max = Math.max(max, c + 1); break; } });
    return max;
  }
  getMaxRows() { return Math.max(this.maxRows, this.data.length); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  setFrozenRows(n) { this.frozen = n; return this; }
  getFrozenRows() { return this.frozen; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = /^([A-Z]+):([A-Z]+)$/i.exec(a);
      if (!m) throw new Error('FakeSheet: unsupported A1 range ' + a);
      const c1 = colToIndex(m[1]), c2 = colToIndex(m[2]);
      return new FakeRange(this, 1, c1, this.getMaxRows(), c2 - c1 + 1);
    }
    return new FakeRange(this, a, b, c == null ? 1 : c, d == null ? 1 : d);
  }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(row) {
    const r = this.getLastRow();
    this.data.length = Math.max(this.data.length, r);
    this.data.splice(r, this.data.length - r, row.map((v, i) => coerce(v, r >= 1 ? this.colFormats[i] : undefined)));
    this.writes++;
    return this;
  }
  _get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined && row[c - 1] !== null ? row[c - 1] : ''; }
  _set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    const nv = coerce(v, r >= 2 ? this.colFormats[c - 1] : undefined);
    const old = row[c - 1];
    const same = old === nv || (old instanceof Date && nv instanceof Date && old.getTime() === nv.getTime());
    if (!same) { row[c - 1] = nv; this.writes++; }
  }
  // test helpers
  headers() { return (this.data[0] || []).filter(h => h !== '').map(String); }
  objects() {
    const h = this.data[0] || [];
    return this.data.slice(1).filter(r => r && r.some(v => v !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])));
  }
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) { Object.assign(this, { sheet, row, col, numRows, numCols }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = this.sheet._get(this.row + r, this.col + c);
        line.push(v instanceof Date ? new Date(v.getTime()) : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    if (vals.length !== this.numRows || vals.some(r => r.length !== this.numCols)) throw new Error('FakeRange.setValues: dimensions mismatch');
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet._set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet._set(this.row, this.col, v); return this; }
  setFontWeight(w) { for (let c = 0; c < this.numCols; c++) if (this.row === 1) this.sheet.bold.add(this.col + c - 1); return this; }
  setNumberFormat(f) {
    // Formats are tracked per column for data rows (row ≥ 2), which is all Code.gs needs.
    if (this.row + this.numRows - 1 >= 2) {
      for (let c = 0; c < this.numCols; c++) {
        const idx = this.col + c - 1;
        if (this.sheet.colFormats[idx] !== f) { this.sheet.colFormats[idx] = f; this.sheet.writes++; }
      }
    }
    return this;
  }
}

export class FakeSpreadsheet {
  constructor() { this.sheets = []; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) {
    if (this.getSheetByName(n)) throw new Error('Sheet exists: ' + n);
    const s = new FakeSheet(n);
    this.sheets.push(s);
    return s;
  }
  getSheets() { return this.sheets.slice(); }
  // test helper: build a sheet from a header row + data rows (no coercion, like typed-in data)
  addSheet(name, headers, rows = [], formats = {}) {
    const s = this.insertSheet(name);
    s.data = [headers.slice(), ...rows.map(r => r.slice())];
    Object.entries(formats).forEach(([h, f]) => { const i = headers.indexOf(h); if (i >= 0) s.colFormats[i] = f; });
    return s;
  }
}

/* ---------------- Other service fakes ---------------- */
export function createEnv(opts = {}) {
  const ss = opts.spreadsheet || new FakeSpreadsheet();
  const clock = { offset: 0, now() { return Date.now() + this.offset; }, advance(ms) { this.offset += ms; } };
  const props = new Map(Object.entries(opts.properties || {}));
  const cache = new Map();          // key → {value, expires}
  const lockState = { held: false, busy: false, acquired: 0 };
  const logs = [];

  const SpreadsheetApp = { getActiveSpreadsheet: () => ss, getActive: () => ss };
  const LockService = {
    getScriptLock: () => ({
      tryLock() { if (lockState.busy) return false; lockState.held = true; lockState.acquired++; return true; },
      waitLock() { if (lockState.busy) throw new Error('Lock timeout'); lockState.held = true; lockState.acquired++; },
      releaseLock() { lockState.held = false; },
      hasLock() { return lockState.held; },
    }),
  };
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => randomUUID(),
    computeDigest(alg, value) {
      if (alg !== 'SHA_256') throw new Error('Unsupported digest ' + alg);
      const buf = createHash('sha256').update(String(value), 'utf8').digest();
      return Array.from(buf, b => (b > 127 ? b - 256 : b));   // Apps Script returns signed bytes
    },
    sleep() {},
    formatDate: (d) => new Date(d).toISOString(),
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty(k, v) { props.set(k, String(v)); return this; },
      deleteProperty(k) { props.delete(k); return this; },
      getProperties: () => Object.fromEntries(props),
    }),
  };
  const CacheService = {
    getScriptCache: () => ({
      get(k) { const e = cache.get(k); if (!e) return null; if (e.expires <= clock.now()) { cache.delete(k); return null; } return e.value; },
      put(k, v, ttl = 600) { cache.set(k, { value: String(v), expires: clock.now() + Math.min(ttl, 21600) * 1000 }); },
      remove(k) { cache.delete(k); },
    }),
  };
  const ContentService = {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput(s) {
      return { _content: String(s), _mime: 'text/plain', setMimeType(m) { this._mime = m; return this; }, getContent() { return this._content; }, getMimeType() { return this._mime; } };
    },
  };
  const Session = { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }), getScriptTimeZone: () => 'America/New_York' };
  const Logger = { log: (...a) => { logs.push(a.join(' ')); } };

  const context = vm.createContext({ SpreadsheetApp, LockService, Utilities, PropertiesService, CacheService, ContentService, Session, Logger, console });
  vm.runInContext(readFileSync(CODE_PATH, 'utf8'), context, { filename: 'Code.gs' });

  const parse = (out) => JSON.parse(out.getContent());
  const api = {
    ss, props, cache, clock, lockState, logs, context,
    setup: () => JSON.parse(JSON.stringify(context.setup())),   // copy out of the vm realm
    get: (params = {}) => parse(context.doGet({ parameter: params })),
    post: (body) => parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } })),
    rawGet: (params = {}) => context.doGet({ parameter: params }),
    sheet: (n) => ss.getSheetByName(n),
    rows: (n) => ss.getSheetByName(n).objects(),
    // convenience: login and return token
    login(parentName = 'Dad', pin = '1234') {
      const p = api.get().parents.find(x => x.name === parentName);
      const r = api.post({ action: 'login', parentId: p.id, pin, deviceId: 'dev1', deviceName: 'Test rig' });
      if (!r.ok) throw new Error('login failed: ' + JSON.stringify(r));
      return r.token;
    },
  };
  return api;
}
