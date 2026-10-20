import { useEffect, useRef, useState } from 'react';
import { Activity, Bot, Check, Feather, Minus, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme, type Theme } from '@/shared/lib/theme';

/* Theme menu for the site: Light, Dark, Editorial (warm paper set in
   Playfair Display) and Physical AI (a fixed stage of morphing machines
   beside the scrolling content). The button shows the current theme's icon; the menu
   opens above it in the bottom bar and below it in page headers. */

const OPTIONS: { key: Theme; label: string; note: string; icon: LucideIcon; swatch: [string, string]; font?: string }[] = [
  { key: 'minimal', label: 'Minimal', note: 'Plain, no animation · fastest', icon: Minus, swatch: ['#f6f6f4', '#2f3b4c'] },
  { key: 'light', label: 'Light', note: 'Cool glass, daylight', icon: Sun, swatch: ['#f4f6fb', '#2f5bea'] },
  { key: 'dark', label: 'Dark', note: 'Midnight, glowing scan', icon: Moon, swatch: ['#0a0f1a', '#7fb0ff'] },
  { key: 'editorial', label: 'Editorial', note: 'Warm paper, Playfair', icon: Feather, swatch: ['#f6f1e7', '#9a3b1c'], font: "'Playfair Display', serif" },
  { key: 'physical', label: 'Physical AI', note: 'Robot stage beside the text', icon: Bot, swatch: ['#0b0d10', '#ff8a3d'] },
  { key: 'hil', label: 'HIL Bench', note: 'Test-bench look · for dSPACE', icon: Activity, swatch: ['#0a1020', '#f5c542'] },
];

export default function ThemeToggle({ className = '', placement = 'up' }: { className?: string; placement?: 'up' | 'down' }) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const Current = OPTIONS.find((o) => o.key === theme)?.icon ?? Sun;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={'lg-btn !w-[34px] !px-0 justify-center ' + className}
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Theme"
      >
        <Current className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className={'lg-panel !absolute right-0 z-[80] w-[236px] !rounded-[22px] p-1.5 ' +
            (placement === 'up' ? 'bottom-[calc(100%+12px)]' : 'top-[calc(100%+12px)]')}
          style={{ background: 'color-mix(in oklab, var(--bg2) 96%, transparent)', backdropFilter: 'blur(20px) saturate(160%)', textShadow: 'none' }}
        >
          <p className="mono mx-2.5 mb-1.5 mt-2 !text-[9.5px] text-fg3">Theme</p>
          {OPTIONS.map((o) => {
            const active = o.key === theme;
            return (
              <button
                key={o.key}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => { setTheme(o.key); setOpen(false); }}
                className={'flex w-full items-center gap-3 rounded-[16px] px-2.5 py-2 text-left transition-colors ' +
                  (active ? 'bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]' : 'hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)]')}
              >
                <span
                  className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[color:var(--line)]"
                  style={{ background: o.swatch[0], color: o.swatch[1] }}
                >
                  <o.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium leading-tight text-fg" style={o.font ? { fontFamily: o.font } : undefined}>
                    {o.label}
                  </span>
                  <span className="block text-[11.5px] leading-tight text-fg3">{o.note}</span>
                </span>
                {active && <Check className="h-3.5 w-3.5 flex-none text-[color:var(--p)]" strokeWidth={2.6} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
