import type React from 'react';
import { DOMAINS, HERO_STATS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 04 — About. One statement, three short factual paragraphs, four numbers,
   then the four areas of work as an index. Everything here is a shipped
   result or a current role — no roadmap, no aspirations. */
export default function About() {
  return (
    <section id="about" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(14,143,176,.14)', '--t2': 'rgba(37,99,235,.12)' } as React.CSSProperties}>
      <SectionHead label="About" />

      <p
        data-reveal
        className="t-statement max-w-[24ch]"
      >
        I work on software that <span className="serif text-p">senses</span>,{' '}
        <span className="serif text-a">models</span> and acts in the real world.
      </p>

      <div data-reveal className="mt-10 grid max-w-[1100px] t-body gap-6 md:grid-cols-3">
        <p>
          2.5 years of industry work in India: REST APIs for a payments platform processing about 2,000
          transactions a day (Electrum), then Azure data pipelines for clinical software, where retrieval
          became about 30% faster (Altera Digital Health).
        </p>
        <p>
          Since 2024, based in Germany. Graduate AI coursework at OTH Amberg-Weiden (45 ECTS, GPA 2.0) —
          the tabletop-factory twin, the Webots SLAM robot and the diffusion work on this site are outputs
          of that programme. Teaching assistant for a Master's data-analysis module with 30 students.
        </p>
        <p>
          Now M.Sc. Computer Engineering at Paderborn University, focused on robotics and embedded systems:
          state estimation, perception, planning and control, verified in simulation before hardware.
        </p>
      </div>

      <div className="mt-[clamp(28px,5vh,52px)] grid grid-cols-2 gap-3 md:grid-cols-4">
        {HERO_STATS.map((s, i) => (
          <div key={s.label} data-reveal={i * 0.06} className="lg-panel p-5 md:p-6">
            <p className="text-[clamp(30px,3.6vw,52px)] font-medium tracking-[-.04em]">{s.value}</p>
            <p className="mt-2 text-[13px] text-fg2">{s.label}</p>
          </div>
        ))}
      </div>

      <ol className="content-list mt-[clamp(28px,5vh,52px)] border-t border-[color:var(--line)]">
        {DOMAINS.map((d) => (
          <li
            key={d.no}
            data-reveal
            className="grid gap-3 border-b border-[color:var(--line)] py-7 md:grid-cols-[80px_1fr_1.3fr] md:gap-8"
          >
            <span className="mono pt-2 text-fg3">{d.no}</span>
            <h3 className="text-[clamp(22px,2.4vw,34px)] font-medium tracking-[-.03em]">{d.title}</h3>
            <div>
              <p className="t-body">{d.claim}</p>
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
