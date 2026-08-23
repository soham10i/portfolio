import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SiteBackground from '@/components/SiteBackground';
import { readStoredPalette } from '@/lib/palettes';

/* Catch-all for unknown URLs. Without it an unmatched path renders nothing at
   all, which looks identical to a broken deploy. */
export default function NotFound() {
  const palette = readStoredPalette();

  return (
    <div className="relative min-h-screen bg-bg text-fg">
      <SiteBackground paletteKey={palette} />

      <main className="relative z-[1] grid min-h-screen place-items-center px-[26px]">
        <div className="rounded-[18px] border border-line bg-surf p-10 text-center backdrop-blur-[18px] backdrop-saturate-[170%]">
          <p className="mb-3 font-mono text-[10.5px] uppercase leading-none tracking-[.24em] text-fg3">
            Error 404
          </p>
          <h1 className="text-[clamp(34px,4.4vw,56px)] font-bold leading-[1.04] tracking-[-.03em]">
            Page not found
          </h1>
          <p className="mx-auto mt-4 max-w-[42ch] text-[13.5px] leading-[1.6] text-fg2">
            That URL doesn't match anything on this site. It may have moved, or the
            link that brought you here may be out of date.
          </p>
          <Link
            to="/"
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13.5px] font-semibold text-bg transition-[filter] hover:brightness-110"
            style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
          >
            <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2} />
            Back to the portfolio
          </Link>
        </div>
      </main>
    </div>
  );
}
