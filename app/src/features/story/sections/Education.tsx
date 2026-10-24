import type React from 'react';
import { EDUCATION, LANGUAGES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 06 — Education. Degrees and what each one was for, then languages. Split
   out of the old "Path" chapter so experience and study each read on their
   own. */
export default function Education() {
  return (
    <section id="education" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(16,185,129,.12)', '--t2': 'rgba(59,130,246,.10)' } as React.CSSProperties}>
      <SectionHead label="Education" aside={`${EDUCATION.length} degrees`} />

      <h2
        data-reveal
        className="mb-[clamp(40px,6vh,72px)] max-w-[18ch] t-h2"
      >
        Study, <span className="serif text-a">project-led.</span>
      </h2>
      <p data-reveal className="-mt-[clamp(16px,3vh,40px)] mb-[clamp(24px,4vh,40px)] t-lead">
        Computer Engineering in Paderborn now; AI coursework in Amberg before that; two degrees in India before
        that. Most of the projects on this site started as coursework.
      </p>

      <ol className="content-list border-t border-[color:var(--line)]">
        {EDUCATION.map((e) => (
          <li
            key={e.period + e.degree}
            data-reveal
            className="group grid gap-2 border-b border-[color:var(--line)] py-6 transition-colors hover:bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] md:grid-cols-[200px_1.1fr_1fr] md:gap-8"
          >
            <span className="mono pt-1.5 text-fg3">{e.period}</span>
            <span>
              <span className="block text-[clamp(19px,1.8vw,24px)] font-medium tracking-[-.02em]">{e.degree}</span>
              <span className="mt-1 block text-[14px] text-fg2">{e.institution} · {e.location}</span>
            </span>
            <span className="text-[14px] leading-relaxed text-fg2">
              <span className="mb-1 block font-medium text-fg">{e.grade}</span>
              {e.focus}
            </span>
          </li>
        ))}
      </ol>

      <div data-reveal className="mt-12 border-t border-[color:var(--line)] pt-8">
        <p className="mono !text-[10.5px] uppercase tracking-wider text-fg3 mb-4">Languages</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LANGUAGES.map((l) => {
            const parts = l.level.split(' · ');
            const badge = parts.length > 1 ? parts[0] : l.level;
            const desc = parts.length > 1
              ? parts.slice(1).join(' · ')
              : l.name === 'Gujarati'
                ? 'Mother tongue'
                : 'Professional working';
            return (
              <div
                key={l.name}
                className="lg-panel flex flex-col justify-between p-4 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-medium text-fg">{l.name}</span>
                  <span className="rounded-full border border-[color:var(--line)] bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] px-2.5 py-0.5 mono !text-[10px] text-fg font-medium">
                    {badge}
                  </span>
                </div>
                <p className="mt-3 text-[12.5px] leading-snug text-fg2">
                  {desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
