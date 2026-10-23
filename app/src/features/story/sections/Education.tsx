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
      <SectionHead no="06" label="Education" aside={`${EDUCATION.length} degrees`} />

      <h2
        data-reveal
        className="mb-[clamp(40px,6vh,72px)] max-w-[18ch] t-h2"
      >
        Study, <span className="serif text-a">project-led.</span>
      </h2>
      <p data-reveal className="content-glass -mt-[clamp(16px,3vh,40px)] mb-[clamp(24px,4vh,40px)] t-lead">
        Computer Engineering in Paderborn now; AI coursework in Amberg before that; two degrees in India before
        that. Most of the projects on this site started as coursework.
      </p>

      <ol className="content-glass content-list border-t border-[color:var(--line)]">
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

      <div data-reveal className="content-glass mt-6">
        <p className="mono !text-[10.5px] text-fg3">Languages</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {LANGUAGES.map((l) => (
            <li key={l.name} className="flex items-baseline justify-between gap-4 text-[14px]">
              <span className="font-medium">{l.name}</span>
              <span className="text-right text-[13px] text-fg2">{l.level}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
