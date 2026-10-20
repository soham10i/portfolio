import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/shared/lib/theme';

/* Sun/moon switch for the site theme. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className={'lg-btn !w-[34px] !px-0 justify-center ' + className}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
