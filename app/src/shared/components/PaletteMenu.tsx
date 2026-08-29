import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { PALETTES, PALETTE_KEYS, type PaletteKey } from '@/shared/lib/palettes';

/* The theme picker, extracted so every page can carry it.
 *
 * It used to live inside SiteHeader, which meant the notes pages — the ones
 * people actually sit and read for fifteen minutes — were the only place you
 * could not change the theme. */

interface Props {
  palette: PaletteKey;
  onPalette: (k: PaletteKey) => void;
  /** `compact` drops the word "Theme" and shows only the three colour dots. */
  compact?: boolean;
  align?: 'left' | 'right';
}

export default function PaletteMenu({ palette, onPalette, compact = false, align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className={'flex h-[32px] items-center gap-2 rounded-full border border-line bg-surf2 text-[12.5px] font-medium text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--p)_14%,transparent)] ' +
          (compact ? 'px-2.5' : 'px-3')}
      >
        <span className="flex gap-[3px]">
          <span className="h-[9px] w-[9px] rounded-full bg-p" />
          <span className="h-[9px] w-[9px] rounded-full bg-s" />
          <span className="h-[9px] w-[9px] rounded-full bg-a" />
        </span>
        {!compact && 'Theme'}
      </button>

      {open && (
        <div
          role="menu"
          className={'absolute top-[42px] z-[70] w-[264px] rounded-2xl border border-line p-2 ' +
            (align === 'right' ? 'right-0' : 'left-0')}
          style={{
            background: 'var(--bg)',
            boxShadow: '0 24px 48px -12px color-mix(in oklab, var(--fg) 26%, transparent)',
          }}
        >
          <p className="mx-2 mb-2 mt-1.5 font-mono text-[10px] uppercase leading-none tracking-[.18em] text-fg3">
            Colour theme
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
                onClick={() => { onPalette(k); setOpen(false); }}
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
  );
}
