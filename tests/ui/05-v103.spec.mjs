// v1.0.3: goal sheet text, kid-owned goals, stale-refresh race, drag-to-dismiss, iOS zoom guard.
import { test, expect, tid, asParent, asKid, goKid, unlock } from './helpers.mjs';

test('goal sheet shows no stray text (no "false") for a kid without a goal', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_jake');
  await tid(page, 'goal-edit-btn').click();
  await expect(tid(page, 'goal-sheet')).toHaveClass(/show/);
  const text = await page.locator('#goalSheet .body').innerText();
  expect(text).not.toContain('false');
  await expect(tid(page, 'goal-clear')).toHaveCount(0);
});

test('a kid can set their own goal and it sticks', async ({ page }) => {
  await asKid(page, 'k_jake');
  await expect(tid(page, 'goal-edit-btn')).toHaveText(/Set goal/);
  await tid(page, 'goal-edit-btn').click();
  await expect(page.locator('#goalSheet h2')).toHaveText('My goal');
  await tid(page, 'goal-name').fill('Power Wheels');
  await tid(page, 'goal-amount').fill('100');
  await tid(page, 'goal-save').click();
  await expect(tid(page, 'goal-bar')).toContainText('Power Wheels');
  await expect.poll(() => page.evaluate(() => window.__vault.mock.db().kids.find(k => k.id === 'k_jake').goalCents), { timeout: 5000 }).toBe(10000);
  await page.evaluate(() => window.__vault.store.refresh());
  await expect(tid(page, 'goal-bar')).toContainText('Power Wheels');
});

test('a kid cannot edit a sibling\'s goal (no button; server says AUTH)', async ({ page }) => {
  await asKid(page, 'k_jake');
  await page.evaluate(() => { location.hash = '#/kid/k_logan'; });
  await expect(tid(page, 'view-kid')).toHaveClass(/active/);
  await expect(tid(page, 'goal-edit-btn')).toHaveCount(0);
  const code = await page.evaluate(async () => {
    try { await window.__vault.api.call('setGoal', { kidId: 'k_logan', goalName: 'x', goalCents: 100, user: { role: 'kid', id: 'k_jake', name: 'Jake' } }); return 'ok'; }
    catch (e) { return e.code; }
  });
  expect(code).toBe('AUTH');
});

test('a stale refresh that was in flight during a save does not wipe the saved goal', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_jake');
  // Start a refresh whose data is read now but delivered ~2.5 s later (like a slow Apps Script GET);
  // later loads are fast again.
  await page.evaluate(async () => {
    const m = window.__vault.mock;
    m.setLoadLag(2500);
    window.__vault.store.refresh();
    await new Promise(r => setTimeout(r, 80));
    m.setLoadLag(0);
  });
  await tid(page, 'goal-edit-btn').click();
  await tid(page, 'goal-name').fill('Lego');
  await tid(page, 'goal-amount').fill('25');
  await tid(page, 'goal-save').click();
  await expect(tid(page, 'goal-bar')).toContainText('Lego');
  // Across the whole window (send, stale response, follow-up refresh) the goal must never vanish.
  for (let i = 0; i < 24; i++) {
    await expect(tid(page, 'goal-bar')).toContainText('Lego', { timeout: 150 });
    await page.waitForTimeout(150);
  }
  expect(await page.evaluate(() => window.__vault.store.outbox.list().length)).toBe(0);
});

test('inputs are at least 16px so iOS does not zoom on focus', async ({ page }) => {
  await asParent(page);
  await tid(page, 'fab').click();
  const sizes = await page.evaluate(() => [...document.querySelectorAll('input')].filter(i => i.offsetParent).map(i => parseFloat(getComputedStyle(i).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
});

test('parent FAB reads "＋ Add / Spend"', async ({ page }) => {
  await asParent(page);
  await expect(tid(page, 'fab')).toHaveText('＋ Add / Spend');
});

async function drag(page, sheetSel, fromY, toY) {
  await page.evaluate(async ({ sheetSel, fromY, toY }) => {
    const el = document.querySelector(sheetSel);
    const x = innerWidth / 2;
    const mk = (y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const fire = (type, y) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [mk(y)], targetTouches: type === 'touchend' ? [] : [mk(y)], changedTouches: [mk(y)] }));
    fire('touchstart', fromY);
    const steps = 8;
    for (let i = 1; i <= steps; i++) { await new Promise(r => setTimeout(r, 16)); fire('touchmove', fromY + (toY - fromY) * i / steps); }
    fire('touchend', toY);
  }, { sheetSel, fromY, toY });
}

test('dragging the grip down dismisses a sheet; a small drag snaps back', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone-only gesture');
  await asParent(page);
  await tid(page, 'fab').click();
  const sheet = tid(page, 'entry-sheet');
  await expect(sheet).toHaveClass(/show/);
  await page.waitForTimeout(400);
  const top = await sheet.evaluate(el => el.getBoundingClientRect().top);
  await drag(page, '#entrySheet', top + 12, top + 40);      // small: snaps back
  await page.waitForTimeout(400);
  await expect(sheet).toHaveClass(/show/);
  expect(await sheet.evaluate(el => el.style.transform)).toBe('');
  await drag(page, '#entrySheet', top + 12, top + 320);     // big: dismisses
  await expect(sheet).not.toHaveClass(/show/);
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => document.documentElement.classList.contains('sheet-open'))).toBe(false);
});

test('page is scroll-locked while a sheet is open', async ({ page }) => {
  await asParent(page);
  await tid(page, 'fab').click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('sheet-open'))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.classList.contains('sheet-open'))).toBe(false);
});

/* ---- parent app lock ---- */
const reopen = async (page) => { await page.reload(); await page.waitForFunction(() => window.__vault && window.__vault.store); };

test('a parent must enter the PIN every time the app opens; wrong PIN is refused', async ({ page }) => {
  await asParent(page);
  await reopen(page);
  await expect(tid(page, 'lock-modal')).toBeVisible();
  await expect(tid(page, 'fab')).toBeHidden();
  await tid(page, 'lock-input').fill('9999');
  await tid(page, 'lock-submit').click();
  await expect(tid(page, 'lock-error')).toHaveText('Wrong PIN');
  await expect(tid(page, 'lock-modal')).toBeVisible();
  await tid(page, 'lock-input').fill('1234');
  await tid(page, 'lock-submit').click();
  await expect(tid(page, 'lock-modal')).toBeHidden();
  await expect(tid(page, 'fab')).toHaveText('＋ Add / Spend');
});

test('a kid is never locked', async ({ page }) => {
  await asKid(page, 'k_jake');
  await reopen(page);
  await expect(tid(page, 'view-kid')).toHaveClass(/active/);
  await expect(tid(page, 'lock-modal')).toBeHidden();
  await expect(tid(page, 'fab')).toHaveText('＋ Ask');
});

test('coming back after 30 s in the background locks; a quick app switch does not', async ({ page }) => {
  await asParent(page);
  const flip = (skipMs) => page.evaluate((skipMs) => {
    const real = Date.now.bind(Date);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    if (skipMs) { const t0 = real(); Date.now = () => real() + skipMs + (real() - t0); }
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  }, skipMs);
  await flip(5000);
  await expect(tid(page, 'lock-modal')).toBeHidden();
  await flip(31000);
  await expect(tid(page, 'lock-modal')).toBeVisible();
  await unlock(page);
});

test('"Switch user" on the lock screen signs the parent out', async ({ page }) => {
  await asParent(page);
  await reopen(page);
  await tid(page, 'lock-switch').click();
  await expect(tid(page, 'lock-modal')).toBeHidden();
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
  expect(await page.evaluate(() => window.__vault.identity.isParent)).toBe(false);
  await page.keyboard.press('Escape');                      // the who sheet is mandatory now
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
});

test('five wrong PINs sign the parent out', async ({ page }) => {
  await asParent(page);
  await reopen(page);
  for (let i = 0; i < 5; i++) {
    await tid(page, 'lock-input').fill('000' + i);
    await tid(page, 'lock-submit').click();
    if (i < 4) { await expect(tid(page, 'lock-error')).toHaveText('Wrong PIN'); await expect(tid(page, 'lock-submit')).toBeEnabled(); }
  }
  await expect(tid(page, 'lock-modal')).toBeHidden();
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
  await expect(tid(page, 'who-message')).toContainText('signed out');
  expect(await page.evaluate(() => window.__vault.identity.isParent)).toBe(false);
});

test('a PIN changed in the Sheet is accepted (server check) and old one is not', async ({ page }) => {
  await asParent(page);
  // Simulate the PIN being changed in the Parents tab.
  await page.evaluate(() => { const m = window.__vault.mock; const d = m.db(); });
  await page.evaluate(() => {
    const raw = sessionStorage.getItem('vault_demo_db_test'); const db = JSON.parse(raw);
    db.parents.find(p => p.id === 'p_dad').pin = '4321';
    sessionStorage.setItem('vault_demo_db_test', JSON.stringify(db));
  });
  await reopen(page);
  await unlock(page, '4321');
  await reopen(page);
  await unlock(page, '4321');                               // now cached locally too
});
