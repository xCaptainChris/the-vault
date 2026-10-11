import { CONFIG } from './config.js';

const params = new URLSearchParams(location.search);
const apiUnset = !CONFIG.API_URL || CONFIG.API_URL.includes('PASTE');

export const isDemo = params.get('demo') === '1' || apiUnset;
export const fixtureName = isDemo && params.get('fixture') === 'test' ? 'test' : 'sample';
export const storagePrefix = isDemo ? 'vault_demo_' : 'vault_';
export const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// ?undo=300 shortens the undo window (demo only, used by tests).
const undoParam = Number(params.get('undo'));
export const undoMs = isDemo && undoParam > 0 ? undoParam : CONFIG.UNDO_MS;
