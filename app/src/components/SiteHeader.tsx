import { useEffect, useRef, useState } from 'react';
import { Check, Github, Mail } from 'lucide-react';
import { PALETTES, PALETTE_KEYS, type PaletteKey } from '@/lib/palettes';
import { CONTACT } from '@/data/portfolio';

const NAV = [
  ['Projects', '#projects'],
  ['Experience', '#experience'],
  ['Skills', '#skills'],
  ['About', '#about'],
  ['Research', '#research'],
  ['Contact', '#contact'],
] as const;

interface SiteHeaderProps {
  palette: PaletteKey;
  onPalette: (k: PaletteKey) => void;
}

export default function SiteHeader({ palette, onPalette }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-[60] border-b border-line"
      style={{
        background: 'color-mix(in oklab,var(--bg) 72%,transparent)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      }}
    >
      <div className="mx-auto flex h-[66px] max-w-[1180px] items-center justify-between gap-5 px-[26px]">
        <a href="#hero" className="flex items-center gap-2.5 text-fg">
          <span
            className="grid h-[26px] w-[26px] place-items-center rounded-lg text-[12px] font-extrabold tracking-[-.02em] text-bg"
            style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
          >
            SP
          </span>
          <span className="whitespace-nowrap text-[14px] font-semibold tracking-[-.01em]">Soham Patel</span>
        </a>

        <nav className="hidden items-center gap-[26px] lg:flex">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="text-[13.5px] text-fg2 transition-colors hover:text-fg">
              {label}
            </a>
          ))}
        </nav>

        <div className="relative flex items-center gap-2.5" ref={menuRef}>
          <a
            href={CONTACT.github} target="_blank" rel="noopener noreferrer" title="GitHub"
            className="grid h-8 w-8 place-items-center rounded-[9px] text-fg2 transition-colors hover:bg-surf2 hover:text-fg"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href={`mailto:${CONTACT.email}`} title="Email"
            className="grid h-8 w-8 place-items-center rounded-[9px] text-fg2 transition-colors hover:bg-surf2 hover:text-fg"
          >
            <Mail className="h-4 w-4" />
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Change theme"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-[34px] items-center gap-2 rounded-full border border-line bg-surf2 px-3 text-[12.5px] font-medium text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--p)_14%,transparent)]"
          >
            <span className="flex gap-[3px]">
              <span className="h-[9px] w-[9px] rounded-full bg-p" />
              <span className="h-[9px] w-[9px] rounded-full bg-s" />
              <span className="h-[9px] w-[9px] rounded-full bg-a" />
            </span>
            Theme
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[44px] z-[70] w-[262px] rounded-2xl border border-line p-2"
              style={{
                background: 'color-mix(in oklab,var(--bg) 86%,transparent)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 24px 48px -12px rgba(0,0,0,.55)',
              }}
            >
              <p className="mx-2 mb-2 mt-1.5 font-mono text-[10px] uppercase leading-none tracking-[.18em] text-fg3">
                Color theme
              </p>
              {PALETTE_KEYS.map((k) => {
                const t = PALETTES[k];
                const active = k === palette;
                return (
                  <button
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => { onPalette(k); setMenuOpen(false); }}
                    className="flex w-full items-center gap-[11px] rounded-[11px] border border-transparent px-2.5 py-[9px] text-left text-[13px] text-fg transition-colors hover:border-line"
                    style={{ background: active ? `color-mix(in oklab,${t.p} 15%,transparent)` : 'transparent' }}
                  >
                    <span className="flex flex-none gap-[3px]">
                      <span className="h-[22px] w-3 rounded-[4px]" style={{ background: t.p }} />
                      <span className="h-[22px] w-3 rounded-[4px]" style={{ background: t.s }} />
                      <span className="h-[22px] w-3 rounded-[4px]" style={{ background: t.a }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.name}</span>
                      <span className="block text-[11px] text-fg3">{t.note}</span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 flex-none text-p" strokeWidth={2.6} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
