// Independent QA exploration suite (separate from the T01–T35 UI suite).
// Run from tests/:  npx playwright test -c qa/qa.config.js
// Serves the repo at :8090 (root) and its parent dir at :8091 (so the app lives under /vault/).
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(FALLBACK) ? FALLBACK : undefined);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
export const SUBDIR = basename(repo);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.qa\.mjs/,
  fullyParallel: true,
  timeout: 120_000,
  expect: { timeout: 7_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    serviceWorkers: 'block',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'off',
  },
  webServer: [
    { command: 'python3 -m http.server 8090', cwd: repo, url: 'http://localhost:8090/index.html', reuseExistingServer: true, stdout: 'ignore', stderr: 'ignore' },
    { command: 'python3 -m http.server 8091', cwd: resolve(repo, '..'), url: `http://localhost:8091/${SUBDIR}/index.html`, reuseExistingServer: true, stdout: 'ignore', stderr: 'ignore' },
  ],
  projects: [
    { name: 'phone', use: { baseURL: 'http://localhost:8090/', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'tablet', use: { baseURL: 'http://localhost:8090/', viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'desktop', use: { baseURL: 'http://localhost:8090/', viewport: { width: 1440, height: 900 } } },
  ],
});
