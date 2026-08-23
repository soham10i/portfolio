import { createContext, useContext } from 'react';

/* The context, its type and the hook live here rather than beside the
   provider component: a file that exports both a component and a hook defeats
   Vite's fast refresh, same reason lib/twin.ts is split out of the viewers. */

export type Theme = 'dark' | 'light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
