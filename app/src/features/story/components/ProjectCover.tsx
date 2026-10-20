import type { Project } from '@/shared/data/portfolio';

/* A project's visual. With a photo: the screenshot, framed. Without one:
   generative cover art — the project's tint as a light field over a fine
   engineering grid, its number set huge, its stack as a faint readout — so
   cards without screenshots still look designed rather than empty. */
export default function ProjectCover({
  project, index, className = '', chrome = false,
}: { project: Project; index: number; className?: string; chrome?: boolean }) {
  const tint = project.tint ?? '#4d8dff';
  const no = String(index + 1).padStart(2, '0');

  return (
    <div className={'relative overflow-hidden bg-[color:var(--canvas)] ' + className}>
      {chrome && (
        <div className="absolute inset-x-0 top-0 z-[2] flex h-8 items-center gap-1.5 bg-black/30 px-3 backdrop-blur-md">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          {project.liveUrl && (
            <span className="ml-3 truncate text-[11px] text-white/70">{project.liveUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
          )}
        </div>
      )}

      {project.image ? (
        <img
          src={project.image}
          alt={`${project.title} — screenshot`}
          loading="lazy"
          decoding="async"
          className={'absolute inset-0 h-full w-full object-cover ' + (chrome ? 'pt-8' : '')}
        />
      ) : (
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-0" style={{ background: `radial-gradient(90% 80% at 80% 10%, ${tint}, transparent 65%), radial-gradient(70% 70% at 0% 100%, color-mix(in oklab, ${tint} 50%, #4f46e5), transparent 70%), #0b1220` }} />
          <div
            className="absolute inset-0 opacity-[.18]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              maskImage: 'radial-gradient(80% 80% at 70% 30%, #000, transparent)',
              WebkitMaskImage: 'radial-gradient(80% 80% at 70% 30%, #000, transparent)',
            }}
          />
          <span className="absolute -bottom-[.18em] right-[.04em] select-none font-medium leading-none tracking-[-.08em] text-white/90 [font-size:clamp(120px,22cqw,260px)]">
            {no}
          </span>
          <span className="mono absolute left-4 top-4 max-w-[70%] !text-[10px] leading-relaxed text-white/60">
            {project.category}
            <br />
            {project.tech?.slice(0, 4).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}
