# The Vault v1.0 — Implementation Plan

## Key decisions

- **One codebase, demo is a flag.** Vanilla ES modules, no build step. `?demo=1` (or an unset API URL) swaps in a mock adapter that enforces the same rules as the server. `vault-demo.html` becomes a redirect stub.
- **Money is integer cents everywhere in code.** The Sheet still shows dollars formatted `$0.00`, so Chris can read it as an audit log. The server converts with `Math.round(v*100)` when reading.
- **Sheet columns are found by header name, not position.** That makes `setup()` safe to re-run and lets it upgrade the current Sheet: it adds missing columns, gives every kid a stable ID, and links old rows to kids by name.
- **Parent sign-in uses a session token.** Logging in returns a random token; the Sheet stores only its SHA-256 hash in a visible **Sessions** tab, and Chris can revoke one by deleting its row. Five wrong PINs locks that parent out for 15 minutes. Anything sent without a valid token is forced to a *pending* request. Edit, void, approve, settle, kid and goal changes all require the token, and the signed-in name is stamped by the server, not taken from the client.
- **Every write goes through an outbox** saved on the device, using IDs the device creates, so retries never double-post. Unsent changes are layered on top of the last data from the server, so nothing flickers or disappears. Each change waits 4 seconds before sending, which gives a free **Undo**. Logging out is queued like any other change, so earlier unsent parent entries still go through.
- **Offline open works through a service worker.** It caches the whole app under a version number and shows "Update ready" when a new version is deployed. It never caches calls to the Apps Script backend.
- **Tithing is a toggle on money-in entries**, on by default, that creates a linked 10% tithing row (rounded up). "Mark as sent" settles exactly the rows the parent saw and writes a **Settlements** row; nothing is deleted.
- **Two new Sheet tabs:** **Audit** logs every change with before/after values, user and device. **Settlements** records each time tithing was sent.

## v1.0 feature list (short)

Who's here with server-checked parent PINs; device name; a parent "family strip" (what you're holding, tithing to send, requests waiting); kid cards with emoji and goal %; a 3-tap entry flow with recent "what for" chips, quick amounts, categories filtered by in/out and a game-keyword guess for Digital; kid requests with approve, deny, edit-then-approve and approve-all; edit and void; a games-spending pill on each kid's page plus the donut chart (30d/90d/all); savings goals with a goal-reached celebration; the tithing escrow screen; a history box that scrolls on its own, grouped by month; kid add/rename/archive in the app; negative-balance warnings; undo; sync status; offline open; the Android back button closing sheets; real PNG icons; layouts for phone, tablet and desktop.

**Left out:** notifications, allowance, chore board, kid-to-kid transfers, interest/match, kid PINs, editing categories or PINs in the app, CSV export, and a delta-sync endpoint. Reasons are in §1b.

---

# The Vault v1.0 — Implementation Plan

## 1. v1.0 feature set

### 1a. In v1.0
| # | Feature | Why |
|---|---|---|
| F1 | **Who's here?** Parents pick a name and enter a PIN (checked by the server, returns a token). Kids just tap their name. The choice sticks on the device. | Tracks users, not devices. No passwords for kids. |
| F2 | **Device name + device ID** stamped on every row. Shown only when a row is tapped open, and in Sheet columns. | Lets Chris investigate who did what without cluttering the screen. |
| F3 | **Family strip (parents only)** on Home: "Holding $X · Tithing $Y · N requests". Tapping opens a breakdown. | Parents hold the cash, so "what we owe" is the number they actually need. |
| F4 | **Kid bank cards**: emoji, name, balance, goal %, pending badge. Archived kids are hidden. | Keeps the current look. Archiving hides the baby until she has activity. |
| F5 | **Fast entry sheet**: kid preselected when possible, In/Out toggle, recent-entry chips (one tap fills note, category and amount), quick amounts $1/$2/$5/$10/$20, "what for" text, category chips filtered by direction, Save. | Meets the ≤3-tap goal. Repeat chores take one tap. |
| F6 | **Tithing toggle** on money-in: "Set aside 10% for tithing (−$1.00)". On by default, remembered per device. Creates a linked tithing row (same GroupID). | The most common tithing action, built into the entry with no extra step. |
| F7 | **Kid requests**: kid-mode Save creates a pending row. **Approvals sheet**: approve, deny, tap to edit then approve, and approve-all. Linked groups are approved or denied together. | Required. Approve-all saves taps after a busy Saturday. |
| F8 | **Edit / void (parents)** from the opened row. Void needs a second tap to confirm and keeps the row. Voided rows appear dimmed and struck through for parents only. | Required. Fixing mistakes must be easy to find but hard to do by accident. |
| F9 | **Kid dashboard**: hero balance, pending amount, goal bar, **"🎮 $X on games in the last 30 days" pill**, Money in/out mini bars that open the donut chart (30d/90d/all). | Chris wants his son to see the game spending without having to dig for it. |
| F10 | **History box** that scrolls on its own (capped height), newest first, with month headers showing that month's in/out totals. | Required. The month headers double as a cheap monthly summary. |
| F11 | **Savings goals** (parents edit name and amount). **Goal-reached** badge plus a one-time confetti burst per device per goal. | Required. The celebration costs little and motivates the kids. |
| F12 | **Tithing escrow sheet**: total, per-kid amounts, "Mark $X as sent" (two-tap confirm), last 3 settlements. | Required. Settlement history answers "did we send September's?". |
| F13 | **Kids management (parents, in Settings)**: add, rename, emoji, color, archive/unarchive. | Kid IDs are stable, so renaming is safe. The baby's name is still to be decided. |
| F14 | **Negative balance**: allowed, shown in red. Entry sheet warns "This puts Jake at −$2.40". | Parents sometimes front money. A warning is enough. |
| F15 | **Undo snackbar** (4 seconds) on every write. | Comes free with the outbox delay. |
| F16 | **Offline outbox + sync indicator** (badge with unsent count, "last synced" time). | Without it, entries made on a bad connection are lost. |
| F17 | **Service worker, manifest, real PNG icons, self-hosted font.** | Reliable install and offline open, and ready for Capacitor later. |
| F18 | **Haptic tick** on save, approve and void, through `platform.js` (`navigator.vibrate`; can switch to the Capacitor plugin later). | One line of code; feels native. |
| F19 | **Android back button / history**: hash routes plus a history entry for each open sheet. | Needed for Android and Capacitor. |
| F20 | **Responsive layout** for 390, 820 and 1440 px widths. Sheets become centered dialogs at ≥820 px. | Required. |

### 1b. Deliberately left out
| Item | Decision | Reason |
|---|---|---|
| Notifications / email | Never | Chris said no. |
| Allowance / recurring entries | Never | Kids earn only by doing things. The "Allowance" category is removed (old rows still show with a generic icon). |
| Chore jobs board with set prices | Never (at most later) | A second system to maintain. Recent-entry chips already make repeat chores one tap. |
| Kid-to-kid transfers | Later | Rare. Two entries do the same job today. |
| Parent interest / match | Later | Not asked for. If wanted, enter it as a "Gift". Possibly "match toward goal" later. |
| Monthly report screen | Later | Month headers cover it. |
| Spend/save/give jars per kid | Never | Goals and tithing escrow already cover save and give. |
| Kid PINs | Later, only if siblings tamper | Kids can only create pending requests, so the risk is low. |
| Kid cancelling own request | Later | Parents can deny it. |
| Editing categories / changing PINs in the app | Sheet only | Rare, and Chris owns the Sheet. |
| Managing signed-in devices in the app | Sheet only | Delete a row in the Sessions tab. |
| Delta sync (`since` / revision check) | Later | The full ledger is ~300 KB/year of JSON. Fine for years. |
| Ledger search / filter | Later | The scroll box plus month headers is enough at family scale. |
| Balance-over-time line chart | Later | The donut answers the actual question (where the money goes). |
| Light theme | Never | Keep the current dark look. |
| Hiding the read endpoint behind a secret | Never | The API URL ships inside the public frontend anyway. Anyone with the URL can read the ledger, and PINs are never sent to the browser. Acceptable at family scale; noted in SETUP.md. |

## 2. UX map

The visual language stays as is: the dark `--bg #101014` palette and CSS variables from the current `index.html`, the Outfit font, gradient bank cards, bottom sheets with a grip handle, the FAB, and chip buttons. Move the current CSS to `css/app.css` mostly unchanged.

### Routes (hash)
- `#/` is Home. `#/kid/{kidId}` is a kid's dashboard.
- Opening any sheet calls `history.pushState({sheet:id})`. A back press (`popstate`) closes the top sheet first.

### Header (all screens)
Logo "The Vault" (subtitle "Family Bank", or "Family Bank · Demo" in demo mode) · sync button `↻` with an orange badge showing the unsent count · account button showing the user's emoji or initial.

### First run on a device
1. **Device name modal** (cannot be dismissed): "Name this device", e.g. "Kitchen iPad". Device ID shown small.
2. **Who's here sheet** (cannot be dismissed while no user is set): Parents (🔑 name) and Kids (emoji name; archived kids hidden).
   - Parent → **PIN modal**: numeric input with an Unlock button. Error text under the input ("Wrong PIN" or "Too many tries — wait 15 min"). In demo mode it shows the hint "Demo PINs: Dad 1234 · Mom 5678".
   - Kid → set the user immediately.

### Account menu (tap the account button), a small sheet
- Everyone: "Switch user" (opens Who's here).
- Parents also: "Settings", "Sign out".

### Home, parent view
1. Pending banner (existing style) is replaced by the **family strip**, one card with three tappable segments:
   - **Holding $17.50** opens the Family sheet: each kid's balance, plus unsent tithing, equals total cash to hold.
   - **Tithing $3.20** opens the Tithing sheet.
   - **2 requests** opens the Approvals sheet. This segment is hidden when there are none.
2. Kid card grid: 1 column under 640 px, 2 columns at 640–1023, 3 columns at 1024 and up. Card shows emoji, name, balance (red if negative), a goal line ("Switch game · 11%" or "🎉 Goal reached"), and a pending dot.
3. FAB "＋ Entry" (green).

### Home, kid view
After choosing a kid, the app goes straight to `#/kid/{self}`. Back ("← All accounts") shows siblings' cards read-only: no family strip, and the FAB reads "＋ Ask".

### Kid dashboard (`#/kid/{id}`)
- **Hero** (gradient in the kid's color): name, big balance, "+$5.00 pending" line if any, goal bar, and "✎ Set/Edit goal" (parents only).
- **Digital pill** below the hero: "🎮 $15.00 on games · last 30 days". Shown only if the kid has ever had a Digital entry. Tapping opens the donut chart (Money out, 30 days).
- **Money in / Money out panels**: mini bars by category; tapping opens the donut sheet.
- **History**: a capped scroll box with month headers ("October 2026 · +$28.00 / −$17.40"). Each row shows icon, note, "date · category", and the amount, plus a "pending" tag and a "⏳" tag for unsent changes.
  - Tapping a row opens details: "Entered Sat Oct 10, 2026 3:12 PM by Dad on Dad's phone (a1b2c3d4)" · "Approved by Mom · Oct 10 3:20 PM" · "Edited by Dad · …" · "Sent to church Oct 3" · "Part of: +$20.00 Mowed the lawn" (linked rows) · "ID t_…". Device ID shows for parents only.
  - Parents also get **✎ Edit** and **Void** (tap again to confirm). Settled rows show "Settled — can't edit".
- **Layout at ≥1024 px**: two columns. Left: hero, pill, panels. Right: history box at `height: calc(100dvh - 140px)`.
- **Ledger box height**: `max-height: min(55dvh, 560px)` on phone and tablet. The page itself never grows with history.

### Entry sheet (FAB)
| Element | Parent | Kid |
|---|---|---|
| Title | "New entry" | "Ask for money" |
| Kid chips (emoji + name, non-archived) | Shown. Preselected: current kid page, else last kid used on this device, else none. | Hidden (fixed to self) |
| In / Out toggle | Defaults to In | Defaults to In |
| Recent chips ("Recent") | Up to 6 distinct (note, category, amount) from this kid's approved history in this direction, newest first; fall back to all kids. Tapping fills amount, note and category. | Same |
| Amount | Big input (`inputmode="decimal"`, no autofocus) plus quick chips $1 $2 $5 $10 $20 | Same |
| What for | Text, max 80 chars, optional | Same |
| Category chips | Filtered by direction. Default In→Chores, Out→Spending. A recent chip sets it. Typing a game keyword (roblox, robux, minecraft, fortnite, v-bucks, xbox, playstation, psn, nintendo, switch, steam, app store, google play, in-app, game) auto-selects Digital unless a category was picked by hand. | Same |
| Tithing toggle (In only) | "⛪ Set aside 10% for tithing (−$1.00)". Default on; last choice remembered per device in `prefs.titheDefault`. | Same (the request includes the linked tithing row) |
| Balance warning (Out only) | "This puts Jake at −$2.40" if the new balance would be below 0. Does not block saving. | Same |
| Save button | "Save +$10.00 → Logan" (green) | "Send request" (cyan) |

**Tap count**: FAB → recent chip → Save is 3 taps from a kid page or with a remembered kid; 4 if a kid must be picked. Manual entry: FAB → (kid) → amount chip → category or note → Save.

On Save: queue the change, close the sheet, haptic tick, and show the snackbar "Saved · Undo" (kid: "Request sent · Undo") for 4 seconds.

**Edit mode** (from a row or from Approvals): same sheet, titled "Edit entry". No recent chips and no tithing toggle. If the row has an unsettled linked tithing row and the amount changes, show the checkbox "Also update tithing to −$2.00" (on by default; sends `retithe:true`). Buttons: "Save changes". When editing a pending request, the buttons are "Approve with changes" and "Deny".

### Approvals sheet (parents)
- List of pending items. Linked rows show as one card: "Lizzy · +$5.00 Chores · Folded laundry (−$0.50 tithing) · requested on Lizzy's iPad · 2h ago".
- Each card: **Approve**, **Deny**. Tapping the card body opens edit mode.
- **Approve all (N)** button at the top when N ≥ 2.
- Empty state: "All caught up 🎉". Closes automatically when it empties.

### Tithing sheet (parents)
Note: "Set aside by the kids since you last sent tithing." Per-kid rows (dot, name, amount), then a Total row. **Mark $3.20 as sent**: first tap changes the label to "Tap again to confirm", second tap queues the settle. Below: "Last sent" list, up to 3 entries ("Oct 3 · $14.00 · Dad"). Empty state: "Nothing set aside right now".

### Family sheet (parents)
Each kid (including archived kids with a non-zero balance): balance. Subtotal "Kids' money". Plus "Tithing to send". Then **"Total you should be holding"**.

### Donut sheet
Title "{Kid} — money out/in". Period chips 30 days / 90 days / All time. **Default is 30 days** (changed from "all" so recent game spending stands out). SVG donut with the total in the center, and a legend showing %, amount and category icon.

### Goal sheet (parents)
Goal name, target amount, Save. "Remove goal" (ghost button).

### Settings sheet (parents; account menu → Settings)
- **Kids**: one row per kid (emoji, name, "archived" tag) → kid editor sheet: name, emoji (text input, first grapheme kept, plus 12 suggestion chips), color (8 swatches: `#4cd964 #00d2ff #ffcc4d #c084fc #ff8a5c #ff6bb5 #7ea6ff #34d1b2`), "Hide (archive)" toggle, Save. Plus "＋ Add kid".
- **This device**: name (editable), ID (read-only).
- **Sync**: "Last synced 2 min ago · 0 unsent". Tap "Sync now". If any changes failed permanently, list them with a "Dismiss" button.
- **Open the Sheet** link (only if `CONFIG.SHEET_URL` is set).
- **Sign out**.
- Version line: "v1.0.0 · demo/live".

### Snackbar / toast
One element in the existing toast style. Supports an optional action button ("Undo", "Reload", "View").

### Update ready
When a new service worker is waiting, show the snackbar "Update ready · Reload".

### Desktop and tablet (≥820 px)
`.wrap` max-width 1100 px. Sheets become centered dialogs (max-width 520, all corners rounded, fade and scale in). FAB stays bottom-right. Hover states on rows and cards.

## 3. Frontend structure (static, no build step)

```
/index.html              shell markup only; <link rel="stylesheet" href="./css/app.css">,
                         <script type="module" src="./js/app.js">; every URL relative (./)
/manifest.json           (filename kept so existing installs still match)
/sw.js                   service worker (root, so its scope covers the app)
/css/app.css             existing styles moved here, plus responsive and dialog rules
/fonts/Outfit-Variable.woff2   self-hosted (OFL); @font-face in app.css
/icons/icon.svg          source artwork: vault door on #101014, green→cyan ring
/icons/icon-192.png  /icons/icon-512.png  /icons/icon-maskable-512.png
/icons/apple-touch-icon.png (180)  /icons/favicon-32.png
/js/config.js            export const CONFIG = { API_URL, APP_VERSION:'1.0.0', POLL_MS:60000,
                         TITHE_RATE_PCT:10, UNDO_MS:4000, QUICK_AMOUNTS:[100,200,500,1000,2000],
                         SHEET_URL:'' }
/js/env.js               isDemo (query demo=1 OR API_URL contains 'PASTE'), fixture name
                         (?fixture=test|sample, default sample), storage prefix
                         ('vault_' | 'vault_demo_'), isNative (window.Capacitor?.isNativePlatform?.())
/js/platform.js          haptic(kind), registerServiceWorker(onUpdate), openExternal(url)
/js/storage.js           get(key, fallback) / set(key, val) / del(key), JSON, prefixed
/js/ids.js               newId(prefix): crypto.randomUUID if present, else a getRandomValues v4
/js/money.js             parseCents(str) → int|null (rejects >2 decimals, ≤0, >1,000,000);
                         fmtCents(c) → "$1,234.50"; fmtSigned(c); titheCents(c) = Math.ceil(c*pct/100)
/js/api/index.js         export const api = isDemo ? mockAdapter : remoteAdapter
/js/api/remote.js        load(): GET; call(action, body): POST text/plain; ApiError normalization
/js/api/mock.js          same interface; wraps mock-server with latency/offline/failNext
/js/api/mock-server.js   pure JS copy of every Code.gs rule (auth, transitions, idempotency,
                         validation) over an in-memory db saved to sessionStorage
/js/api/fixtures.js      'sample' (rich demo) and 'test' (deterministic, see §7)
/js/identity.js          device {id,name}; user {role:'parent'|'kid', id, name}; token
/js/outbox.js            enqueue / cancel / drain / list / overlay(snapshot) — see §6
/js/store.js             snapshot (from server) + derived view = overlay(snapshot, outbox);
                         subscribe/emit; load from cache at boot; refresh()
/js/selectors.js         PURE: balances, pendingByKid, owedSummary, titheOwed, catTotals(kid,dir,days),
                         digitalSpend(kid,days), recentSuggestions(kid,dir), monthGroups(rows),
                         groupOf(tx), goalState(kid)
/js/router.js            hash routes; pushSheet/popSheet; back-button handling
/js/ui/dom.js            $, esc, html helpers, snackbar(msg,{action,onAction,ms}), confirmTwice(btn)
/js/ui/sheet.js          openSheet(id) / closeSheets() (bottom sheet or dialog by width), scrim
/js/ui/header.js  home.js  kid.js  ledger.js  entry.js  approvals.js  tithe.js  family.js
/js/ui/donut.js   goal.js  who.js (device modal, who sheet, PIN)  settings.js (incl. kid editor)
/js/ui/celebrate.js      CSS-only confetti (~40 spans, 1.2 s, skipped under reduced-motion)
/js/app.js               boot: env → identity → store.loadCache → render → router → registerSW →
                         first-run modals → store.refresh → outbox.drain → poll timer
/Code.gs                 backend (not loaded by the app)
/vault-demo.html         stub: <meta http-equiv="refresh" content="0;url=./index.html?demo=1">
/tools/make-icons.mjs    Playwright script: renders icons/icon.svg to all PNGs (dev only, outputs committed)
/tests/...               see §7; package.json with devDependencies only (@playwright/test)
/SETUP.md                updated
```

Rules:
- No inline `onclick` in HTML, no `alert/confirm/prompt`, no `document.write`.
- Every asset path starts with `./`.
- In demo mode only, `window.__vault = { store, outbox, mock }` is exposed as a test hook.
- Every interactive element gets a `data-testid` (list in §7).

**Adapter interface** (both adapters implement it exactly):
```
load() → Promise<Snapshot>
call(action, body) → Promise<object>   // throws ApiError {code, message, retryable}
```
Body always includes `deviceId`, `deviceName`, `token` (or null), and `user` ({role, id, name}). Error codes: `NETWORK` (retryable), `BUSY` (retryable), `AUTH`, `LOCKED`, `BAD_INPUT`, `NOT_FOUND`, `CONFLICT`, `SETTLED`.

**Remote adapter details:**
- GET: `fetch(API_URL + '?t=' + Date.now(), {redirect:'follow'})`.
- POST: `fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body), redirect:'follow'})`. Text/plain avoids a CORS preflight. Fetch follows the 302 to `script.googleusercontent.com`.
- 15-second timeout via `AbortController`.
- A non-JSON or HTML response becomes `NETWORK` (retryable).
- No `credentials` option, no custom headers beyond the one above.

**Service worker registration** happens only if `'serviceWorker' in navigator && !isNative && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')`.

**manifest.json:**
```json
{ "id":"./", "name":"The Vault — Family Bank", "short_name":"The Vault",
  "description":"Family kids'-money ledger", "start_url":"./", "scope":"./",
  "display":"standalone", "background_color":"#101014", "theme_color":"#101014",
  "icons":[
   {"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},
   {"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},
   {"src":"icons/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}
```
In `index.html` add `<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">` and `<link rel="icon" href="./icons/favicon-32.png">`. The maskable icon keeps its artwork inside the central 80% circle with a full-bleed `#101014` background.

**sw.js:**
- `const VERSION='1.0.0'`. This must equal `CONFIG.APP_VERSION`; a test checks it. Bump both on every deploy.
- Cache name `vault-shell-${VERSION}`.
- `install`: precache SHELL = index.html, manifest.json, css/app.css, fonts/…, every js/** file, and icons. No `skipWaiting` on install.
- `activate`: delete old `vault-shell-*` caches, then `clients.claim()`.
- `fetch`:
  - Same-origin GET only. Navigation requests → `caches.match('./index.html', {ignoreSearch:true})`, falling back to network.
  - Other same-origin GETs → cache-first with network fallback.
  - Ignore anything cross-origin, including `script.google.com` and `googleusercontent`: don't call `respondWith`.
- `message`: on `'SKIP_WAITING'`, call `self.skipWaiting()`.
- Page side: on `reg.waiting`, or `updatefound` reaching `installed` while a controller exists, show the "Update ready · Reload" snackbar. On tap, postMessage SKIP_WAITING; on `controllerchange`, `location.reload()`.

## 4. Sheet schema and Apps Script API

### 4a. Tabs
Columns are accessed by header name through `colMap_(sheet)`. Order only matters for fresh installs.

**Transactions**: one row per entry; never deleted.
| Column | Notes |
|---|---|
| ID | Generated on the device (`t_` + uuid). Idempotency key. |
| Timestamp | Server receive time (Date) |
| Child | Kid name **snapshot** at write time (for reading the Sheet only) |
| Amount | Dollars, number format `$0.00`. Sign: + in, − out. Read as `Math.round(v*100)` |
| Category | |
| Note | |
| Status | pending / approved / denied / void |
| DeviceID | |
| DeviceName | |
| ActedBy | Parent name who approved, denied or voided |
| Settled | Date the tithing was marked sent (blank = unsent) |
| User | Who entered it (session name for parents; claimed name for kids) |
| KidID | **Stable key** |
| Role | parent / kid |
| ClientTime | When it was entered on the device (clamped to ≤ server time + 5 min) |
| ActedAt | |
| ActedDeviceName | |
| EditedBy | |
| EditedAt | |
| GroupID | Links a deposit and its tithing row |
| SettleID | |

The first 12 columns match the existing Sheet exactly; the rest get appended.

**Kids**: `Name, Color, Goal Name, Goal Amount, KidID, Emoji, Archived`. The first 4 are existing. Goal Amount is in dollars. Archived is TRUE/FALSE.

**Parents**: `Name, PIN, ParentID`. PIN column formatted as text. Plaintext PIN in Chris's private Sheet is acceptable.

**Categories** (new): `Name, Emoji, Color, Direction (in|out|both), Active (TRUE/FALSE)`. Seeded only when the tab is created:
| Name | Emoji | Color | Direction |
|---|---|---|---|
| Chores | 🧹 | #4cd964 | in |
| Gift | 🎁 | #ffcc4d | in |
| Spending | 🛒 | #ff6b5e | out |
| Digital | 🎮 | #c084fc | out |
| Tithing | ⛪ | #7ea6ff | out |
| Savings | 🏦 | #34d1b2 | out — meaning "moved to a real savings account" |
| Other | ➕ | #8a8a96 | both |

"Allowance" is not seeded. Existing Allowance rows still render with the generic icon.

**Sessions** (new): `TokenHash, ParentID, Name, DeviceID, DeviceName, CreatedAt, LastSeenAt, RevokedAt`.

**Settlements** (new): `SettleID, Timestamp, Total (dollars), Count, PerKid (text "Logan $2.00; Lizzy $0.80"), User, DeviceName, TxIDs (comma list)`.

**Audit** (new, append-only): `Timestamp, Action, TargetID, User, Role, DeviceID, DeviceName, Details (JSON: before/after or reason)`. Logs every write action, `login`, `login_fail`, `logout`, and every `AUTH`-rejected attempt.

### 4b. `setup()`: idempotent and migration-safe
Re-running it must change nothing (a test checks this). It also runs automatically when `SCHEMA_VERSION < 2`.

1. Set the Script Property `SCHEMA_VERSION=2` at the end.
2. Run `ensureSheet_(name, headers)` for each tab: create it with bold, frozen headers if missing; otherwise append any missing header at the end.
3. Formats:
   - Transactions: Amount `$0.00`; Timestamp, ClientTime, ActedAt, EditedAt, Settled as `yyyy-mm-dd hh:mm`.
   - Parents: PIN `@`.
   - Kids: Goal Amount `$0.00`.
4. Kids: any row with a Name but no KidID gets `k_` + 8 random chars. Blank Archived becomes FALSE.
   - Seed only on fresh creation: Logan, Lizzy, Jake, Baby (Archived=TRUE), with colors `#4cd964 #00d2ff #ffcc4d #c084fc` and emojis 🦖 🦄 🚀 🍼.
5. Parents: a missing ParentID gets `p_` + 8 random chars. Fresh seed: Dad/1234, Mom/1234, with a `Logger.log` warning to change the PINs.
6. Transactions: for rows missing KidID, match `Child` to a kid name (trimmed, case-insensitive).
   - If there's no match, create an archived kid with that name and use its ID. Nothing is ever orphaned.
   - Backfill blanks: Role (`ActedBy` present → parent, else blank), ClientTime = Timestamp.
7. Categories: seed only on creation.
8. Return/log a summary (`{created:[...], addedColumns:{...}, kidsAssigned:n, txLinked:n, kidsCreated:n}`).

`doGet` and `doPost` first check `SCHEMA_VERSION`. If it's below 2, they acquire the lock and call `setup()`.

### 4c. Endpoints
**Common to every response**: always HTTP 200 JSON. `{ok:true,...}` or `{ok:false, code, error}`.

**Common to every POST**:
- Body (text/plain JSON): `{action, token|null, deviceId, deviceName, user:{role,id,name}, ...}`.
- `const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return {ok:false, code:'BUSY'}`, released in `finally`.
- "Parent-only" means `auth_(token)` must return a session, otherwise `{ok:false, code:'AUTH'}` plus an Audit `auth_reject` row.
- For parent actions the server stamps the acting name from the session, **never** from `body.user`.

**GET `doGet()`, no auth:**
```
{ ok, schema:2, serverTime, instance: ScriptProperty INSTANCE_NAME||'',
  kids:[{id,name,color,emoji,goalName,goalCents,archived}],
  parents:[{id,name}],                                  // never PIN
  categories:[{name,emoji,color,dir,active}],
  transactions:[{id, ts, clientTime, kidId, kidName, amountCents, category, note, status, user,
                 role, deviceId, deviceName, actedBy, actedAt, actedDeviceName, editedBy, editedAt,
                 settledAt, settleId, groupId}],
  settlements:[{id, ts, totalCents, count, perKid, user, deviceName}]  // newest 10
}
```

**POST actions:**
| action | params | auth | behavior | response |
|---|---|---|---|---|
| `login` | parentId, pin | none | Lockout check (`CacheService` key `fail:{parentId}`; ≥5 failures in 15 min → `LOCKED`). Compare PIN as a string. On success: token = `Utilities.getUuid()+Utilities.getUuid()` with dashes removed; append to Sessions with `hash=sha256hex(token)`; clear the fail counter; Audit `login`. On failure: increment the counter; Audit `login_fail`. | `{ok, token, parent:{id,name}}` / `AUTH` "Wrong PIN" / `LOCKED` |
| `whoami` | token | — | Validate the token. | `{ok, parent:{id,name}}` / `AUTH` |
| `logout` | token | — | Set RevokedAt; remove the cache entry. Idempotent (unknown token → ok). | `{ok}` |
| `add` | `txs:[{id, kidId, amountCents, category, note, clientTime, groupId?}]` (1–2 items) | open | Validate everything first, then write all or nothing. **Status = approved if the token is valid, else pending** (any client `status` is ignored). Role and User come from the session or else `body.user.name` (kid; max 40 chars, role kid). If a tx id already exists → skip it (idempotent) and return the existing row. Validation rules below. Audit `add`. | `{ok, txs:[row...], duplicate:bool}` |
| `setStatus` | id, status (`approved`/`denied`/`void`) | parent | Allowed: pending→approved/denied, approved→void. A row already in the target status → no-op ok. Settled row → `SETTLED`. Other transitions → `CONFLICT`. If the row has a GroupID, apply the same transition to all group rows in an eligible state, skipping settled rows (they're reported). Set ActedBy, ActedAt, ActedDeviceName. Audit. | `{ok, txs:[updated rows], skipped:[ids]}` |
| `update` | id, kidId, amountCents, category, note, retithe? | parent | Status must be pending or approved and not settled, else `CONFLICT`/`SETTLED`. Same validation as `add`. Record before/after in Audit. Set EditedBy, EditedAt. If `retithe` is set, the row is positive, and the group has an unsettled Tithing row: set that row's amount = −ceil(new×10%) and its kidId the same. | `{ok, txs:[...]}` |
| `settleTithing` | settleId, txIds[] | parent | If settleId already exists in Settlements → return the stored result. Otherwise settle exactly those rows that are approved, Tithing, negative, and unsettled: set Settled=now and SettleID. If none qualify → `{ok, count:0, totalCents:0}` with no Settlements row. Else append a Settlements row and Audit. | `{ok, settleId, count, totalCents, settledIds}` |
| `upsertKid` | kid:{id, name, color, emoji, archived} | parent | Name 1–20 chars, unique (case-insensitive). Color must be `#rrggbb`. Emoji max 8 code units. Insert if the id is new, else update the row. Transaction `Child` snapshots are not rewritten. Audit. | `{ok, kid}` |
| `setGoal` | kidId, goalName (≤40), goalCents (0 clears) | parent | Write Goal Name and Goal Amount (dollars); clearing blanks both. Audit. | `{ok, kid}` |

**`add` validation:**
- `kidId` exists and is not archived.
- `amountCents` is an integer, non-zero, and `|x| ≤ 1,000,000`.
- Category is active and its direction matches the sign (or is `both`).
- A Tithing row must be negative.
- Note is at most 80 chars.
- With 2 txs: same kidId and same groupId. The second must be Tithing and negative.
- `clientTime` is clamped to ≤ now + 5 min.

**`auth_(token)`:**
1. `hash = sha256hex(token)`.
2. `CacheService.getScriptCache().get('s:'+hash)` → session JSON (cached for 600 s).
3. Otherwise scan Sessions for the hash with RevokedAt blank; cache the result.
4. Update LastSeenAt at most once per 24 h (the cached object records `seenDay`).
5. Also check that the ParentID still exists in Parents. Deleting a parent row revokes their sessions.

Revoking by editing the Sheet takes effect within 10 minutes (the cache TTL); this is documented. `logout` takes effect immediately.

**Utilities:** `colMap_`, `rowToTx_`, `txToRow_`, `findRowById_` (reads only the ID column), `audit_`, `json_`, `sha256hex_` (`Utilities.computeDigest(SHA_256)` → hex).

**Optional Script Properties:** `INSTANCE_NAME` (set to `test` on the test deployment). Live tests refuse to run unless it contains "test" or `VAULT_ALLOW_PROD=1`.

**Data volume note:** each GET returns the whole ledger, about 150 bytes per row. Ten rows a day is roughly 0.5 MB/year: fine for years. If it ever matters, add a `?since=` parameter later.

## 5. Auth and session design

- **Parents.** Who's here → pick a parent → PIN → `login` (needs a connection; if offline: "Can't verify PIN offline"). Store `{token, parent}` under `vault_session`. The user becomes `{role:'parent', id, name}`.
  - Sessions are long-lived with no expiry.
  - On boot and every 30 minutes while visible, the app calls `whoami` if online. On `AUTH` it drops to "Who's here?" with "Please sign in again", and keeps the outbox.
- **Kids.** Tapping a name sets `{role:'kid', id:kidId, name}`. No token is created. Kid requests carry no token, so the server forces pending.
- **Switching user / signing out.** Queue a `logout` op (with the old token) behind everything already in the outbox, then clear the local session immediately. This keeps earlier parent changes valid even when offline.
- **Ops carry their own token.** Each op stores the token captured when it was queued. On `AUTH`, the op is marked `needs-auth`, then:
  - if the same parent signs in again, those ops get the new token and retry;
  - if someone else signs in, they're shown in Settings → Sync ("2 changes by Dad need Dad to sign in"). Nothing is silently resent under another identity.
- **The UI gates nothing on its own.** Hiding buttons in kid mode is cosmetic. The server (and mock server) enforce every rule. The mock server implements the same `AUTH`, transition and validation rules so UI security tests are meaningful.
- **Threat model.** Stops a kid from approving, voiding, editing or settling by replaying requests. Stops PIN guessing (lockout). Keeps PINs out of the page source and the GET payload. Does **not** hide ledger contents from someone who has the API URL. Documented as accepted.

## 6. Offline / outbox / sync

**Op shape** (localStorage `vault_outbox`, an ordered array):
```
{ opId, action, body, token, createdAt, notBefore: createdAt+UNDO_MS, attempts:0,
  nextAttemptAt:0, state:'queued'|'sending'|'needs-auth'|'failed', error:null }
```

**Making ops idempotent:**
| Action | How |
|---|---|
| add | Tx IDs created on the device |
| setStatus / update / setGoal | Applying the same target state twice is a no-op |
| settleTithing | `settleId` created on the device |
| upsertKid | Kid id created on the device |
| logout | Already idempotent |
| login | Never queued |

**Overlay.** The view is `overlay(snapshot, outbox)`. Each op type has a pure apply function:
| Op | Applied as |
|---|---|
| add | Append the txs with `_local:true` and status per role |
| setStatus | Patch status (group-aware) |
| update | Patch fields |
| settleTithing | Set `settledAt` |
| upsertKid / setGoal | Patch the kid |
| logout | Nothing |

Ops in `failed` state are not applied. Every successful fetch replaces the snapshot and recomputes the overlay, so unsent entries never flicker away.

**Drain** (single flight; uses `navigator.locks.request('vault-outbox')` when available, else an in-memory flag):
```
loop: op = first op with state in (queued) whose notBefore<=now && nextAttemptAt<=now
      (strict FIFO: if the head op is blocked by notBefore/backoff/needs-auth, stop — preserves order)
  send via api.call(op.action, {...op.body, token: op.token})
  ok            → remove op; merge returned rows into snapshot; continue
  NETWORK/BUSY  → attempts++, nextAttemptAt = now + [2,5,15,30,60]s[min(attempts-1,4)]; stop
  AUTH          → state 'needs-auth'; stop (FIFO head blocks until resolved or dismissed)
  other code    → state 'failed', error = message; snackbar "1 change couldn't be saved · View"; continue
after loop: if anything was sent → store.refresh()
```

**When drain runs:** after enqueue (it waits for `notBefore`), on a `setTimeout` to the earliest `notBefore`/`nextAttemptAt`, on the `online` event, on `visibilitychange` to visible, and on every poll tick.

**When the app goes to the background** (`visibilitychange` → hidden): set `notBefore = 0` on all queued ops and drain right away (Undo is no longer possible).

**Undo.** While an op is still queued and its `notBefore` hasn't passed, the snackbar's Undo calls `outbox.cancel(opId)`, which removes it; the overlay re-renders. After that the snackbar is gone.

**Polling.** `store.refresh()` runs at boot, every `POLL_MS` while visible, on becoming visible, after a drain, and when ↻ is pressed. ↻ also forces a drain that ignores backoff.

**Cache.** The snapshot is saved to `vault_snapshot` after each successful load. At boot the app renders immediately from the cached snapshot plus the outbox.

**Sync indicator.** The ↻ badge shows the count of queued + needs-auth ops (a red dot if any have failed). Settings → Sync shows "Last synced …", the counts, and a per-failure Dismiss.

**Kid page "⏳" tag** marks `_local` rows and rows patched by a pending op.

## 7. Test plan

### 7a. Setup
- `tests/package.json`: devDependencies `@playwright/test`.
- `playwright.config.js`:
  - `webServer: python3 -m http.server 8080` (repo root), `baseURL http://localhost:8080`.
  - Projects:
    - **mobile**: `{viewport:390x844, isMobile:true, hasTouch:true, deviceScaleFactor:3}`
    - **tablet**: `{viewport:820x1180, hasTouch:true}`
    - **desktop**: `{viewport:1440x900}`
  - The UI specs run in all three projects.
- Default URL: `./index.html?demo=1&fixture=test`. Before each test: `sessionStorage.clear()` and `localStorage.clear()`.
- **Mock hooks** on `window.__vault.mock`: `reset(fixture)`, `setOffline(bool)`, `failNext(n, code)`, `setLatency(ms)`, `db()`, `addTx(rows)` (for bulk data). Also `window.__vault.outbox.list()`.
- Use `UNDO_MS` from config; tests can shorten it with `?undo=300` (demo only).
- Every test asserts no `console.error` / `pageerror` and no horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`).
- Pure modules are tested with `node --test tests/unit/*.test.mjs`: money, selectors, the outbox overlay, and mock-server rules.

### 7b. Fixture `test` (deterministic; dN = N days before load)
**Parents:** Dad p_dad/1234, Mom p_mom/5678.

**Kids:**
| Kid | ID | Emoji | Goal | Archived |
|---|---|---|---|---|
| Logan | k_logan | 🦖 | "Switch game" $60 | no |
| Lizzy | k_lizzy | 🦄 | "Art kit" $3.50 | no |
| Jake | k_jake | 🚀 | none | no |
| Baby | k_baby | 🍼 | none | yes |

**Transactions:**
| ID | Kid | When | Amount | Category | Note | Status | Other |
|---|---|---|---|---|---|---|---|
| L1 | Logan | d10 | +2000 | Chores | "Mowed the lawn" | approved | group gL1 |
| L2 | Logan | d10 | −200 | Tithing | "Tithing · Mowed the lawn" | approved | group gL1, unsettled |
| L3 | Logan | d5 | −1500 | Digital | "Robux" | approved | |
| L4 | Logan | d40 | +1000 | Gift | "Birthday from Grandma" | approved | |
| L5 | Logan | d40 | −100 | Tithing | | approved | settled d35, settle s_old |
| L6 | Logan | d100 | −500 | Digital | "Minecraft" | approved | |
| Z1 | Lizzy | d3 | +800 | Chores | "Dishes all week" | approved | group gZ1 |
| Z2 | Lizzy | d3 | −80 | Tithing | | approved | group gZ1, unsettled |
| Z3 | Lizzy | d2 | −350 | Spending | "Ice cream" | approved | |
| Z4 | Lizzy | d0 | +500 | Chores | "Folded laundry" | pending | user Lizzy, device "Lizzy's iPad" |
| J1 | Jake | d1 | +400 | Chores | "Picked up toys" | approved | group gJ1 |
| J2 | Jake | d1 | −40 | Tithing | | approved | group gJ1, unsettled |
| J3 | Jake | d6 | +5000 | Gift | "Typo" | void | |
| J4 | Jake | d7 | +10000 | Gift | | denied | |
| J5 | Jake | d0 | −600 | Digital | "Fortnite skin" | pending | |

Settlements: s_old, d35, $1.00, Dad.

**Expected values:**
| Item | Expected |
|---|---|
| Logan balance | $7.00 |
| Lizzy balance | $3.70 (goal reached) |
| Jake balance | $3.60 |
| Baby | hidden |
| Holding total | $17.50 (kids' money $14.30 + tithing $3.20) |
| Tithing per kid | Logan $2.00, Lizzy $0.80, Jake $0.40 |
| Requests | 2 |
| Logan Digital spend | 30d $15.00 · 90d $15.00 · all $20.00 |
| Logan goal | 11% |

### 7c. UI checks (mock mode; all three widths)
- **T01 First run.** Device modal appears and can't be dismissed. Save "Test Phone". Who's here appears and can't be dismissed. Kids Logan, Lizzy and Jake are shown and Baby is not.
- **T02 Parent login.** Tap Dad, enter a wrong PIN (0000) → `pin-error` "Wrong PIN". Enter 1234 → the account button shows "D". `localStorage vault_demo_session` has a token.
- **T03 Lockout.** Five wrong PINs for Mom → "Too many tries". A correct PIN is still rejected while locked.
- **T04 Home (parent).** Card balances read $7.00, $3.70, $3.60. Family strip reads Holding $17.50, Tithing $3.20, 2 requests. Lizzy's card shows "Goal reached"; Logan's shows "11%".
- **T05 Family sheet.** Per-kid rows, Kids' money $14.30, Tithing $3.20, Total $17.50.
- **T06 Kid dashboard (Logan).** Hero $7.00. Digital pill reads "$15.00". Ledger hides voided and denied rows for kid users and shows voided rows struck through for parents (check on Jake). Month headers are present.
- **T07 Row detail.** Tapping L3 shows "by", "on", and the device ID for parents. For a kid user, the device ID is absent and Edit/Void are absent.
- **T08 Fast entry (3 taps).** On Logan's page: FAB → tap the recent chip "Mowed the lawn" (amount, category and note fill as $20 / Chores / note) → Save.
  - With the tithing toggle on (default): two new rows (+$20, −$2), balance $25.00, tithing $5.20, snackbar has Undo.
  - Count the clicks: exactly 3.
- **T09 Undo.** Make an entry, tap Undo within the window → balance back to before, outbox empty, nothing in `mock.db()`.
- **T10 Manual entry from Home.** FAB → Jake → Out → $5 chip → type "Roblox gift card" (Digital auto-selected) → Save → Jake shows −$1.40 in red. The balance warning appeared before saving.
- **T11 Tithing toggle off.** Entry +$10 with the toggle off → only one row is created. Reopen the sheet → the toggle is remembered as off.
- **T12 Amount validation.** "abc", "0", and "1.234" each show an error and nothing is saved. "$1,000.50" is accepted (100050 cents).
- **T13 Kid request.** Switch to Lizzy (no PIN) → lands on Lizzy's page → FAB says "Ask" → no kid chips → +$3 Chores → "Send request" → row shows the pending tag, balance unchanged.
  - In kid mode the family strip, Approvals, edit/void and goal-edit controls are absent from the DOM.
- **T14 Approvals.** Back to Dad → 3 requests → open Approvals → linked request (from T13) displays as one card → Approve Z4 → Lizzy $8.70 and tithing untouched (Z4 has no group) → Deny J5 → it disappears.
  - "Approve all" works when there are ≥2.
- **T15 Edit-then-approve.** Tap a pending card → change $5 to $4 → "Approve with changes" → approved at $4.00.
- **T16 Edit approved.** Edit L1 from $20 to $30 with "Also update tithing" checked → L2 becomes −$3.00, balance $16.00.
- **T17 Void.** Void L3: first tap arms the button, second tap voids → balance +$15. Row is struck through for parents. Undo is available.
- **T18 Settled immutable.** L5 detail shows "Settled — can't edit". No Edit/Void buttons.
- **T19 Tithing settle.** Open Tithing → per-kid amounts and total $3.20 → tap Mark (label changes to confirm) → tap again → strip tithing segment hidden/$0 → "Last sent" shows today's $3.20 by Dad. Balances unchanged.
- **T20 Donut.** On Logan, Money out: default 30 days total $15.00 (Digital 100%), 90 days $15.00, All time $22.00 (Digital $20 + Tithing $3, using the original fixture with L5's $1 + L2's $2 = $23.00 total with Digital 87%).
  - Assert the legend values match `selectors.catTotals` computed in-page rather than hardcoding all of them. The 30d total $15.00 is hardcoded.
- **T21 Goals.** Set Jake's goal "Lego" $10 → card shows 36%. Clear it → no goal line. Kid users have no goal button.
- **T22 Goal celebration.** Add +$60 to Logan → `goal-reached` visible and confetti element appears once. After a reload, no confetti, badge still there.
- **T23 Kids management.** Settings → Add kid "Test" 🐢 → appears on Home. Rename Baby to "Emma" and unarchive → "Emma" appears, and existing (none) or new entries keep the same kidId. Rename Logan to "Lo" → all of Logan's history still shows on "Lo". Archive Jake → hidden from Home and the entry chips; history kept.
- **T24 Ledger cap.** `mock.addTx(300 rows for Logan)` → on Logan's page, `ledger.scrollHeight > ledger.clientHeight`. Page `document.scrollingElement.scrollHeight ≤ innerHeight + 900` (mobile) and the ledger box height ≤ 560 px on mobile/tablet. On desktop, the ledger sits in the right column.
- **T25 Offline outbox.** `mock.setOffline(true)` → add 2 entries → rows show ⏳, sync badge "2", `outbox.list().length===2`. Reload the page (still offline) → both rows still visible. `setOffline(false)` and trigger online → badge clears; `db()` has exactly those rows once.
- **T26 Idempotency.** `failNext(1,'NETWORK')` after the server has applied the change (the mock option `failAfterApply`) → retry → no duplicate rows in `db()`.
- **T27 Permanent failure.** `failNext(1,'BAD_INPUT')` → snackbar "couldn't be saved" → Settings → Sync lists it → Dismiss.
- **T28 Auth expiry.** Invalidate Dad's token via `mock.revokeAll()` → queue a void → op becomes needs-auth → app returns to Who's here → sign in as Dad → op sends.
- **T29 Logout ordering.** Offline: Dad makes an entry, then switches to Jake → online → the entry is approved in `db()` and Dad's token is revoked afterward.
- **T30 Back button.** Open the entry sheet → `page.goBack()` closes it and stays on the same view. From a kid page, back returns to Home.
- **T31 Responsive.**
  - At 390: cards in 1 column.
  - At 820: cards in 2 columns, and sheets are centered dialogs (`getBoundingClientRect` left > 0 and bottom < innerHeight).
  - At 1440: 3 columns, and the kid view has 2 columns.
  - FAB is visible and doesn't cover the Save button.
  - Every tap target is ≥ 40×40 px (scan all `button`).
- **T32 Remote adapter wire format** (non-demo; `config.js` URL intercepted with `page.route`):
  - Serve `index.html` with `API_URL='https://script.google.com/macros/s/TEST/exec'`; tests rewrite `config.js` with `page.route`.
  - GET returns 302 to `https://script.googleusercontent.com/echo?x` → routed → fixture JSON → app renders. This proves the redirect is followed.
  - POST: assert the request header content-type starts with `text/plain`, the body has `action:'add'`, `txs[0].id` matches `/^t_/`, and amounts are integers. Assert no OPTIONS request was seen.
- **T33 PWA.** `manifest.json` parses. Icons 192, 512 and maskable exist; PNG width/height are read from the IHDR bytes; there is no `data:` src. `apple-touch-icon` is 180×180.
  - `sw.js` `VERSION === CONFIG.APP_VERSION`.
  - After the first load, wait for `navigator.serviceWorker.controller` (reload once) → `context.setOffline(true)` → reload `index.html?demo=1&fixture=test` → app renders the header and cards.
- **T34 Relative paths.** Grep `index.html`, `js/**`, `css/**`, `sw.js` and `manifest.json` for `src="/`, `href="/` and `'/js` → none. No `alert(`, `confirm(` or `prompt(`.
- **T35 No PIN leak.** In demo GET-equivalent output (`mock.load()`) and in the live GET, no key named `pin` or `PIN` at any depth.

### 7d. Live API checks
`tests/live/api.test.mjs`, run with `node --test`. Env: `VAULT_API_URL`, `VAULT_PARENT_ID`, `VAULT_PIN`, and `VAULT_LOCK_PARENT_ID` (a throwaway parent row for the lockout test).

Preflight: GET → `ok`, `schema===2`, `instance` contains "test" (else abort unless `VAULT_ALLOW_PROD=1`).

Use `fetch` with the POST `text/plain` header and default redirect handling.

| # | Check |
|---|---|
| L01 | GET shape: arrays exist; no `pin` key anywhere; amounts are integers. |
| L02 | Login with a wrong PIN → `AUTH`. Correct PIN → token (≥40 chars). `whoami` → parent. |
| L03 | Setup: `upsertKid` a kid "ZZ Test" (id `k_zz_<rand>`) with the token → ok. Without a token → `AUTH`. |
| L04 | `add` with **no token** but a client `status:'approved'` and `user:{role:'parent',name:'Dad'}` → returned row status `pending`, role `kid`. |
| L05 | `add` with no token and a garbage token (`'x'.repeat(64)`) → pending, plus an Audit `auth_reject`… for writes it still succeeds as pending. Garbage-token `setStatus` → `AUTH`. |
| L06 | No token: `setStatus` approve, `setStatus` void, `update`, `settleTithing`, `setGoal`, `upsertKid` → each returns `AUTH`; GET confirms nothing changed. |
| L07 | Parent `add` with the token and a client `user.name:'Mallory'` → approved, `user` = the session name. |
| L08 | Idempotency: send the same `add` (same tx id) twice → second has `duplicate:true`; GET shows exactly one row. |
| L09 | Group: add +1000 with −100 Tithing (same groupId) without a token → both pending. `setStatus` approve on the first id → both approved. |
| L10 | Transitions: approved → `denied` → `CONFLICT`. Void → ok; void again → ok (no-op). Void → approved → `CONFLICT`. |
| L11 | Settle: `settleTithing{settleId, txIds:[tithe id]}` → count 1, totalCents 100. Repeat the same settleId → same result, no second Settlements row. Then void the settled row → `SETTLED`; `update` it → `SETTLED`. |
| L12 | Validation: amountCents 1.5 → `BAD_INPUT`; 0 → `BAD_INPUT`; Tithing positive → `BAD_INPUT`; unknown kid → `BAD_INPUT`/`NOT_FOUND`; archived kid → `BAD_INPUT`; note 81 chars → `BAD_INPUT`. |
| L13 | Logout → `whoami` with the old token → `AUTH`. A parent action with the old token → `AUTH`. |
| L14 | Lockout (on `VAULT_LOCK_PARENT_ID`): 5 wrong PINs → 6th attempt (even with the correct PIN) → `LOCKED`. |
| L15 | Cleanup: log in again, void the ZZ test rows, archive the test kid. |
| L16 | Run `setup()` twice manually (documented step); GET schema unchanged and no duplicate columns. Checked via a `?diag=1` GET that returns tab header lists (no data). |

## 8. Implementation steps (in order)

1. **Scaffold.** Create the folders from §3. Move the CSS out of `index.html` into `css/app.css` unchanged. Write `config.js`, `env.js`, `storage.js`, `ids.js`, `money.js`, `platform.js`. Add unit tests for `money` (parse/format/tithe ceiling).
2. **Mock server and fixtures.** Write `api/mock-server.js` with every rule in §4c (auth, lockout, transitions, groups, settle, idempotency, validation). Add `fixtures.js` (test + sample; sample uses Logan/Lizzy/Jake/Baby with richer data), `api/mock.js` with the hooks, and unit tests for the mock rules.
3. **Selectors and store.** Write `selectors.js` (pure, with unit tests against the §7b numbers) and `store.js`.
4. **Outbox.** Write `outbox.js` with the overlay, drain, backoff, undo and needs-auth handling. Unit-test the overlay and the drain ordering with a fake adapter.
5. **Port the UI.** Bring each piece of the current `index.html` into the `ui/*` modules: header, home, kid, ledger (now keyed by kidId, in cents, with month groups), donut (default 30d), goal, tithe, approvals. Add `data-testid`s.
6. **New UX.** Family strip and sheet; entry sheet upgrades (recent chips, quick amounts, direction-filtered categories, Digital keyword guess, tithing toggle, balance warning, kid-mode lock); approve-all and edit-then-approve; void confirm; voided rows for parents; Digital pill; goal celebration; settings with the kid editor and sync status; account menu; snackbar with Undo.
7. **Identity and auth flow.** Device modal, Who's here, PIN, session, `whoami` check, logout op.
8. **Router.** Hash routes and back-button handling for sheets. Responsive CSS (grid columns, desktop two-column kid view, dialog sheets, ledger height rules).
9. **Code.gs v2.** Header-map helpers, `setup()` migration, `doGet`, `doPost` with lock, every action, Sessions, Audit, Settlements, lockout, `?diag=1`. Keep it identical in behavior to `mock-server.js` (go through the §4c table line by line).
10. **Remote adapter.** Text/plain POST, redirect follow, timeout, error mapping.
11. **PWA.** Draw `icons/icon.svg`, run `tools/make-icons.mjs` and commit the PNGs. Self-host the Outfit woff2 (if it can't be downloaded, keep the Google Fonts link and add a runtime cache for `fonts.gstatic.com` in `sw.js`). Update the manifest, write `sw.js`, add update-ready handling.
12. **Cleanup.** Replace `vault-demo.html` with the redirect stub. Delete the old inline script.
13. **Tests.** Playwright config and specs T01–T35. Run all three projects and fix issues.
14. **Live test.** Make a copy of the Sheet as "Vault TEST", paste `Code.gs`, set `INSTANCE_NAME=test`, run `setup()`, deploy, and run the §7d tests.
15. **Rewrite SETUP.md:**
    - Paste `Code.gs`, run `setup()` (safe to re-run; it upgrades the existing Sheet and keeps history).
    - Change PINs in Parents.
    - Deploy as a **new version** of the existing deployment so the URL is unchanged.
    - Set `API_URL` in `js/config.js`.
    - Bump `APP_VERSION` and `sw.js` `VERSION` together on every frontend change.
    - Push to GitHub Pages.
    - Demo link: `index.html?demo=1`.
    - Revoking devices: delete rows in Sessions.
    - The ledger is readable by anyone with the URL.
    - Capacitor notes: copy the static folder as `webDir`; the service worker is skipped in native; `platform.js` is where the Haptics and Preferences plugins plug in later.
16. **Production upgrade.** Back up the live Sheet (File → Make a copy), then paste the new `Code.gs`, run `setup()`, check the summary log, redeploy the same deployment, and deploy the frontend.

### Critical files for implementation
- /home/claude/vault/index.html (source of the existing UI, CSS and behavior to port)
- /home/claude/vault/Code.gs (backend to rewrite; existing column order must survive migration)
- /home/claude/vault/vault-demo.html (sample data to fold into `js/api/fixtures.js`, then replace with a redirect stub)
- /home/claude/vault/manifest.json (replace the data-URI icon)
- /home/claude/vault/SETUP.md (rewrite for v2 setup, migration and versioning)

**Worth saving to memory for The Vault:** the v1.0 plan keeps the Sheet + Apps Script + GitHub Pages stack, puts demo mode behind `?demo=1` with a mock adapter, adds parent session tokens (Sessions tab) and an offline outbox with undo, uses a default-on 10% tithing toggle on money-in (rounded up), and adds Audit and Settlements tabs. Allowance, notifications and the chore board are explicitly out.