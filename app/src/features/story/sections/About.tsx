import type React from 'react';
import { DOMAINS, HERO_STATS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 02 — About. One large statement, the four proof numbers as glass tiles,
   then the four domains as an index. */
export default function About() {
  return (
    <section id="about" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(14,143,176,.14)', '--t2': 'rgba(37,99,235,.12)' } as React.CSSProperties}>
      <SectionHead no="02" label="About" />

      <p
        data-reveal
        className="max-w-[24ch] text-[clamp(32px,5.4vw,84px)] font-medium leading-[1.02] tracking-[-.04em]"
      >
        I build software that has to work on a <span className="serif text-p">factory floor</span>,
        in a <span className="serif text-a">camera feed</span>, and in production.
      </p>

      <div className="mt-[10vh] grid grid-cols-2 gap-3 md:grid-cols-4">
        {HERO_STATS.map((s, i) => (
          <div key={s.label} data-reveal={i * 0.06} className="lg-panel p-5 md:p-6">
            <p className="text-[clamp(30px,3.6vw,52px)] font-medium tracking-[-.04em]">{s.value}</p>
            <p className="mt-2 text-[13px] text-fg2">{s.label}</p>
          </div>
        ))}
      </div>

      <ol className="mt-[12vh] border-t border-[color:var(--line)]">
        {DOMAINS.map((d) => (
          <li
            key={d.no}
            data-reveal
            className="grid gap-3 border-b border-[color:var(--line)] py-7 md:grid-cols-[80px_1fr_1.3fr] md:gap-8"
          >
            <span className="mono pt-2 text-fg3">{d.no}</span>
            <h3 className="text-[clamp(22px,2.4vw,34px)] font-medium tracking-[-.03em]">{d.title}</h3>
            <div>
              <p className="text-[15px] leading-relaxed text-fg2">{d.claim}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {d.items.map((it) => (
                  <li key={it} className="lg-pill px-3 py-1 text-[12px] text-fg2">{it}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
