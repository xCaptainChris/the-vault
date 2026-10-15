// v1.0.4: tap-for-details card, approve/deny reasons kids can read, kid icon picker,
// per-kid tithing (pay one kid or all; kids can see it), still page with scrolling history.
import { test, expect, tid, asParent, asKid, goKid, goHome, db, waitOutboxEmpty, switchToKid } from './helpers.mjs';

test('tapping a history row pops a card; Escape and ✕ close it', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await tid(page, 'tx-row-L3').click();
  await expect(tid(page, 'tx-sheet')).toHaveClass(/show/);
  await expect(tid(page, 'tx-card-status')).toHaveText('Approved');
  await expect(tid(page, 'tx-card-amount')).toHaveText('−$15.00');
  await tid(page, 'tx-card-close').click();
  await expect(tid(page, 'tx-sheet')).not.toHaveClass(/show/);
  await tid(page, 'tx-row-L3').click();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'tx-sheet')).not.toHaveClass(/show/);
});

test('parent denies a pending request from its card with a reason; the kid sees it', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_jake');
  await tid(page, 'tx-row-J5').click();
  await expect(tid(page, 'tx-card-status')).toHaveText('Waiting for approval');
  await tid(page, 'tx-card-reason').fill('Room isn’t clean yet');
  await tid(page, 'tx-card-deny').click();
  await expect(tid(page, 'tx-sheet')).not.toHaveClass(/show/);
  await expect(tid(page, 'tx-row-J5').getByTestId('denied-tag')).toBeVisible();
  await waitOutboxEmpty(page);
  const t = (await db(page)).transactions.find(x => x.id === 'J5');
  expect(t.status).toBe('denied');
  expect(t.reason).toBe('Room isn’t clean yet');

  await switchToKid(page, 'k_jake');
  await tid(page, 'tx-row-J5').click();
  await expect(tid(page, 'tx-card-status')).toHaveText('Denied');
  await expect(tid(page, 'tx-reason')).toContainText('Room isn’t clean yet');
  await expect(tid(page, 'tx-card-acted')).toContainText('Denied by Dad');
  await expect(tid(page, 'tx-card-approve')).toHaveCount(0);
});

test('approve with a note from the approvals list', async ({ page }) => {
  await asParent(page);
  await tid(page, 'strip-requests').click();
  await tid(page, 'add-reason-Z4').click();
  await tid(page, 'reason-Z4').fill('Great job!');
  await tid(page, 'approve-Z4').click();
  await waitOutboxEmpty(page);
  expect((await db(page)).transactions.find(x => x.id === 'Z4').reason).toBe('Great job!');
});

test('a kid can change their own icon; not a sibling’s', async ({ page }) => {
  await asKid(page, 'k_jake');
  await tid(page, 'hero-icon-btn').click();
  await expect(tid(page, 'avatar-sheet')).toHaveClass(/show/);       // v1.1: the avatar builder comes first
  await tid(page, 'avatar-use-emoji').click();
  await expect(tid(page, 'emoji-sheet')).toHaveClass(/show/);
  await tid(page, 'emoji-0').click();
  await expect(tid(page, 'hero-icon-btn')).toContainText('🦖');
  await waitOutboxEmpty(page);
  expect((await db(page)).kids.find(k => k.id === 'k_jake').emoji).toBe('🦖');
  await page.evaluate(() => { location.hash = '#/kid/k_logan'; });
  await expect(page).toHaveURL(/k_logan/);
  await expect(tid(page, 'hero-icon-btn')).toHaveCount(0);
  const code = await page.evaluate(async () => {
    try { await window.__vault.api.call('setEmoji', { kidId: 'k_logan', emoji: '🐸', user: { role: 'kid', id: 'k_jake', name: 'Jake' } }); return 'ok'; }
    catch (e) { return e.code; }
  });
  expect(code).toBe('AUTH');
});

test('tithing: pay one kid at a time; kids see paid / waiting', async ({ page }) => {
  await asParent(page);
  await tid(page, 'strip-tithe').click();
  await tid(page, 'tithe-pay-k_lizzy').click();
  await tid(page, 'tithe-pay-k_lizzy').click();          // confirm
  await expect(tid(page, 'strip-tithe')).toContainText('$2.40');
  await waitOutboxEmpty(page);
  const d = await db(page);
  expect(d.transactions.find(t => t.id === 'Z2').settledAt).toBeTruthy();
  expect(d.transactions.find(t => t.id === 'L2').settledAt).toBeFalsy();

  await switchToKid(page, 'k_lizzy');
  await expect(tid(page, 'kid-tithe-pill')).toContainText('Tithing paid');
  await tid(page, 'kid-tithe-pill').click();
  await expect(tid(page, 'kid-tithe-status')).toHaveText('All paid ✓');
  await expect(tid(page, 'kid-tithe-paid')).toContainText('$0.80');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'tx-row-Z2').getByTestId('tithe-paid-tag')).toBeVisible();

  await switchToKid(page, 'k_logan');
  await expect(tid(page, 'kid-tithe-pill')).toContainText('$2.00');
  await expect(tid(page, 'kid-tithe-pill')).toContainText('tithing waiting');
});

test('parent can mark one kid’s tithing paid from that kid’s tithing card', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await tid(page, 'kid-tithe-pill').click();
  await expect(tid(page, 'kid-tithe-owed')).toHaveText('$2.00');
  await tid(page, 'kid-tithe-pay').click();
  await tid(page, 'kid-tithe-pay').click();
  await expect(tid(page, 'kid-tithe-pill')).toContainText('Tithing paid');
});

test('phone: kid page holds still; only history scrolls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await asParent(page);
  await page.evaluate(() => {
    const now = Date.now(); const rows = [];
    for (let i = 0; i < 80; i++) { const ts = new Date(now - (i + 1) * 36e5 * 9).toISOString();
      rows.push({ id: 'b' + i, ts, clientTime: ts, kidId: 'k_logan', kidName: 'Logan', amountCents: 100, category: 'Chores', note: 'Bulk ' + i,
        status: 'approved', user: 'Dad', role: 'parent', deviceId: 'a1b2c3d4', deviceName: "Dad's phone", actedBy: 'Dad', actedAt: ts,
        actedDeviceName: '', editedBy: '', editedAt: '', settledAt: '', settleId: '', groupId: '', reason: '' }); }
    window.__vault.mock.addTx(rows);
  });
  await page.evaluate(() => window.__vault.store.refresh());
  await goKid(page, 'k_logan');
  const m = await page.evaluate(() => {
    const l = document.querySelector('[data-testid="ledger"]').getBoundingClientRect();
    return { page: document.scrollingElement.scrollHeight, ih: innerHeight, ledgerBottom: l.bottom, ledgerH: l.height };
  });
  expect(m.page).toBeLessThanOrEqual(m.ih + 1);          // page itself doesn't scroll
  expect(m.ledgerBottom).toBeLessThanOrEqual(m.ih);      // history box fits on screen
  expect(m.ledgerH).toBeGreaterThan(200);
  await tid(page, 'kidLedger').count();
  const scrolled = await page.evaluate(() => { const l = document.querySelector('[data-testid="ledger"]'); l.scrollTop = 400; return l.scrollTop; });
  expect(scrolled).toBeGreaterThan(0);
  await goHome(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('kid-page'))).toBe(false);
});
