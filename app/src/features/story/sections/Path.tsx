import type React from 'react';
import { EDUCATION, EXPERIENCES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 05 — Path. Experience, then education, as an index. Phase 4 turns this
   into a pinned horizontal band; the list stays as the mobile layout. */
export default function Path() {
  const rows = [
    ...EXPERIENCES.map((e) => ({ when: e.period, what: e.role, where: e.company, note: e.description })),
    ...EDUCATION.map((e) => ({ when: e.period, what: e.degree, where: e.institution, note: e.grade })),
  ];

  return (
    <section id="path" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(139,92,246,.14)', '--t2': 'rgba(236,72,153,.08)' } as React.CSSProperties}>
      <SectionHead no="05" label="Path" aside={`${EXPERIENCES.length} roles · ${EDUCATION.length} degrees`} />

      <h2
        data-reveal
        className="mb-[clamp(40px,6vh,72px)] max-w-[18ch] text-[clamp(40px,7vw,112px)] font-medium leading-[.92] tracking-[-.05em]"
      >
        Healthcare, fintech, <span className="serif text-a">then factories.</span>
      </h2>

      <ol className="border-t border-[color:var(--line)]">
        {rows.map((r) => (
          <li
            key={r.when + r.what}
            data-reveal
            className="group grid gap-2 border-b border-[color:var(--line)] py-6 transition-colors hover:bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] md:grid-cols-[200px_1.1fr_1fr] md:gap-8"
          >
            <span className="mono pt-1.5 text-fg3">{r.when}</span>
            <span>
              <span className="block text-[clamp(19px,1.8vw,24px)] font-medium tracking-[-.02em]">{r.what}</span>
              <span className="mt-1 block text-[14px] text-fg2">{r.where}</span>
            </span>
            <span className="text-[14px] leading-relaxed text-fg2">{r.note}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
