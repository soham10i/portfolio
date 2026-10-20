import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { PROJECTS, type Project } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';
import { useStory } from '../lib/store';

const yearOf = (p: Project) => p.timeline.match(/\d{4}/g)?.at(-1) ?? p.timeline;

/* 03 — Work. Projects as portrait "trading cards" (Evan Fasquelle), shown in
   the page's one light chapter so they read like a gallery wall.
   Phase 2 pins this section and fans the same cards out as a 3D deck; these
   DOM cards stay as the accessible, reduced-motion and mobile version. */
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
          className="max-w-[14ch] text-[clamp(40px,7vw,112px)] font-medium leading-[.92] tracking-[-.05em]"
        >
          Nine projects. <span className="serif text-s">Collect them all.</span>
        </h2>
        <p data-reveal className="max-w-[34ch] text-[15px] leading-relaxed text-fg2">
          From a PLC-accurate factory twin to on-device vision. Open a card to explore it; the counter below keeps score.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((p, i) => {
          const seen = collected.includes(p.id);
          const tint = p.tint ?? '#4d8dff';
          return (
            <li key={p.id} data-reveal={(i % 3) * 0.08}>
              <Link
                to={`/project/${p.id}`}
                onClick={() => collect(p.id)}
                className="lg-panel group relative flex aspect-[5/6] flex-col justify-between overflow-hidden p-6 transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-1.5"
              >
                {/* colour field: the card's identity, brighter on hover */}
                <span
                  aria-hidden
                  className="absolute -right-1/4 -top-1/4 h-[85%] w-[85%] rounded-full opacity-50 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
                  style={{ background: tint }}
                />

                <div className="relative flex items-center justify-between">
                  <span className="mono text-fg2">
                    {String(i + 1).padStart(2, '0')} / {total}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {p.featured && <span className="mono rounded-full bg-[color:var(--fg)] px-2.5 py-1 !text-[9.5px] text-[color:var(--bg)]">Featured</span>}
                    {!p.githubUrl && <span className="mono rounded-full border border-[color:var(--line)] px-2.5 py-1 !text-[9.5px] text-fg2">Soon</span>}
                    {seen && <span className="h-2 w-2 rounded-full bg-[#10b981]" title="Explored" />}
                  </span>
                </div>

                <div className="relative">
                  <p className="mono mb-3 text-fg3">{p.category} · {yearOf(p)}</p>
                  <h3 className="text-[clamp(24px,2.2vw,32px)] font-medium leading-[1.05] tracking-[-.03em]">
                    {p.title}
                  </h3>
                  {p.impact && <p className="mt-3 line-clamp-2 text-[14px] leading-snug text-fg2">{p.impact}</p>}
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-4">
                    <span className="truncate text-[12.5px] text-fg3">{p.tech?.slice(0, 3).join(' · ')}</span>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] transition-transform duration-300 group-hover:rotate-45">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
