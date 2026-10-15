// QA exploration: a real family's day at 390 / 820 / 1440, against the deterministic `test` fixture.
// Every step checks console errors, failed requests, horizontal overflow and (phone) tap targets,
// and saves a screenshot to tests/qa/screens/.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCREENS = join(dirname(fileURLToPath(import.meta.url)), 'screens');
mkdirSync(SCREENS, { recursive: true });
const tid = (page, id) => page.getByTestId(id);
const money = (c) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function instrument(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  // The browser's lazy favicon fetch gets aborted when the test flips the context offline: not an app error.
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  page.on('request', (r) => { if (/script\.google|googleusercontent/.test(r.url())) problems.push('LIVE API CALLED: ' + r.url()); });
  return problems;
}

async function check(page, problems, info, step) {
  const proj = info.project.name;
  expect(problems, `[${step}] console/request problems`).toEqual([]);
  const m = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth;
    // Visible interactive things smaller than 40px (phone only enforced).
    const small = [...document.querySelectorAll('button, [role="button"], input')].filter(b => {
      if (b.closest('.sheet:not(.show), .modal:not(.show), .toast:not(.show)')) return false;
      const cs = getComputedStyle(b);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (r.bottom < 0 || r.top > innerHeight) return false;
      return r.width < 40 || r.height < 40;
    }).map(b => `${b.dataset.testid || b.className || b.tagName}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
    // Elements poking out of the right edge of the viewport (clipping).
    const poking = [...document.querySelectorAll('.wrap *, .sheet.show *, .modal.show *')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed';
    }).slice(0, 5).map(e => (e.dataset.testid || e.className || e.tagName).toString().slice(0, 40));
    return { over, small, poking };
  });
  expect(m.over, `[${step}] horizontal overflow`).toBeLessThanOrEqual(0);
  expect(m.poking, `[${step}] elements past right edge`).toEqual([]);
  if (proj === 'phone') expect(m.small, `[${step}] tap targets < 40px`).toEqual([]);
  await page.screenshot({ path: join(SCREENS, `${proj}-${step}.png`) });
}

const db = (page) => page.evaluate(() => window.__vault.mock.db());
const drained = (page) => expect.poll(() => page.evaluate(() => window.__vault.outbox.list().length), { timeout: 10_000 }).toBe(0);
const bal = (page, kid) => tid(page, 'kid-balance-' + kid);
async function home(page) {
  if (await tid(page, 'view-home').evaluate(e => e.classList.contains('active'))) return;
  await tid(page, 'back-btn').click();
  await expect(tid(page, 'view-home')).toHaveClass(/active/);
}
async function kidPage(page, kid) {
  await home(page);
  await tid(page, 'kid-card-' + kid).click();
  await expect(tid(page, 'view-kid')).toHaveClass(/active/);
}
async function waitToastGone(page) { await expect(tid(page, 'snackbar')).not.toHaveClass(/show/, { timeout: 6000 }); }

test('a family day: kid requests → Dad approves → entries → goals → void → tithing → settings → offline', async ({ page, context }, info) => {
  const problems = instrument(page);
  await page.goto('./index.html?demo=1&fixture=test&undo=800');
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await page.evaluate(() => window.__vault.mock.setLatency(20));

  /* ---- first run ---- */
  await expect(tid(page, 'device-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(tid(page, 'device-modal')).toBeVisible();
  await check(page, problems, info, '01-device');
  await tid(page, 'device-input').fill('Kitchen iPad');
  await tid(page, 'device-save').click();
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);       // not dismissable
  await expect(tid(page, 'who-kid-k_baby')).toHaveCount(0);
  await check(page, problems, info, '02-who');

  /* ---- kid: Logan asks (tithing on, then off) ---- */
  await tid(page, 'who-kid-k_logan').click();
  await expect(page).toHaveURL(/#\/kid\/k_logan/);
  await expect(tid(page, 'fab')).toHaveText('＋ Ask');
  await expect(tid(page, 'family-strip')).toHaveCount(0);
  await expect(tid(page, 'goal-edit-btn')).toHaveCount(1);   // kids can set their own goal (v1.0.3)
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-kids')).toHaveCount(0);
  await expect(tid(page, 'entry-title')).toHaveText('Ask for money');
  await tid(page, 'entry-quick-500').click();
  await tid(page, 'entry-note').fill('Raked leaves');
  await check(page, problems, info, '03-kid-ask');
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'tithe-ask-title')).toContainText('($0.50)');      // v1.1.2: kids choose each time
  await tid(page, 'tithe-ask-yes').click();
  await expect(tid(page, 'snackbar')).toContainText('Request sent');
  await tid(page, 'fab').click();
  await tid(page, 'entry-quick-200').click();
  await tid(page, 'entry-note').fill('Fed the dog');
  await tid(page, 'entry-save').click();
  await tid(page, 'tithe-ask-no').click();
  await drained(page);
  let d = await db(page);
  const kidRows = d.transactions.filter(t => t.user === 'Logan' && t.kidId === 'k_logan');
  expect(kidRows.map(t => [t.amountCents, t.status, t.role, t.deviceName])).toEqual([
    [500, 'pending', 'kid', 'Kitchen iPad'], [-50, 'pending', 'kid', 'Kitchen iPad'], [200, 'pending', 'kid', 'Kitchen iPad']]);
  expect(kidRows[0].groupId).toBeTruthy();
  expect(kidRows[1].groupId).toBe(kidRows[0].groupId);
  expect(kidRows[2].groupId).toBe('');
  await expect(tid(page, 'hero-balance')).toHaveText('$7.00');
  await expect(tid(page, 'pending-tag')).toHaveCount(3);
  await check(page, problems, info, '04-kid-pending');

  /* ---- Dad signs in ---- */
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-switch').click();
  await tid(page, 'who-parent-p_dad').click();
  await tid(page, 'pin-input').fill('1234');
  await check(page, problems, info, '05-pin');
  await tid(page, 'pin-submit').click();
  await expect(tid(page, 'pin-modal')).toBeHidden();
  await home(page);
  await expect(tid(page, 'strip-requests')).toContainText('4 requests');
  await expect(tid(page, 'strip-holding')).toContainText('$17.50');
  await check(page, problems, info, '06-home-dad');

  /* ---- approvals: edit-then-approve Z4, deny J5, approve-all the two Logan requests ---- */
  await tid(page, 'strip-requests').click();
  await expect(page.locator('[data-testid^="approval-card-"]')).toHaveCount(4);
  const grouped = kidRows[0].id;
  await expect(tid(page, 'approval-tithe-' + grouped)).toContainText('−$0.50');
  await check(page, problems, info, '07-approvals');
  await tid(page, 'approval-body-Z4').click();
  await expect(tid(page, 'entry-title')).toHaveText('Review request');
  await tid(page, 'entry-amount').fill('4');
  await tid(page, 'entry-approve-changes').click();
  await tid(page, 'strip-requests').click();
  await tid(page, 'deny-J5').click();
  await tid(page, 'reason-J5').fill('Not this time, buddy');     // optional reason the kid will see
  await tid(page, 'deny-confirm-J5').click();
  await expect(page.locator('[data-testid^="approval-card-"]')).toHaveCount(2);
  await tid(page, 'approve-all').click();
  await drained(page);
  d = await db(page);
  const st = (id) => d.transactions.find(t => t.id === id);
  expect([st('Z4').status, st('Z4').amountCents, st('Z4').actedBy, st('Z4').editedBy]).toEqual(['approved', 400, 'Dad', 'Dad']);
  expect(st('J5').status).toBe('denied');
  kidRows.forEach(r => expect(st(r.id).status).toBe('approved'));
  await expect(tid(page, 'strip-requests')).toHaveCount(0);
  // Logan 7.00 + 5.00 − 0.50 + 2.00 = 13.50; Lizzy 3.70 + 4.00 = 7.70; tithing 3.20 + 0.50 = 3.70
  await expect(bal(page, 'k_logan')).toHaveText('$13.50');
  await expect(bal(page, 'k_lizzy')).toHaveText('$7.70');
  await expect(tid(page, 'strip-tithe')).toContainText('$3.70');

  /* ---- direct parent entry: Jake, recent chip + quick amount ---- */
  await waitToastGone(page);
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_jake').click();
  await expect(tid(page, 'entry-recent-0')).toContainText('Picked up toys');
  await tid(page, 'entry-recent-0').click();
  await expect(tid(page, 'entry-amount')).toHaveValue('4.00');
  await tid(page, 'entry-quick-1000').click();
  await expect(tid(page, 'entry-note')).toHaveValue('Picked up toys');
  await expect(tid(page, 'entry-cat-Chores')).toHaveClass(/sel/);
  // The kid turned tithing off on this device, so the parent's default is now off too.
  const titheWasOn = await tid(page, 'entry-tithe-toggle').getAttribute('aria-pressed');
  if (titheWasOn !== 'true') await tid(page, 'entry-tithe-toggle').click();
  await expect(tid(page, 'entry-save')).toHaveText('Save +$10.00 → Jake');
  await check(page, problems, info, '08-parent-entry');
  await tid(page, 'entry-save').click();
  await expect(bal(page, 'k_jake')).toHaveText('$12.60');       // 3.60 + 10 − 1
  await expect(tid(page, 'strip-tithe')).toContainText('$4.70');

  /* ---- money out to Digital (Logan) ---- */
  await kidPage(page, 'k_logan');
  await waitToastGone(page);
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-kid-k_logan')).toHaveClass(/sel/);
  await tid(page, 'entry-dir-out').click();
  await tid(page, 'entry-quick-500').click();
  await tid(page, 'entry-note').fill('Roblox');
  await expect(tid(page, 'entry-cat-Digital')).toHaveClass(/sel/);
  await expect(tid(page, 'entry-tithe-toggle')).toHaveCount(0);
  await tid(page, 'entry-save').click();
  await drained(page);
  await expect(tid(page, 'hero-balance')).toHaveText('$8.50');
  await expect(tid(page, 'digital-amount')).toHaveText('$20.00');  // L3 15 + 5
  await check(page, problems, info, '09-kid-dashboard');

  /* ---- donut numbers, hand computed ---- */
  await expect(tid(page, 'total-out')).toHaveText('$28.50');          // panel = all time (v1.1.1)
  await tid(page, 'panel-out').click();
  const legend = async () => Object.fromEntries(await page.locator('[data-testid^="donut-leg-"]').evaluateAll(els => els.map(e => [e.dataset.testid.slice(10), Number(e.dataset.cents)])));
  await expect(tid(page, 'donut-period-0')).toHaveClass(/sel/);
  await tid(page, 'donut-period-30').click();
  expect(await legend()).toEqual({ Digital: 2000, Tithing: 250 });
  await expect(tid(page, 'donut-total')).toHaveText('$22.50');
  await check(page, problems, info, '10-donut-out-30');
  await tid(page, 'donut-period-90').click();
  expect(await legend()).toEqual({ Digital: 2000, Tithing: 350 });
  await expect(tid(page, 'donut-total')).toHaveText('$23.50');
  await tid(page, 'donut-period-0').click();
  expect(await legend()).toEqual({ Digital: 2500, Tithing: 350 });
  await expect(tid(page, 'donut-total')).toHaveText('$28.50');
  await page.evaluate(() => history.back());                    // Android back closes the sheet
  await expect(tid(page, 'donut-sheet')).not.toHaveClass(/show/);
  await expect(tid(page, 'view-kid')).toHaveClass(/active/);
  await tid(page, 'panel-in').click();
  await tid(page, 'donut-period-30').click();
  expect(await legend()).toEqual({ Chores: 2700 });             // L1 20 + 5 + 2
  await tid(page, 'donut-period-90').click();
  expect(await legend()).toEqual({ Chores: 2700, Gift: 1000 });
  await page.keyboard.press('Escape');

  /* ---- goal: set Jake's and reach it ---- */
  await kidPage(page, 'k_jake');
  await tid(page, 'goal-edit-btn').click();
  await tid(page, 'goal-name').fill('Lego');
  await tid(page, 'goal-amount').fill('15');
  await check(page, problems, info, '11-goal-sheet');
  await tid(page, 'goal-save').click();
  await expect(tid(page, 'goal-bar')).toContainText('$12.60 / $15.00');
  await waitToastGone(page);
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-tithe-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'entry-tithe-toggle').click();
  await tid(page, 'entry-amount').fill('3');
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'goal-reached')).toBeVisible();
  await expect(tid(page, 'confetti')).toHaveCount(1);
  await expect(tid(page, 'hero-balance')).toHaveText('$15.60');
  await check(page, problems, info, '12-goal-reached');

  /* ---- void with two taps, undo, void for real ---- */
  await drained(page);
  await kidPage(page, 'k_logan');
  d = await db(page);
  const roblox = d.transactions.find(t => t.note === 'Roblox' && t.kidId === 'k_logan');
  await tid(page, 'tx-row-' + roblox.id).click();
  await expect(tid(page, 'tx-detail-' + roblox.id)).toContainText('Kitchen iPad');
  await tid(page, 'tx-void').click();
  await expect(tid(page, 'tx-void')).toHaveText('Tap again to void');
  await expect(tid(page, 'hero-balance')).toHaveText('$8.50');
  await check(page, problems, info, '13-void-armed');
  await tid(page, 'tx-void').click();
  await expect(tid(page, 'hero-balance')).toHaveText('$13.50');
  await tid(page, 'snackbar-action').click();                   // Undo
  await expect(tid(page, 'hero-balance')).toHaveText('$8.50');
  await drained(page);
  expect((await db(page)).transactions.find(t => t.id === roblox.id).status).toBe('approved');
  await tid(page, 'tx-row-' + roblox.id).click();
  await tid(page, 'tx-void').click();
  await tid(page, 'tx-void').click();
  await drained(page);
  await expect(tid(page, 'hero-balance')).toHaveText('$13.50');
  await expect(tid(page, 'tx-row-' + roblox.id)).toHaveClass(/voided/);
  expect((await db(page)).transactions.find(t => t.id === roblox.id).status).toBe('void');
  await expect(tid(page, 'digital-amount')).toHaveText('$15.00');

  /* ---- tithing escrow ---- */
  await home(page);
  await tid(page, 'strip-tithe').click();
  await expect(tid(page, 'tithe-total')).toHaveText('$4.70');
  await expect(tid(page, 'tithe-row-k_logan')).toContainText('$2.50');
  await expect(tid(page, 'tithe-row-k_lizzy')).toContainText('$0.80');
  await expect(tid(page, 'tithe-row-k_jake')).toContainText('$1.40');
  await check(page, problems, info, '14-tithe');
  await tid(page, 'tithe-mark').click();
  await expect(tid(page, 'tithe-mark')).toHaveText('Tap again to confirm');
  await tid(page, 'tithe-mark').click();
  await expect(tid(page, 'strip-tithe')).toContainText('$0.00');
  await drained(page);
  d = await db(page);
  const s = d.settlements.find(x => x.id !== 's_old');
  expect([s.totalCents, s.count, s.user]).toEqual([470, 5, 'Dad']);
  await expect(bal(page, 'k_logan')).toHaveText('$13.50');      // balances unchanged
  await expect(tid(page, 'strip-holding')).toContainText(money(1350 + 770 + 1560));

  /* ---- settings: archive/unarchive/rename ---- */
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-settings').click();
  await check(page, problems, info, '15-settings');
  await tid(page, 'settings-kid-k_lizzy').click();
  await tid(page, 'kid-edit-archive').click();
  await check(page, problems, info, '16-kid-editor');
  await tid(page, 'kid-edit-save').click();
  await tid(page, 'settings-kid-k_jake').click();
  await tid(page, 'kid-edit-name').fill('Jakey');
  await tid(page, 'kid-edit-save').click();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'kid-card-k_lizzy')).toHaveCount(0);
  await expect(tid(page, 'kid-card-k_jake')).toContainText('Jakey');
  // Archived-but-nonzero Lizzy still counts in "holding"
  await expect(tid(page, 'strip-holding')).toContainText(money(1350 + 770 + 1560));
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-settings').click();
  await tid(page, 'settings-kid-k_lizzy').click();
  await tid(page, 'kid-edit-archive').click();
  await tid(page, 'kid-edit-save').click();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'kid-card-k_lizzy')).toBeVisible();

  /* ---- negative balance warning ---- */
  await waitToastGone(page);
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_lizzy').click();
  await tid(page, 'entry-dir-out').click();
  await tid(page, 'entry-amount').fill('20');
  await expect(tid(page, 'entry-warning')).toHaveText('This puts Lizzy at −$12.30');
  await check(page, problems, info, '17-neg-warning');
  await tid(page, 'entry-save').click();
  await expect(bal(page, 'k_lizzy')).toHaveText('−$12.30');
  await expect(bal(page, 'k_lizzy')).toHaveClass(/neg/);
  await drained(page);

  /* ---- ledger scrolls internally; page does not grow ---- */
  await kidPage(page, 'k_logan');
  const before = await page.evaluate(() => document.scrollingElement.scrollHeight);
  await page.evaluate(() => {
    const now = Date.now(); const rows = [];
    for (let i = 0; i < 250; i++) {
      const ts = new Date(now - (i + 1) * 36e5 * 9).toISOString();
      rows.push({ id: 'qa' + i, ts, clientTime: ts, kidId: 'k_logan', kidName: 'Logan', amountCents: i % 2 ? 100 : -100,
        category: i % 2 ? 'Chores' : 'Spending', note: 'QA row ' + i, status: 'approved', user: 'Dad', role: 'parent',
        deviceId: 'x', deviceName: 'x', actedBy: 'Dad', actedAt: ts, actedDeviceName: '', editedBy: '', editedAt: '', settledAt: '', settleId: '', groupId: '' });
    }
    window.__vault.mock.addTx(rows);
    return window.__vault.store.refresh();
  });
  await expect(tid(page, 'tx-row-qa249')).toBeAttached();
  const m = await page.evaluate(() => {
    const l = document.querySelector('[data-testid="ledger"]');
    return { sh: l.scrollHeight, ch: l.clientHeight, page: document.scrollingElement.scrollHeight };
  });
  expect(m.sh).toBeGreaterThan(m.ch * 3);
  expect(m.page).toBeLessThanOrEqual(before + 40);
  await page.locator('[data-testid="ledger"]').evaluate(l => { l.scrollTop = 2000; });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await check(page, problems, info, '18-ledger-scrolled');

  /* ---- back button closes sheets ---- */
  for (const opener of ['fab', 'account-btn']) {
    await tid(page, opener).click();
    await expect(page.locator('.sheet.show')).toHaveCount(1);
    await page.evaluate(() => history.back());
    await expect(page.locator('.sheet.show')).toHaveCount(0);
    await expect(tid(page, 'view-kid')).toHaveClass(/active/);
  }
  await page.evaluate(() => history.back());
  await expect(tid(page, 'view-home')).toHaveClass(/active/);

  /* ---- reload persistence ---- */
  await page.reload();
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await expect(tid(page, 'lock-modal')).toBeVisible();          // parents re-enter the PIN on every open
  await tid(page, 'lock-input').fill('1234');
  await tid(page, 'lock-submit').click();
  await expect(tid(page, 'lock-modal')).toBeHidden();
  await expect(tid(page, 'account-btn')).toHaveText('D');
  await expect(bal(page, 'k_logan')).toHaveText(money(1350 + 250 * 0));   // QA rows net to 0
  await expect(bal(page, 'k_lizzy')).toHaveText('−$12.30');
  await expect(tid(page, 'kid-card-k_jake')).toContainText('Jakey');
  await expect(tid(page, 'device-modal')).toBeHidden();

  /* ---- offline: entry queues, nothing crashes ---- */
  await context.setOffline(true);
  await page.evaluate(() => window.__vault.mock.setOffline(true));
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await waitToastGone(page).catch(() => {});
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_logan').click();
  await tid(page, 'entry-quick-100').click();
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'sync-badge')).toHaveText('1');
  await page.waitForTimeout(1500);                               // past the undo window → send attempt fails
  await expect(tid(page, 'sync-badge')).toHaveText('1');
  await tid(page, 'sync-btn').click();
  await expect(tid(page, 'snackbar')).toContainText('Sync failed');
  await check(page, problems, info, '19-offline');
  await context.setOffline(false);
  await page.evaluate(() => { window.__vault.mock.setOffline(false); window.dispatchEvent(new Event('online')); });
  await drained(page);
  await expect(tid(page, 'sync-badge')).toBeHidden();
  d = await db(page);
  expect(d.transactions.filter(t => t.kidId === 'k_logan' && t.amountCents === 100 && t.user === 'Dad' && !t.id.startsWith('qa')).length).toBe(1);
  expect(problems).toEqual([]);
});

test('kid cannot escalate: forged approve/void/settle/edit via the api are rejected', async ({ page }) => {
  const problems = instrument(page);
  await page.goto('./index.html?demo=1&fixture=test');
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  const res = await page.evaluate(async () => {
    const api = window.__vault.api;
    const base = { deviceId: 'kid', deviceName: 'Kid tab', user: { role: 'parent', id: 'p_dad', name: 'Dad' } };
    const out = {};
    for (const [a, b] of [['setStatus', { id: 'Z4', status: 'approved' }], ['setStatus', { id: 'L3', status: 'void' }],
      ['update', { id: 'L3', kidId: 'k_logan', amountCents: -1, category: 'Digital', note: '' }],
      ['settleTithing', { settleId: 's_x', txIds: ['L2'] }], ['setGoal', { kidId: 'k_jake', goalName: 'x', goalCents: 100 }],
      ['upsertKid', { kid: { id: 'k_jake', name: 'Hax', color: '#000000', emoji: '', archived: true } }]]) {
      try { await api.call(a, { ...base, token: 'forged', ...b }); out[a + b.status] = 'OK?!'; } catch (e) { out[a + (b.status || '')] = e.code; }
    }
    const r = await api.call('add', { ...base, token: null, status: 'approved',
      txs: [{ id: 't_forge', kidId: 'k_jake', amountCents: 99999, category: 'Gift', note: '', clientTime: new Date(Date.now() + 864e5 * 30).toISOString() }] });
    out.add = [r.txs[0].status, r.txs[0].role, r.txs[0].user, Date.parse(r.txs[0].clientTime) - Date.now() < 6 * 60e3];
    return out;
  });
  expect(res).toEqual({ setStatusapproved: 'AUTH', setStatusvoid: 'AUTH', update: 'AUTH', settleTithing: 'AUTH', setGoal: 'AUTH', upsertKid: 'AUTH',
    add: ['pending', 'kid', 'Dad', true] });
  expect(problems).toEqual([]);
});

test('live mode (API_URL set) without network: boots, no crash, no demo data, demo still reachable', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  let hits = 0;
  await page.route(/script\.google\.com|googleusercontent/, (r) => { hits++; return r.abort('internetdisconnected'); });
  await page.goto('./index.html');
  await expect(tid(page, 'device-modal')).toBeVisible();
  await expect(page.locator('#logoSub')).toHaveText('Family Bank');
  expect(await page.evaluate(() => window.__vault)).toBeUndefined();
  await expect.poll(() => hits).toBeGreaterThan(0);
  expect(problems).toEqual([]);
  await page.goto('./index.html?demo=1');
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await expect(page.locator('#logoSub')).toHaveText('Family Bank · Demo');
});
