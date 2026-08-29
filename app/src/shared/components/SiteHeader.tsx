import { Github, Mail } from 'lucide-react';
import { type PaletteKey } from '@/shared/lib/palettes';
import PaletteMenu from '@/shared/components/PaletteMenu';
import { CONTACT } from '@/shared/data/portfolio';

const NAV = [
  ['Projects', '#projects'],
  ['Experience', '#experience'],
  ['Skills', '#skills'],
  ['About', '#about'],
  ['Research', '#research'],
  ['Notes', '/notes'],
  ['Contact', '#contact'],
] as const;

interface SiteHeaderProps {
  palette: PaletteKey;
  onPalette: (k: PaletteKey) => void;
}

export default function SiteHeader({ palette, onPalette }: SiteHeaderProps) {
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

        <div className="relative flex items-center gap-2.5">
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

          <PaletteMenu palette={palette} onPalette={onPalette} />
        </div>
      </div>
    </header>
  );
}
