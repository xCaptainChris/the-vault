// PURE functions over a view snapshot: {kids, parents, categories, transactions, settlements}.
// All amounts are integer cents. No DOM, no storage.

const DAY = 864e5;
export const when = (t) => t.clientTime || t.ts;
const ms = (t) => Date.parse(when(t)) || 0;

export const isApproved = (t) => t.status === 'approved';
export const visibleKids = (v) => v.kids.filter(k => !k.archived);
export const kidById = (v, id) => v.kids.find(k => k.id === id) || null;
export const catByName = (v, name) => v.categories.find(c => c.name === name) || null;

export function balances(v) {
  const out = {};
  v.kids.forEach(k => { out[k.id] = 0; });
  v.transactions.forEach(t => { if (isApproved(t)) out[t.kidId] = (out[t.kidId] || 0) + t.amountCents; });
  return out;
}
export const balanceOf = (v, kidId) => balances(v)[kidId] || 0;

export function pendingList(v) {
  return v.transactions.filter(t => t.status === 'pending');
}

export function pendingByKid(v) {
  const out = {};
  pendingList(v).forEach(t => {
    const o = out[t.kidId] || (out[t.kidId] = { count: 0, cents: 0 });
    o.count++;
    o.cents += t.amountCents;
  });
  return out;
}

// Approved, unsettled, negative Tithing rows — what the parents owe the church.
export function titheRows(v) {
  return v.transactions.filter(t => isApproved(t) && t.category === 'Tithing' && t.amountCents < 0 && !t.settledAt);
}

export function titheOwed(v) {
  const rows = titheRows(v);
  const per = {};
  let total = 0;
  rows.forEach(t => { per[t.kidId] = (per[t.kidId] || 0) + -t.amountCents; total += -t.amountCents; });
  return { per, total, txIds: rows.map(t => t.id) };
}

// Family sheet / Holding segment: kids' money + unsent tithing = total cash to hold.
export function owedSummary(v) {
  const bal = balances(v);
  const kids = v.kids.filter(k => !k.archived || bal[k.id]).map(k => ({ kid: k, cents: bal[k.id] || 0 }));
  const kidsTotal = kids.reduce((s, r) => s + r.cents, 0);
  const tithe = titheOwed(v).total;
  return { kids, kidsTotal, tithe, total: kidsTotal + tithe };
}

// Approval groups: linked rows (same groupId) count as one request.
export function requestGroups(v) {
  const pend = pendingList(v);
  const groups = [];
  const seen = {};
  pend.forEach(t => {
    const key = t.groupId || t.id;
    if (seen[key]) { seen[key].rows.push(t); return; }
    const g = { key, rows: [t] };
    seen[key] = g;
    groups.push(g);
  });
  groups.forEach(g => {
    g.main = g.rows.find(r => r.category !== 'Tithing') || g.rows[0];
    g.tithe = g.rows.find(r => r !== g.main && r.category === 'Tithing') || null;
  });
  return groups.sort((a, b) => ms(b.main) - ms(a.main));
}

export function catTotals(v, kidId, dir, days, now = Date.now()) {
  const cutoff = days ? now - days * DAY : -Infinity;
  const map = {};
  v.transactions.forEach(t => {
    if (!isApproved(t) || t.kidId !== kidId) return;
    if (dir === 'in' ? t.amountCents <= 0 : t.amountCents >= 0) return;
    if (ms(t) < cutoff) return;
    const c = t.category || 'Other';
    map[c] = (map[c] || 0) + Math.abs(t.amountCents);
  });
  return Object.entries(map).map(([cat, cents]) => ({ cat, cents })).sort((a, b) => b.cents - a.cents || (a.cat < b.cat ? -1 : 1));
}

export function digitalSpend(v, kidId, days, now = Date.now()) {
  const cutoff = days ? now - days * DAY : -Infinity;
  let total = 0;
  v.transactions.forEach(t => {
    if (isApproved(t) && t.kidId === kidId && t.category === 'Digital' && t.amountCents < 0 && ms(t) >= cutoff) total += -t.amountCents;
  });
  return total;
}
export const hasDigital = (v, kidId) => v.transactions.some(t => t.kidId === kidId && t.category === 'Digital');

// Up to 6 distinct (note, category, amount) from approved history in this direction, newest first.
// Falls back to all kids when this kid has none. Tithing rows are never suggested.
export function recentSuggestions(v, kidId, dir, limit = 6) {
  const pick = (rows) => {
    const out = [];
    const seen = {};
    rows.slice().sort((a, b) => ms(b) - ms(a)).forEach(t => {
      if (out.length >= limit) return;
      if (!isApproved(t) || t.category === 'Tithing') return;
      if (dir === 'in' ? t.amountCents <= 0 : t.amountCents >= 0) return;
      const amountCents = Math.abs(t.amountCents);
      const key = (t.note || '').toLowerCase() + '|' + t.category + '|' + amountCents;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ note: t.note || '', category: t.category, amountCents });
    });
    return out;
  };
  const mine = kidId ? pick(v.transactions.filter(t => t.kidId === kidId)) : [];
  return mine.length ? mine : pick(v.transactions);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Rows newest first, grouped by month, with that month's approved in/out totals.
export function monthGroups(rows) {
  const sorted = rows.slice().sort((a, b) => ms(b) - ms(a) || (a.id < b.id ? 1 : -1));
  const groups = [];
  let cur = null;
  sorted.forEach(t => {
    const d = new Date(ms(t));
    const key = d.getFullYear() + '-' + d.getMonth();
    if (!cur || cur.key !== key) {
      cur = { key, label: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), inCents: 0, outCents: 0, rows: [] };
      groups.push(cur);
    }
    cur.rows.push(t);
    if (isApproved(t)) { if (t.amountCents > 0) cur.inCents += t.amountCents; else cur.outCents += -t.amountCents; }
  });
  return groups;
}

export function groupOf(v, tx) {
  if (!tx || !tx.groupId) return tx ? [tx] : [];
  return v.transactions.filter(t => t.groupId === tx.groupId);
}

export function goalState(kid, balanceCents) {
  if (!kid || !(kid.goalCents > 0)) return { has: false, pct: 0, reached: false };
  const pct = Math.max(0, Math.min(100, Math.floor((balanceCents / kid.goalCents) * 100)));
  return { has: true, pct, reached: balanceCents >= kid.goalCents, name: kid.goalName || 'Goal', target: kid.goalCents };
}

// Game keyword guess for the Digital category.
const GAME_WORDS = ['roblox', 'robux', 'minecraft', 'fortnite', 'v-bucks', 'vbucks', 'xbox', 'playstation', 'psn', 'nintendo',
  'switch', 'steam', 'app store', 'google play', 'in-app', 'game'];
export function looksDigital(note) {
  const s = String(note || '').toLowerCase();
  return GAME_WORDS.some(w => s.includes(w));
}
