// Playwright config: UI suite (PLAN §7) against mock mode, served by python3 -m http.server.
// Browser: Playwright's bundled Chromium if installed; otherwise set CHROMIUM_PATH (or the
// /opt/pw-browsers fallback below is used when it exists).
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const FALLBACK = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(FALLBACK) ? FALLBACK : undefined);
const PORT = Number(process.env.VAULT_PORT || 8080);

export default defineConfig({
  testDir: './ui',
  fullyParallel: true,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: 'block',            // T33 opts back in
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'off',
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    cwd: '..',
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
