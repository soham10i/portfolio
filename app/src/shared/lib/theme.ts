import { create } from 'zustand';
import { applyPalette, storePalette } from './palettes';

/* Light / dark for the whole site.
 *
 * html[data-theme] is set before first paint by the inline script in
 * index.html (stored choice, else the OS preference), so this module only
 * reads it. Choosing a theme also moves the older palette system — used by the
 * demos and notes — to its matching palette, so every page agrees. */

export type Theme = 'light' | 'dark';
const KEY = 'sp-theme';

const current = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

function paint(theme: Theme) {
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = theme === 'dark' ? '#04060a' : '#dfe5ee';
}

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: current(),
  setTheme: (theme) => {
    paint(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* non-fatal */ }
    const palette = theme === 'dark' ? 'midnight' : 'daylight';
    applyPalette(palette);
    storePalette(palette);
    set({ theme });
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
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
