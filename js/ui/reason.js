// Optional "why" for an approve/deny decision. Quick chips fill the box; the kid sees the text.
import { h } from './dom.js';

export const DENY_PRESETS = ['Chore isn’t done yet', 'Already paid', 'Let’s talk about it', 'Not this time'];
export const MAX_REASON = 140;

// opts: { kidName, presets, value, onInput, testid }
export function reasonField(opts = {}) {
  const input = h('input', {
    class: 'text-in reason-in', testid: opts.testid || 'reason-input', maxlength: String(MAX_REASON), autocomplete: 'off',
    enterkeyhint: 'done', placeholder: opts.kidName ? `Why? (optional — ${opts.kidName} will see this)` : 'Why? (optional)',
    value: opts.value || '',
  });
  input.addEventListener('input', () => { if (opts.onInput) opts.onInput(input.value); });
  const chips = (opts.presets || []).map((p, i) => h('button', {
    class: 'chip-btn small', type: 'button', testid: (opts.testid || 'reason') + '-preset-' + i,
    onclick: (e) => { e.stopPropagation(); input.value = p; if (opts.onInput) opts.onInput(p); },
  }, p));
  const el = h('div', { class: 'reasonbox' }, chips.length ? h('div', { class: 'chips reason-chips' }, chips) : null, input);
  return { el, input, get value() { return input.value.trim().slice(0, MAX_REASON); } };
}
