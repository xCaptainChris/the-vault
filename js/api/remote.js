// Remote adapter: Google Apps Script web app.
// POST uses text/plain to avoid a CORS preflight; fetch follows the 302 to googleusercontent.
import { CONFIG } from '../config.js';
import { ApiError, unwrap } from './errors.js';

const TIMEOUT_MS = 15000;

async function request(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...init, redirect: 'follow', signal: ctl.signal });
  } catch (e) {
    throw new ApiError('NETWORK', e && e.name === 'AbortError' ? 'Timed out' : 'Network error');
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    const text = await res.text();
    data = JSON.parse(text);
  } catch (e) {
    throw new ApiError('NETWORK', 'Unexpected response from server');
  }
  return unwrap(data);
}

export const remoteAdapter = {
  kind: 'remote',
  load() {
    return request(CONFIG.API_URL + '?t=' + Date.now(), { method: 'GET' });
  },
  call(action, body) {
    return request(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, action }),
    });
  },
};
