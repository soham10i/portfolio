/* Three palettes: one dark UI theme, one light UI theme, one reading theme.
   Every token in the table lives here and nowhere else — components reference
   them through the Tailwind names (bg, surf, fg2, line, p, s, a …) declared in
   tailwind.config.js. Midnight Glass is the default.

   Four further palettes (Aurora Navy, Graphite & Amber, Terminal Green,
   Cobalt & Magenta) were removed on request: seven themes is a menu, not a
   choice, and the four that went were variations on a hue rather than
   distinct reading conditions. `readStoredPalette` falls back to the default
   for anyone whose browser still holds one of the removed keys. */

export type PaletteKey = 'midnight' | 'daylight' | 'paper';

export interface Palette {
  name: string;
  note: string;
  bg: string; bg2: string;
  surf: string; surf2: string;
  fg: string; fg2: string; fg3: string;
  line: string;
  p: string; s: string; a: string;
  /** Ground colour for the 3D viewers — the WebGL scenes need their own. */
  canvas: string;
  /** true when the palette is light, so components can flip shadows/scrims. */
  light?: boolean;
  /** true for the high-depth themes: deeper shadows, brighter rim, more curve. */
  depth?: boolean;
}

export const PALETTES: Record<PaletteKey, Palette> = {
  /* Deep blue, high depth. The ground is nearly black with a blue cast
     (#050912) so the glass surfaces above it have somewhere to sit; the
     primary is a cool electric blue and the accent a cyan, which is the
     colour language of instrumentation rather than of consumer UI.
     Body text reaches roughly 15:1 against the ground. */
  midnight: {
    name: 'Midnight Glass', note: 'Deep blue, maximum depth',
    bg: '#050912', bg2: '#0a1424',
    surf: 'rgba(16,28,50,.66)', surf2: 'rgba(120,170,255,.07)',
    fg: '#dce6f7', fg2: '#93a7c6', fg3: '#63769a',
    line: 'rgba(130,175,255,.15)',
    p: '#4d8dff', s: '#8b7bff', a: '#2fe0f0',
    canvas: '#03060e', depth: true,
  },
  daylight: {
    name: 'Daylight Glass', note: 'Light, frosted surfaces',
    bg: '#eef2f9', bg2: '#ffffff',
    surf: 'rgba(255,255,255,.62)', surf2: 'rgba(15,23,42,.045)',
    fg: '#16233a', fg2: '#47566e', fg3: '#7386a1',
    line: 'rgba(15,23,42,.10)',
    p: '#2563eb', s: '#7c3aed', a: '#0e7490',
    canvas: '#dfe6f2', light: true,
  },
  /* A reading theme rather than a UI theme: warm paper ground, ink-dark text,
     and a muted accent, so a long derivation is comfortable for the twenty
     minutes it takes rather than merely legible. Body text sits at about
     13.5:1 against the ground — well past AA. */
  paper: {
    name: 'Paper & Ink', note: 'Warm, for long reading',
    bg: '#f7f4ee', bg2: '#fffdf8',
    surf: 'rgba(255,253,248,.72)', surf2: 'rgba(58,46,32,.055)',
    fg: '#22201c', fg2: '#4f4a42', fg3: '#847c70',
    line: 'rgba(58,46,32,.14)',
    p: '#9a3412', s: '#7c2d5a', a: '#166534',
    canvas: '#ebe6dc', light: true,
  },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];
export const DEFAULT_PALETTE: PaletteKey = 'midnight';
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
  r.setProperty('--canvas', t.canvas);
  /* Glass depth reads completely differently on light and dark grounds, so the
     card shadows and rim highlights are tokens too, not fixed rgba. */
  if (t.light) {
    r.setProperty('--glass-shadow', '0 18px 40px -18px rgba(15,23,42,.30), 0 2px 6px -2px rgba(15,23,42,.10)');
    r.setProperty('--glass-shadow-lift', '0 30px 60px -22px rgba(15,23,42,.38), 0 4px 10px -3px rgba(15,23,42,.12)');
    r.setProperty('--glass-rim', 'rgba(255,255,255,.85)');
    r.setProperty('--glass-inner', 'rgba(255,255,255,.55)');
  } else if (t.depth) {
    /* A longer, softer throw plus a tinted ambient layer: the shadow is not
       just darker, it is coloured by the primary, which is what stops a very
       dark theme from looking like flat black rectangles on flat black. */
    r.setProperty('--glass-shadow', '0 26px 60px -26px rgba(0,0,0,.78), 0 10px 24px -12px color-mix(in oklab, var(--p) 32%, transparent), 0 2px 6px -2px rgba(0,0,0,.5)');
    r.setProperty('--glass-shadow-lift', '0 46px 96px -30px rgba(0,0,0,.88), 0 18px 44px -16px color-mix(in oklab, var(--p) 42%, transparent), 0 6px 14px -5px rgba(0,0,0,.55)');
    r.setProperty('--glass-rim', 'rgba(190,220,255,.26)');
    r.setProperty('--glass-inner', 'rgba(190,220,255,.11)');
  } else {
    r.setProperty('--glass-shadow', '0 20px 44px -22px rgba(0,0,0,.62), 0 2px 6px -2px rgba(0,0,0,.4)');
    r.setProperty('--glass-shadow-lift', '0 34px 66px -24px rgba(0,0,0,.72), 0 5px 12px -4px rgba(0,0,0,.45)');
    r.setProperty('--glass-rim', 'rgba(255,255,255,.16)');
    r.setProperty('--glass-inner', 'rgba(255,255,255,.06)');
  }
  document.documentElement.dataset.paletteLight = t.light ? '1' : '0';
  /* The key itself, so CSS can carry per-theme geometry (radii, blur) that
     custom properties alone cannot express. */
  document.documentElement.dataset.palette = key;
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
