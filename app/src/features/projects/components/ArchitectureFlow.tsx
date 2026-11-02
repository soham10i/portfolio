import { useState } from 'react';
import { ArrowDown, Layers, LayoutGrid, CheckCircle2 } from 'lucide-react';
import type { ArchitectureTier } from '../lib/projectDetailContent';

interface Props {
  architecture: ArchitectureTier[];
  tint?: string;
}

export default function ArchitectureFlow({ architecture, tint = 'var(--p)' }: Props) {
  const [viewMode, setViewMode] = useState<'flow' | 'matrix'>('flow');
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  if (!architecture || architecture.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* View Mode Switcher & Pipeline Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] pb-3">
        {/* Pipeline sequence breadcrumb */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {architecture.map((l, i) => (
            <button
              key={l.tier}
              type="button"
              onClick={() => setSelectedTier(selectedTier === i ? null : i)}
              className={
                'group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-left transition-all ' +
                (selectedTier === i
                  ? 'bg-[color:var(--fg)] text-[color:var(--on-fg)] shadow-sm'
                  : 'bg-[color:var(--surf2)] text-fg2 hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]')
              }
              title={`Jump to ${l.tier}`}
            >
              <span
                className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-semibold"
                style={{
                  background: selectedTier === i ? 'var(--on-fg)' : tint,
                  color: selectedTier === i ? 'var(--fg)' : '#ffffff',
                }}
              >
                {i + 1}
              </span>
              <span className="mono !text-[11.5px] font-medium tracking-wide">{l.tier}</span>
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-full border border-[color:var(--line)] bg-[color:var(--surf2)] p-1">
          <button
            type="button"
            onClick={() => setViewMode('flow')}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ' +
              (viewMode === 'flow'
                ? 'bg-[color:var(--bg)] text-fg shadow-sm'
                : 'text-fg3 hover:text-fg')
            }
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Pipeline Flow</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ' +
              (viewMode === 'matrix'
                ? 'bg-[color:var(--bg)] text-fg shadow-sm'
                : 'text-fg3 hover:text-fg')
            }
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Layer Matrix</span>
          </button>
        </div>
      </div>

      {/* View Mode: Pipeline Flow */}
      {viewMode === 'flow' && (
        <div className="flex flex-col gap-0">
          {architecture.map((l, i) => {
            const isSelected = selectedTier === i;
            const isLast = i === architecture.length - 1;

            return (
              <div key={l.tier} className="relative flex flex-col">
                {/* Main Tier Card */}
                <div
                  onClick={() => setSelectedTier(isSelected ? null : i)}
                  className={
                    'lg-panel group relative flex flex-col gap-3.5 p-5 transition-all duration-300 md:p-6 cursor-pointer ' +
                    (isSelected
                      ? 'ring-2 shadow-lg'
                      : 'hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--fg)_20%,transparent)]')
                  }
                  style={{
                    borderColor: isSelected ? tint : undefined,
                    boxShadow: isSelected ? `0 12px 30px -10px color-mix(in oklab, ${tint} 25%, transparent)` : undefined,
                  }}
                >
                  {/* Tier Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] pb-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-7 w-7 flex-none place-items-center rounded-full text-[12px] font-semibold text-white shadow-sm"
                        style={{ background: tint }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3 className="mono text-[14px] font-semibold tracking-wider text-fg">
                          {l.tier}
                        </h3>
                        {l.role && (
                          <p className="text-[12.5px] font-medium text-fg3 sm:text-[13px]">
                            {l.role}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="mono rounded-full border border-[color:var(--line)] bg-[color:var(--surf2)] px-2.5 py-0.5 !text-[11px] text-fg3">
                        {l.parts.length} components
                      </span>
                    </div>
                  </div>

                  {/* Tier Technical Description */}
                  {l.description && (
                    <p className="text-[14.5px] sm:text-[15px] leading-relaxed text-fg2">
                      {l.description}
                    </p>
                  )}

                  {/* Component Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {l.parts.map((pt) => (
                      <span
                        key={pt}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-3.5 py-1 text-[13px] sm:text-[13.5px] font-medium text-fg2 transition-colors hover:border-fg3 hover:text-fg"
                      >
                        <CheckCircle2 className="h-3 w-3 text-fg3" />
                        {pt}
                      </span>
                    ))}
                  </div>

                  {/* Boundary Output Tag */}
                  {l.dataOut && (
                    <div className="mt-1 flex items-center gap-2 border-t border-[color:var(--line)] pt-3 text-[12.5px] sm:text-[13px] text-fg3">
                      <span className="mono !text-[11px] uppercase tracking-wider text-fg2">Data Boundary:</span>
                      <span className="font-mono text-fg2">{l.dataOut}</span>
                    </div>
                  )}
                </div>

                {/* Connecting Arrow between pipeline stages */}
                {!isLast && (
                  <div className="my-2.5 flex items-center justify-center gap-2 text-fg3" aria-hidden>
                    <span className="h-4 w-px bg-[color:var(--line)]" />
                    <div className="flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-0.5 text-[11px] font-mono text-fg3 shadow-xs">
                      <ArrowDown className="h-3 w-3 animate-bounce" style={{ color: tint }} />
                      <span>Data pipeline transition</span>
                    </div>
                    <span className="h-4 w-px bg-[color:var(--line)]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* View Mode: Layer Matrix */}
      {viewMode === 'matrix' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {architecture.map((l, i) => {
            const isSelected = selectedTier === i;

            return (
              <div
                key={l.tier}
                onClick={() => setSelectedTier(isSelected ? null : i)}
                className={
                  'lg-panel flex flex-col justify-between gap-4 p-5 transition-all duration-300 cursor-pointer ' +
                  (isSelected
                    ? 'ring-2 shadow-lg'
                    : 'hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--fg)_20%,transparent)]')
                }
                style={{
                  borderColor: isSelected ? tint : undefined,
                  boxShadow: isSelected ? `0 10px 24px -10px color-mix(in oklab, ${tint} 25%, transparent)` : undefined,
                }}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-[color:var(--line)] pb-3">
                    <span className="mono flex items-center gap-2 text-[14px] font-semibold text-fg">
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full text-[11px] text-white"
                        style={{ background: tint }}
                      >
                        {i + 1}
                      </span>
                      {l.tier}
                    </span>
                    <span className="mono !text-[11px] text-fg3">Tier {i + 1}</span>
                  </div>

                  {l.role && (
                    <p className="mt-2 text-[13px] font-medium text-fg">
                      {l.role}
                    </p>
                  )}

                  {l.description && (
                    <p className="mt-2 text-[14px] leading-relaxed text-fg2">
                      {l.description}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--line)] pt-3">
                    {l.parts.map((pt) => (
                      <span
                        key={pt}
                        className="rounded-full border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-3 py-0.5 text-[12.5px] text-fg2"
                      >
                        {pt}
                      </span>
                    ))}
                  </div>

                  {l.dataOut && (
                    <p className="mt-3 truncate font-mono text-[11.5px] text-fg3">
                      ➔ {l.dataOut}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

