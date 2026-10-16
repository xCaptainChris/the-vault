// Platform seam: browser today, Capacitor plugins later (Haptics, Preferences, Browser).
import { isNative } from './env.js';

const PATTERNS = { tick: 10, success: [10, 40, 10], warn: 30 };

export function haptic(kind = 'tick') {
  try {
    const h = window.Capacitor?.Plugins?.Haptics;
    if (isNative && h) { h.impact({ style: kind === 'warn' ? 'HEAVY' : 'LIGHT' }); return; }
    if (navigator.vibrate) navigator.vibrate(PATTERNS[kind] || 10);
  } catch (e) { /* not supported */ }
}

export function openExternal(url) {
  const b = window.Capacitor?.Plugins?.Browser;
  if (isNative && b) return b.open({ url });
  window.open(url, '_blank', 'noopener');
}

// Registers ./sw.js and calls onUpdate(applyFn) when a new version is waiting.
export function registerServiceWorker(onUpdate) {
  const okHost = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || isNative || !okHost) return;
  let reloading = false;
  // First install claims the page too; only reload when an update replaced an existing controller.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const notify = (w) => onUpdate(() => w.postMessage('SKIP_WAITING'));
    if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
      });
    });
    // Coming back to the app with an update already downloaded: just apply it (nothing is mid-edit
    // after a trip to the background, and the outbox is saved), so a missed "Reload" can't strand it.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (reg.waiting && navigator.serviceWorker.controller) { reg.waiting.postMessage('SKIP_WAITING'); return; }
      reg.update().catch(() => {});
    });
  }).catch(() => { /* offline or blocked */ });
}
