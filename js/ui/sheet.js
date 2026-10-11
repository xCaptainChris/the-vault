// Bottom sheets (phone) / centered dialogs (≥820px, via CSS). One open at a time.
import { byId, $$ } from './dom.js';
import { router } from '../router.js';

let current = null;          // {id, locked, onClose}

export function openSheet(id, opts = {}) {
  const el = byId(id);
  if (current && current.id !== id) {
    byId(current.id).classList.remove('show');
    if (current.onClose) current.onClose();
  }
  current = { id, locked: !!opts.locked, onClose: opts.onClose || null };
  el.classList.add('show');
  byId('scrim').classList.add('show');
  if (!opts.noHistory) router.pushSheet(id);
  el.scrollTop = 0;
}

export function isOpen(id) { return !!current && (!id || current.id === id); }
export function currentSheet() { return current ? current.id : null; }

// fromPop: called from a back press (history already popped).
// force: close even a locked sheet (used when navigating away).
export function closeSheets(fromPop = false, force = false) {
  if (!current) return false;
  if (current.locked && fromPop && !force) {
    router.pushSheet(current.id);       // can't dismiss: put the entry back
    return true;
  }
  const c = current;
  current = null;
  $$('.sheet.show').forEach(s => s.classList.remove('show'));
  byId('scrim').classList.remove('show');
  if (c.onClose) c.onClose();
  if (!fromPop) router.popSheet();
  return true;
}

router.setSheetCloser((fromPop, force) => closeSheets(fromPop, force));

export function initSheets() {
  byId('scrim').addEventListener('click', () => { if (current && !current.locked) closeSheets(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current && !current.locked) closeSheets(); });
}
