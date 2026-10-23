import type React from 'react';
import { DOMAINS, HERO_STATS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 02 — About. The story in three short paragraphs, four numbers, then the
   four areas of work as an index. */
export default function About() {
  return (
    <section id="about" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(14,143,176,.14)', '--t2': 'rgba(37,99,235,.12)' } as React.CSSProperties}>
      <SectionHead no="02" label="About" />

      <p
        data-reveal
        className="t-statement max-w-[24ch]"
      >
        I work on software that <span className="serif text-p">senses</span>,{' '}
        <span className="serif text-a">models</span> and acts in the real world.
      </p>

      <div data-reveal className="content-glass mt-10 grid max-w-[1100px] t-body gap-6 md:grid-cols-3">
        <p>
          I started in backend development. As an intern I built an expense-sharing app. At Electrum I wrote
          payment APIs, and at Altera I built Azure data pipelines for clinical software.
        </p>
        <p>
          In 2024 I moved to Germany to study AI at OTH Amberg-Weiden. There my projects moved to physical
          systems: a factory cell simulated from its PLC code, a robot that maps mazes with LIDAR, and indoor
          tracking with BLE beacons.
        </p>
        <p>
          Now I study Computer Engineering at Paderborn University, focused on robotics: state estimation,
          perception, planning and control, tested in simulation before they run on hardware.
        </p>
      </div>

      <div className="mt-[8vh] grid grid-cols-2 gap-3 md:grid-cols-4">
        {HERO_STATS.map((s, i) => (
          <div key={s.label} data-reveal={i * 0.06} className="lg-panel p-5 md:p-6">
            <p className="text-[clamp(30px,3.6vw,52px)] font-medium tracking-[-.04em]">{s.value}</p>
            <p className="mt-2 text-[13px] text-fg2">{s.label}</p>
          </div>
        ))}
      </div>

      <ol className="content-glass content-list mt-[8vh] border-t border-[color:var(--line)]">
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
