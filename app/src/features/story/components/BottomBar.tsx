import { useEffect, useRef } from 'react';
import JarvisOrb from '@/features/chat/components/JarvisOrb';
import { PROJECTS } from '@/shared/data/portfolio';
import { CHAPTERS } from '../lib/chapters';
import ThemeToggle from './ThemeToggle';
import { useStory } from '../lib/store';

/* One docked capsule, after Shape of Intelligence's bottom bar: where you are
   (chapter, progress, projects explored), JARVIS, motion, and light/dark. */
export default function BottomBar() {
  const chapter = useStory((s) => s.chapter);
  const motion = useStory((s) => s.motion);
  const setMotion = useStory((s) => s.setMotion);
  const collected = useStory((s) => s.collected.length);
  const bar = useRef<HTMLSpanElement>(null);

  /* Progress changes every frame; write it straight to the DOM. */
  useEffect(() => {
    const paint = (p: number) => { if (bar.current) bar.current.style.transform = `scaleX(${p})`; };
    paint(useStory.getState().progress);
    return useStory.subscribe((s) => paint(s.progress));
  }, []);

  const current = CHAPTERS[chapter];

  return (
    <div className="story-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-[var(--gutter)] pb-4">
      <div className="lg-pill lg-chrome pointer-events-auto flex h-12 max-w-full items-center gap-1 pl-4 pr-1.5">
        <div className="flex min-w-0 items-center gap-3 pr-2" aria-live="polite">
          <span className="mono whitespace-nowrap text-fg">
            {current.no}<span className="text-fg3"> / {CHAPTERS.at(-1)!.no}</span>
          </span>
          <span className="relative hidden h-px w-14 overflow-hidden bg-[color:var(--line)] sm:block">
            <span ref={bar} className="absolute inset-0 origin-left bg-[color:var(--fg)]" style={{ transform: 'scaleX(0)' }} />
          </span>
          <span className="hidden whitespace-nowrap text-[13px] text-fg2 sm:inline">{current.label}</span>
          <span className="mono hidden whitespace-nowrap text-fg3 md:inline" title="Projects you have opened">
            {collected}/{PROJECTS.length} explored
          </span>
        </div>

        <span className="mx-1 h-6 w-px bg-[color:var(--line)]" />

        <button
          type="button"
          className="lg-btn"
          onClick={() => window.dispatchEvent(new Event('jarvis:open'))}
          aria-label="Ask JARVIS about my work"
        >
          <JarvisOrb size={22} className="-ml-1.5" />
          <span className="hidden sm:inline">Ask JARVIS</span>
        </button>
        <button
          type="button"
          className="lg-btn"
          aria-pressed={motion}
          onClick={() => setMotion(!motion)}
          title="Smooth scrolling and animation"
        >
          <span className="mono whitespace-nowrap !text-[10px]">Motion {motion ? 'on' : 'off'}</span>
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}
