import type React from 'react';
import { EDUCATION, EXPERIENCES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 05 — Path. Experience with what each role delivered, then education. */
export default function Path() {
  const rows = [
    ...EXPERIENCES.map((e) => ({ when: e.period, what: e.role, where: e.company, note: e.description, more: e.highlights })),
    ...EDUCATION.map((e) => ({ when: e.period, what: e.degree, where: e.institution, note: `${e.grade} · ${e.focus}`, more: [] as string[] })),
  ];

  return (
    <section id="path" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(139,92,246,.14)', '--t2': 'rgba(236,72,153,.08)' } as React.CSSProperties}>
      <SectionHead no="05" label="Path" aside={`${EXPERIENCES.length} roles · ${EDUCATION.length} degrees`} />

      <h2
        data-reveal
        className="mb-[clamp(40px,6vh,72px)] max-w-[18ch] t-h2"
      >
        From backend services <span className="serif text-a">to physical systems.</span>
      </h2>
      <p data-reveal className="content-glass -mt-[clamp(16px,3vh,40px)] mb-[clamp(24px,4vh,40px)] t-lead">
        Four industry roles in India, then study in Germany. Newest first.
      </p>

      <ol className="content-glass content-list border-t border-[color:var(--line)]">
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
            <span className="text-[14px] leading-relaxed text-fg2">
              {r.note}
              {r.more.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {r.more.map((h) => (
                    <li key={h} className="relative pl-4 text-[13.5px] before:absolute before:left-0 before:top-[.6em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--fg3)]">{h}</li>
                  ))}
                </ul>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
