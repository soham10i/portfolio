import { useTheme } from '@/shared/lib/theme';
import { CHAPTERS } from '../lib/chapters';
import { useStory } from '../lib/store';
import { PHYSICAL_LABELS } from '../three/shapes';

/* The Physical AI theme's stage: a fixed frame on the left that holds the
   point-cloud machines (CloudLayer's canvas is confined to the same box in
   story.css), with an instrument-style caption naming the machine for the
   current chapter. The content scrolls in the column beside it. */
export default function PhysicalStage() {
  const theme = useTheme((s) => s.theme);
  const chapter = useStory((s) => s.chapter);
  const quality = useStory((s) => s.quality);
  if (theme !== 'physical') return null;

  const label = PHYSICAL_LABELS[Math.min(chapter, PHYSICAL_LABELS.length - 1)];
  const [name, detail] = label.split(' · ');

  return (
    <aside className="pa-stage" aria-label="Animated robotics models">
      <span className="pa-corner pa-tl" /><span className="pa-corner pa-tr" />
      <span className="pa-corner pa-bl" /><span className="pa-corner pa-br" />

      <div className="pa-hud pa-hud-top mono">
        <span>Physical AI · stage</span>
        <span>{String(chapter + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}</span>
      </div>

      <div className="pa-hud pa-hud-bottom">
        <p className="mono !text-[9.5px] text-fg3">Model {String(chapter + 1).padStart(2, '0')}</p>
        <p key={label} className="pa-title mt-1.5 text-[clamp(20px,1.9vw,28px)] font-medium tracking-[-.02em] text-fg">{name}</p>
        <p className="mt-1 text-[13px] text-fg2">{detail}</p>
        <p className="mono mt-4 !text-[9.5px] text-fg3">
          {quality === 0 ? 'Animation off on this device' : 'Point-sampled · morphs as you scroll'}
        </p>
      </div>
    </aside>
  );
}
