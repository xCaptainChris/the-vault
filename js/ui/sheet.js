// Bottom sheets (phone) / centered dialogs (≥820px, via CSS). One open at a time.
// Phone sheets can be dragged down to dismiss (from the grip, or anywhere once scrolled to top).
import { byId, $$ } from './dom.js';
import { router } from '../router.js';

let current = null;          // {id, locked, onClose}
const isDialog = () => window.matchMedia('(min-width: 820px)').matches;

function lockPage(on) { document.documentElement.classList.toggle('sheet-open', on); }

export function openSheet(id, opts = {}) {
  const el = byId(id);
  if (current && current.id !== id) {
    byId(current.id).classList.remove('show');
    if (current.onClose) current.onClose();
  }
  current = { id, locked: !!opts.locked, onClose: opts.onClose || null };
  el.style.transform = '';
  el.classList.add('show');
  byId('scrim').classList.add('show');
  lockPage(true);
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
  $$('.sheet.show').forEach(s => { s.classList.remove('show'); s.style.transition = ''; s.style.transform = ''; });
  const scrim = byId('scrim');
  scrim.classList.remove('show');
  scrim.style.opacity = '';
  lockPage(false);
  if (c.onClose) c.onClose();
  if (!fromPop) router.popSheet();
  return true;
}

router.setSheetCloser((fromPop, force) => closeSheets(fromPop, force));

/* ---------- drag to dismiss ---------- */
function attachDrag(el) {
  let startY = 0, lastY = 0, lastT = 0, vel = 0, dy = 0;
  let tracking = false, dragging = false, fromGrip = false;
  const scrim = byId('scrim');

  el.addEventListener('touchstart', (e) => {
    if (isDialog() || !current || current.id !== el.id || e.touches.length !== 1) { tracking = false; return; }
    const y = e.touches[0].clientY;
    const top = el.getBoundingClientRect().top;
    fromGrip = y - top < 44;                       // the grip strip at the top of the sheet
    tracking = fromGrip || el.scrollTop <= 0;
    dragging = false;
    startY = lastY = y; lastT = e.timeStamp; vel = 0; dy = 0;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const y = e.touches[0].clientY;
    const d = y - startY;
    if (!dragging) {
      if (d < -4 && !fromGrip) { tracking = false; return; }   // scrolling up the sheet's content
      if (d > 6 && (fromGrip || el.scrollTop <= 0)) {
        dragging = true;
        el.style.transition = 'none';
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      } else return;
    }
    e.preventDefault();
    dy = Math.max(0, d);
    if (current && current.locked) dy = Math.min(dy, 40) * 0.5 + Math.max(0, dy - 40) * 0.08;   // rubber band
    const dt = Math.max(1, e.timeStamp - lastT);
    vel = 0.8 * vel + 0.2 * ((y - lastY) / dt);
    lastY = y; lastT = e.timeStamp;
    el.style.transform = `translateY(${dy}px)`;
    scrim.style.opacity = String(Math.max(0.15, 1 - dy / Math.max(240, el.offsetHeight)));
  }, { passive: false });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    el.style.transition = '';
    scrim.style.opacity = '';
    const far = dy > Math.min(140, el.offsetHeight * 0.3);
    if ((far || vel > 0.6) && current && !current.locked) {
      closeSheets();                // animates from the dragged position to off-screen
    } else {
      el.style.transform = '';      // snap back
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

export function initSheets() {
  const scrim = byId('scrim');
  scrim.addEventListener('click', () => { if (current && !current.locked) closeSheets(); });
  // Swiping on the dimmed area must not scroll the page underneath (iOS ignores overflow:hidden).
  scrim.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current && !current.locked) closeSheets(); });
  $$('.sheet').forEach(attachDrag);
}
