import type React from 'react';
import { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ROLES } from '@/shared/data/portfolio';
import { useStory } from '../lib/store';

/* 01 — Hey. Oversized name with the 3D form threading through it
   (Shape of Intelligence), giant grotesk + serif italic accent (Evan).
   The WebGL layer mounts into [data-hero-stage] in Phase 1; until then the
   gradient backdrop carries the section. */
export default function Hero() {
  const motion = useStory((s) => s.motion);
  const [role, setRole] = useState(0);

  useEffect(() => {
    if (!motion) return;
    const t = setInterval(() => setRole((r) => (r + 1) % ROLES.length), 2600);
    return () => clearInterval(t);
  }, [motion]);

  return (
    <section
      id="hey"
      data-anchor-offset="0"
      aria-label="Introduction"
      className="panel relative flex min-h-[calc(100svh-var(--inset)*2)] flex-col justify-between overflow-hidden px-[var(--gutter)] pb-28 pt-[132px]"
      style={{ '--t1': 'rgba(37,99,235,.20)', '--t2': 'rgba(14,143,176,.16)' } as React.CSSProperties}
    >
      <div data-hero-stage aria-hidden className="pointer-events-none absolute inset-0" />

      <div className="relative flex items-start justify-between gap-6 text-[13px] leading-snug text-fg2">
        <p data-reveal className="max-w-[26ch]">
          M.Sc. Computer Engineering at Paderborn University. Building industrial AI, digital twins and computer vision.
        </p>
        <p data-reveal="0.08" className="text-right">
          Paderborn, Germany
          <br />
          <span className="text-fg3">Open to roles &amp; collaborations</span>
        </p>
      </div>

      <h1
        className="relative select-none font-medium leading-[.8] tracking-[-.065em]"
        style={{ fontSize: 'clamp(76px, 19.5vw, 320px)' }}
      >
        <span data-reveal="0.1" className="block">Soham</span>
        <span data-reveal="0.2" className="flex items-baseline justify-end gap-[.12em]">
          <span className="serif text-[.32em] tracking-normal text-fg2">builds with</span>
          Patel
        </span>
      </h1>

      <div className="relative flex items-end justify-between gap-6">
        <div data-reveal="0.3" className="max-w-[34ch] text-[15px] leading-relaxed text-fg2">
          <p className="mono mb-2 text-fg3">Currently</p>
          <p className="h-[1.6em] overflow-hidden text-fg">
            <span key={role} className={motion ? 'block animate-rise' : 'block'}>{ROLES[role]}</span>
          </p>
        </div>
        <a
          href="#about"
          data-reveal="0.35"
          className="lg-pill flex h-14 items-center gap-3 pl-5 pr-2 text-[14px]"
        >
          Begin the story
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--bg)]">
            <ArrowDown className="h-4 w-4" />
          </span>
        </a>
      </div>
    </section>
  );
}
