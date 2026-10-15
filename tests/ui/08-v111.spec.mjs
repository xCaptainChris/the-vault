// v1.1.1: "Dad said yes/no" card, balance on spend approvals, kid cards hide IDs, phone layouts.
import { test, expect, tid, asParent, asKid, switchToKid, goKid, goHome, db, waitOutboxEmpty, openRow } from './helpers.mjs';

test('a kid sees what happened to their requests once, with the reason', async ({ page }) => {
  await asParent(page, { extra: '&decisions=1' });
  await tid(page, 'strip-requests').click();
  await tid(page, 'deny-J5').click();
  await tid(page, 'reason-J5-preset-0').click();
  await tid(page, 'deny-confirm-J5').click();
  await waitOutboxEmpty(page);
  await page.keyboard.press('Escape');
  await switchToKid(page, 'k_jake');
  await expect(tid(page, 'decision-sheet')).toHaveClass(/show/, { timeout: 4000 });
  await expect(tid(page, 'decision-J5')).toContainText('Fortnite skin');
  await expect(tid(page, 'decision-J5')).toContainText('No from Dad');
  await expect(tid(page, 'decision-list')).toContainText('Chore isn’t done yet');
  await tid(page, 'decision-ok').click();
  await expect(tid(page, 'decision-sheet')).not.toHaveClass(/show/);
  // Not shown again
  await goHome(page);
  await goKid(page, 'k_jake');
  await page.waitForTimeout(1200);
  await expect(tid(page, 'decision-sheet')).not.toHaveClass(/show/);
});

test('spend approvals show the balance before → after; kids never see IDs', async ({ page }) => {
  await asParent(page);
  await tid(page, 'strip-requests').click();
  await expect(tid(page, 'approval-bal-J5')).toContainText('$3.60');
  await expect(tid(page, 'approval-bal-J5')).toContainText('−$2.40');
  await expect(tid(page, 'approval-bal-J5')).toHaveClass(/neg/);
  await page.keyboard.press('Escape');
  await goKid(page, 'k_jake');
  await openRow(page, 'J5');
  await expect(tid(page, 'tx-card-balance')).toContainText('→');
  await expect(page.locator('#txSheet .cardid')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await switchToKid(page, 'k_jake');
  await openRow(page, 'J5');
  await expect(tid(page, 'tx-card-status')).toBeVisible();
  await expect(page.locator('#txSheet .cardid')).toHaveCount(0);
  await expect(tid(page, 'tx-card-balance')).toHaveCount(0);
});

test('a kid on a sibling’s page has no Ask button', async ({ page }) => {
  await asKid(page, 'k_jake');
  await expect(tid(page, 'fab')).toBeVisible();
  await goHome(page);
  await goKid(page, 'k_logan');
  await expect(tid(page, 'fab')).toBeHidden();
});

test('phone: kid page leaves most of the screen for History', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
  await asKid(page, 'k_logan');
  const h = await tid(page, 'ledger').evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThan(330);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);

});

test('phone: home fits four kids without scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
  // Un-archive Baby through the demo server so there are four cards.
  await asParent(page);
  const ok = await page.evaluate(async () => {
    const v = window.__vault;
    const r = await v.api.call('upsertKid', { token: v.identity.session.token, deviceId: 'x', deviceName: 'x', kid: { id: 'k_baby', name: 'Baby', color: '#c084fc', emoji: '🍼', archived: false } });
    await v.store.refresh();
    return r.ok;
  });
  expect(ok).toBe(true);
  await expect(page.locator('[data-testid^="kid-card-"]')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  const last = await tid(page, 'kid-card-k_baby').evaluate(el => el.getBoundingClientRect().bottom);
  const fabTop = await tid(page, 'fab').evaluate(el => el.getBoundingClientRect().top);
  expect(last).toBeLessThanOrEqual(fabTop);
});
