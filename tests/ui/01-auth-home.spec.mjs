// T01–T07: first run, parent login, lockout, home, family sheet, kid dashboard, row detail.
import { test, expect, tid, open, nameDevice, enterPin, asParent, asKid, goKid, goHome, switchToKid, openRow } from './helpers.mjs';

test('T01 first run: device modal and Who’s here cannot be dismissed; Baby hidden', async ({ page }) => {
  await open(page);
  await expect(tid(page, 'device-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(tid(page, 'device-modal')).toBeVisible();
  await nameDevice(page, 'Test Phone');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.goBack().catch(() => {});
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
  for (const k of ['k_logan', 'k_lizzy', 'k_jake']) await expect(tid(page, 'who-kid-' + k)).toBeVisible();
  await expect(tid(page, 'who-kid-k_baby')).toHaveCount(0);
  await expect(page.getByTestId('who-kids')).not.toContainText('Baby');
});

test('T02 parent login: wrong PIN then right PIN, token stored', async ({ page }) => {
  await open(page);
  await nameDevice(page);
  await enterPin(page, 'p_dad', '0000');
  await expect(tid(page, 'pin-error')).toHaveText('Wrong PIN');
  await expect(tid(page, 'pin-hint')).toHaveText('Demo PINs: Dad 1234 · Mom 5678');
  await tid(page, 'pin-input').fill('1234');
  await tid(page, 'pin-submit').click();
  await expect(tid(page, 'account-btn')).toHaveText('D');
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('vault_demo_session')));
  expect(typeof sess.token).toBe('string');
  expect(sess.token.length).toBeGreaterThanOrEqual(40);
  expect(sess.parent.name).toBe('Dad');
});

test('T03 lockout after 5 wrong PINs; correct PIN still rejected', async ({ page }) => {
  await open(page);
  await nameDevice(page);
  await enterPin(page, 'p_mom', '0000');
  for (let i = 0; i < 4; i++) {
    await tid(page, 'pin-input').fill('0000');
    await tid(page, 'pin-submit').click();
    await page.waitForTimeout(60);
  }
  await expect(tid(page, 'pin-error')).toContainText('Too many tries');
  await tid(page, 'pin-input').fill('5678');
  await tid(page, 'pin-submit').click();
  await expect(tid(page, 'pin-error')).toContainText('Too many tries');
  expect(await page.evaluate(() => localStorage.getItem('vault_demo_session'))).toBeNull();
});

test('T04 home (parent): balances, family strip, goals', async ({ page }) => {
  await asParent(page);
  await expect(tid(page, 'kid-balance-k_logan')).toHaveText('$7.00');
  await expect(tid(page, 'kid-balance-k_lizzy')).toHaveText('$3.70');
  await expect(tid(page, 'kid-balance-k_jake')).toHaveText('$3.60');
  await expect(tid(page, 'kid-card-k_baby')).toHaveCount(0);
  await expect(tid(page, 'strip-holding')).toContainText('$17.50');
  await expect(tid(page, 'strip-tithe')).toContainText('$3.20');
  await expect(tid(page, 'strip-requests')).toContainText('2 requests');
  await expect(tid(page, 'kid-goal-k_lizzy')).toContainText('Goal reached');
  await expect(tid(page, 'kid-goal-k_logan')).toContainText('11%');
  await expect(tid(page, 'kid-pending-k_lizzy')).toBeVisible();
});

test('T05 family sheet', async ({ page }) => {
  await asParent(page);
  await tid(page, 'strip-holding').click();
  await expect(tid(page, 'family-sheet')).toHaveClass(/show/);
  await expect(tid(page, 'family-row-k_logan')).toContainText('$7.00');
  await expect(tid(page, 'family-row-k_lizzy')).toContainText('$3.70');
  await expect(tid(page, 'family-row-k_jake')).toContainText('$3.60');
  await expect(tid(page, 'family-kids-total')).toHaveText('$14.30');
  await expect(tid(page, 'family-tithe')).toHaveText('$3.20');
  await expect(tid(page, 'family-total')).toHaveText('$17.50');
});

test('T06 kid dashboard: hero, digital pill, void hidden from kids, denied shown + tagged, month headers', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await expect(tid(page, 'hero-balance')).toHaveText('$7.00');
  await expect(tid(page, 'digital-amount')).toHaveText('$15.00');
  expect(await tid(page, 'month-header').count()).toBeGreaterThan(0);
  await goHome(page);
  await goKid(page, 'k_jake');
  await expect(tid(page, 'tx-row-J3')).toHaveClass(/voided/);
  const deco = await tid(page, 'tx-row-J3').locator('.txamt').evaluate(e => getComputedStyle(e).textDecorationLine);
  expect(deco).toContain('line-through');
  await expect(tid(page, 'tx-row-J4').getByTestId('denied-tag')).toBeVisible();      // denied stays in history
  await switchToKid(page, 'k_jake');
  await expect(tid(page, 'tx-row-J1')).toBeVisible();
  await expect(tid(page, 'tx-row-J3')).toHaveCount(0);
  await expect(tid(page, 'tx-row-J4').getByTestId('denied-tag')).toBeVisible();
});

test('T07 row detail: parent sees device ID + actions; kid does not', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await openRow(page, 'L3');
  const d = tid(page, 'tx-detail-L3');
  await expect(d).toContainText(' by Dad');
  await expect(d).toContainText("Dad's phone");
  await expect(d.getByTestId('tx-device-id')).toContainText('a1b2c3d4');
  await expect(d.getByTestId('tx-edit')).toBeVisible();
  await expect(d.getByTestId('tx-void')).toBeVisible();
  await page.keyboard.press('Escape');
  await switchToKid(page, 'k_logan');
  await openRow(page, 'L3');
  const k = tid(page, 'tx-detail-L3');
  await expect(k).toContainText(' by Dad');
  await expect(k.getByTestId('tx-device-id')).toHaveCount(0);
  await expect(k).not.toContainText('a1b2c3d4');
  await expect(k.getByTestId('tx-edit')).toHaveCount(0);
  await expect(k.getByTestId('tx-void')).toHaveCount(0);
});

test('kid user lands on own page and sees siblings read-only', async ({ page }) => {
  await asKid(page, 'k_lizzy');
  await expect(tid(page, 'fab')).toHaveText('＋ Ask');
  await goHome(page);
  await expect(tid(page, 'family-strip')).toHaveCount(0);
  await expect(tid(page, 'kid-card-k_logan')).toBeVisible();
});
