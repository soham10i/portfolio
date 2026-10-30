import type React from 'react';
import { DOMAINS, HERO_STATS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* 02 — About. The story in three short paragraphs, where it is going, four
   numbers, then the four areas of work as an index. */
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
          I started in backend development. As an intern I built an expense-sharing app. At Electrum I wrote
          payment APIs, and at Altera I built Azure data pipelines for clinical software.
        </p>
        <p>
          That work recorded what happened in the world; I wanted to write software that acts in it. So in 2024
          I moved to Germany to study AI at OTH Amberg-Weiden, and my projects moved to physical systems: a
          factory cell simulated from its PLC code, a robot that maps mazes with LIDAR, indoor tracking with
          BLE beacons.
        </p>
        <p>
          Now I study Computer Engineering at Paderborn University, focused on robotics: state estimation,
          perception, planning and control, tested in simulation before they run on hardware.
        </p>
      </div>

      <div data-reveal className="lg-panel mt-10 max-w-[760px] p-6 md:p-8">
        <p className="mono !text-[10.5px] tracking-[.14em] uppercase text-fg3">Where I'm headed</p>
        <p className="t-lead mt-3">
          Robots that work outside the lab need software you can trust before it touches hardware: estimators
          that report their own error, perception that runs on the device, and simulations checked against the
          real machine. That is the work I want to do next, in a team that ships robots or industrial systems.
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

      <ol className="content-list mt-[8vh] border-t border-[color:var(--line)]">
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
