import { storagePrefix } from './env.js';

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(storagePrefix + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}
export function set(key, val) {
  try { localStorage.setItem(storagePrefix + key, JSON.stringify(val)); } catch (e) { /* quota/private mode */ }
}
export function del(key) {
  try { localStorage.removeItem(storagePrefix + key); } catch (e) { /* ignore */ }
}
