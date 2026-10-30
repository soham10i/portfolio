import type React from 'react';
import { EXPERIENCES } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';
import Timeline from '../components/Timeline';

/* 03 — Experience. Four industry roles, newest first, on a shared rail so the
   timeline reads as one sequence: internship → backend → data systems →
   teaching. Each entry: what was delivered, with the number a recruiter can
   ask about. */
export default function Experience() {
  const entries = EXPERIENCES.map((e) => ({
    period: e.period,
    badge: e.type,
    title: e.role,
    place: `${e.company} · ${e.location}`,
    body: e.description,
    points: e.highlights,
    foot: e.technologies,
  }));

  return (
    <section id="experience" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(37,99,235,.13)', '--t2': 'rgba(14,143,176,.11)' } as React.CSSProperties}>
      <SectionHead label="Experience" aside={`${EXPERIENCES.length} roles`} />

      <h2 data-reveal className="mb-3 max-w-[18ch] t-h2">
        Two and a half years <span className="serif text-a">shipping software.</span>
      </h2>
      <p data-reveal className="mb-[clamp(20px,3vh,32px)] t-lead">
        Payments, healthcare data, university teaching — each role below shipped something measurable,
        newest first.
      </p>

      <Timeline entries={entries} accent="var(--p)" />
    </section>
  );
}
