import type React from 'react';
import type { Project } from '@/shared/data/portfolio';
import LidarCover from './LidarCover';

/* A project's visual. A live 3-D cover when the project has one (cover3d).
   With a photo: the screenshot, framed. Without one:
   generative cover art — the project's tint as a light field over a fine
   engineering grid, its number set huge, its stack as a faint readout — so
   cards without screenshots still look designed rather than empty. Colours
   live in story.css (.cover-*) so the art follows the theme: a deep field on
   dark grounds, a pale tinted field with ink type on light ones. */
export default function ProjectCover({
  project, index, className = '', chrome = false,
}: { project: Project; index: number; className?: string; chrome?: boolean }) {
  const tint = project.tint ?? '#4d8dff';
  const no = String(index + 1).padStart(2, '0');

  if (project.cover3d === 'lidar') return <LidarCover fallback={project.image} className={className} />;

  return (
    <div className={'cover relative overflow-hidden ' + (project.image ? 'bg-[color:var(--canvas)] ' : '') + className}>
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
        <div aria-hidden className="cover-art absolute inset-0" style={{ '--tint': tint } as React.CSSProperties}>
          <div className="cover-field absolute inset-0" />
          <div className="cover-grid absolute inset-0" />
          <span className="cover-no absolute -bottom-[.18em] right-[.04em] select-none font-medium leading-none tracking-[-.08em] [font-size:clamp(120px,22cqw,260px)]">
            {no}
          </span>
          <span className="cover-meta mono absolute left-4 top-12 max-w-[70%] !text-[10px] leading-relaxed">
            {project.category}
            <br />
            {project.tech?.slice(0, 4).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}
