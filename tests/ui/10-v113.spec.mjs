// v1.1.3: Face ID survives switching to a kid and brings the parent back; home cards shrink to fit short phones.
import { test, expect, tid, asParent, switchToKid, goHome, db } from './helpers.mjs';

async function virtualFaceId(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true } });
}

test('Face ID: switch to a kid and back without the PIN; still works on the lock screen after', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'virtual authenticator is Chromium-only');
  await virtualFaceId(page);
  await asParent(page);
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-bio').click();
  await expect(page.locator('#toast')).toContainText('is on for this phone');

  await switchToKid(page, 'k_jake');
  expect(await page.evaluate(() => !!localStorage.getItem('vault_demo_bioCred'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('vault_demo_session'))).toBeNull();

  // Back to Dad: Face ID passes straight away, no PIN typed.
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-switch').click();
  await tid(page, 'who-parent-p_dad').click();
  await expect(tid(page, 'pin-modal')).toBeHidden({ timeout: 6000 });
  await expect(tid(page, 'who-sheet')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => localStorage.getItem('vault_demo_parkedSession'))).toBeNull();
  // The restored sign-in works for parent-only actions.
  await goHome(page).catch(() => {});
  await tid(page, 'strip-requests').click();
  await tid(page, 'approve-J5').click();
  await expect.poll(async () => (await db(page)).transactions.find(t => t.id === 'J5').status).toBe('approved');
  await page.keyboard.press('Escape');

  // And Face ID is still on for the next cold open.
  await page.reload();
  await expect(tid(page, 'lock-modal')).toBeHidden({ timeout: 6000 });
});

test('without Face ID, switching to a kid still signs the parent out (PIN needed to come back)', async ({ page }) => {
  await asParent(page);
  await switchToKid(page, 'k_jake');
  expect(await page.evaluate(() => localStorage.getItem('vault_demo_parkedSession'))).toBeNull();
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-switch').click();
  await tid(page, 'who-parent-p_dad').click();
  await expect(tid(page, 'pin-modal')).toBeVisible();
  await expect(tid(page, 'pin-bio')).toBeHidden();
});

test('phone: four kids fit a short screen too (cards shrink, nothing scrolls)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
  await page.setViewportSize({ width: 390, height: 640 });
  await asParent(page);
  await page.evaluate(async () => {
    const v = window.__vault;
    await v.api.call('upsertKid', { token: v.identity.session.token, deviceId: 'x', deviceName: 'x', kid: { id: 'k_baby', name: 'Baby', color: '#c084fc', emoji: '🍼', archived: false } });
    await v.store.refresh();
  });
  await expect(page.locator('[data-testid^="kid-card-"]')).toHaveCount(4);
  const m = await page.evaluate(() => {
    const c = document.querySelector('.cards');
    return { page: document.documentElement.scrollHeight - innerHeight, list: c.scrollHeight - c.clientHeight };
  });
  expect(m.page).toBeLessThanOrEqual(1);
  expect(m.list).toBeLessThanOrEqual(1);
  // Cards fill the screen; the Add button floats over the last card's empty corner, never over a name or balance.
  const vh = await page.evaluate(() => innerHeight);
  const last = await tid(page, 'kid-card-k_baby').evaluate(el => el.getBoundingClientRect().bottom);
  expect(last).toBeLessThanOrEqual(vh);
  const fab = await tid(page, 'fab').evaluate(el => el.getBoundingClientRect().toJSON());
  const bal = await tid(page, 'kid-balance-k_baby').evaluate(el => el.getBoundingClientRect().toJSON());
  expect(bal.right <= fab.left || bal.bottom <= fab.top).toBe(true);
});
