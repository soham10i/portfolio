import type React from 'react';
import { EDUCATION, LANGUAGES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';
import Timeline from '../components/Timeline';

/* 05 — Education. Four degrees on the same rail visual as Experience, so a
   reader sees the two timelines as one path: India (B.Sc., M.Sc. IT) →
   Germany (graduate AI coursework, M.Sc. Computer Engineering). Newest first. */
export default function Education() {
  const entries = EDUCATION.map((e) => ({
    period: e.period,
    title: e.degree,
    place: `${e.institution} · ${e.location}`,
    lead: e.grade,
    body: e.focus,
  }));

  return (
    <section id="education" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(139,92,246,.13)', '--t2': 'rgba(16,185,129,.10)' } as React.CSSProperties}>
      <SectionHead label="Education" aside={`${EDUCATION.length} degrees`} />

      <h2 data-reveal className="mb-3 max-w-[18ch] t-h2">
        Four degrees, <span className="serif text-s">one direction.</span>
      </h2>
      <p data-reveal className="mb-[clamp(20px,3vh,32px)] t-lead">
        Computer science in India, then AI and robotics in Germany. Newest first.
      </p>

      <Timeline entries={entries} accent="var(--s)" />

      <div data-reveal className="mt-[clamp(24px,4vh,40px)]">
        <p className="mono mb-4 !text-[10.5px] uppercase tracking-wider text-fg3">Languages</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {LANGUAGES.map((l) => {
            const parts = l.level.split(' · ');
            const badge = parts.length > 1 ? parts[0] : l.level;
            const desc = parts.length > 1
              ? parts.slice(1).join(' · ')
              : l.name === 'Gujarati'
                ? 'Mother tongue'
                : 'Professional working';
            return (
              <div key={l.name} className="lg-panel flex flex-col justify-between p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] font-medium text-fg">{l.name}</span>
                  <span className="rounded-full border border-[color:var(--line)] bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] px-2.5 py-0.5 mono !text-[10px] text-fg font-medium">
                    {badge}
                  </span>
                </div>
                <p className="mt-3 text-[12.5px] leading-snug text-fg2">{desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
