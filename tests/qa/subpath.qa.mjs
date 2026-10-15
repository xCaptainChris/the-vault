// PWA / Capacitor readiness under a subpath (/vault/): relative URLs, SW scope + precache, offline open.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUB = `http://localhost:8091/${basename(ROOT)}/`;
const walk = (d) => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);

test.use({ serviceWorkers: 'allow' });

test('sw.js precaches every app file, and nothing that does not exist', async () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const listed = [...new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]))].sort();
  const want = ['index.html', 'manifest.json', ...['css', 'js', 'fonts', 'icons'].flatMap(d => walk(join(ROOT, d)).map(f => relative(ROOT, f)))]
    .filter(f => !f.endsWith('.svg') && !f.endsWith('.txt') && !f.endsWith('.md')).sort();
  expect(listed).toEqual(want);
  expect(sw.split('const SHELL')[1].split('];')[0]).not.toMatch(/https?:/);
});

test('manifest + icons are valid', async () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  expect(m.start_url).toBe('./');
  expect(m.scope).toBe('./');
  for (const ic of m.icons) {
    const buf = readFileSync(join(ROOT, ic.src));
    expect(buf.slice(1, 4).toString()).toBe('PNG');
    const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    expect(`${w}x${h}`).toBe(ic.sizes);
  }
});

test('subpath /vault/: demo works, SW scope is the subpath, offline reload opens the app', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });
  await page.goto(SUB + '?demo=1&fixture=test');
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await page.getByTestId('device-input').fill('Sub');
  await page.getByTestId('device-save').click();
  await page.getByTestId('who-kid-k_logan').click();
  await expect(page.getByTestId('hero-balance')).toHaveText('$7.00');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(SUB);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await expect(page.getByTestId('hero-balance')).toHaveText('$7.00');
  const icon = await page.evaluate(async () => (await fetch('./icons/icon-192.png')).status);
  expect(icon).toBe(200);
  await context.setOffline(false);
  expect(problems).toEqual([]);
});

test('vault-demo.html still redirects to demo after the service worker is installed', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  await page.route(/script\.google|googleusercontent/, (r) => r.abort());
  await page.goto(SUB + 'index.html?demo=1');
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto(SUB + 'vault-demo.html');
  await page.waitForURL(/demo=1/);
  await page.waitForFunction(() => window.__vault && window.__vault.store);
  await expect(page.locator('#logoSub')).toHaveText('Family Bank · Demo');
});
