import type React from 'react';
import { EXPERIENCES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';
import RoleTimeline from '../components/RoleTimeline';

/* 04 — Experience. Four industry roles, newest first, on a shared rail so the
   timeline reads as one sequence: internship → backend → data systems →
   teaching. Each role is told as a short story — the situation, what was
   built and how, what made it hard, and the number it moved. */
export default function Experience() {
  return (
    <section id="experience" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(37,99,235,.13)', '--t2': 'rgba(14,143,176,.11)' } as React.CSSProperties}>
      <SectionHead label="Experience" aside={`${EXPERIENCES.length} roles`} />

      <h2 data-reveal className="mx-auto mb-3 max-w-[18ch] text-center t-h2">
        Two and a half years <span className="serif text-a">shipping software.</span>
      </h2>
      <p data-reveal className="mx-auto mb-[clamp(20px,3vh,32px)] max-w-[64ch] text-center t-lead">
        From an intern untangling group debts with a graph algorithm, to payment APIs, to health-data
        pipelines that had to be fast and compliant at once, to teaching. Each role: the situation, what
        I built, the hard part, and the number it moved. Newest first.
      </p>

      <div className="measure">
        <RoleTimeline roles={EXPERIENCES} accent="var(--p)" />
      </div>
    </section>
  );
}
