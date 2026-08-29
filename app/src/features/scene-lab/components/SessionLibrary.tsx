import { useEffect, useState } from 'react';
import { Film, RotateCcw, Trash2, Video } from 'lucide-react';
import * as session from '@/features/scene-lab/lib/videoSession';

/* Everything this page is holding, and a way to let go of it.
 *
 * The point of showing this list is not convenience — it is that a privacy
 * claim you can verify beats one you have to believe. A visitor can see
 * exactly what is in memory, how much of it there is, and remove any of it
 * without reloading. */

interface Props {
  activeId: string | null;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  accent: string;
}

export default function SessionLibrary({ activeId, onOpen, onRemove, onClear, accent }: Props) {
  const [items, setItems] = useState<session.SessionVideo[]>([]);
  useEffect(() => session.subscribe(setItems), []);

  const total = items.reduce((n, v) => n + v.bytes, 0);

  return (
    <section className="glass-card overflow-hidden rounded-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-fg3">
          This session · {items.length} clip{items.length === 1 ? '' : 's'}
          {items.length > 0 && <span className="ml-2 normal-case tracking-normal">{session.formatBytes(total)} in memory</span>}
        </p>
        {items.length > 0 && (
          <button type="button" onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg3 transition-colors hover:border-[#f87171] hover:text-[#f87171]">
            <Trash2 className="h-3 w-3" /> Forget all
          </button>
        )}
      </div>

      <div className="border-b border-line px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-fg2">
          <strong className="text-fg">Nothing here is uploaded.</strong> Your clip stays in this
          browser tab and is read directly from memory — it is never written to disk and never
          sent to the server. Only sampled keyframes are sent for captioning, and only while
          narration is on. Everything is released when you close the tab, or now, with the
          buttons on this list.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-fg3">
          No clips yet. Upload one, or start the camera.
        </p>
      ) : (
        <ul className="max-h-[280px] overflow-y-auto">
          {items.map((v) => {
            const on = v.id === activeId;
            return (
              <li key={v.id}
                className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
                style={on ? { background: 'color-mix(in oklab,var(--a) 8%,transparent)' } : undefined}>
                <span className="mt-0.5 flex-none text-fg3">
                  {v.kind === 'camera' ? <Video className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg" title={v.name}>{v.name}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-fg3">
                    {session.formatDuration(v.durationSec)} · {v.width}×{v.height} · {session.formatBytes(v.bytes)}
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px]" style={{ color: v.keyframes ? accent : 'var(--fg3)' }}>
                    {v.keyframes
                      ? `${v.keyframes} keyframe${v.keyframes === 1 ? '' : 's'}, ${v.captioned} captioned${v.summarised ? ', summarised' : ''}`
                      : 'not analysed yet'}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1">
                  {v.kind === 'file' && (
                    <button type="button" onClick={() => onOpen(v.id)} title="Analyse again"
                      className="grid h-7 w-7 place-items-center rounded-[8px] text-fg3 transition-colors hover:bg-surf2 hover:text-fg">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => onRemove(v.id)} title="Remove from memory"
                    className="grid h-7 w-7 place-items-center rounded-[8px] text-fg3 transition-colors hover:bg-surf2 hover:text-[#f87171]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
