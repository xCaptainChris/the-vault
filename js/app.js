// Boot: env → identity → store.loadCache → render → router → registerSW →
// first-run modals → store.refresh → outbox.drain → poll timer.
import { CONFIG } from './config.js';
import { isDemo, undoMs } from './env.js';
import * as storage from './storage.js';
import { api } from './api/index.js';
import { mockHooks } from './api/mock.js';
import { newId } from './ids.js';
import { identity } from './identity.js';
import { store } from './store.js';
import { createOutbox } from './outbox.js';
import { router } from './router.js';
import * as selectors from './selectors.js';
import { registerServiceWorker } from './platform.js';
import { checkBio } from './bio.js';
import { byId, snackbar } from './ui/dom.js';
import { initSheets, closeSheets } from './ui/sheet.js';
import { renderHeader } from './ui/header.js';
import { renderHome } from './ui/home.js';
import { renderKid } from './ui/kid.js';
import { openEntryNew, refreshEntry } from './ui/entry.js';
import { refreshApprovals } from './ui/approvals.js';
import { refreshTithe, initKidTithe } from './ui/tithe.js';
import { refreshFamily } from './ui/family.js';
import { refreshDonut } from './ui/donut.js';
import { initWho, openWho, refreshWho, showDeviceModal, signOut } from './ui/who.js';
import { initLock, lockNow, forgetPin } from './ui/lock.js';
import { refreshTxCard, initTxCard } from './ui/txcard.js';
import { initDecisions } from './ui/decisions.js';
import { openAccount, openSettings, refreshSettings } from './ui/settings.js';

/* ---------------- outbox ---------------- */
const outbox = createOutbox({
  load: () => storage.get('outbox', []),
  save: (ops) => storage.set('outbox', ops),
  api,
  now: () => Date.now(),
  undoMs,
  newId: () => newId('op_'),
  onSent: (op, res) => store.mergeResult(op, res),
  onDrained: () => store.refresh(),
  onChange: () => store.emit(),
  onAuthLost: (op) => {
    const u = identity.user;
    if (u && u.role === 'parent' && op.who && op.who.id === u.id) sessionLost();
  },
  onFailed: () => snackbar('1 change couldn’t be saved', { action: 'View', onAction: openSettings, ms: 6000 }),
});
store.setOutbox(outbox);

function sessionLost() {
  forgetPin();
  identity.setSession(null);
  identity.setUser(null);
  closeSheets(false, true);
  render();
  openWho('Please sign in again');
}

/* ---------------- render ---------------- */
function render() {
  const view = store.view;
  renderHeader();
  const r = router.route;
  const home = byId('view-home');
  const kid = byId('view-kid');
  if (r.name === 'kid' && view.kids.length && !selectors.kidById(view, r.kidId)) { router.go('#/'); return; }
  const onKid = r.name === 'kid';
  if (kid.classList.contains('active') !== onKid || home.classList.contains('active') === onKid) {
    home.classList.toggle('active', !onKid);
    kid.classList.toggle('active', onKid);
    window.scrollTo(0, 0);
  }
  if (onKid) renderKid(view, r.kidId); else renderHome(view);

  const u = identity.user;
  const fab = byId('fab');
  // A kid looking at a sibling's page has nothing to ask for there.
  fab.hidden = !u || (!identity.isParent && onKid && r.kidId !== u.id);
  const parent = identity.isParent;
  fab.textContent = parent ? '＋ Add / Spend' : '＋ Ask';
  fab.classList.toggle('request', !parent);

  document.documentElement.classList.toggle('kid-page', onKid);
  document.documentElement.classList.toggle('home-page', !onKid);
  refreshEntry(); refreshTxCard(); refreshApprovals(); refreshTithe(); refreshFamily(); refreshDonut(); refreshSettings(); refreshWho();
}
store.subscribe(render);
router.onChange(() => render());

/* ---------------- wiring ---------------- */
initSheets();
initTxCard();
initKidTithe();
initDecisions();
initWho({ onUserChanged: () => store.emit() });
initLock({ onSwitchUser: () => signOut(), onSignedOut: (msg) => signOut(msg) });
byId('fab').addEventListener('click', openEntryNew);
byId('backBtn').addEventListener('click', () => router.go('#/'));
byId('acctBtn').addEventListener('click', () => (identity.user ? openAccount() : openWho()));
byId('syncBtn').addEventListener('click', syncNow);

async function syncNow() {
  const ic = byId('syncBtn');
  ic.classList.add('spin');
  try {
    await outbox.drain({ force: true });
    const ok = await store.refresh();
    snackbar(ok ? 'Up to date' : 'Sync failed — check connection');
  } finally {
    ic.classList.remove('spin');
  }
}

/* ---------------- session check ---------------- */
let lastWhoami = 0;
async function checkSession() {
  const s = identity.session;
  if (!s || !s.token || !navigator.onLine) return;
  if (Date.now() - lastWhoami < 30 * 60 * 1000) return;
  lastWhoami = Date.now();
  try {
    await api.call('whoami', { token: s.token, deviceId: identity.device.id, deviceName: identity.device.name, user: identity.user });
  } catch (e) {
    if (e.code === 'AUTH' && identity.token === s.token) sessionLost();
    else if (e.code !== 'AUTH') lastWhoami = 0;
  }
}

/* ---------------- lifecycle ---------------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { outbox.flushUndo(); outbox.drain(); return; }
  outbox.drain();
  store.refresh();
  checkSession();
});
window.addEventListener('online', () => { outbox.drain({ force: true }); store.refresh(); });
setInterval(() => {
  if (document.hidden) return;
  outbox.drain();
  store.refresh();
  checkSession();
}, CONFIG.POLL_MS);

/* ---------------- boot ---------------- */
if (isDemo) window.__vault = { store, outbox, mock: mockHooks, selectors, api, identity, config: CONFIG };
checkBio();
render();
registerServiceWorker((apply) => snackbar('Update ready', { action: 'Reload', onAction: apply, ms: Infinity }));
if (!identity.device.name) showDeviceModal(false);
else if (!identity.user || (identity.user.role === 'parent' && !identity.session)) openWho();
else lockNow();                       // parents re-enter their PIN every time the app opens (no-op for kids)
store.refresh().then(() => { outbox.drain(); checkSession(); });
