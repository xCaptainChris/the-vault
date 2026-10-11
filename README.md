# The Vault

A family ledger for the kids' money. The parents hold the cash, and The Vault tracks what each kid has, what's set aside for tithing, and where the money goes. It's an installable PWA; the backend is a Google Sheet plus Apps Script.

- **Try the demo:** open `index.html?demo=1`. It needs no backend. Demo PINs: Dad 1234, Mom 5678.
- **Set it up:** see [SETUP.md](SETUP.md).
- **Design and decisions:** see [PLAN.md](PLAN.md).

## Layout

| Path | What |
|---|---|
| `index.html`, `css/`, `fonts/`, `icons/`, `manifest.json`, `sw.js` | Static PWA shell (vanilla ES modules, no build step, relative paths only) |
| `js/config.js` | `API_URL` (empty = demo mode), version, tuning |
| `js/api/` | `remote.js` (Apps Script), `mock.js` + `mock-server.js` (same rules, in the browser), fixtures |
| `js/outbox.js`, `js/store.js` | Offline outbox with undo, overlaid on the last server snapshot |
| `js/ui/` | Screens and sheets |
| `Code.gs`, `appsscript.json` | Backend (paste into the Sheet's Apps Script project) |
| `tests/` | Node unit tests, Apps Script harness tests, Playwright UI suite, live API checks |
| `tools/` | Icon generator (Pillow) and the service-worker file-list helper |

## Run locally

```
python3 -m http.server 8080      # then open http://localhost:8080/?demo=1
cd tests && npm install && npm test
```
