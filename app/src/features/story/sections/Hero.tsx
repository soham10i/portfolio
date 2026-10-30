import type React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import JarvisOrb from '@/features/chat/components/JarvisOrb';

/* 01 — Intro. Who this is in two sentences, then the two strongest measured
   results, each opening its project. The name is in the status line and the header. */

const SPECS = [
  { id: 'digital-twin', domain: 'Digital twin', value: '56/56', note: 'PLC-derived checks passed · 1.2 mm RMS' },
  { id: 'scene', domain: 'Computer vision', value: 'On-device', note: 'YOLOv8 on ONNX Runtime Web, in your browser' },
];

export default function Hero() {
  return (
    <section
      id="hey"
      data-anchor-offset="0"
      aria-label="Introduction"
      className="panel relative flex min-h-[100svh] flex-col justify-between gap-8 overflow-hidden px-[var(--gutter)] pb-24 pt-[clamp(92px,13vh,132px)] sm:pb-28"
      style={{ '--t1': 'rgba(37,99,235,.20)', '--t2': 'rgba(14,143,176,.16)' } as React.CSSProperties}
    >

      <div className="relative flex items-start justify-between gap-6 text-[13px] leading-snug text-fg2">
        <p data-reveal className="mono !text-[11px] font-medium tracking-[.14em] uppercase text-fg3">
          Soham Patel
        </p>
        <p data-reveal="0.08" className="text-right">
          M.Sc. Computer Engineering · Paderborn
          <br />
          <span className="text-fg3">Available now</span>
        </p>
      </div>

      <div className="relative">
        <h1
          data-reveal="0.1"
          className="t-display max-w-[24ch]"
        >
          <span className="block text-fg">Soham Patel</span>
          <span className="block text-[clamp(28px,3.8vw,54px)] font-normal leading-[1.12] text-fg2 mt-2">
            Software engineer,{' '}<br className="max-sm:hidden" /><span className="serif whitespace-nowrap text-[color:var(--p)]">robotics & simulation.</span>
          </span>
        </h1>
        <p data-reveal="0.18" className="t-lead mt-7">
          I spent 2.5 years building backend and data systems in healthcare and payments. Now I build the software
          side of physical systems: factory twins checked against their PLC code, maze-mapping robots, on-device
          vision. I study Computer Engineering in Paderborn.
        </p>
      </div>

      <div className="relative flex flex-col gap-5">
        <ul data-reveal="0.26" className="grid max-w-[760px] grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SPECS.map((s) => (
            <li key={s.id}>
              <Link
                to={`/project/${s.id}`}
                className="lg-panel group flex h-full flex-col gap-1.5 p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:p-5"
              >
                <span className="flex items-center justify-between">
                  <span className="mono !text-[9.5px] text-fg3">{s.domain}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-fg3 transition-colors group-hover:text-fg" />
                </span>
                <span className="text-[clamp(24px,2.6vw,34px)] font-medium leading-none tracking-[-.03em] text-fg">{s.value}</span>
                <span className="text-[12.5px] leading-snug text-fg2">{s.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            data-reveal="0.32"
            onClick={() => window.dispatchEvent(new Event('jarvis:open'))}
            className="glass-ai-btn !h-14 !px-5 text-[14px]"
            aria-label="Ask Nexus about my work"
          >
            <div className="glass-ai-orb-wrap">
              <JarvisOrb size={26} />
            </div>
            <span>Ask Nexus about my work</span>
          </button>

          <a href="#work" data-reveal="0.35" className="lg-pill flex h-14 items-center gap-3 pl-5 pr-2 text-[14px]">
            Explore the work
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--on-fg)]">
              <ArrowDown className="h-4 w-4" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
