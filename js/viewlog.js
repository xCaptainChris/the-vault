// Screen-size log for troubleshooting the iPhone Home Screen layout. Records what the page's height was at
// each launch / resize / app switch / sign-in screen, so a short screen can be traced to the moment it
// happened. Tap the numbers line at the bottom of Settings to see it. Kept on this phone only (last 80 lines).
const KEY = 'vault_viewlog';
const t0 = Date.now();

function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }

export function viewLog(ev) {
  try {
    const c = document.documentElement.classList;
    const flags = ['page-lock', 'app-locked', 'sheet-open', 'kid-page'].filter(x => c.contains(x)).map(x => x.split('-')[0]).join(',');
    const vv = window.visualViewport ? Math.round(visualViewport.height) : '-';
    const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${ev} · inner ${innerHeight} vv ${vv}${document.hidden ? ' hidden' : ''}${flags ? ' [' + flags + ']' : ''}`;
    const all = read(); all.push(line);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-80)));
  } catch (e) { /* storage full or blocked: logging is optional */ }
}

export function viewLogLines() { return read(); }
