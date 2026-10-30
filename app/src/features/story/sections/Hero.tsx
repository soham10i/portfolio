import type React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import JarvisOrb from '@/features/chat/components/JarvisOrb';

/* 01 — Intro. Centered, read top to bottom the way a first-time visitor
   scans: where Soham is now, who, what, two plain sentences, the two ways in,
   then the two strongest measured results, each opening its project. */

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
      className="panel relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-[var(--gutter)] pb-24 pt-[clamp(92px,13vh,132px)] text-center sm:pb-28"
      style={{ '--t1': 'rgba(37,99,235,.20)', '--t2': 'rgba(14,143,176,.16)' } as React.CSSProperties}
    >
      <div className="relative flex w-full max-w-[880px] flex-col items-center">
        <p data-reveal className="lg-pill mono mb-7 flex items-center gap-2 px-3.5 py-1.5 !text-[10.5px] text-fg2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" aria-hidden />
          Available now · <span className="max-sm:hidden">M.Sc. Computer Engineering,</span> Paderborn
        </p>

        <h1 data-reveal="0.1" className="t-display">
          <span className="block text-fg">Soham Patel</span>
          <span className="mt-3 block text-[clamp(26px,3.4vw,48px)] font-normal leading-[1.15] text-fg2">
            Software engineer for{' '}<span className="serif whitespace-nowrap text-[color:var(--p)]">robotics & simulation.</span>
          </span>
        </h1>

        <p data-reveal="0.18" className="t-lead mx-auto mt-7 max-w-[56ch]">
          I spent 2.5 years building backend and data systems for healthcare and payments.
          Now I build the software side of physical systems: factory twins checked against their PLC code,
          robots that map mazes, and vision that runs on your device.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href="#work" data-reveal="0.24" className="lg-pill flex h-14 items-center gap-3 pl-5 pr-2 text-[14px]">
            Explore the work
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--on-fg)]">
              <ArrowDown className="h-4 w-4" />
            </span>
          </a>
          <button
            type="button"
            data-reveal="0.28"
            onClick={() => window.dispatchEvent(new Event('jarvis:open'))}
            className="glass-ai-btn !h-14 !px-5 text-[14px]"
            aria-label="Ask Nexus about my work"
          >
            <div className="glass-ai-orb-wrap">
              <JarvisOrb size={26} />
            </div>
            <span>Ask Nexus about my work</span>
          </button>
        </div>

        <div data-reveal="0.34" className="mt-[clamp(40px,7vh,72px)] w-full max-w-[760px]">
          <p className="mono mb-3 !text-[10px] text-fg3">Measured, not claimed</p>
          <ul className="grid grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
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
        </div>
      </div>
    </section>
  );
}
