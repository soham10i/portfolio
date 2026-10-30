import type React from 'react';
import { DOMAINS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 02 — About. Directly under the intro: a two-sentence summary, the three
   stages of the background as short cards (when, where, what was done), then
   the four areas of work as an index. Plain facts only; every figure here is
   also in the Experience or Education data. */

const STAGES = [
  {
    when: '2021 – 2024',
    where: 'India · industry',
    title: 'Backend and data engineering',
    body:
      'REST APIs in FastAPI and Django for a payments platform handling about 2,000 transactions a day. ' +
      'Azure ETL pipelines for clinical audit-log data, with retrieval about 30% faster. ' +
      'Before that, a full-stack internship (Angular, ASP.NET Core).',
  },
  {
    when: 'Oct 2024 – Aug 2026',
    where: 'OTH Amberg-Weiden',
    title: 'Graduate study in applied AI',
    body:
      'Deep learning and advanced learning algorithms, computer vision, generative and diffusion models, ' +
      'digital twins and embedded intelligence. Presented Cor2Vox (3D shape-to-image diffusion) at the ' +
      'AI Conference 2025. Teaching assistant for a Master’s data-analysis module.',
  },
  {
    when: 'Now',
    where: 'Paderborn University',
    title: 'M.Sc. Computer Engineering',
    body:
      'Robotics and embedded systems: state estimation, perception, planning and control, ' +
      'tested in simulation before hardware; AI hardware for inference and chip design.',
  },
];

export default function About() {
  return (
    <section id="about" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(14,143,176,.14)', '--t2': 'rgba(37,99,235,.12)' } as React.CSSProperties}>
      <SectionHead label="About" aside="2.5 years in industry" />

      <h2 data-reveal className="mx-auto mb-3 max-w-[20ch] text-center t-h2">
        From backend systems to <span className="serif text-p">robotics software.</span>
      </h2>
      <p data-reveal className="mx-auto max-w-[62ch] text-center t-lead">
        I write and test software for systems that sense and act: state estimation, perception and
        simulation. Before that, I built backend services and data pipelines for payments and healthcare.
      </p>

      <ol className="mx-auto mt-[clamp(28px,5vh,48px)] grid max-w-[760px] gap-3 xl:max-w-[1180px] xl:grid-cols-3">
        {STAGES.map((s, i) => (
          <li key={s.title} data-reveal={i * 0.06} className="lg-panel flex flex-col p-5 md:p-6">
            <p className="mono flex flex-wrap items-center gap-x-2 !text-[10px] text-fg3">
              <span>{s.when}</span>
              <span aria-hidden>·</span>
              <span>{s.where}</span>
            </p>
            <h3 className="mt-3 text-[clamp(18px,1.5vw,21px)] font-medium leading-snug tracking-[-.02em] text-fg">
              {s.title}
            </h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-fg2">{s.body}</p>
          </li>
        ))}
      </ol>

      <p data-reveal className="mono mb-1 mt-[clamp(36px,6vh,60px)] text-center !text-[10.5px] text-fg3">Areas of work</p>
      <ol className="measure content-list border-t border-[color:var(--line)]">
        {DOMAINS.map((d) => (
          <li
            key={d.no}
            data-reveal
            className="grid gap-3 border-b border-[color:var(--line)] py-6 md:grid-cols-[56px_minmax(0,1fr)_minmax(0,1.5fr)] md:gap-8"
          >
            <span className="mono pt-1.5 text-fg3">{d.no}</span>
            <h3 className="text-[clamp(20px,2vw,28px)] font-medium leading-tight tracking-[-.03em]">{d.title}</h3>
            <div>
              <p className="max-w-[64ch] text-[15px] leading-relaxed text-fg2">{d.claim}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
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
