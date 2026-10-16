// Kid avatars: a flat cartoon bust drawn as SVG from a short code (stored in the Kids sheet).
// Code v2: "2:<sex b|g>:<hair id>:<hair color #>:<skin #>:<eye #>:<acc+acc…>:<highlight hex|>:<shirt hex|>"
// (v1 codes "1:sex:hair:hc:skin:eye:acc" still parse.) Pure module (no DOM): unit-testable.

export const SEXES = [{ id: 'b', label: 'Boy' }, { id: 'g', label: 'Girl' }];

export const HAIRS = [
  { id: 'spk', label: 'Spiky', sex: 'b' },
  { id: 'swp', label: 'Swoop', sex: 'b' },
  { id: 'buz', label: 'Buzz', sex: 'b' },
  { id: 'bcr', label: 'Curly', sex: 'b' },
  { id: 'afr', label: 'Afro', sex: 'b' },
  { id: 'mhk', label: 'Mohawk', sex: 'b' },
  { id: 'shg', label: 'Shaggy', sex: 'b' },
  { id: 'lng', label: 'Long', sex: 'g' },
  { id: 'shd', label: 'Over shoulder', sex: 'g' },
  { id: 'pny', label: 'Ponytail', sex: 'g' },
  { id: 'brd', label: 'Braid', sex: 'g' },
  { id: 'ice', label: 'Snow Queen', sex: 'g' },
  { id: 'bob', label: 'Bob', sex: 'g' },
  { id: 'pig', label: 'Pigtails', sex: 'g' },
  { id: 'cur', label: 'Curly', sex: 'g' },
  { id: 'bun', label: 'Top bun', sex: 'g' },
];

export const HAIR_COLORS = [
  { label: 'Black', c: '#2b2523' }, { label: 'Dark brown', c: '#4a3226' }, { label: 'Brown', c: '#7a4f33' },
  { label: 'Red', c: '#c1572b' }, { label: 'Blonde', c: '#d9a94e' }, { label: 'Light blonde', c: '#ecd08f' },
  { label: 'Platinum', c: '#e9ecf2' }, { label: 'Pink', c: '#f06aa8' }, { label: 'Purple', c: '#8e5bd6' },
  { label: 'Blue', c: '#3f86e0' }, { label: 'Teal', c: '#2fb5a6' },
];
export const SKINS = [
  { label: 'Light', c: '#f9dcc8' }, { label: 'Fair', c: '#f2c6a6' }, { label: 'Medium', c: '#dca47f' },
  { label: 'Tan', c: '#bd8358' }, { label: 'Brown', c: '#8f5b3c' }, { label: 'Dark', c: '#5e3a26' },
];
export const EYES = [
  { label: 'Brown', c: '#5a3a24' }, { label: 'Hazel', c: '#8a6a32' }, { label: 'Blue', c: '#3d7fc4' },
  { label: 'Green', c: '#3f8a52' }, { label: 'Gray', c: '#7c8794' },
];
// Quick picks for highlights and shirts (a full color picker is offered too).
export const STREAKS = ['#ff5fa2', '#b06cff', '#4f9dff', '#2fd3c0', '#ff6a3d', '#ffd65a', '#f4f6fb'];
export const SHIRTS = ['#4cd964', '#00d2ff', '#ff6b5e', '#ffcc33', '#b06cff', '#ff8ac2', '#f1ead8', '#ffffff', '#3a3d48', '#2d6cdf'];

// Extras. `slot` = only one per slot (one hat, one pair of glasses, one thing in hand…).
export const ACCESSORIES = [
  { id: 'cap', label: 'Ball cap', slot: 'head' },
  { id: 'bnt', label: 'Beanie', slot: 'head' },
  { id: 'crn', label: 'Crown', slot: 'head' },
  { id: 'tia', label: 'Tiara', slot: 'head' },
  { id: 'hph', label: 'Headphones', slot: 'head' },
  { id: 'hbd', label: 'Headband', slot: 'head' },
  { id: 'bow', label: 'Bow', slot: 'clip' },
  { id: 'flw', label: 'Flower', slot: 'clip' },
  { id: 'glr', label: 'Round glasses', slot: 'eyes' },
  { id: 'gls', label: 'Square glasses', slot: 'eyes' },
  { id: 'sun', label: 'Sunglasses', slot: 'eyes' },
  { id: 'std', label: 'Stud earrings', slot: 'ears' },
  { id: 'hop', label: 'Hoop earrings', slot: 'ears' },
  { id: 'wnd', label: 'Magic wand', slot: 'hand' },
  { id: 'tpt', label: 'Trumpet', slot: 'hand' },
  { id: 'frk', label: 'Freckles', slot: '' },
];
const ACC = Object.fromEntries(ACCESSORIES.map(a => [a.id, a]));

const V1_RE = /^1:[bg]:[a-z]{3}:\d:\d:\d:([a-z]{3}(\+[a-z]{3})*)?$/;
const V2_RE = /^2:[bg]:[a-z]{3}:\d{1,2}:\d{1,2}:\d{1,2}:([a-z]{3}(\+[a-z]{3})*)?:([0-9a-f]{6})?:([0-9a-f]{6})?$/;
export const CODE_RE = V2_RE;
export const isCode = (c) => typeof c === 'string' && (V1_RE.test(c) || V2_RE.test(c));
export const DEFAULT = { sex: 'b', hair: 'spk', hairColor: 1, skin: 1, eye: 0, acc: [], streak: '', shirt: '' };

const clampIdx = (n, list) => (Number.isInteger(n) && n >= 0 && n < list.length ? n : 0);
const hex = (v) => { const m = /^#?([0-9a-fA-F]{6})$/.exec(v || ''); return m ? '#' + m[1].toLowerCase() : ''; };

export function parse(code) {
  if (!isCode(code)) return null;
  const parts = code.split(':');
  const [, sex, hair, hc, sk, ey, acc, streak, shirt] = parts;
  return normalize({ sex, hair, hairColor: +hc, skin: +sk, eye: +ey, acc: acc ? acc.split('+') : [], streak: streak || '', shirt: shirt || '' });
}

// Keep a spec valid: known ids only, one item per slot (last one wins).
export function normalize(s) {
  const sex = s.sex === 'g' ? 'g' : 'b';
  const hair = HAIRS.some(h => h.id === s.hair) ? s.hair : (sex === 'g' ? 'lng' : 'spk');
  const bySlot = {};
  const acc = [];
  (s.acc || []).forEach(id => {
    const a = ACC[id];
    if (!a || acc.includes(id)) return;
    if (a.slot) { if (bySlot[a.slot]) acc.splice(acc.indexOf(bySlot[a.slot]), 1); bySlot[a.slot] = id; }
    acc.push(id);
  });
  return { sex, hair, hairColor: clampIdx(s.hairColor, HAIR_COLORS), skin: clampIdx(s.skin, SKINS), eye: clampIdx(s.eye, EYES), acc, streak: hex(s.streak), shirt: hex(s.shirt) };
}

export function serialize(s) {
  const n = normalize(s);
  return ['2', n.sex, n.hair, n.hairColor, n.skin, n.eye, n.acc.join('+'), n.streak.slice(1), n.shirt.slice(1)].join(':');
}

// Toggle an extra; picking one in an occupied slot swaps it out.
export function toggleAcc(s, id) {
  const has = s.acc.includes(id);
  const a = ACC[id];
  let acc = s.acc.filter(x => x !== id);
  if (!has) { if (a && a.slot) acc = acc.filter(x => ACC[x].slot !== a.slot); acc.push(id); }
  return normalize({ ...s, acc });
}

export function random(rnd = Math.random) {
  const pick = (list) => Math.floor(rnd() * list.length);
  const sex = rnd() < 0.5 ? 'b' : 'g';
  const hairs = HAIRS.filter(h => h.sex === sex);
  const acc = [];
  if (rnd() < 0.45) acc.push(['cap', 'bnt', 'crn', 'tia', 'hph', 'hbd'][pick([1, 2, 3, 4, 5, 6])]);
  if (rnd() < 0.35) acc.push(['glr', 'gls', 'sun'][pick([1, 2, 3])]);
  if (sex === 'g' && rnd() < 0.5) acc.push(['bow', 'flw'][pick([1, 2])]);
  if (rnd() < 0.2) acc.push(['wnd', 'tpt'][pick([1, 2])]);
  if (rnd() < 0.25) acc.push('frk');
  const natural = pick([1, 2, 3, 4, 5, 6]);           // mostly natural colors
  const hairColor = rnd() < 0.2 ? 6 + pick([1, 2, 3, 4, 5]) : natural;
  return normalize({
    sex, hair: hairs[pick(hairs)].id, hairColor, skin: pick(SKINS), eye: pick(EYES), acc,
    streak: rnd() < 0.25 ? STREAKS[pick(STREAKS)] : '', shirt: rnd() < 0.6 ? SHIRTS[pick(SHIRTS)] : '',
  });
}

/* ---------------- drawing ---------------- */

function shade(hx, amt) {
  const n = parseInt(hx.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const circles = (list, fill) => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
const braid = (pts, fill, dk) => pts.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r * 0.85).toFixed(2)}" fill="${fill}"/><path d="M${x - r * 0.6},${y} Q${x},${y + r * 0.55} ${x + r * 0.6},${y}" stroke="${dk}" stroke-width=".8" fill="none"/>`).join('');

// Head: ellipse cx 50 cy 47 rx 20 ry 22. Every front-hair shape must reach down past the head's edge
// on both sides (x≈29–31 at y≥42) so no background shows between hair and forehead.
const CAP = 'M29,46 C27,28 38,19 50,19 C62,19 73,28 71,46 C67,37 59,32 50,32 C41,32 33,37 29,46 Z';
const HAIR_BACK = {
  lng: 'M26,46 C23,26 36,17 50,17 C64,17 77,26 74,46 C76,58 80,70 79,80 C74,88 64,86 60,79 L60,62 L40,62 L40,79 C36,86 26,88 21,80 C20,70 24,58 26,46 Z',
  bob: 'M26,46 C23,26 36,17 50,17 C64,17 77,26 74,46 L75,64 C71,69 65,68 63,63 L37,63 C35,68 29,69 25,64 Z',
  shd: 'M27,46 C24,26 37,17 50,17 C64,17 76,26 73,46 L71,58 L36,58 C31,56 28,52 27,46 Z',
  shg: 'M27,48 C24,28 37,18 50,18 C63,18 76,28 73,48 L73,58 L27,58 Z',
  cur: '',
  afr: '',
};
const HAIR_FRONT = {
  spk: 'M28,47 C26,31 33,23 42,21 L40,13 L48,19 L53,11 L57,19 L65,14 L63,22 C70,26 74,35 72,47 C70,40 67,36 62,34 C55,37 44,37 37,33 C33,37 30,41 28,47 Z',
  swp: 'M29,47 C26,29 37,20 51,20 C64,20 74,28 71,46 C69,40 66,36 61,34 C53,37 43,37 36,33 C32,37 30,42 29,47 Z',
  buz: 'M30,44 C30,30 39,23 50,23 C61,23 70,30 70,44 C66,36 59,32 50,32 C41,32 34,36 30,44 Z',
  bcr: CAP,
  afr: 'M30,45 C30,31 39,25 50,25 C61,25 70,31 70,45 C66,37 59,33 50,33 C41,33 34,37 30,45 Z',
  mhk: 'M44,27 L41,9 L47,15 L50,6 L53,15 L59,9 L56,27 C54,31 46,31 44,27 Z',
  shg: 'M27,56 C24,30 36,19 50,19 C64,19 76,30 73,56 L69,51 L68,44 C65,39 61,37 58,36 L56,40 L53,36 L49,41 L46,36 L42,40 L40,36 C36,38 33,42 32,46 L31,52 Z',
  lng: 'M29,47 C27,29 38,20 50,20 C62,20 73,29 71,47 C67,38 60,32 52,31 L50,35 L48,31 C40,32 33,38 29,47 Z',
  shd: 'M29,47 C27,29 38,20 51,20 C63,20 73,28 71,46 C67,37 61,33 54,32 C45,33 36,38 29,47 Z',
  pny: 'M29,47 C27,28 39,20 52,20 C64,21 73,29 71,46 C66,37 58,33 49,34 C42,35 35,39 29,47 Z',
  brd: 'M29,47 C27,29 38,20 50,20 C62,20 73,29 71,47 C67,38 60,32 52,31 L50,35 L48,31 C40,32 33,38 29,47 Z',
  ice: 'M29,47 C26,27 37,14 52,15 C66,16 75,27 71,47 C69,38 65,31 57,29 C49,28 40,31 35,37 C32,40 30,43 29,47 Z',
  bob: 'M29,43 C29,28 39,21 50,21 C61,21 71,28 71,43 L71,44 L29,44 Z',
  pig: 'M29,47 C27,29 38,20 50,20 C62,20 73,29 71,47 C67,38 60,32 52,31 L50,35 L48,31 C40,32 33,38 29,47 Z',
  cur: CAP,
  bun: 'M29,46 C27,28 38,20 50,20 C62,20 73,28 71,46 C67,36 59,31 50,31 C41,31 33,36 29,46 Z',
};
// Strand lines used for highlights (drawn on the front hair).
const STREAK_PATHS = {
  default: 'M40,23 C36,28 33,34 31,42 M50,21 C48,26 47,30 47,33 M60,23 C64,28 67,34 69,42',
  long: 'M40,23 C36,28 33,34 31,42 M50,21 C48,26 47,30 47,33 M60,23 C64,28 67,34 69,42 M25,50 C24,60 23,68 24,76 M75,50 C76,60 77,68 76,76',
};

// Returns an SVG string. opts: { bg: '#hex' | null, size: px, id, shirt: fallback shirt color }
export function avatarSvg(spec, opts = {}) {
  const s = normalize(spec || DEFAULT);
  const size = opts.size || 96;
  const hair = HAIR_COLORS[s.hairColor].c;
  const hairDk = shade(hair, -0.25);
  const hairLt = shade(hair, 0.18);
  const skin = SKINS[s.skin].c;
  const skinDk = shade(skin, -0.12);
  const iris = EYES[s.eye].c;
  const shirt = s.shirt || opts.shirt || '#f1ead8';
  const has = (id) => s.acc.includes(id);
  const p = [];
  const uid = opts.id || 'av';

  p.push(`<defs><clipPath id="${uid}c"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#${uid}c)">`);
  if (opts.bg) p.push(`<rect width="100" height="100" fill="${opts.bg}"/>`);
  p.push('<g transform="translate(50 54) scale(1.2) translate(-50 -50)">');   // bust fills the circle

  // ---- behind the head ----
  if (HAIR_BACK[s.hair]) p.push(`<path d="${HAIR_BACK[s.hair]}" fill="${hair}"/>`);
  if (s.hair === 'afr') p.push(`<ellipse cx="50" cy="34" rx="28" ry="23" fill="${hair}"/>` + circles([[25, 38, 7], [75, 38, 7], [30, 22, 8], [70, 22, 8], [50, 13, 9]], hair));
  if (s.hair === 'cur') p.push(circles([[28, 30, 9], [72, 30, 9], [24, 44, 9], [76, 44, 9], [24, 58, 9], [76, 58, 9], [27, 70, 8.5], [73, 70, 8.5], [38, 20, 9], [62, 20, 9], [50, 16, 9]], hair));
  if (s.hair === 'pig') p.push(`<circle cx="24" cy="50" r="9" fill="${hair}"/><circle cx="76" cy="50" r="9" fill="${hair}"/><circle cx="29" cy="45" r="2.2" fill="#e8577e"/><circle cx="71" cy="45" r="2.2" fill="#e8577e"/>`);
  if (s.hair === 'pny') p.push(`<path d="M66,26 C80,24 84,40 78,56 C76,62 70,64 70,58 C74,46 72,36 64,32 Z" fill="${hair}"/><circle cx="67" cy="28" r="3" fill="${hairDk}"/>`);
  if (s.hair === 'bun') p.push(`<circle cx="50" cy="16" r="9" fill="${hair}"/><path d="M44,16 Q50,20 56,16" stroke="${hairDk}" stroke-width="1" fill="none"/><rect x="43" y="22" width="14" height="3.4" rx="1.7" fill="#e8577e"/>`);

  // ---- body ----
  p.push(`<path d="M18,104 C18,86 30,79 50,79 C70,79 82,86 82,104 Z" fill="${shirt}"/>`);
  p.push(`<path d="M43,62 L57,62 L57,80 C53,84 47,84 43,80 Z" fill="${skinDk}"/>`);
  p.push(`<path d="M41,79 L50,88 L59,79 L55,77 L50,82 L45,77 Z" fill="#ffffff" opacity=".9"/>`);

  // ---- hair that falls in front of the shoulders ----
  if (s.hair === 'shd') p.push(`<path d="M63,46 C70,52 72,62 72,72 C72,80 69,88 64,92 C60,88 59,82 61,76 C63,68 62,60 58,54 Z" fill="${hair}"/><path d="M66,58 C68,66 68,74 65,84" stroke="${hairDk}" stroke-width="1" fill="none" stroke-linecap="round"/>`);
  if (s.hair === 'brd') p.push(braid([[33, 60, 4.6], [32, 67, 4.4], [31.5, 74, 4.2], [31.5, 81, 4]], hair, hairDk) + `<rect x="28.5" y="84" width="6" height="2.6" rx="1.3" fill="#e8577e"/><path d="M29.5,86.5 L28,92 L31.5,90 L35,92 L33.5,86.5 Z" fill="${hair}"/>`);
  if (s.hair === 'ice') p.push(braid([[65, 56, 5.6], [66.5, 64, 5.4], [67.5, 72, 5.2], [68, 80, 5], [68, 88, 4.6]], hair, hairDk) + `<path d="M64,93 L62,99 L68,96 L73,99 L71,93 Z" fill="${hair}"/>` + `<circle cx="61" cy="70" r=".9" fill="#ffffff" opacity=".9"/><circle cx="72" cy="84" r=".9" fill="#ffffff" opacity=".9"/>`);

  // ---- ears + earrings ----
  p.push(`<ellipse cx="30" cy="51" rx="4.5" ry="5.5" fill="${skinDk}"/><ellipse cx="70" cy="51" rx="4.5" ry="5.5" fill="${skinDk}"/>`);
  if (has('std')) p.push(`<circle cx="29.5" cy="57" r="1.8" fill="#f2c94c"/><circle cx="70.5" cy="57" r="1.8" fill="#f2c94c"/>`);
  if (has('hop')) p.push(`<circle cx="29.5" cy="59.5" r="3" fill="none" stroke="#f2c94c" stroke-width="1.4"/><circle cx="70.5" cy="59.5" r="3" fill="none" stroke="#f2c94c" stroke-width="1.4"/>`);

  // ---- face ----
  p.push(`<ellipse cx="50" cy="47" rx="20" ry="22" fill="${skin}"/>`);
  p.push(`<circle cx="38" cy="57" r="3.6" fill="#f08a7e" opacity=".38"/><circle cx="62" cy="57" r="3.6" fill="#f08a7e" opacity=".38"/>`);
  if (has('frk')) p.push(`<g fill="${shade(skin, -0.35)}" opacity=".7"><circle cx="36" cy="54.5" r=".7"/><circle cx="39" cy="55.6" r=".7"/><circle cx="37.3" cy="57.3" r=".7"/><circle cx="64" cy="54.5" r=".7"/><circle cx="61" cy="55.6" r=".7"/><circle cx="62.7" cy="57.3" r=".7"/></g>`);
  [42, 58].forEach(x => {
    p.push(`<ellipse cx="${x}" cy="50" rx="3" ry="3.4" fill="#ffffff"/><circle cx="${x}" cy="50.4" r="2.4" fill="${iris}"/><circle cx="${x}" cy="50.6" r="1.25" fill="#1d1612"/><circle cx="${x + 0.8}" cy="49.4" r=".7" fill="#ffffff"/>`);
  });
  if (s.sex === 'g') p.push(`<path d="M38.6,47.4 L37.2,46.2 M45.4,47.4 L46.8,46.2 M54.6,47.4 L53.2,46.2 M61.4,47.4 L62.8,46.2" stroke="#1d1612" stroke-width=".8" stroke-linecap="round"/>`);
  if (s.hair !== 'bob') p.push(`<path d="M38.5,44.2 Q42,42.6 45.5,44 M54.5,44 Q58,42.6 61.5,44.2" stroke="${hairDk}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  p.push(`<path d="M49,53.5 Q50,55.6 51,53.5" stroke="${shade(skin, -0.3)}" stroke-width="1" fill="none" stroke-linecap="round"/>`);
  if (!has('tpt')) p.push(`<path d="M45,59.5 Q50,64 55,59.5" stroke="#9c3b32" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);

  // ---- front hair ----
  if (s.hair === 'mhk') p.push(`<path d="${HAIR_FRONT.buz}" fill="${hair}" opacity=".45"/>`);
  p.push(`<path d="${HAIR_FRONT[s.hair]}" fill="${hair}"/>`);
  if (s.hair === 'bcr') p.push(circles([[31, 41, 5], [33, 33, 5.5], [39, 27, 5.8], [46, 23.5, 5.8], [54, 23.5, 5.8], [61, 27, 5.8], [67, 33, 5.5], [69, 41, 5]], hair) + circles([[36, 31, 1.6], [50, 24, 1.6], [64, 31, 1.6]], hairLt));
  if (s.hair === 'cur') p.push(circles([[32, 38, 5.5], [37, 30, 6], [45, 25, 6], [55, 25, 6], [63, 30, 6], [68, 38, 5.5]], hair) + circles([[40, 29, 1.6], [56, 25, 1.6], [66, 36, 1.4]], hairLt));
  if (s.hair === 'ice') p.push(`<path d="M37,34 C43,27 54,25 63,30" stroke="${hairLt}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>`);
  if (s.streak && s.hair !== 'mhk') {
    const sp = ['lng', 'shd', 'bob'].includes(s.hair) ? STREAK_PATHS.long : STREAK_PATHS.default;
    // Clipped to the hair itself so a streak can never land on the face or the background.
    const shapes = [HAIR_FRONT[s.hair], HAIR_BACK[s.hair]].filter(Boolean).map(d => `<path d="${d}"/>`).join('')
      + (s.hair === 'bcr' || s.hair === 'cur' ? `<path d="${CAP}"/>` : '');
    p.push(`<clipPath id="${uid}h">${shapes}</clipPath><path d="${sp}" clip-path="url(#${uid}h)" stroke="${s.streak}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".95"/>`);
  }
  if (s.streak && s.hair === 'mhk') p.push(`<path d="M47,14 L48,27 M53,14 L52,27" stroke="${s.streak}" stroke-width="2.2" stroke-linecap="round"/>`);

  // ---- glasses ----
  if (has('glr')) p.push(`<g fill="none" stroke="#2a2a33" stroke-width="1.3"><circle cx="42" cy="50" r="5"/><circle cx="58" cy="50" r="5"/><path d="M47,49.5 Q50,48 53,49.5 M37,49 L31,47.5 M63,49 L69,47.5"/></g>`);
  if (has('gls')) p.push(`<g fill="none" stroke="#2a2a33" stroke-width="1.3"><rect x="36.5" y="45.8" width="11" height="8.4" rx="2"/><rect x="52.5" y="45.8" width="11" height="8.4" rx="2"/><path d="M47.5,49 L52.5,49 M36.5,48.5 L31,47.5 M63.5,48.5 L69,47.5"/></g>`);
  if (has('sun')) p.push(`<g><rect x="35.5" y="45.5" width="12.5" height="8.5" rx="3" fill="#1f2128"/><rect x="52" y="45.5" width="12.5" height="8.5" rx="3" fill="#1f2128"/><path d="M48,48.6 L52,48.6 M35.5,48 L31,47 M64.5,48 L69,47" stroke="#1f2128" stroke-width="1.4"/><path d="M38,47.5 L41,47.5 M54.5,47.5 L57.5,47.5" stroke="#ffffff" stroke-width="1" opacity=".55" stroke-linecap="round"/></g>`);

  // ---- head wear ----
  if (has('cap')) p.push(`<path d="M28.5,40 C28.5,23 39,17 50,17 C61,17 71.5,23 71.5,40 Z" fill="#d6453d"/><path d="M50,37.5 C61,35 73,36 82,40.5 C73,43.5 61,42.6 50,41.8 Z" fill="#b5372f"/><circle cx="50" cy="18.5" r="1.8" fill="#b5372f"/>`);
  if (has('bnt')) p.push(`<path d="M27.5,41 C27.5,21 39,14 50,14 C61,14 72.5,21 72.5,41 Z" fill="#2f9e9a"/><rect x="26.5" y="35.5" width="47" height="7.5" rx="3.5" fill="#25807c"/><circle cx="50" cy="12.5" r="4.5" fill="#f4f1e8"/>`);
  if (has('crn')) p.push(`<path d="M34,31 L35.5,16 L43,24 L50,12.5 L57,24 L64.5,16 L66,31 Z" fill="#f2c94c" stroke="#d9a929" stroke-width=".8"/><circle cx="50" cy="25" r="2" fill="#e8577e"/><circle cx="41" cy="27" r="1.4" fill="#3d7fc4"/><circle cx="59" cy="27" r="1.4" fill="#3f8a52"/>`);
  if (has('tia')) p.push(`<path d="M36,30 C42,26 58,26 64,30 L61,24 L57,26.5 L53.5,21 L50,16 L46.5,21 L43,26.5 L39,24 Z" fill="#e3e8f2" stroke="#b7c0d3" stroke-width=".7"/><path d="M50,17.5 L52.2,21.5 L50,25 L47.8,21.5 Z" fill="#ff5fa2"/><circle cx="42" cy="26.4" r="1" fill="#8fd3ff"/><circle cx="58" cy="26.4" r="1" fill="#8fd3ff"/>`);
  if (has('hbd')) p.push(`<path d="M29.5,40 C31,26 40,21.5 50,21.5 C60,21.5 69,26 70.5,40" fill="none" stroke="#e8577e" stroke-width="3.6" stroke-linecap="round"/>`);
  if (has('hph')) p.push(`<path d="M27.5,48 C27,25 39,17 50,17 C61,17 73,25 72.5,48" fill="none" stroke="#3a3d48" stroke-width="3.4" stroke-linecap="round"/><rect x="22.5" y="43" width="9" height="15" rx="4" fill="#3a3d48"/><rect x="68.5" y="43" width="9" height="15" rx="4" fill="#3a3d48"/><rect x="24.5" y="46" width="5" height="9" rx="2.5" fill="#e8577e"/><rect x="70.5" y="46" width="5" height="9" rx="2.5" fill="#e8577e"/>`);
  if (has('bow')) p.push(`<g transform="translate(65 26) rotate(18)"><path d="M0,0 L-8,-5 L-8,5 Z M0,0 L8,-5 L8,5 Z" fill="#e8577e"/><circle r="2.3" fill="#c93f66"/></g>`);
  if (has('flw')) p.push(`<g transform="translate(66 28)" fill="#f6a5c0">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(3.4 * Math.cos(a * Math.PI / 180)).toFixed(2)}" cy="${(3.4 * Math.sin(a * Math.PI / 180)).toFixed(2)}" r="2.7"/>`).join('')}<circle r="2" fill="#f2c94c"/></g>`);

  // ---- things held in hand ----
  if (has('wnd')) p.push(`<path d="M66,88 L80,58" stroke="#5b3a8c" stroke-width="2.4" stroke-linecap="round"/><path d="M80.5,49 L82.6,54.4 L88.4,54.6 L83.8,58.2 L85.4,63.8 L80.5,60.5 L75.6,63.8 L77.2,58.2 L72.6,54.6 L78.4,54.4 Z" fill="#ffd65a" stroke="#f2b632" stroke-width=".6"/><circle cx="72" cy="50" r=".9" fill="#ffffff"/><circle cx="88" cy="48" r="1.1" fill="#ffd65a"/><circle cx="86" cy="66" r=".8" fill="#ffffff"/>` + `<ellipse cx="65" cy="88" rx="5" ry="4.4" fill="${skin}"/><path d="M61.5,86 L68.5,86" stroke="${skinDk}" stroke-width=".8" stroke-linecap="round"/>`);
  if (has('tpt')) p.push(`<g><path d="M53,61.4 L75,61.4 L75,64.6 L53,64.6 Z" fill="#e7b43c"/><path d="M73,58.5 C78,57.8 81.5,56 85,53.5 L85,72.5 C81.5,70 78,68.2 73,67.5 Z" fill="#f2c94c"/><ellipse cx="85" cy="63" rx="2" ry="9.5" fill="#d39b26"/><rect x="58.5" y="56.5" width="2.2" height="5.5" rx="1" fill="#d39b26"/><rect x="62.5" y="56.5" width="2.2" height="5.5" rx="1" fill="#d39b26"/><rect x="66.5" y="56.5" width="2.2" height="5.5" rx="1" fill="#d39b26"/><circle cx="52.8" cy="63" r="2.2" fill="#d39b26"/><path d="M55,62.2 L73,62.2" stroke="#fff3c4" stroke-width=".8" opacity=".8"/></g>` + `<ellipse cx="63" cy="67.8" rx="5" ry="4" fill="${skin}"/><path d="M59.6,66.4 L66.4,66.4" stroke="${skinDk}" stroke-width=".8" stroke-linecap="round"/>`);

  p.push('</g></g>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Avatar">${p.join('')}</svg>`;
}

export function avatarFor(kid, size = 96, extra = {}) {
  const spec = kid && parse(kid.avatar);
  if (!spec) return null;
  return avatarSvg(spec, { size, bg: extra.bg === undefined ? null : extra.bg, shirt: kid.color || '#f1ead8', id: extra.id || ('av' + (kid.id || '').replace(/[^a-z0-9]/gi, '') + size) });
}
