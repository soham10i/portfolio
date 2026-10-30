import type React from 'react';
import { EXPERIENCES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 05 — Experience. What each role delivered, newest first. Education has its
   own chapter next door; the two used to share one "Path" section. */
export default function Experience() {
  return (
    <section id="experience" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(139,92,246,.14)', '--t2': 'rgba(236,72,153,.08)' } as React.CSSProperties}>
      <SectionHead label="Experience" aside={`${EXPERIENCES.length} roles`} />

      <h2
        data-reveal
        className="mb-[clamp(40px,6vh,72px)] max-w-[18ch] t-h2"
      >
        From backend services <span className="serif text-a">to physical systems.</span>
      </h2>
      <p data-reveal className="-mt-[clamp(16px,3vh,40px)] mb-[clamp(24px,4vh,40px)] t-lead">
        Three industry roles in India — healthcare data, payments, full-stack — and a teaching role in Germany. Newest first.
      </p>

      <ol className="content-list border-t border-[color:var(--line)]">
        {EXPERIENCES.map((e) => (
          <li
            key={e.period + e.role}
            data-reveal
            className="group grid gap-2 border-b border-[color:var(--line)] py-6 transition-colors hover:bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] md:grid-cols-[200px_1.1fr_1fr] md:gap-8"
          >
            <span className="mono pt-1.5 text-fg3">{e.period}</span>
            <span>
              <span className="block text-[clamp(19px,1.8vw,24px)] font-medium tracking-[-.02em]">{e.role}</span>
              <span className="mt-1 block text-[14px] text-fg2">{e.company}</span>
            </span>
            <span className="text-[14px] leading-relaxed text-fg2">
              {e.description}
              {e.highlights.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {e.highlights.map((h) => (
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
