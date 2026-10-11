// Hash routes (#/ and #/kid/{id}) plus one history entry per open sheet (Android back closes it).
const listeners = new Set();
let sheetCloser = null;      // set by ui/sheet.js: (fromPop, force) => bool (true if a sheet was open)
let pendingBack = false;     // we called history.back() to drop a sheet entry; popstate not seen yet
let queuedHash = null;       // navigation requested while that back() is in flight
let queuedSheet = null;      // sheet opened while that back() is in flight

export function parseRoute(hash = location.hash) {
  const m = /^#\/kid\/([^/?#]+)/.exec(hash || '');
  return m ? { name: 'kid', kidId: decodeURIComponent(m[1]) } : { name: 'home' };
}

function fire() { const r = parseRoute(); listeners.forEach(fn => fn(r)); }

function navigate(hash) {
  if (history.state && history.state.sheet) {
    // A sheet owns the current entry: close it and reuse the entry for the new route.
    if (sheetCloser) sheetCloser(true, true);
    history.replaceState(null, '', hash);
    fire();
  } else if (location.hash !== hash) {
    location.hash = hash;            // hashchange → fire()
  } else {
    fire();
  }
}

export const router = {
  get route() { return parseRoute(); },
  onChange(fn) { listeners.add(fn); },
  setSheetCloser(fn) { sheetCloser = fn; },

  go(hash) {
    if (pendingBack) { queuedHash = hash; return; }
    navigate(hash);
  },
  pushSheet(id) {
    if (pendingBack) { queuedSheet = id; return; }   // push once the in-flight back() lands
    if (history.state && history.state.sheet) history.replaceState({ sheet: id }, '');
    else history.pushState({ sheet: id }, '');
  },
  popSheet() {
    if (pendingBack) { queuedSheet = null; return; }
    if (history.state && history.state.sheet) {
      pendingBack = true;
      history.back();
    }
  },
};

window.addEventListener('popstate', () => {
  if (pendingBack) {
    pendingBack = false;
    const sheet = queuedSheet;
    const hash = queuedHash;
    queuedSheet = null;
    queuedHash = null;
    if (hash) navigate(hash);
    if (sheet) router.pushSheet(sheet);
    return;
  }
  // A real back press: close the top sheet first. Route changes arrive via hashchange.
  if (sheetCloser) sheetCloser(true);
});
window.addEventListener('hashchange', () => fire());
