import { Brain, Camera, Captions, Filter, ScanEye } from 'lucide-react';

export interface PipelineState {
  source: { active: boolean; detail: string };
  detect: { active: boolean; detail: string };
  gate: { active: boolean; detail: string };
  caption: { active: boolean; detail: string; offline?: boolean };
  reason: { active: boolean; detail: string };
}

const STAGES = [
  { key: 'source', label: 'Source', where: 'your device', Icon: Camera },
  { key: 'detect', label: 'YOLOv8n', where: 'in your browser', Icon: ScanEye },
  { key: 'gate', label: 'Keyframe gate', where: 'scene-change Δ', Icon: Filter },
  { key: 'caption', label: 'Captioner', where: 'BLIP / VLM', Icon: Captions },
  { key: 'reason', label: 'Reasoning', where: 'summary & Q&A', Icon: Brain },
] as const;

/* The page's architecture, drawn live: each stage lights up while it is
   actually working, with its current figure underneath. The dashed boundary
   marks where data first leaves the device — the privacy claim, made visible. */
export default function Pipeline({ state }: { state: PipelineState }) {
  return (
    <ol className="relative grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STAGES.map(({ key, label, where, Icon }, i) => {
        const s = state[key];
        const off = key === 'caption' && state.caption.offline;
        return (
          <li key={key} className="relative">
            {i === 3 && (
              <span aria-hidden className="absolute -left-1.5 bottom-1 top-1 hidden w-px border-l border-dashed border-[color:var(--fg3)] sm:block" title="Leaves the device here" />
            )}
            <div
              className={'lg-panel flex h-full flex-col gap-2 p-3.5 transition-[box-shadow,transform] duration-500 ' + (s.active ? '-translate-y-0.5' : '')}
              style={s.active ? { boxShadow: '0 0 0 1px color-mix(in oklab, var(--a) 60%, transparent), 0 18px 40px -18px color-mix(in oklab, var(--a) 70%, transparent)' } : undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className="grid h-8 w-8 place-items-center rounded-full transition-colors duration-500"
                  style={{ background: s.active ? 'var(--a)' : 'var(--surf2)', color: s.active ? '#04121a' : 'var(--fg2)' }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="mono !text-[9px] text-fg3">0{i + 1}</span>
              </div>
              <div>
                <p className="text-[14px] font-medium tracking-[-.01em]">{label}</p>
                <p className="mono !text-[9px] text-fg3">{where}</p>
              </div>
              <p className="mt-auto flex items-center gap-1.5 truncate text-[12.5px] text-fg2">
                <span
                  className={'h-1.5 w-1.5 flex-none rounded-full ' + (s.active ? 'animate-pulse' : '')}
                  style={{ background: off ? '#f87171' : s.active ? 'var(--a)' : 'var(--fg3)' }}
                />
                {s.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
