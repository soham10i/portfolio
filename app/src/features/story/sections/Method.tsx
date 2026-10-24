import type React from 'react';
import SectionHead from '../components/SectionHead';

const STEPS = [
  {
    no: '01', title: 'Model',
    text: 'Start from the source of truth — the PLC step tables, the datasheet, the schema — not from a screenshot of the system.',
    proof: 'STF twin: geometry on the real 15 mm grid, I/O from the Belegungsplan',
  },
  {
    no: '02', title: 'Simulate',
    text: 'Make it run before making it look good. A model is useful once it predicts something you can check.',
    proof: 'MuJoCo cell: 56/56 checks, 1.2 mm RMS prediction',
  },
  {
    no: '03', title: 'Deploy',
    text: 'Containers, CI that blocks a bad build, and compute placed where privacy and latency need it.',
    proof: 'SceneLab: detection in the visitor’s browser, captions server-side',
  },
  {
    no: '04', title: 'Measure',
    text: 'Report the number, including when it is bad, and say what it does not cover.',
    proof: 'Brain-MRI UAD: DICE 0.076, reported as a weak baseline',
  },
];

/* 06 — Method. Four steps, each with an example from the projects. */
export default function Method() {
  return (
    <section id="method" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(16,185,129,.13)', '--t2': 'rgba(14,143,176,.12)' } as React.CSSProperties}>
      <SectionHead label="Method" />

      <h2
        data-reveal
        className="mb-[clamp(40px,6vh,72px)] max-w-[16ch] t-h2"
      >
        How I <span className="serif text-p">work.</span>
      </h2>

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.no} data-reveal={i * 0.08} className="lg-panel flex min-h-[340px] flex-col justify-between p-6">
            <div>
              <p className="mono text-fg3">{s.no}</p>
              <h3 className="mt-6 text-[clamp(34px,3vw,46px)] font-medium tracking-[-.04em]">{s.title}</h3>
              <p className="t-body mt-4">{s.text}</p>
            </div>
            <p className="mt-8 border-t border-[color:var(--line)] pt-4 text-[13px] leading-relaxed text-fg">
              <span className="serif mr-1 text-a">e.g.</span> {s.proof}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
