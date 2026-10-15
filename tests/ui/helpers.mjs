// Shared fixtures for the UI suite: fresh storage per test (new context), console-error and
// horizontal-overflow checks after every test, and small flows (device name, parent/kid sign-in).
import { test as base, expect } from '@playwright/test';

export const URL = (extra = '') => `./index.html?demo=1&fixture=test&undo=300${extra}`;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.errors = errors;
    await use(page);
    if (!testInfo.annotations.some(a => a.type === 'allow-console-errors')) {
      expect(errors, 'no console errors / page errors').toEqual([]);
    }
    if (!page.isClosed() && !testInfo.annotations.some(a => a.type === 'skip-overflow')) {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth).catch(() => 0);
      expect(over, 'no horizontal overflow').toBeLessThanOrEqual(0);
    }
  },
});
export { expect };

export const tid = (page, id) => page.getByTestId(id);

export async function open(page, extra = '') {
  // The kid "Dad said yes!" card (v1.1.1) is tested on its own; elsewhere start with everything seen.
  if (!extra.includes('decisions')) {
    await page.addInitScript(() => {
      for (const k of ['k_logan', 'k_lizzy', 'k_jake', 'k_baby']) {
        const key = 'vault_demo_seenDecisions_' + k;
        if (localStorage.getItem(key) == null) localStorage.setItem(key, JSON.stringify('2999-01-01T00:00:00.000Z'));
      }
    });
  }
  await page.goto(URL(extra));
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await page.evaluate(() => window.__vault.mock.setLatency(20));
}

export async function nameDevice(page, name = 'Test Phone') {
  await expect(tid(page, 'device-modal')).toBeVisible();
  await tid(page, 'device-input').fill(name);
  await tid(page, 'device-save').click();
  await expect(tid(page, 'who-sheet')).toHaveClass(/show/);
}

export async function enterPin(page, parentId, pin) {
  await tid(page, 'who-parent-' + parentId).click();
  await expect(tid(page, 'pin-modal')).toBeVisible();
  await tid(page, 'pin-input').fill(pin);
  await tid(page, 'pin-submit').click();
}

// Fresh device → Dad (or Mom) signed in, on Home.
export async function asParent(page, { parentId = 'p_dad', pin = '1234', extra = '' } = {}) {
  await open(page, extra);
  await nameDevice(page);
  await expect(tid(page, 'who-parent-' + parentId)).toBeVisible();
  await enterPin(page, parentId, pin);
  await expect(tid(page, 'pin-modal')).toBeHidden();
  await expect(tid(page, 'who-sheet')).not.toHaveClass(/show/);
}

export async function asKid(page, kidId, { extra = '' } = {}) {
  await open(page, extra);
  await nameDevice(page);
  await tid(page, 'who-kid-' + kidId).click();
  await expect(page).toHaveURL(new RegExp('#/kid/' + kidId));
}

// Switch user via the account menu.
export async function switchToKid(page, kidId) {
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-switch').click();
  await tid(page, 'who-kid-' + kidId).click();
  await expect(page).toHaveURL(new RegExp('#/kid/' + kidId));
}
export async function switchToParent(page, parentId = 'p_dad', pin = '1234') {
  await tid(page, 'account-btn').click();
  await tid(page, 'menu-switch').click();
  await enterPin(page, parentId, pin);
  await expect(tid(page, 'pin-modal')).toBeHidden();
}

// Parent app lock (v1.0.3): after a reload/cold open a signed-in parent must re-enter the PIN.
export async function unlock(page, pin = '1234') {
  await expect(tid(page, 'lock-modal')).toBeVisible();
  await tid(page, 'lock-input').fill(pin);
  await tid(page, 'lock-submit').click();
  await expect(tid(page, 'lock-modal')).toBeHidden();
}

export async function goKid(page, kidId) {
  await tid(page, 'kid-card-' + kidId).click();
  await expect(tid(page, 'view-kid')).toHaveClass(/active/);
}

export async function goHome(page) {
  await tid(page, 'back-btn').click();
  await expect(tid(page, 'view-home')).toHaveClass(/active/);
}

export async function closeSheet(page) {
  await page.keyboard.press('Escape');
}

export const db = (page) => page.evaluate(() => window.__vault.mock.db());
export const outboxLen = (page) => page.evaluate(() => window.__vault.outbox.list().length);
export async function waitOutboxEmpty(page, timeout = 10_000) {
  await expect.poll(() => outboxLen(page), { timeout }).toBe(0);
}

// Open a ledger row's detail by id.
export async function openRow(page, id) {
  await tid(page, 'tx-row-' + id).click();
  await expect(tid(page, 'tx-detail-' + id)).toBeVisible();
}
