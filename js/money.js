// Money is integer cents everywhere in code.
export const MAX_CENTS = 1000000;

// "$1,000.50" → 100050. Returns null for anything invalid, ≤0, >2 decimals or > MAX_CENTS.
export function parseCents(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
// 123450 → "$1,234.50"; negatives use a real minus: "−$2.40"
export function fmtCents(c) {
  const n = Math.round(Number(c) || 0);
  return (n < 0 ? '−' : '') + fmt.format(Math.abs(n) / 100);
}
export function fmtSigned(c) {
  const n = Math.round(Number(c) || 0);
  return (n < 0 ? '−' : '+') + fmt.format(Math.abs(n) / 100);
}
export function titheCents(c, pct = 10) {
  return Math.ceil((Math.abs(c) * pct) / 100);
}
