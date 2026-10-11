export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const byId = (id) => document.getElementById(id);

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tiny element builder: h('button', {class:'x', testid:'y', onclick}, 'text' | Node | [..])
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'testid') el.dataset.testid = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c instanceof Node ? c : String(c)); });
  return el;
}

/* ---- snackbar ---- */
let snackTimer = null;
export function snackbar(msg, opts = {}) {
  const el = byId('toast');
  const msgEl = el.querySelector('.tmsg');
  const btn = el.querySelector('button');
  msgEl.textContent = msg;
  if (opts.action) {
    btn.hidden = false;
    btn.textContent = opts.action;
    btn.onclick = () => { hideSnackbar(); if (opts.onAction) opts.onAction(); };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  el.classList.add('show');
  clearTimeout(snackTimer);
  const ms = opts.ms || (opts.action ? 4000 : 2200);
  if (ms !== Infinity) snackTimer = setTimeout(hideSnackbar, ms);
}
export function hideSnackbar() {
  clearTimeout(snackTimer);
  byId('toast').classList.remove('show');
}

// First tap arms (label changes), second tap within 4 s runs fn.
export function confirmTwice(btn, armedLabel, fn) {
  const original = btn.textContent;
  let timer = null;
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (btn.dataset.armed) {
      clearTimeout(timer);
      delete btn.dataset.armed;
      btn.classList.remove('armed');
      fn();
      return;
    }
    btn.dataset.armed = '1';
    btn.classList.add('armed');
    btn.textContent = armedLabel;
    timer = setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = original; }, 4000);
  });
}

const DATE_SHORT = { month: 'short', day: 'numeric' };
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', DATE_SHORT);
export const fmtDayYear = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtFull = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fmtShortTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
