// T14–T22: approvals, edit-then-approve, edit approved, void, settled lock, tithing settle,
// donut, goals, goal celebration.
import { test, expect, tid, asParent, goKid, goHome, db, waitOutboxEmpty, switchToKid, switchToParent, openRow, unlock } from './helpers.mjs';

test('T14 approvals: linked request is one card; approve, deny, approve all', async ({ page }) => {
  await asParent(page);
  // Lizzy asks for $3 Chores (with the default tithing row)
  await switchToKid(page, 'k_lizzy');
  await tid(page, 'fab').click();
  await tid(page, 'entry-amount').fill('3');
  await tid(page, 'entry-save').click();
  await tid(page, 'tithe-ask-yes').click();
  await waitOutboxEmpty(page);
  await switchToParent(page);
  await goHome(page).catch(() => {});
  await expect(tid(page, 'strip-requests')).toContainText('3 requests');
  await tid(page, 'strip-requests').click();
  await expect(tid(page, 'approve-sheet')).toHaveClass(/show/);
  const newReq = (await db(page)).transactions.find(t => t.kidId === 'k_lizzy' && t.amountCents === 300);
  await expect(tid(page, 'approval-card-' + newReq.id)).toBeVisible();
  await expect(tid(page, 'approval-tithe-' + newReq.id)).toContainText('−$0.30 tithing');
  await expect(page.locator('[data-testid^="approval-card-"]')).toHaveCount(3);   // 4 pending rows, 3 cards
  await expect(tid(page, 'approve-all')).toHaveText('Approve all (3)');
  await expect(tid(page, 'approval-card-Z4')).toContainText("requested on Lizzy's iPad");

  await tid(page, 'approve-Z4').click();
  await expect(tid(page, 'approval-card-Z4')).toHaveCount(0);
  await tid(page, 'deny-J5').click();
  await tid(page, 'reason-J5-preset-0').click();                       // "Chore isn't done yet"
  await tid(page, 'deny-confirm-J5').click();
  await expect(tid(page, 'approval-card-J5')).toHaveCount(0);
  await expect(tid(page, 'approve-all')).toHaveCount(0);   // only 1 left
  await waitOutboxEmpty(page);
  let d = await db(page);
  expect(d.transactions.find(t => t.id === 'Z4').status).toBe('approved');
  expect(d.transactions.find(t => t.id === 'J5').status).toBe('denied');
  expect(d.transactions.find(t => t.id === 'J5').reason).toBe('Chore isn’t done yet');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'kid-balance-k_lizzy')).toHaveText('$8.70');
  await expect(tid(page, 'strip-tithe')).toContainText('$3.20');   // Z4 has no group: tithing untouched

  // Approve all with ≥2: add a second request, then approve both groups at once
  await switchToKid(page, 'k_jake');
  await tid(page, 'fab').click();
  await tid(page, 'entry-quick-100').click();
  await tid(page, 'entry-save').click();
  await tid(page, 'tithe-ask-yes').click();
  await waitOutboxEmpty(page);
  await switchToParent(page);
  await goHome(page).catch(() => {});
  await tid(page, 'strip-requests').click();
  await expect(tid(page, 'approve-all')).toHaveText('Approve all (2)');
  await tid(page, 'approve-all').click();
  await waitOutboxEmpty(page);
  d = await db(page);
  expect(d.transactions.filter(t => t.status === 'pending')).toHaveLength(0);
  await expect(tid(page, 'strip-requests')).toHaveCount(0);
});

test('T15 edit-then-approve a pending request', async ({ page }) => {
  await asParent(page);
  await tid(page, 'strip-requests').click();
  await tid(page, 'approval-body-Z4').click();
  await expect(tid(page, 'entry-title')).toHaveText('Review request');
  await expect(tid(page, 'entry-amount')).toHaveValue('5.00');
  await tid(page, 'entry-amount').fill('4');
  await tid(page, 'entry-approve-changes').click();
  await waitOutboxEmpty(page);
  const z4 = (await db(page)).transactions.find(t => t.id === 'Z4');
  expect(z4).toMatchObject({ amountCents: 400, status: 'approved', editedBy: 'Dad', actedBy: 'Dad' });
  await expect(tid(page, 'kid-balance-k_lizzy')).toHaveText('$7.70');
});

test('T16 edit an approved deposit and re-tithe', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await openRow(page, 'L1');
  await tid(page, 'tx-detail-L1').getByTestId('tx-edit').click();
  await expect(tid(page, 'entry-title')).toHaveText('Edit entry');
  await expect(tid(page, 'entry-recent')).toHaveCount(0);
  await expect(tid(page, 'entry-tithe-toggle')).toHaveCount(0);
  await tid(page, 'entry-amount').fill('30');
  await expect(tid(page, 'entry-retithe')).toContainText('Also update tithing to −$3.00');
  await expect(tid(page, 'entry-retithe')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'hero-balance')).toHaveText('$16.00');
  await waitOutboxEmpty(page);
  const d = await db(page);
  expect(d.transactions.find(t => t.id === 'L1').amountCents).toBe(3000);
  expect(d.transactions.find(t => t.id === 'L2').amountCents).toBe(-300);
  await expect(tid(page, 'tx-amount-L2')).toHaveText('−$3.00');
});

test('T17 void needs two taps, strikes the row, and can be undone', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await openRow(page, 'L3');
  const vb = tid(page, 'tx-detail-L3').getByTestId('tx-void');
  await vb.click();
  await expect(vb).toHaveText('Tap again to void');
  await expect(tid(page, 'hero-balance')).toHaveText('$7.00');
  await vb.click();
  await expect(tid(page, 'hero-balance')).toHaveText('$22.00');
  await expect(tid(page, 'tx-row-L3')).toHaveClass(/voided/);
  await expect(tid(page, 'snackbar-action')).toHaveText('Undo');
  await waitOutboxEmpty(page);
  expect((await db(page)).transactions.find(t => t.id === 'L3').status).toBe('void');
});

test('T17b undo a void', async ({ page }) => {
  await asParent(page);
  await page.goto('./index.html?demo=1&fixture=test&undo=5000');
  await page.waitForFunction(() => window.__vault);
  await unlock(page);
  await goKid(page, 'k_logan');
  await openRow(page, 'L3');
  const vb = tid(page, 'tx-detail-L3').getByTestId('tx-void');
  await vb.click();
  await vb.click();
  await expect(tid(page, 'hero-balance')).toHaveText('$22.00');
  await tid(page, 'snackbar-action').click();
  await expect(tid(page, 'hero-balance')).toHaveText('$7.00');
  await page.waitForTimeout(300);
  expect((await db(page)).transactions.find(t => t.id === 'L3').status).toBe('approved');
});

test('T18 settled rows are immutable', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await openRow(page, 'L5');
  const d = tid(page, 'tx-detail-L5');
  await expect(d.getByTestId('tx-settled-lock')).toHaveText('Settled — can’t edit');
  await expect(d.getByTestId('tx-edit')).toHaveCount(0);
  await expect(d.getByTestId('tx-void')).toHaveCount(0);
  await expect(d).toContainText('Sent to church');
});

test('T19 tithing settle with two-tap confirm', async ({ page }) => {
  await asParent(page);
  await tid(page, 'strip-tithe').click();
  await expect(tid(page, 'tithe-row-k_logan')).toContainText('$2.00');
  await expect(tid(page, 'tithe-row-k_lizzy')).toContainText('$0.80');
  await expect(tid(page, 'tithe-row-k_jake')).toContainText('$0.40');
  await expect(tid(page, 'tithe-total')).toHaveText('$3.20');
  await expect(tid(page, 'tithe-mark')).toHaveText('Mark all $3.20 paid');
  await tid(page, 'tithe-mark').click();
  await expect(tid(page, 'tithe-mark')).toHaveText('Tap again to confirm');
  await tid(page, 'tithe-mark').click();
  await expect(tid(page, 'strip-tithe')).toContainText('$0.00');
  await waitOutboxEmpty(page);
  const d = await db(page);
  expect(d.settlements).toHaveLength(2);
  expect(d.transactions.filter(t => ['L2', 'Z2', 'J2'].includes(t.id)).every(t => t.settledAt && t.settleId)).toBe(true);
  await expect(tid(page, 'kid-balance-k_logan')).toHaveText('$7.00');
  await expect(tid(page, 'kid-balance-k_lizzy')).toHaveText('$3.70');
  await expect(tid(page, 'kid-balance-k_jake')).toHaveText('$3.60');
  await tid(page, 'strip-tithe').click();
  await expect(tid(page, 'tithe-empty')).toBeVisible();
  const first = tid(page, 'tithe-last').locator('.legrow').first();
  await expect(first).toContainText('$3.20');
  await expect(first).toContainText('Dad');
});

test('T20 donut: panel opens all time (matches the panel total), then 30d, 90d', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await expect(tid(page, 'total-out')).toHaveText('$23.00');
  await tid(page, 'panel-out').click();
  await expect(tid(page, 'donut-title')).toHaveText('Logan — money out');
  await expect(tid(page, 'donut-period-0')).toHaveClass(/sel/);
  await expect(tid(page, 'donut-leg-Digital').locator('.lval')).toHaveText('$20.00');
  for (const days of [30, 90, 0]) {
    await tid(page, 'donut-period-' + days).click();
    const expected = await page.evaluate((d) => window.__vault.selectors.catTotals(window.__vault.store.view, 'k_logan', 'out', d), days);
    const shown = await page.locator('[data-testid^="donut-leg-"]').evaluateAll(els => els.map(e => ({ cat: e.dataset.testid.slice(10), cents: Number(e.dataset.cents) })));
    expect(shown).toEqual(expected);
    const total = expected.reduce((s, e) => s + e.cents, 0);
    await expect(tid(page, 'donut-total')).toHaveText('$' + (total / 100).toFixed(2));
  }
  // All time: Digital $20 + Tithing $3 = $23, Digital 87%
  await expect(tid(page, 'donut-total')).toHaveText('$23.00');
  await expect(tid(page, 'donut-leg-Digital').locator('.lpct')).toHaveText('87%');
});

test('T21 goals: set, show %, clear; a kid can edit only their own goal', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_jake');
  await tid(page, 'goal-edit-btn').click();
  await tid(page, 'goal-name').fill('Lego');
  await tid(page, 'goal-amount').fill('10');
  await tid(page, 'goal-save').click();
  await expect(tid(page, 'goal-bar')).toContainText('Lego');
  await goHome(page);
  await expect(tid(page, 'kid-goal-k_jake')).toHaveText('Lego · 36%');
  await goKid(page, 'k_jake');
  await tid(page, 'goal-edit-btn').click();
  await tid(page, 'goal-clear').click();
  await expect(tid(page, 'goal-bar')).toHaveCount(0);
  await goHome(page);
  await expect(tid(page, 'kid-goal-k_jake')).toHaveCount(0);
  await waitOutboxEmpty(page);
  expect((await db(page)).kids.find(k => k.id === 'k_jake').goalCents).toBe(0);
  await switchToKid(page, 'k_jake');
  await expect(tid(page, 'goal-edit-btn')).toHaveCount(1);          // own page
  await page.evaluate(() => { location.hash = '#/kid/k_logan'; });
  await expect(page).toHaveURL(/#\/kid\/k_logan/);
  await expect(tid(page, 'goal-edit-btn')).toHaveCount(0);          // sibling's page
});

test('T22 goal celebration fires once per device', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await expect(tid(page, 'goal-reached')).toHaveCount(0);
  await tid(page, 'fab').click();
  await tid(page, 'entry-amount').fill('60');
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'goal-reached')).toBeVisible();
  await expect(tid(page, 'confetti')).toHaveCount(1);
  await waitOutboxEmpty(page);
  await page.reload();
  await page.waitForFunction(() => window.__vault);
  await unlock(page);
  await expect(tid(page, 'goal-reached')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(tid(page, 'confetti')).toHaveCount(0);
});
