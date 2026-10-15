// v1.1.2: denied requests don't show a tithing row; Face ID unlock (WebAuthn, tested with a virtual authenticator).
import { test, expect, tid, asParent, switchToKid, switchToParent, goHome, db, waitOutboxEmpty } from './helpers.mjs';

test('a denied request shows once — no tithing row for money never received', async ({ page }) => {
  await asParent(page);
  await switchToKid(page, 'k_lizzy');
  await tid(page, 'fab').click();
  await tid(page, 'entry-amount').fill('3');
  await tid(page, 'entry-save').click();
  await tid(page, 'tithe-ask-yes').click();
  await waitOutboxEmpty(page);
  const req = (await db(page)).transactions.find(t => t.kidId === 'k_lizzy' && t.amountCents === 300);
  const tithe = (await db(page)).transactions.find(t => t.groupId && t.groupId === req.groupId && t.category === 'Tithing');
  expect(tithe).toBeTruthy();
  await expect(tid(page, 'tx-row-' + tithe.id)).toBeVisible();            // pending: both rows show

  await switchToParent(page);
  await goHome(page).catch(() => {});
  await tid(page, 'strip-requests').click();
  await tid(page, 'deny-' + req.id).click();
  await tid(page, 'deny-confirm-' + req.id).click();
  await waitOutboxEmpty(page);
  await page.keyboard.press('Escape');
  await tid(page, 'kid-card-k_lizzy').click();
  await expect(tid(page, 'tx-row-' + req.id)).toBeVisible();
  await expect(tid(page, 'tx-row-' + req.id).getByTestId('denied-tag')).toBeVisible();
  await expect(tid(page, 'tx-row-' + tithe.id)).toHaveCount(0);
});

test('Face ID: turn on from the account menu, then the lock screen opens with it; PIN still works', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'virtual authenticator is Chromium-only');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true } });
  await asParent(page);
  await tid(page, 'account-btn').click();
  await expect(tid(page, 'menu-bio')).toContainText('Off');
  await tid(page, 'menu-bio').click();
  await expect(page.locator('#toast')).toContainText('is on for this phone');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vault_demo_bioCred')));
  expect(saved.parentId).toBe('p_dad');

  // Re-open the app: the lock screen offers Face ID and (here) passes straight away.
  await page.reload();
  await expect(tid(page, 'lock-modal')).toBeHidden({ timeout: 6000 });

  // Menu shows On; turning it off goes back to the PIN.
  await tid(page, 'account-btn').click();
  await expect(tid(page, 'menu-bio')).toContainText('On');
  await tid(page, 'menu-bio').click();
  await page.reload();
  await expect(tid(page, 'lock-modal')).toBeVisible();
  await expect(tid(page, 'lock-bio')).toBeHidden();
  await tid(page, 'lock-input').fill('1234');
  await tid(page, 'lock-submit').click();
  await expect(tid(page, 'lock-modal')).toBeHidden();
});

test('a kid asking for money is asked about tithing: Yes links a 10% row, No sends just the request', async ({ page }) => {
  await asParent(page);
  await switchToKid(page, 'k_jake');
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-tithe-toggle')).toHaveCount(0);
  await tid(page, 'entry-amount').fill('4');
  await tid(page, 'entry-note').fill('Fed the dog');
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'tithe-ask-sheet')).toHaveClass(/show/);
  await expect(tid(page, 'tithe-ask-title')).toHaveText('Would you like to set aside 10% ($0.40) for tithing?');
  await page.keyboard.press('Escape');                                   // can't be dismissed without answering
  await expect(tid(page, 'tithe-ask-sheet')).toHaveClass(/show/);
  await tid(page, 'tithe-ask-yes').click();
  await waitOutboxEmpty(page);
  let d = await db(page);
  const a = d.transactions.find(t => t.note === 'Fed the dog');
  expect(a).toMatchObject({ amountCents: 400, status: 'pending' });
  expect(d.transactions.filter(t => t.groupId && t.groupId === a.groupId && t.category === 'Tithing')[0]).toMatchObject({ amountCents: -40, status: 'pending' });

  await tid(page, 'fab').click();
  await tid(page, 'entry-amount').fill('2');
  await tid(page, 'entry-note').fill('Took out trash');
  await tid(page, 'entry-save').click();
  await tid(page, 'tithe-ask-no').click();
  await waitOutboxEmpty(page);
  d = await db(page);
  const b = d.transactions.find(t => t.note === 'Took out trash');
  expect(b).toMatchObject({ amountCents: 200, status: 'pending' });
  expect(b.groupId || '').toBe('');
  expect(d.transactions.filter(t => t.kidId === 'k_jake' && /Took out trash/.test(t.note) && t.category === 'Tithing')).toHaveLength(0);
});
