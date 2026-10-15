// v1.1: avatar builder (kids make their own; parents any), shown on hero, home card, who's-here, header.
import { test, expect, tid, asParent, asKid, goKid, goHome, db, waitOutboxEmpty } from './helpers.mjs';

test('a kid builds and saves their own avatar; it shows everywhere', async ({ page }) => {
  await asKid(page, 'k_jake');
  await tid(page, 'hero-icon-btn').click();
  await expect(tid(page, 'avatar-sheet')).toHaveClass(/show/);
  await tid(page, 'avatar-sex-g').click();
  await expect(tid(page, 'avatar-hair-lng')).toBeVisible();
  await tid(page, 'avatar-hair-pny').click();
  await tid(page, 'avatar-haircolor-3').click();
  await tid(page, 'avatar-skin-2').click();
  await tid(page, 'avatar-eyes-2').click();
  await tid(page, 'avatar-acc-crn').click();
  await tid(page, 'avatar-acc-cap').click();          // same slot: replaces the crown
  await tid(page, 'avatar-acc-glr').click();
  await expect(tid(page, 'avatar-acc-crn')).toHaveAttribute('aria-pressed', 'false');
  await expect(tid(page, 'avatar-acc-cap')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'avatar-save').click();
  await expect(tid(page, 'hero-avatar')).toBeVisible();
  await waitOutboxEmpty(page);
  expect((await db(page)).kids.find(k => k.id === 'k_jake').avatar).toBe('2:g:pny:3:2:2:cap+glr::');
  await expect(tid(page, 'account-btn').locator('svg')).toHaveCount(1);
  await goHome(page);
  await expect(tid(page, 'kid-card-k_jake').locator('.kav svg')).toHaveCount(1);
});

test('highlights + shirt: presets, any color, and back to defaults', async ({ page }) => {
  await asKid(page, 'k_lizzy');
  await tid(page, 'hero-icon-btn').click();
  await tid(page, 'avatar-sex-g').click();
  await tid(page, 'avatar-hair-ice').click();
  await tid(page, 'avatar-streak-0').click();
  await expect(tid(page, 'avatar-streak-0')).toHaveAttribute('aria-pressed', 'true');
  expect(await tid(page, 'avatar-preview').innerHTML()).toContain('#ff5fa2');
  // Custom shirt color from the picker
  await tid(page, 'avatar-shirt-custom').evaluate((el) => { el.value = '#123abc'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(await tid(page, 'avatar-preview').innerHTML()).toContain('#123abc');
  await expect(tid(page, 'avatar-shirt-none')).toHaveAttribute('aria-pressed', 'false');
  await tid(page, 'avatar-acc-tia').click();
  await tid(page, 'avatar-acc-wnd').click();
  await tid(page, 'avatar-acc-tpt').click();           // same hand: swaps the wand for the trumpet
  await expect(tid(page, 'avatar-acc-wnd')).toHaveAttribute('aria-pressed', 'false');
  await tid(page, 'avatar-save').click();
  await waitOutboxEmpty(page);
  expect((await db(page)).kids.find(k => k.id === 'k_lizzy').avatar).toMatch(/^2:g:ice:\d+:\d+:\d+:tia\+tpt:ff5fa2:123abc$/);
  // Back to "no highlights" + "my color"
  await tid(page, 'hero-avatar').click();
  await tid(page, 'avatar-streak-none').click();
  await tid(page, 'avatar-shirt-none').click();
  await tid(page, 'avatar-save').click();
  await waitOutboxEmpty(page);
  expect((await db(page)).kids.find(k => k.id === 'k_lizzy').avatar).toMatch(/^2:g:ice:\d+:\d+:\d+:tia\+tpt::$/);
});

test('surprise me + use an emoji instead (clears the avatar)', async ({ page }) => {
  await asKid(page, 'k_lizzy');
  await tid(page, 'hero-icon-btn').click();
  await tid(page, 'avatar-random').click();
  await tid(page, 'avatar-save').click();
  await waitOutboxEmpty(page);
  expect((await db(page)).kids.find(k => k.id === 'k_lizzy').avatar).toMatch(/^2:[bg]:/);
  await tid(page, 'hero-avatar').click();
  await tid(page, 'avatar-use-emoji').click();
  await expect(tid(page, 'emoji-sheet')).toHaveClass(/show/);
  await tid(page, 'emoji-3').click();
  await waitOutboxEmpty(page);
  const k = (await db(page)).kids.find(k => k.id === 'k_lizzy');
  expect(k.avatar).toBe('');
  expect(k.emoji).toBe('🐱');
  await expect(tid(page, 'hero-icon-btn')).toContainText('🐱');
});

test('a parent can set any kid’s avatar; a kid cannot set a sibling’s', async ({ page }) => {
  await asParent(page);
  await goKid(page, 'k_logan');
  await tid(page, 'hero-icon-btn').click();
  await tid(page, 'avatar-hair-buz').click();
  await tid(page, 'avatar-save').click();
  await expect(tid(page, 'hero-avatar')).toBeVisible();
  const code = await page.evaluate(async () => {
    try { await window.__vault.api.call('setAvatar', { kidId: 'k_logan', avatar: '1:b:spk:0:0:0:', user: { role: 'kid', id: 'k_jake', name: 'Jake' } }); return 'ok'; }
    catch (e) { return e.code; }
  });
  expect(code).toBe('AUTH');
  const bad = await page.evaluate(async () => {
    try { await window.__vault.api.call('setAvatar', { kidId: 'k_jake', avatar: '<script>', user: { role: 'kid', id: 'k_jake', name: 'Jake' } }); return 'ok'; }
    catch (e) { return e.code; }
  });
  expect(bad).toBe('BAD_INPUT');
});
