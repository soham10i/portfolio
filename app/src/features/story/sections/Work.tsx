import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { PROJECTS, type Project } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';
import ProjectCover from '../components/ProjectCover';
import { useStory } from '../lib/store';
import { useTilt } from '../lib/useTilt';

const yearOf = (p: Project) => p.timeline.match(/\d{4}/g)?.at(-1) ?? p.timeline;

function WorkCard({ p, i, total, seen, onOpen }: { p: Project; i: number; total: string; seen: boolean; onOpen: () => void }) {
  const card = useRef<HTMLAnchorElement>(null);
  useTilt(card, 6);

  return (
    <div className="tilt-stage h-full">
      <Link
        ref={card}
        to={`/project/${p.id}`}
        onClick={onOpen}
        className="tilt lg-panel group relative flex h-full flex-col overflow-hidden !rounded-[26px] p-2"
      >
        <div className="cq relative">
          <ProjectCover project={p} index={i} className="aspect-[16/11] rounded-[20px]" />
          <div className="absolute inset-x-3 top-3 z-[2] flex items-center justify-between">
            <span className="mono rounded-full bg-black/35 px-2.5 py-1 !text-[9.5px] text-white backdrop-blur-md">
              {String(i + 1).padStart(2, '0')} / {total}
            </span>
            <span className="flex items-center gap-1.5">
              {p.featured && <span className="mono rounded-full bg-white px-2.5 py-1 !text-[9.5px] text-[#0d1626]">Featured</span>}
              {p.liveUrl && <span className="mono flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 !text-[9.5px] text-white backdrop-blur-md"><span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />Live</span>}
              {!p.githubUrl && <span className="mono rounded-full bg-black/35 px-2.5 py-1 !text-[9.5px] text-white backdrop-blur-md">Soon</span>}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-4 px-3 pb-2 pt-4" style={{ transform: 'translateZ(30px)' }}>
          <div>
            <p className="mono mb-2 flex items-center gap-2 text-fg3">
              {p.category} · {yearOf(p)}
              {seen && <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" title="Explored" />}
            </p>
            <h3 className="text-[clamp(21px,1.9vw,27px)] font-medium leading-[1.08] tracking-[-.03em]">{p.title}</h3>
            {p.impact && <p className="mt-2 line-clamp-2 text-[14px] leading-snug text-fg2">{p.impact}</p>}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-3">
            <span className="truncate text-[12.5px] text-fg3">{p.tech?.slice(0, 3).join(' · ')}</span>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--on-fg)] transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

/* 03 — Work. Project cards: a real screenshot or replay when there is one,
   generative cover art otherwise, tilting toward the pointer. */
export default function Work() {
  const collected = useStory((s) => s.collected);
  const collect = useStory((s) => s.collect);
  const total = String(PROJECTS.length).padStart(2, '0');

  return (
    <section id="work" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]">
      <SectionHead no="03" label="Selected work" aside={`${collected.length} / ${PROJECTS.length} explored`} />

      <div className="mb-[clamp(40px,6vh,72px)] flex flex-wrap items-end justify-between gap-6">
        <h2
          data-reveal
          className="max-w-[14ch] t-h2"
        >
          Nine projects, <span className="serif text-s">with code.</span>
        </h2>
        <p data-reveal className="content-glass t-body max-w-[42ch]">
          Each card opens a short write-up: the problem, what I built, how I measured it and what did not work.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((p, i) => (
          <li key={p.id} data-reveal={(i % 3) * 0.08}>
            <WorkCard p={p} i={i} total={total} seen={collected.includes(p.id)} onOpen={() => collect(p.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
