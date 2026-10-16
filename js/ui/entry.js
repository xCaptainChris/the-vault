// Entry sheet: new entry (parent), ask for money (kid), edit / edit-then-approve (parent).
import { byId, h } from './dom.js';
import { openSheet, closeSheets } from './sheet.js';
import { CONFIG } from '../config.js';
import { parseCents, fmtCents, fmtSigned, titheCents } from '../money.js';
import * as S from '../selectors.js';
import { store } from '../store.js';
import { identity, prefs, setPref } from '../identity.js';
import { newId } from '../ids.js';
import { write } from '../actions.js';
import { router } from '../router.js';
import { reasonField } from './reason.js';

const DEFAULT_CAT = { in: 'Chores', out: 'Spending' };
let st = null;               // entry state while the sheet is open
let els = null;

const view = () => store.view;
const isParent = () => identity.isParent;
// Tithing toggle default is remembered per person, not per device (shared iPad).
const titheKey = () => { const u = identity.user; return u ? (u.role || '') + ':' + (u.id || u.name || '') : 'anon'; };

export function openEntryNew() {
  const u = identity.user;
  const parent = isParent();
  const v = view();
  let kidId = null;
  if (!parent && u && u.role === 'kid') kidId = u.id;
  else {
    const r = router.route;
    const pageKid = r.name === 'kid' ? S.kidById(v, r.kidId) : null;
    const last = S.kidById(v, prefs().lastKid);
    if (pageKid && !pageKid.archived) kidId = pageKid.id;
    else if (last && !last.archived) kidId = last.id;
  }
  const p = prefs();
  st = { mode: 'new', kidId, dir: 'in', cat: DEFAULT_CAT.in, catManual: false, recentSel: -1,
    tithe: (p.titheByUser || {})[titheKey()] !== false, retithe: true, orig: null };
  build();
  openSheet('entrySheet', { onClose: () => { st = null; } });
}

export function openEntryEdit(txId) {
  const t = view().transactions.find(x => x.id === txId);
  if (!t) return;
  st = { mode: 'edit', editId: t.id, kidId: t.kidId, dir: t.amountCents >= 0 ? 'in' : 'out', cat: t.category,
    catManual: true, recentSel: -1, tithe: false, retithe: true, orig: { ...t } };
  build();
  els.amount.value = (Math.abs(t.amountCents) / 100).toFixed(2);
  els.note.value = t.note || '';
  refresh();
  openSheet('entrySheet', { onClose: () => { st = null; } });
}

function build() {
  const parent = isParent();
  const body = byId('entrySheet').querySelector('.body');
  body.innerHTML = '';
  const edit = st.mode === 'edit';
  const title = edit ? (st.orig.status === 'pending' ? 'Review request' : 'Edit entry') : (parent ? 'Money in or out' : 'Ask for money');
  els = {};
  els.kids = h('div', { class: 'chips', testid: 'entry-kids' });
  els.dir = h('div', { class: 'seg', testid: 'entry-dir' },
    h('button', { class: 'in', testid: 'entry-dir-in', onclick: () => setDir('in') }, '＋ Money in'),
    h('button', { class: 'out', testid: 'entry-dir-out', onclick: () => setDir('out') }, '－ Money out'));
  els.recentWrap = h('div', {});
  els.amount = h('input', { class: 'amount-in num', testid: 'entry-amount', inputmode: 'decimal', placeholder: '$0.00', autocomplete: 'off', 'aria-label': 'Amount' });
  els.amount.addEventListener('input', () => { st.recentSel = -1; clearError(); refresh(); });
  els.quick = h('div', { class: 'chips quick' }, CONFIG.QUICK_AMOUNTS.map(c =>
    h('button', { class: 'chip-btn', testid: 'entry-quick-' + c, onclick: () => { els.amount.value = (c / 100).toFixed(2); st.recentSel = -1; clearError(); refresh(); } }, fmtCents(c).replace('.00', ''))));
  els.note = h('input', { class: 'text-in', testid: 'entry-note', placeholder: 'Mowed the lawn, bought a game…', maxlength: '80', autocomplete: 'off', 'aria-label': 'What for' });
  els.note.addEventListener('input', () => {
    st.recentSel = -1;
    if (!st.catManual && st.dir === 'out' && S.looksDigital(els.note.value)) st.cat = 'Digital';
    refresh();
  });
  els.cats = h('div', { class: 'chips', testid: 'entry-cats' });
  els.titheSlot = h('div', {});
  els.warn = h('div', { class: 'warnline', testid: 'entry-warning', hidden: true });
  els.error = h('div', { class: 'errline', testid: 'entry-error', hidden: true });
  els.buttons = h('div', {});

  body.append(h('h2', { testid: 'entry-title' }, title));
  if (parent) body.append(h('div', { class: 'flabel' }, 'Who'), els.kids);
  body.append(h('div', { class: 'flabel' }, 'Direction'), els.dir, els.recentWrap,
    h('div', { class: 'flabel' }, 'Amount'), els.amount, els.quick,
    h('div', { class: 'flabel' }, 'What for'), els.note,
    h('div', { class: 'flabel' }, 'Category'), els.cats,
    els.titheSlot, els.warn, els.error);
  if (edit && st.orig.status === 'pending') {
    const k = S.kidById(view(), st.orig.kidId);
    els.reason = reasonField({ kidName: k ? k.name : '', testid: 'entry-reason' });
    body.append(h('div', { class: 'flabel' }, 'Note to ' + (k ? k.name : 'them')), els.reason.el);
  }
  body.append(els.buttons);
  refresh();
}

function setDir(dir) {
  if (st.dir === dir) return;
  st.dir = dir;
  st.recentSel = -1;
  const c = S.catByName(view(), st.cat);
  if (!c || (c.dir !== 'both' && c.dir !== dir)) { st.cat = DEFAULT_CAT[dir]; st.catManual = false; }
  if (!st.catManual && dir === 'out' && S.looksDigital(els.note.value)) st.cat = 'Digital';
  refresh();
}

function clearError() { els.error.hidden = true; }

function currentCents() { return parseCents(els.amount.value); }

function refresh() {
  if (!st) return;
  const v = view();
  const parent = isParent();
  const edit = st.mode === 'edit';
  const kid = S.kidById(v, st.kidId);

  // kid chips
  if (parent) {
    els.kids.innerHTML = '';
    S.visibleKids(v).forEach(k => els.kids.append(h('button', {
      class: 'chip-btn' + (st.kidId === k.id ? ' sel' : ''), testid: 'entry-kid-' + k.id,
      onclick: () => { st.kidId = k.id; refresh(); },
    }, (k.emoji ? k.emoji + ' ' : '') + k.name)));
  }
  // direction
  els.dir.children[0].classList.toggle('sel', st.dir === 'in');
  els.dir.children[1].classList.toggle('sel', st.dir === 'out');
  // recent chips
  els.recentWrap.innerHTML = '';
  if (!edit) {
    const rec = S.recentSuggestions(v, st.kidId, st.dir);
    if (rec.length) {
      els.recentWrap.append(h('div', { class: 'flabel' }, 'Recent'), h('div', { class: 'chips', testid: 'entry-recent' },
        rec.map((r, i) => h('button', {
          class: 'chip-btn recent' + (st.recentSel === i ? ' sel' : ''), testid: 'entry-recent-' + i,
          onclick: () => {
            els.amount.value = (r.amountCents / 100).toFixed(2);
            els.note.value = r.note;
            st.cat = r.category; st.catManual = true; st.recentSel = i;
            clearError(); refresh();
          },
        }, (S.catByName(v, r.category)?.emoji || '') + ' ' + (r.note || r.category), h('small', { class: 'num' }, fmtCents(r.amountCents))))));
    }
  }
  // categories
  els.cats.innerHTML = '';
  v.categories.filter(c => c.active && (c.dir === 'both' || c.dir === st.dir)).forEach(c => {
    els.cats.append(h('button', {
      class: 'chip-btn' + (st.cat === c.name ? ' sel' : ''), testid: 'entry-cat-' + c.name,
      onclick: () => { st.cat = c.name; st.catManual = true; st.recentSel = -1; refresh(); },
    }, c.emoji + ' ' + c.name));
  });
  // tithing toggle (new, money in, not tithing category)
  const cents = currentCents();
  els.titheSlot.innerHTML = '';
  if (!edit && st.dir === 'in' && isParent()) {          // kids are asked when they send (v1.1.2)
    const tc = titheCents(cents || 0, CONFIG.TITHE_RATE_PCT);
    const t = h('button', { class: 'toggle' + (st.tithe ? ' on' : ''), testid: 'entry-tithe-toggle', 'aria-pressed': String(st.tithe),
      onclick: () => { st.tithe = !st.tithe; setPref('titheByUser', { ...(prefs().titheByUser || {}), [titheKey()]: st.tithe }); refresh(); } },
      h('span', { class: 'box' }, st.tithe ? '✓' : ''),
      h('span', {}, `⛪ Set aside ${CONFIG.TITHE_RATE_PCT}% for tithing`, cents ? ` (−${fmtCents(tc)})` : ''));
    els.titheSlot.append(t);
  }
  // retithe (edit, positive row with unsettled linked tithing, amount changed)
  if (edit && st.dir === 'in' && cents && cents !== Math.abs(st.orig.amountCents)) {
    const tr = linkedTithe(v, st.orig);
    if (tr) {
      const nt = titheCents(cents, CONFIG.TITHE_RATE_PCT);
      els.titheSlot.append(h('button', { class: 'toggle' + (st.retithe ? ' on' : ''), testid: 'entry-retithe', 'aria-pressed': String(st.retithe),
        onclick: () => { st.retithe = !st.retithe; refresh(); } },
        h('span', { class: 'box' }, st.retithe ? '✓' : ''), h('span', {}, `Also update tithing to −${fmtCents(nt)}`)));
    }
  }
  // balance warning
  els.warn.hidden = true;
  if (kid && st.dir === 'out' && cents) {
    let bal = S.balanceOf(v, kid.id);
    if (edit && st.orig.status === 'approved' && st.orig.kidId === kid.id) bal -= st.orig.amountCents;
    const nb = bal - cents;
    if (nb < 0) { els.warn.hidden = false; els.warn.textContent = `This puts ${kid.name} at ${fmtCents(nb)}`; }
  }
  // buttons
  els.buttons.innerHTML = '';
  if (edit) {
    if (st.orig.status === 'pending') {
      els.buttons.append(
        h('button', { class: 'primary', testid: 'entry-approve-changes', onclick: () => saveEdit(true) }, 'Approve with changes'),
        h('button', { class: 'primary ghost', testid: 'entry-deny', onclick: denyEdit }, 'Deny'));
    } else {
      els.buttons.append(h('button', { class: 'primary', testid: 'entry-save', onclick: () => saveEdit(false) }, 'Save changes'));
    }
  } else if (parent) {
    const label = cents && kid ? `Save ${fmtSigned(st.dir === 'in' ? cents : -cents)} → ${kid.name}` : 'Save';
    els.buttons.append(h('button', { class: 'primary', testid: 'entry-save', onclick: saveNew }, label));
  } else {
    els.buttons.append(h('button', { class: 'primary cyan', testid: 'entry-save', onclick: saveNew }, 'Send request'));
  }
}

function linkedTithe(v, t) {
  if (!t.groupId || t.amountCents <= 0) return null;
  return v.transactions.find(x => x.groupId === t.groupId && x.id !== t.id && x.category === 'Tithing' && !x.settledAt
    && (x.status === 'pending' || x.status === 'approved')) || null;
}

function fail(msg) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function readForm() {
  if (!st.kidId || !S.kidById(view(), st.kidId)) { fail('Pick a kid'); return null; }
  const cents = currentCents();
  if (!cents) { fail('Enter an amount like 5 or 2.50'); return null; }
  if (!st.cat) { fail('Pick a category'); return null; }
  return { cents, note: els.note.value.trim().slice(0, 80) };
}

function saveNew() {
  const f = readForm();
  if (!f) return;
  const parent = isParent();
  // Kids decide about tithing each time: a small question when they send money they're asking for.
  if (!parent && st.dir === 'in' && st.cat !== 'Tithing') {
    const pending = { kidId: st.kidId, cat: st.cat, f };
    closeSheets();
    setTimeout(() => askTithe(pending), 320);
    return;
  }
  sendNew(f, st.dir === 'in' && st.tithe && st.cat !== 'Tithing');
}

function askTithe({ kidId, cat, f }) {
  const tc = titheCents(f.cents, CONFIG.TITHE_RATE_PCT);
  const body = byId('titheAskSheet').querySelector('.body');
  body.innerHTML = '';
  const go = (yes) => { closeSheets(); sendNew(f, yes, { kidId, cat, dir: 'in' }); };
  body.append(
    h('div', { class: 'askicon' }, '⛪'),
    h('div', { class: 'asktitle', testid: 'tithe-ask-title' }, `Would you like to set aside ${CONFIG.TITHE_RATE_PCT}% (${fmtCents(tc)}) for tithing?`),
    h('div', { class: 'asksub' }, `You asked for ${fmtCents(f.cents)}${f.note ? ' · ' + f.note : ''}`),
    h('div', { class: 'approve-row' },
      h('button', { class: 'btn-ok', testid: 'tithe-ask-yes', onclick: () => go(true) }, 'Yes'),
      h('button', { class: 'btn-no plain', testid: 'tithe-ask-no', onclick: () => go(false) }, 'No')));
  openSheet('titheAskSheet', { locked: true });
}

function sendNew(f, withTithe, ctx = st) {
  const parent = isParent();
  const signed = ctx.dir === 'in' ? f.cents : -f.cents;
  const clientTime = new Date().toISOString();
  const main = { id: newId('t_'), kidId: ctx.kidId, amountCents: signed, category: ctx.cat, note: f.note, clientTime };
  const txs = [main];
  if (withTithe) {
    const groupId = newId('g_');
    main.groupId = groupId;
    txs.push({ id: newId('t_'), kidId: ctx.kidId, amountCents: -titheCents(f.cents, CONFIG.TITHE_RATE_PCT), category: 'Tithing',
      note: ('Tithing · ' + (f.note || ctx.cat)).slice(0, 80), clientTime, groupId });
  }
  if (parent) setPref('lastKid', ctx.kidId);
  closeSheets();
  write([['add', { txs }]], parent ? 'Saved' : 'Request sent');
}

function saveEdit(approve) {
  const f = readForm();
  if (!f) return;
  const o = st.orig;
  const signed = st.dir === 'in' ? f.cents : -f.cents;
  const changed = signed !== o.amountCents || st.cat !== o.category || f.note !== (o.note || '') || st.kidId !== o.kidId;
  const steps = [];
  if (changed) {
    const body = { id: o.id, kidId: st.kidId, amountCents: signed, category: st.cat, note: f.note };
    if (st.retithe && signed > 0 && signed !== o.amountCents && linkedTithe(view(), o)) body.retithe = true;
    steps.push(['update', body]);
  }
  if (approve) {
    const b = { id: o.id, status: 'approved' };
    if (els.reason && els.reason.value) b.reason = els.reason.value;
    steps.push(['setStatus', b]);
  }
  closeSheets();
  if (!steps.length) return;
  write(steps, approve ? 'Approved' : 'Saved');
}

function denyEdit() {
  const id = st.orig.id;
  const b = { id, status: 'denied' };
  if (els.reason && els.reason.value) b.reason = els.reason.value;
  closeSheets();
  write([['setStatus', b]], 'Denied', 'warn');
}

export function refreshEntry() { if (st && els) refresh(); }
