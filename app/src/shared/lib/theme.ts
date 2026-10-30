import { create } from 'zustand';
import { applyPalette, storePalette } from './palettes';

/* Light / dark / editorial / liquid / slate for the whole site. Editorial is
 * a light theme (warm paper, terracotta accents), so it paints
 * data-theme light plus data-style editorial; liquid (deep blue liquid ground,
 * clear frosted glass) and slate (matte graphite, bevelled glass) carry light
 * text, so they paint data-theme dark plus their data-style — everything that
 * only asks "is it dark?" keeps working.
 *
 * html[data-theme] is set before first paint by the inline script in
 * index.html (stored choice, else the OS preference), so this module only
 * reads it. Choosing a theme also moves the older palette system — used by the
 * demos and notes — to its matching palette, so every page agrees. */

export type Theme = 'dark' | 'light' | 'editorial' | 'liquid' | 'slate';
export const THEMES: Theme[] = ['dark', 'light', 'editorial', 'liquid', 'slate'];
export const isDarkTheme = (t: Theme) => t === 'dark' || t === 'liquid' || t === 'slate';
/** Themes painted as a data-style on top of light/dark. */
const STYLED: Theme[] = ['editorial', 'liquid', 'slate'];
const KEY = 'sp-theme';

const current = (): Theme => {
  const h = document.documentElement.dataset;
  if ((STYLED as string[]).includes(h.style ?? '')) return h.style as Theme;
  return h.theme === 'dark' ? 'dark' : 'light';
};

const PALETTE_FOR = { dark: 'midnight', light: 'daylight', editorial: 'paper', liquid: 'midnight', slate: 'midnight' } as const;
const META_COLOR = { dark: '#030509', light: '#e4e9f1', editorial: '#ece5d8', liquid: '#050a2e', slate: '#56616a' } as const;

function paint(theme: Theme) {
  const html = document.documentElement;
  const dark = isDarkTheme(theme);
  html.dataset.theme = dark ? 'dark' : 'light';
  if (STYLED.includes(theme)) html.dataset.style = theme;
  else delete html.dataset.style;
  html.classList.toggle('dark', dark);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = META_COLOR[theme];
}

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'minimal') return 'dark';
    return (THEMES as string[]).includes(v ?? '') ? (v as Theme) : null;
  } catch {
    return null;
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;   // light ↔ dark
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: current(),
  setTheme: (theme) => {
    paint(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* non-fatal */ }
    const palette = PALETTE_FOR[theme];
    applyPalette(palette);
    storePalette(palette);
    set({ theme });
  },
  toggle: () => get().setTheme(isDarkTheme(get().theme) ? 'light' : 'dark'),
}));

/* Until the visitor picks one, follow the OS live (e.g. macOS auto
   appearance switching at sunset). */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (stored()) return;
  const theme: Theme = e.matches ? 'dark' : 'light';
  paint(theme);
  applyPalette(theme === 'dark' ? 'midnight' : 'daylight');
  useTheme.setState({ theme });
});
