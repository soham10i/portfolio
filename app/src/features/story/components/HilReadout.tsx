import { useTheme } from '@/shared/lib/theme';
import { useStory } from '../lib/store';
import { HIL_LABELS } from '../three/shapes';

/* HIL Bench theme only: a small instrument readout, bottom-left, naming the
   model the background is showing for the current chapter. */
export default function HilReadout() {
  const theme = useTheme((s) => s.theme);
  const chapter = useStory((s) => s.chapter);
  if (theme !== 'hil') return null;
  const [name, detail] = HIL_LABELS[Math.min(chapter, HIL_LABELS.length - 1)].split(' · ');
  return (
    <div className="hil-readout" aria-hidden>
      <span className="hil-dot" />
      <span className="mono !text-[9.5px] text-fg3">CH {String(chapter + 1).padStart(2, '0')}</span>
      <span key={name} className="hil-name text-[12.5px] text-fg">{name}</span>
      <span className="mono !text-[9.5px] text-fg3">{detail}</span>
    </div>
  );
}
