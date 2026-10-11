# The Vault — Setup

The stack: a Google Sheet holds the ledger, an Apps Script web app (`Code.gs`) is the API, and the static frontend lives on GitHub Pages.

## 1. Backend (Sheet + Apps Script)

**New install or upgrading the existing Sheet: the steps are the same.**

1. **Upgrading?** Back up first: File → Make a copy of the live Sheet.
2. Open the Sheet → Extensions → Apps Script.
3. Replace everything in `Code.gs` with this repo's `Code.gs`, then Save.
   - Optional: Project Settings → "Show appsscript.json", then paste this repo's `appsscript.json`. That limits permissions to this one spreadsheet.
4. Choose the `setup` function → Run → grant permissions. Check the execution log for the summary line (`created`, `addedColumns`, `kidsAssigned`, `txLinked`, …).
   - `setup()` is safe to re-run. It adds missing tabs and columns, gives every kid a stable ID, links old rows to kids by name, and never deletes anything.
   - New tabs: **Categories**, **Sessions**, **Settlements**, **Audit**.
   - On a fresh Sheet it seeds kids Logan, Lizzy, Jake and Baby (Baby starts hidden), plus parents **Dad and Mom, both with PIN 1234**.
5. **Change the PINs now.** In the **Parents** tab, edit the PIN column. It's text-formatted, so `0042` keeps its leading zero. PINs are checked by the server and never sent to the browser.
6. Deploy:
   - **First time:** Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
   - **Upgrading:** Deploy → Manage deployments → ✎ on the existing web app → Version: **New version** → Deploy. The URL stays the same.

## 2. Frontend (GitHub Pages)

1. In `js/config.js`, set `API_URL` to the `/exec` URL. Optionally set `SHEET_URL` to show an "Open the Sheet" link in Settings.
2. Push the repo to GitHub → Settings → Pages → deploy from the main branch. It works under a subpath such as `/the-vault/`, because every path is relative.
3. On each phone, open the URL → Share → **Add to Home Screen**.

**On every frontend change, bump `APP_VERSION` in `js/config.js` and `VERSION` in `sw.js` together.** A test checks that they match. Installed apps then show "Update ready · Reload".
If you add or rename a file under `js/`, `css/`, `fonts/` or `icons/`, regenerate the `SHELL` list in `sw.js` with `node tools/make-sw-list.mjs`.

**Demo:** `index.html?demo=1` (or `vault-demo.html`) runs entirely in the browser with sample data. Demo PINs: Dad 1234, Mom 5678.

## 3. Day-to-day admin (all in the Sheet)

- **Kids:** add, rename, recolor and archive in the app (Settings → Kids), or edit the Kids tab directly. Rows are keyed by `KidID`, so renaming is safe.
- **PINs / parents:** edit the Parents tab. **Deleting a parent row immediately signs out all of that parent's devices.**
- **Revoke a device:** in the **Sessions** tab, delete that device's row, or put any date in `RevokedAt`. This takes effect within 10 minutes (server cache); "Sign out" in the app takes effect immediately. Rows show device name and last-seen date. Tokens are stored only as SHA-256 hashes.
- **Categories:** edit the Categories tab. Set `Active` to FALSE to retire one; old rows keep displaying.
- **Lockout:** 5 wrong PINs locks that parent out for 15 minutes.
- **Audit:** every change, login, failed login and rejected request is appended to the **Audit** tab, with before/after values.
- **Tithing:** "Mark as sent" stamps the rows' `Settled`/`SettleID` columns and adds a **Settlements** row. Nothing is deleted.

## 4. Security notes (accepted trade-offs)

- Anyone who has the API URL can **read** the ledger. The URL ships in the public frontend, but PINs are never part of any response.
- Writes without a valid parent session can only create **pending** requests. Approve, deny, void, edit, settle, and kid or goal changes all require a signed-in parent, and the server stamps the name from the session.
- It's a family-grade lock, not bank-grade.

## 5. Testing

```
cd tests && npm install
npm run test:unit       # pure modules (money, selectors)
npm run test:backend    # Code.gs in a Node vm with fake Apps Script services
npm run test:ui         # Playwright, mock mode, 390/820/1440 px (uses python3 -m http.server)
```

Live API checks (`npm run test:live`) need a **test** deployment. Make a copy of the Sheet named "Vault TEST", paste `Code.gs`, set the Script Property `INSTANCE_NAME=test`, run `setup()` and deploy. Then set `VAULT_API_URL`, `VAULT_PARENT_ID`, `VAULT_PIN`, and optionally `VAULT_LOCK_PARENT_ID` (a throwaway parent row). The tests refuse to run against an instance whose name doesn't contain "test".

## 6. Capacitor (later)

- Use this folder as-is for `webDir`; there's no build step.
- The service worker is skipped automatically inside the native shell (`env.isNative`).
- `js/platform.js` is the seam for native features: Haptics (already used when the plugin is present), Browser (for "Open the Sheet") and Preferences (storage) plug in there.
- The Android back button already closes the top sheet first, through history entries.
