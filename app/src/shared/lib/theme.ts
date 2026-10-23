import { create } from 'zustand';
import { applyPalette, storePalette } from './palettes';

/* Light / dark / editorial / minimal for the whole site. Editorial is a
 * light theme (warm paper, Playfair Display), so each styled theme paints
 * data-theme light or dark plus a data-style — everything that only asks
 * "is it dark?" keeps working.
 *
 * html[data-theme] is set before first paint by the inline script in
 * index.html (stored choice, else the OS preference), so this module only
 * reads it. Choosing a theme also moves the older palette system — used by the
 * demos and notes — to its matching palette, so every page agrees. */

export type Theme = 'light' | 'dark' | 'editorial' | 'minimal';
export const THEMES: Theme[] = ['light', 'dark', 'editorial', 'minimal'];
export const isDarkTheme = (t: Theme) => t === 'dark';
/** Themes painted as a data-style on top of light/dark. */
const STYLED: Theme[] = ['editorial', 'minimal'];
const KEY = 'sp-theme';

const current = (): Theme => {
  const h = document.documentElement.dataset;
  if ((STYLED as string[]).includes(h.style ?? '')) return h.style as Theme;
  return h.theme === 'dark' ? 'dark' : 'light';
};

const PALETTE_FOR = { light: 'daylight', dark: 'midnight', editorial: 'paper', minimal: 'daylight' } as const;
const META_COLOR = { light: '#e4e9f1', dark: '#030509', editorial: '#ece5d8', minimal: '#f6f6f4' } as const;

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
