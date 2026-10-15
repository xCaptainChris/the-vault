// T08–T13: fast entry, undo, manual entry, tithing toggle, validation, kid request.
import { test, expect, tid, asParent, asKid, goKid, db, outboxLen, waitOutboxEmpty, switchToKid, unlock } from './helpers.mjs';

test('T08 fast entry in exactly 3 taps (FAB → recent chip → Save)', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await page.evaluate(() => { window.__clicks = 0; document.addEventListener('click', () => window.__clicks++, true); });
  await tid(page, 'fab').click();
  await tid(page, 'entry-recent-0').click();
  await expect(tid(page, 'entry-amount')).toHaveValue('20.00');
  await expect(tid(page, 'entry-note')).toHaveValue('Mowed the lawn');
  await expect(tid(page, 'entry-cat-Chores')).toHaveClass(/sel/);
  await expect(tid(page, 'entry-tithe-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'entry-save').click();
  expect(await page.evaluate(() => window.__clicks)).toBe(3);
  await expect(tid(page, 'snackbar-action')).toHaveText('Undo');
  await expect(tid(page, 'hero-balance')).toHaveText('$25.00');
  await waitOutboxEmpty(page);
  const rows = (await db(page)).transactions.filter(t => t.kidId === 'k_logan' && !/^L\d$/.test(t.id));
  expect(rows.map(r => r.amountCents).sort((a, b) => a - b)).toEqual([-200, 2000]);
  expect(rows.every(r => r.status === 'approved')).toBe(true);
  await tid(page, 'back-btn').click();
  await expect(tid(page, 'strip-tithe')).toContainText('$5.20');
});

test('T09 undo removes the entry before it is sent', async ({ page }) => {
  await asParent(page, { extra: '' });
  // Use a long undo window for this test so Undo is reliably in time.
  await page.goto('./index.html?demo=1&fixture=test&undo=5000');
  await page.waitForFunction(() => window.__vault);
  await unlock(page);
  await goKid(page, 'k_logan');
  await tid(page, 'fab').click();
  await tid(page, 'entry-recent-0').click();
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'hero-balance')).toHaveText('$25.00');
  await tid(page, 'snackbar-action').click();
  await expect(tid(page, 'hero-balance')).toHaveText('$7.00');
  expect(await outboxLen(page)).toBe(0);
  await page.waitForTimeout(400);
  expect((await db(page)).transactions.length).toBe(15);
});

test('T10 manual entry from Home with Digital guess and negative warning', async ({ page }) => {
  await asParent(page);
  await tid(page, 'fab').click();
  await tid(page, 'entry-kid-k_jake').click();
  await tid(page, 'entry-dir-out').click();
  await tid(page, 'entry-quick-500').click();
  await tid(page, 'entry-note').fill('Roblox gift card');
  await expect(tid(page, 'entry-cat-Digital')).toHaveClass(/sel/);
  await expect(tid(page, 'entry-warning')).toBeVisible();
  await expect(tid(page, 'entry-warning')).toHaveText('This puts Jake at −$1.40');
  await expect(tid(page, 'entry-tithe-toggle')).toHaveCount(0);
  await tid(page, 'entry-save').click();
  await expect(tid(page, 'kid-balance-k_jake')).toHaveText('−$1.40');
  await expect(tid(page, 'kid-balance-k_jake')).toHaveClass(/neg/);
  await waitOutboxEmpty(page);
  const r = (await db(page)).transactions.find(t => t.note === 'Roblox gift card');
  expect(r).toMatchObject({ kidId: 'k_jake', amountCents: -500, category: 'Digital', status: 'approved' });
});

test('T11 tithing toggle off creates one row and is remembered', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await tid(page, 'fab').click();
  await tid(page, 'entry-quick-1000').click();
  await tid(page, 'entry-tithe-toggle').click();
  await expect(tid(page, 'entry-tithe-toggle')).toHaveAttribute('aria-pressed', 'false');
  await tid(page, 'entry-save').click();
  await waitOutboxEmpty(page);
  expect((await db(page)).transactions.length).toBe(16);
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-tithe-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('T12 amount validation', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await tid(page, 'fab').click();
  for (const bad of ['abc', '0', '1.234']) {
    await tid(page, 'entry-amount').fill(bad);
    await tid(page, 'entry-save').click();
    await expect(tid(page, 'entry-error')).toBeVisible();
    await expect(tid(page, 'entry-sheet')).toHaveClass(/show/);
  }
  expect(await outboxLen(page)).toBe(0);
  await tid(page, 'entry-amount').fill('$1,000.50');
  await tid(page, 'entry-tithe-toggle').click();
  await tid(page, 'entry-save').click();
  await waitOutboxEmpty(page);    // read what was saved (the short test undo window can expire before we look)
  expect((await db(page)).transactions.some(t => t.kidId === 'k_logan' && t.amountCents === 100050)).toBe(true);
});

test('T13 kid request: pending, balance unchanged, no parent controls', async ({ page }) => {
  await asParent(page);
  await switchToKid(page, 'k_lizzy');
  await expect(tid(page, 'fab')).toHaveText('＋ Ask');
  await tid(page, 'fab').click();
  await expect(tid(page, 'entry-title')).toHaveText('Ask for money');
  await expect(tid(page, 'entry-kids')).toHaveCount(0);
  await tid(page, 'entry-amount').fill('3');
  await expect(tid(page, 'entry-cat-Chores')).toHaveClass(/sel/);
  await expect(tid(page, 'entry-save')).toHaveText('Send request');
  await tid(page, 'entry-save').click();
  await tid(page, 'tithe-ask-yes').click();
  await expect(tid(page, 'snackbar')).toContainText('Request sent');
  await expect(tid(page, 'hero-balance')).toHaveText('$3.70');
  await waitOutboxEmpty(page);
  const rows = (await db(page)).transactions.filter(t => t.kidId === 'k_lizzy' && !/^Z\d$/.test(t.id));
  expect(rows).toHaveLength(2);
  expect(rows.every(r => r.status === 'pending' && r.role === 'kid')).toBe(true);
  const main = rows.find(r => r.amountCents === 300);
  await expect(tid(page, 'tx-row-' + main.id).getByTestId('pending-tag')).toBeVisible();
  // parent-only controls are absent from the DOM
  await openRow(page, 'Z1');
  for (const id of ['family-strip', 'tx-edit', 'tx-void', 'approve-all', 'tx-card-approve']) await expect(tid(page, id)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await tid(page, 'back-btn').click();
  await expect(tid(page, 'family-strip')).toHaveCount(0);
  await expect(tid(page, 'strip-requests')).toHaveCount(0);
});

async function openRow(page, id) {
  await tid(page, 'tx-row-' + id).click();
  await expect(tid(page, 'tx-detail-' + id)).toBeVisible();
}

test('kid user cannot get an approved entry even by calling the API directly', async ({ page }) => {
  await asKid(page, 'k_jake');
  const res = await page.evaluate(async () => {
    const api = window.__vault.api;
    const base = { deviceId: 'x', deviceName: 'x', token: null, user: { role: 'parent', id: 'p_dad', name: 'Dad' } };
    const out = {};
    const a = await api.call('add', { ...base, status: 'approved', txs: [{ id: 't_hack', kidId: 'k_jake', amountCents: 9999, category: 'Gift', note: '', clientTime: new Date().toISOString() }] });
    out.add = a.txs[0].status;
    for (const [action, body] of [['setStatus', { id: 'J5', status: 'approved' }], ['setStatus', { id: 'J1', status: 'void' }],
      ['update', { id: 'J1', kidId: 'k_jake', amountCents: 99999, category: 'Chores', note: '' }],
      ['settleTithing', { settleId: 's_x', txIds: ['J2'] }], ['setGoal', { kidId: 'k_jake', goalName: 'x', goalCents: 100 }],
      ['upsertKid', { kid: { id: 'k_x', name: 'X', color: '#4cd964', emoji: '', archived: false } }]]) {
      try { await api.call(action, { ...base, ...body }); out[action + body.status] = 'ok'; } catch (e) { out[action + (body.status || '')] = e.code; }
    }
    return out;
  });
  expect(res).toEqual({ add: 'pending', setStatusapproved: 'AUTH', setStatusvoid: 'AUTH', update: 'AUTH', settleTithing: 'AUTH', setGoal: 'AUTH', upsertKid: 'AUTH' });
});
