import type React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Github } from 'lucide-react';
import { PROJECTS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';
import LiveShot from '../components/LiveShot';

const DEMOS = [
  { to: '/scene', title: 'SceneLab', note: 'YOLOv8 in your browser — frames never leave the device' },
  { to: '/medqa', title: 'MedQA', note: 'Retrieval-augmented answers, checked by an NLI verifier' },
  { to: '/robot', title: 'SLAM robot', note: 'LIDAR mapping and A* planning, in the browser' },
];

/* 03 — Lab. The STF twin gets the stage: a screenshot of its live Cloud Run
   deployment, framed as a browser window that opens the real thing, with the
   code on GitHub. Then the in-site demos. */
export default function Lab() {
  const twin = PROJECTS.find((p) => p.id === 'digital-twin')!;

  return (
    <section id="lab" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(14,165,233,.16)', '--t2': 'rgba(99,102,241,.12)' } as React.CSSProperties}>
      <SectionHead label="Live lab" aside="Running, not recorded" />

      <h2
        data-reveal
        className="mx-auto mb-[clamp(24px,4vh,44px)] max-w-[20ch] text-center t-h2"
      >
        A factory cell, <span className="serif text-p">simulated</span> from its PLC code.
      </h2>

      <div data-reveal className="measure">
        <LiveShot project={twin} />
      </div>

      <article data-reveal className="measure lg-panel mt-3 grid gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:p-8">
        <div>
          <p className="mono mb-3 text-fg3">Featured · {twin.timeline}</p>
          <p className="t-body max-w-[60ch]">
            The twin models all four stations of the fischertechnik 536634 training factory from its PLC programs
            and datasheets, and is checked against them. It runs on Google Cloud Run, so you can start a production
            cycle yourself.
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {twin.tech?.map((t) => (
              <li key={t} className="rounded-full border border-[color:var(--line)] px-3 py-1 text-[12px] text-fg2">{t}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 md:items-end">
          <p className="text-[clamp(20px,1.8vw,26px)] font-medium tracking-[-.02em] md:text-right">{twin.impact}</p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/project/${twin.id}`} className="lg-pill inline-flex h-11 items-center gap-2 px-5 text-[14px]">
              Case study <ArrowUpRight className="h-4 w-4" />
            </Link>
            {twin.githubUrl && (
              <a href={twin.githubUrl} target="_blank" rel="noopener noreferrer" className="btn-ink !h-11">
                <Github className="h-4 w-4" /> Code on GitHub
              </a>
            )}
          </div>
        </div>
      </article>

      <ul className="measure mt-3 grid gap-3 md:grid-cols-3">
        {DEMOS.map((d, i) => (
          <li key={d.to} data-reveal={i * 0.08}>
            <Link to={d.to} className="lg-panel group flex h-full items-start justify-between gap-4 p-6">
              <span>
                <span className="block text-[20px] font-medium tracking-[-.02em]">{d.title}</span>
                <span className="mt-2 block text-[14px] leading-relaxed text-fg2">{d.note}</span>
              </span>
              <ArrowUpRight className="h-5 w-5 flex-none text-fg2 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
