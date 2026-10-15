// T23–T35: kids management, ledger cap, offline outbox, idempotency, permanent failure,
// auth expiry, logout ordering, back button, responsive, remote wire format, PWA, paths, PIN leak.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, tid, open, nameDevice, enterPin, asParent, goKid, goHome, db, outboxLen, waitOutboxEmpty, switchToKid, openRow, unlock } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function openSettings(page) {
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-settings').click();
  await expect(tid(page, 'settings-sheet')).toHaveClass(/show/);
}

test('T23 kids management: add, rename+unarchive, rename keeps history, archive', async ({ page }) => {
  await asParent(page);
  await openSettings(page);
  await tid(page, 'settings-add-kid').click();
  await tid(page, 'kid-edit-name').fill('Test');
  await tid(page, 'kid-edit-emoji').fill('🐢');
  await tid(page, 'kid-edit-save').click();
  await expect(tid(page, 'settings-kids')).toContainText('Test');

  await tid(page, 'settings-kid-k_baby').click();
  await tid(page, 'kid-edit-name').fill('Emma');
  await tid(page, 'kid-edit-archive').click();
  await expect(tid(page, 'kid-edit-archive')).toHaveAttribute('aria-pressed', 'false');
  await tid(page, 'kid-edit-save').click();

  await tid(page, 'settings-kid-k_logan').click();
  await tid(page, 'kid-edit-name').fill('Lo');
  await tid(page, 'kid-edit-save').click();

  await tid(page, 'settings-kid-k_jake').click();
  await tid(page, 'kid-edit-archive').click();
  await tid(page, 'kid-edit-save').click();
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid^="kid-card-"]').filter({ hasText: 'Test' })).toHaveCount(1);
  await expect(tid(page, 'kid-card-k_baby')).toContainText('Emma');
  await expect(tid(page, 'kid-card-k_logan')).toContainText('Lo');
  await expect(tid(page, 'kid-card-k_jake')).toHaveCount(0);
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-kid-k_jake')).toHaveCount(0);
  await expect(tid(page, 'entry-kid-k_baby')).toBeVisible();
  // Emma (same kidId) can receive entries
  await tid(page, 'entry-kid-k_baby').click();
  await tid(page, 'entry-quick-100').click();
  await tid(page, 'entry-save').click();
  await waitOutboxEmpty(page);
  const d = await db(page);
  expect(d.kids.find(k => k.id === 'k_baby')).toMatchObject({ name: 'Emma', archived: false });
  expect(d.kids.find(k => k.id === 'k_jake').archived).toBe(true);
  expect(d.transactions.some(t => t.kidId === 'k_baby' && t.amountCents === 100)).toBe(true);
  expect(d.transactions.filter(t => t.kidId === 'k_jake')).toHaveLength(5);
  await goKid(page, 'k_logan');
  await expect(page.locator('#kidHero')).toContainText('Lo');
  for (const id of ['L1', 'L3', 'L4', 'L6']) await expect(tid(page, 'tx-row-' + id)).toBeVisible();
});

test('T24 ledger box scrolls on its own; page stays short', async ({ page }, info) => {
  await asParent(page);
  await page.evaluate(() => {
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < 300; i++) {
      const ts = new Date(now - (i + 1) * 36e5 * 7).toISOString();
      rows.push({ id: 'bulk' + i, ts, clientTime: ts, kidId: 'k_logan', kidName: 'Logan', amountCents: i % 2 ? 100 : -50,
        category: i % 2 ? 'Chores' : 'Spending', note: 'Bulk ' + i, status: 'approved', user: 'Dad', role: 'parent',
        deviceId: 'a1b2c3d4', deviceName: "Dad's phone", actedBy: 'Dad', actedAt: ts, actedDeviceName: '', editedBy: '', editedAt: '',
        settledAt: '', settleId: '', groupId: '' });
    }
    window.__vault.mock.addTx(rows);
  });
  await page.evaluate(() => window.__vault.store.refresh());
  await goKid(page, 'k_logan');
  await expect(tid(page, 'tx-row-bulk299')).toBeAttached();
  const m = await page.evaluate(() => {
    const l = document.querySelector('[data-testid="ledger"]');
    const r = l.getBoundingClientRect();
    const hero = document.querySelector('[data-testid="kid-hero"]').getBoundingClientRect();
    return { sh: l.scrollHeight, ch: l.clientHeight, h: r.height, left: r.left, heroRight: hero.right,
      page: document.scrollingElement.scrollHeight, ih: innerHeight };
  });
  expect(m.sh).toBeGreaterThan(m.ch);
  if (info.project.name !== 'desktop') {
    expect(m.h).toBeLessThanOrEqual(m.ih);              // fills the space left on screen, never more
    expect(m.page).toBeLessThanOrEqual(m.ih + 900);
  } else {
    expect(m.left).toBeGreaterThanOrEqual(m.heroRight);   // right column
    expect(m.page).toBeLessThanOrEqual(m.ih + 200);
  }
});

test('T25 offline outbox survives reload and sends exactly once', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await page.evaluate(() => window.__vault.mock.setOffline(true));
  for (const amt of ['1', '2']) {
    await tid(page, 'fab').click();
    await tid(page, 'entry-amount').fill(amt);
    await tid(page, 'entry-tithe-toggle').click().catch(() => {});
    if (await tid(page, 'entry-tithe-toggle').getAttribute('aria-pressed') === 'true') await tid(page, 'entry-tithe-toggle').click();
    await tid(page, 'entry-save').click();
  }
  await expect(tid(page, 'sync-badge')).toHaveText('2');
  await page.waitForTimeout(600);
  expect(await outboxLen(page)).toBe(2);
  await expect(page.locator('[data-testid="local-tag"]')).toHaveCount(2);
  await page.reload();
  await page.waitForFunction(() => window.__vault);
  await unlock(page);                                   // offline: checked against the saved PIN hash
  await expect(page.locator('[data-testid="local-tag"]')).toHaveCount(2);
  await expect(tid(page, 'hero-balance')).toHaveText('$10.00');
  await page.evaluate(() => { window.__vault.mock.setOffline(false); window.dispatchEvent(new Event('online')); });
  await waitOutboxEmpty(page);
  await expect(tid(page, 'sync-badge')).toBeHidden();
  const added = (await db(page)).transactions.filter(t => t.kidId === 'k_logan' && !/^L\d$/.test(t.id));
  expect(added.map(t => t.amountCents).sort()).toEqual([100, 200]);
});

test('T26 idempotent retry after a network error that happened after apply', async ({ page }) => {
  await asParent(page);
  await page.evaluate(() => window.__vault.mock.failNext(1, 'NETWORK', { afterApply: true }));
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_jake').click();
  await tid(page, 'entry-quick-200').click();
  await tid(page, 'entry-save').click();
  await expect.poll(() => page.evaluate(() => window.__vault.outbox.list()[0]?.attempts || 0)).toBe(1);
  await tid(page, 'sync-btn').click();     // forces a drain that ignores backoff
  await waitOutboxEmpty(page);
  const added = (await db(page)).transactions.filter(t => t.kidId === 'k_jake' && !/^J\d$/.test(t.id));
  expect(added).toHaveLength(2);           // +$2 and its tithing row, once each
});

test('T27 permanent failure shows in Settings and can be dismissed', async ({ page }) => {
  await asParent(page);
  await page.evaluate(() => window.__vault.mock.failNext(1, 'BAD_INPUT'));
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_jake').click();
  await tid(page, 'entry-quick-100').click();
  await tid(page, 'entry-note').fill('Will fail');
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'snackbar')).toContainText('couldn’t be saved');
  await tid(page, 'snackbar-action').click();
  await expect(tid(page, 'settings-failed')).toContainText('Will fail');
  await tid(page, 'settings-dismiss').click();
  await expect(tid(page, 'settings-failed')).toHaveCount(0);
  expect(await outboxLen(page)).toBe(0);
});

test('T28 auth expiry: op waits for the same parent to sign in again', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await page.evaluate(() => window.__vault.mock.revokeAll());
  await openRow(page, 'L3');
  const vb = tid(page, 'tx-detail-L3').getByTestId('tx-void');
  await vb.click();
  await vb.click();
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
  await expect(tid(page, 'who-message')).toHaveText('Please sign in again');
  const ops = await page.evaluate(() => window.__vault.outbox.list());
  expect(ops.map(o => [o.action, o.state])).toEqual([['setStatus', 'needs-auth']]);
  await enterPin(page, 'p_dad', '1234');
  await waitOutboxEmpty(page);
  expect((await db(page)).transactions.find(t => t.id === 'L3').status).toBe('void');
});

test('T29 logout is queued behind earlier parent changes', async ({ page }) => {
  await asParent(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('vault_demo_session')).token);
  await page.evaluate(() => window.__vault.mock.setOffline(true));
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_lizzy').click();
  await tid(page, 'entry-quick-500').click();
  await tid(page, 'entry-note').fill('Offline parent entry');
  await tid(page, 'entry-save').click();
  await switchToKid(page, 'k_jake');
  expect((await page.evaluate(() => window.__vault.outbox.list())).map(o => o.action)).toEqual(['add', 'logout']);
  await page.evaluate(() => { window.__vault.mock.setOffline(false); window.dispatchEvent(new Event('online')); });
  await waitOutboxEmpty(page);
  const d = await db(page);
  expect(d.transactions.find(t => t.note === 'Offline parent entry')).toMatchObject({ status: 'approved', user: 'Dad' });
  expect(d.sessions.find(s => s.tokenHash === token).revokedAt).toBeTruthy();
});

test('T30 back button closes sheets first, then navigates', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-sheet')).toHaveClass(/show/);
  await page.goBack();
  await expect(tid(page, 'entry-sheet')).not.toHaveClass(/show/);
  await expect(page).toHaveURL(/#\/kid\/k_logan/);
  await expect(tid(page, 'view-kid')).toHaveClass(/active/);
  await page.goBack();
  await expect(tid(page, 'view-home')).toHaveClass(/active/);
});

test('T31 responsive layout, dialogs, FAB, tap targets', async ({ page }, info) => {
  await asParent(page);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="card-grid"]')).gridTemplateColumns.split(' ').length);
  const w = page.viewportSize().width;
  expect(cols).toBe(w >= 1024 ? 3 : w >= 640 ? 2 : 1);
  await expect(tid(page, 'fab')).toBeVisible();

  const scan = async () => page.evaluate(() => [...document.querySelectorAll('button')].filter(b => {
    if (b.closest('.sheet:not(.show), .modal:not(.show)')) return false;   // closed (maybe mid-transition)
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40);
  }).map(b => (b.dataset.testid || b.className || b.textContent).slice(0, 40)));
  expect(await scan()).toEqual([]);

  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_logan').click();
  await page.waitForTimeout(450);                                   // let the open animation finish
  expect(await scan()).toEqual([]);
  const box = await tid(page, 'entry-sheet').boundingBox();
  const vh = page.viewportSize().height;
  if (w >= 820) {
    expect(box.x).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(vh);
  } else {
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(vh - 2);   // bottom sheet
  }
  // FAB does not cover Save (the sheet sits above it). Let the login toast fade first.
  await expect(tid(page, 'snackbar')).not.toHaveClass(/show/, { timeout: 5000 });
  await page.waitForTimeout(300);
  await tid(page, 'entry-save').scrollIntoViewIfNeeded();
  const save = await tid(page, 'entry-save').boundingBox();
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.dataset.testid, { x: save.x + save.width / 2, y: save.y + save.height / 2 });
  expect(hit).toBe('entry-save');
  await page.keyboard.press('Escape');

  await goKid(page, 'k_logan');
  const two = await page.evaluate(() => getComputedStyle(document.querySelector('.kidgrid')).gridTemplateColumns.split(' ').length);
  if (info.project.name === 'desktop') expect(two).toBe(2);
  expect(await scan()).toEqual([]);
});

test('T32 remote adapter wire format (text/plain POST, redirect follow, no preflight)', async ({ page }) => {
  // Playwright does not route the follow-up request of a redirect it fulfilled, so the
  // googleusercontent.com hop is played by a local cross-origin server (CORS like the real one).
  const API = 'https://script.google.com/macros/s/TEST/exec';
  const m = await import('../../js/api/fixtures.js');
  const f = m.buildFixture('test', Date.now());
  const fixture = { ok: true, schema: 2, serverTime: new Date().toISOString(), instance: 'test',
    kids: f.kids, parents: f.parents.map(p => ({ id: p.id, name: p.name })), categories: f.categories,
    transactions: f.transactions, settlements: f.settlements };
  const methods = [];
  const posts = [];
  let lastPost = null;
  const http = await import('node:http');
  const echo = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('content-type', 'application/json');
    if (u.searchParams.get('k') === 'login') return res.end(JSON.stringify({ ok: true, token: 'tok'.repeat(20), parent: { id: 'p_dad', name: 'Dad' } }));
    if (u.searchParams.get('k') === 'post') { posts.push(lastPost); return res.end(JSON.stringify({ ok: true, txs: lastPost.body.txs || [], duplicate: false })); }
    res.end(JSON.stringify(fixture));
  });
  await new Promise(r => echo.listen(0, '127.0.0.1', r));
  const ECHO = `http://127.0.0.1:${echo.address().port}/echo`;
  try {
    await page.route('**/js/config.js', async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace("API_URL: ''", `API_URL: '${API}'`);
      await route.fulfill({ response: res, body });
    });
    await page.route('https://script.google.com/**', async (route) => {
      const req = route.request();
      methods.push(req.method());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      let k = 'get';
      if (req.method() === 'POST') {
        lastPost = { ct: req.headers()['content-type'], body: JSON.parse(req.postData()) };
        k = lastPost.body.action === 'login' ? 'login' : 'post';
      }
      return route.fulfill({ status: 302, headers: { location: `${ECHO}?k=${k}` } });
    });
    await page.goto('./index.html');
    await nameDevice(page);
    await expect(page.locator('#logoSub')).toHaveText('Family Bank');
    await expect(tid(page, 'who-kid-k_logan')).toBeVisible();      // GET followed the 302
    await enterPin(page, 'p_dad', '1234');
    await expect(tid(page, 'kid-balance-k_logan')).toHaveText('$7.00');
    await tid(page, 'fab').click();
    await tid(page, 'entry-kid-k_logan').click();
    await tid(page, 'entry-quick-500').click();
    await tid(page, 'entry-save').click();
    await expect.poll(() => posts.find(p => p.body.action === 'add'), { timeout: 10_000 }).toBeTruthy();
    const add = posts.find(p => p.body.action === 'add');
    expect(add.ct).toMatch(/^text\/plain/);
    expect(add.body.txs[0].id).toMatch(/^t_/);
    expect(add.body.txs.every(t => Number.isInteger(t.amountCents))).toBe(true);
    expect(add.body.token).toBe('tok'.repeat(20));
    expect(add.body.deviceName).toBe('Test Phone');
    expect(methods).not.toContain('OPTIONS');
    expect(await page.evaluate(() => typeof window.__vault)).toBe('undefined');   // no test hook in live mode
  } finally {
    echo.close();
  }
});

function pngSize(file) {
  const b = readFileSync(join(ROOT, file));
  expect(b.slice(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('T33 PWA: manifest, icons, version match, offline open via service worker', async ({ browser }, info) => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  expect(m.start_url).toBe('./');
  const sizes = Object.fromEntries(m.icons.map(i => [i.purpose + i.sizes, i.src]));
  for (const s of m.icons) expect(s.src.startsWith('data:')).toBe(false);
  expect(pngSize(sizes.any192x192)).toEqual([192, 192]);
  expect(pngSize(sizes.any512x512)).toEqual([512, 512]);
  expect(pngSize(sizes.maskable512x512)).toEqual([512, 512]);
  expect(pngSize('icons/apple-touch-icon.png')).toEqual([180, 180]);
  const swV = /const VERSION = '([^']+)'/.exec(readFileSync(join(ROOT, 'sw.js'), 'utf8'))[1];
  const cfgV = /APP_VERSION: '([^']+)'/.exec(readFileSync(join(ROOT, 'js/config.js'), 'utf8'))[1];
  expect(swV).toBe(cfgV);

  const ctx = await browser.newContext({ serviceWorkers: 'allow', viewport: info.project.use.viewport });
  const page = await ctx.newPage();
  const url = './index.html?demo=1&fixture=test';
  await page.goto(new URL(url, info.project.use.baseURL).href);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.locator('header.app')).toBeVisible();
  await page.fill('[data-testid=device-input]', 'Offline');
  await page.click('[data-testid=device-save]');
  await expect(page.getByTestId('who-kid-k_logan')).toBeVisible();
  await page.getByTestId('who-kid-k_logan').click();
  await expect(page.getByTestId('hero-balance')).toHaveText('$7.00');
  await ctx.close();
});

function walk(d) {
  return readdirSync(join(ROOT, d)).flatMap(f => statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
}

test('T34 relative paths only; no alert/confirm/prompt', async () => {
  const files = ['index.html', 'sw.js', 'manifest.json', 'vault-demo.html', ...walk('js'), ...walk('css')];
  for (const f of files) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    for (const bad of ['src="/', "href=\"/", "'/js", '"/js', 'url(/']) expect(s.includes(bad), `${f} contains ${bad}`).toBe(false);
    expect(/\b(alert|confirm|prompt)\(/.test(s), `${f} uses a blocking dialog`).toBe(false);
    expect(/document\.write|onclick="/.test(s), `${f} uses document.write/inline onclick`).toBe(false);
  }
});

test('T35 no PIN key anywhere in the GET payload', async ({ page }) => {
  await open(page);
  const keys = await page.evaluate(() => {
    const out = [];
    const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push(k); walk(v); } };
    walk(window.__vault.mock.load());
    return out;
  });
  expect(keys.filter(k => /^pin$/i.test(k))).toEqual([]);
  expect(keys).toContain('parents');
});

test('vault-demo.html redirects to demo mode', async ({ page }) => {
  await page.goto('./vault-demo.html');
  await expect(page).toHaveURL(/index\.html\?demo=1/);
  await expect(page.locator('#logoSub')).toHaveText('Family Bank · Demo');
});
