/* Four colour palettes from the design handoff. Every token in the table lives
   here and nowhere else — components reference them through the Tailwind names
   (bg, surf, fg2, line, p, s, a …) declared in tailwind.config.js.
   Aurora Navy is the default and matches the :root block in index.css, so the
   first paint is correct before any JS runs. */

export type PaletteKey = 'aurora' | 'amber' | 'terminal' | 'cobalt';

export interface Palette {
  name: string;
  note: string;
  bg: string; bg2: string;
  surf: string; surf2: string;
  fg: string; fg2: string; fg3: string;
  line: string;
  p: string; s: string; a: string;
}

export const PALETTES: Record<PaletteKey, Palette> = {
  aurora: {
    name: 'Aurora Navy', note: 'Refined original',
    bg: '#0a0f1e', bg2: '#0d1830', surf: 'rgba(20,27,46,.60)', surf2: 'rgba(255,255,255,.05)',
    fg: '#e2e8f0', fg2: '#94a3b8', fg3: '#64748b', line: 'rgba(255,255,255,.11)',
    p: '#5ea2ff', s: '#b18cff', a: '#22d3ee',
  },
  amber: {
    name: 'Graphite & Amber', note: 'Industrial control room',
    bg: '#121110', bg2: '#1c1917', surf: 'rgba(32,29,26,.62)', surf2: 'rgba(255,255,255,.05)',
    fg: '#f2ede5', fg2: '#a8a29e', fg3: '#7b736c', line: 'rgba(255,220,170,.13)',
    p: '#f5a623', s: '#ff7a45', a: '#ffd166',
  },
  terminal: {
    name: 'Terminal Green', note: 'Engineering / CLI',
    bg: '#050e0a', bg2: '#08170f', surf: 'rgba(13,30,20,.62)', surf2: 'rgba(140,255,190,.06)',
    fg: '#dcf5e6', fg2: '#86b39a', fg3: '#5c8a72', line: 'rgba(120,255,180,.14)',
    p: '#4ade80', s: '#22d3ee', a: '#a3e635',
  },
  cobalt: {
    name: 'Cobalt & Magenta', note: 'High-contrast tech',
    bg: '#070919', bg2: '#0d1030', surf: 'rgba(20,22,50,.62)', surf2: 'rgba(255,255,255,.055)',
    fg: '#e9ebff', fg2: '#9ba0c9', fg3: '#6d72a2', line: 'rgba(180,190,255,.13)',
    p: '#3b6eff', s: '#ff3ba7', a: '#00e5ff',
  },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];
export const DEFAULT_PALETTE: PaletteKey = 'aurora';
const STORAGE_KEY = 'sp-palette';

export function applyPalette(key: PaletteKey) {
  const t = PALETTES[key];
  if (!t) return;
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--bg2', t.bg2);
  r.setProperty('--surf', t.surf);
  r.setProperty('--surf2', t.surf2);
  r.setProperty('--fg', t.fg);
  r.setProperty('--fg2', t.fg2);
  r.setProperty('--fg3', t.fg3);
  r.setProperty('--line', t.line);
  r.setProperty('--p', t.p);
  r.setProperty('--s', t.s);
  r.setProperty('--a', t.a);
  document.body.style.background = t.bg;
}

export function readStoredPalette(): PaletteKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v in PALETTES) return v as PaletteKey;
  } catch {
    /* private mode / blocked storage — fall through to the default */
  }
  return DEFAULT_PALETTE;
}

export function storePalette(key: PaletteKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* not worth failing a theme switch over */
  }
}
