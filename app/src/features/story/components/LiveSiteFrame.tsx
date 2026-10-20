import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Maximize2, MousePointerClick, X } from 'lucide-react';
import { STF_EMBED } from '@/shared/lib/env';
import { useStory } from '../lib/store';

interface Props {
  /** The live deployment to show. */
  url: string;
  title: string;
  /** Muted loop shown until the visitor asks for the live site. */
  previewVideo?: string;
  className?: string;
}

/* A live website framed as a browser window.
 *
 * The preview loops until the visitor asks for the real thing; only then is
 * the site loaded into the frame. Loading it eagerly would start a second
 * WebGL app (and a Cloud Run cold start) for everyone who scrolls past.
 * Framing needs the target to allow this origin in frame-ancestors
 * (docs/stf-allow-embed.patch); until VITE_STF_EMBED is on, the button
 * opens the site in a new tab instead. */
export default function LiveSiteFrame({ url, title, previewVideo, className = '' }: Props) {
  const motion = useStory((s) => s.motion);
  const video = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const address = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (motion) v.play().catch(() => { /* autoplay refused — first frame stays */ });
    else v.pause();
  }, [motion, live]);

  return (
    <div className={'lg-panel overflow-hidden !rounded-[26px] ' + className}>
      <div className="flex h-12 items-center gap-3 border-b border-[color:var(--line)] px-4">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex min-w-0 items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] px-4 py-1.5 text-[12px] text-fg2">
          <span className={'h-1.5 w-1.5 flex-none rounded-full ' + (live ? 'bg-[#28c840]' : 'bg-[color:var(--fg3)]')} />
          <span className="truncate">{address}</span>
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-8 w-8 flex-none place-items-center rounded-full text-fg2 hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:text-fg"
          title="Open in a new tab"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="relative aspect-[4/3] bg-[color:var(--canvas)] sm:aspect-[16/9]">
        {live ? (
          <>
            <iframe
              src={url}
              title={title}
              className="absolute inset-0 h-full w-full border-0"
              allow="fullscreen"
              referrerPolicy="no-referrer"
            />
            <button
              type="button"
              onClick={() => setLive(false)}
              className="lg-pill absolute right-3 top-3 grid h-9 w-9 place-items-center"
              aria-label="Close the live site"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            {previewVideo && (
              <video
                ref={video}
                src={previewVideo}
                muted
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
                aria-label={`Recorded preview of ${title}`}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            {STF_EMBED ? (
              <button type="button" onClick={() => setLive(true)} className="btn-ink absolute bottom-5 left-1/2 -translate-x-1/2 !bg-white !text-[#0d1626] shadow-2xl">
                <MousePointerClick className="h-4 w-4" /> Interact with the live site
              </button>
            ) : (
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ink absolute bottom-5 left-1/2 -translate-x-1/2 !bg-white !text-[#0d1626] shadow-2xl">
                Open the live site <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
