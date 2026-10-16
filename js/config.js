// The Vault — configuration. Edit API_URL after deploying Code.gs (see SETUP.md).
// While API_URL is empty (or contains "PASTE"), the app runs in demo mode.
export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxbNjlc8B9-F2o7PIOiDuWLYAObmLDf4Rgn2O6CBHfuTc-MXr1EJXm0m5OPZNN8IR-Y/exec',
  APP_VERSION: '1.1.4',        // must equal VERSION in sw.js — bump both on every deploy
  POLL_MS: 60000,
  TITHE_RATE_PCT: 10,
  UNDO_MS: 4000,
  QUICK_AMOUNTS: [100, 200, 500, 1000, 2000],
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/10lI4xJ-j7bzxPsSSubh5230br3LTIMQUtBFNDkPH5qY/edit',
};
