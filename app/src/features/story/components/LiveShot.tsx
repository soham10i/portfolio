import { useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Project } from '@/shared/data/portfolio';
import { PROJECTS } from '@/shared/data/portfolio';
import ProjectCover from './ProjectCover';
import { useTilt } from '../lib/useTilt';

/* A screenshot of a live deployment, framed as a browser window that leans
   toward the pointer. The whole frame is the link to the real site.

   It replaced an in-page <iframe>: the STF service sends X-Frame-Options:
   DENY, so browsers refuse to show it inside another site (see
   docs/stf-allow-embed.patch to change that), and a picture that opens the
   real thing beats a frame that shows an error. */
export default function LiveShot({ project, className = '' }: { project: Project; className?: string }) {
  const frame = useRef<HTMLAnchorElement>(null);
  useTilt(frame, 4);
  const index = PROJECTS.findIndex((p) => p.id === project.id);
  const href = project.liveUrl ?? project.githubUrl;

  return (
    <div className={'tilt-stage ' + className}>
      <a
        ref={frame}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="tilt group relative block overflow-hidden rounded-[26px] border border-[color:var(--line)] shadow-[var(--glass-shadow)]"
        aria-label={`Open ${project.title}${project.liveUrl ? ' — live site' : ''} in a new tab`}
      >
        <ProjectCover project={project} index={index} chrome className="cq aspect-[16/10]" />
        <span className="absolute bottom-5 left-1/2 z-[3] inline-flex h-12 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 text-[14px] font-medium text-[#0d1626] shadow-2xl" style={{ transform: 'translateX(-50%) translateZ(40px)' }}>
          {project.liveUrl ? (
            <><span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Open the live site</>
          ) : 'View on GitHub'}
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </a>
    </div>
  );
}
