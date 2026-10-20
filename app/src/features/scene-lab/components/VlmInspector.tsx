import { useState } from 'react';
import { Eye, FileText, Image as ImageIcon, Layers, Loader2 } from 'lucide-react';
import { formatBytes, type ContactSheet } from '@/features/scene-lab/lib/contactSheet';
import type { Inspection } from '@/features/scene-lab/lib/sceneApi';

/* "What is the model actually looking at?"
 *
 * ── An honest answer, and the dishonest one this avoids ──────────────────────
 * The tempting version of this panel is an attention heatmap over the frame.
 * It is not buildable here and would be a fabrication: hosted vision models
 * served over an OpenAI-compatible endpoint return generated tokens and
 * nothing else — no attention weights, no per-patch scores, no saliency. Any
 * heatmap drawn in this component would be invented by this component.
 *
 * So the panel shows what is genuinely knowable and genuinely useful: the
 * literal request. The exact composite image, the exact frames in it and their
 * timestamps, the detector labels that were passed as ground truth, the full
 * system prompt including the visitor's own scenario text, and a token
 * estimate. The image rendered below is the same data URI that was sent, not a
 * reconstruction — and the prompt text comes from the server's own
 * /api/scene/inspect, which shares one code path with the answer route, so the
 * panel cannot drift out of agreement with reality.
 *
 * That is a stronger transparency story than a heatmap, because every claim on
 * it is checkable.
 */

interface Props {
  sheet: ContactSheet | null;
  inspection: Inspection | null;
  loading?: boolean;
  accent: string;
}

type Tab = 'frames' | 'prompt' | 'log';

export default function VlmInspector({ sheet, inspection, loading, accent }: Props) {
  const [tab, setTab] = useState<Tab>('frames');

  const img = inspection?.image;
  const hasImage = !!sheet || (img?.present ?? false);

  return (
    <section className="lg-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="inline-flex items-center gap-2 mono text-fg3">
          <Eye className="h-3.5 w-3.5" style={{ color: accent }} />
          Sent to the model
        </p>
        {loading
          ? <span className="inline-flex items-center gap-1 font-mono text-[10px] text-fg3"><Loader2 className="h-3 w-3 animate-spin" /> building</span>
          : inspection && (
            <span className="font-mono text-[10px] text-fg3">
              ~{inspection.approxTokens.toLocaleString()} tokens
              {inspection.model && <> · {inspection.model}</>}
            </span>
          )}
      </div>

      {!sheet && !inspection && (
        <p className="px-4 py-5 text-[12.5px] leading-relaxed text-fg2">
          Analyse a clip or camera session, then ask a question. This panel will show the exact
          image and prompt text that go to the vision model — no reconstruction, no mock-up.
        </p>
      )}

      {(sheet || inspection) && (
        <>
          <div className="flex border-b border-line">
            {([
              ['frames', 'Frames', Layers],
              ['prompt', 'Prompt', FileText],
              ['log', 'Detector log', ImageIcon],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors"
                style={{
                  borderBottomColor: tab === key ? accent : 'transparent',
                  color: tab === key ? 'var(--fg)' : 'var(--fg3)',
                }}>
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>

          {/* ── The literal composite ─────────────────────────────────────── */}
          {tab === 'frames' && (
            <div className="px-4 py-3">
              {hasImage ? (
                <>
                  {sheet && (
                    <figure className="mb-3">
                      <img src={sheet.dataUrl} alt="Contact sheet sent to the vision model"
                        className="w-full rounded-[10px] border border-line" />
                      <figcaption className="mt-1.5 font-mono text-[10px] text-fg3">
                        {sheet.cols}×{sheet.rows} grid · {sheet.count} frame{sheet.count === 1 ? '' : 's'} ·
                        {' '}{sheet.width}×{sheet.height}px · {formatBytes(sheet.bytes)} JPEG
                      </figcaption>
                    </figure>
                  )}

                  <p className="mb-2 text-[12px] leading-relaxed text-fg2">
                    One composite, not several images: this model rejects more than one image per
                    request, so the frames are tiled and timestamped in place. That is also why
                    it can answer questions about change over time.
                  </p>

                  {sheet && (
                    <ul className="space-y-1.5">
                      {sheet.frames.map((f, i) => (
                        <li key={`${f.at}-${i}`} className="flex items-start gap-2.5 rounded-[9px] border border-line px-2.5 py-2">
                          <img src={f.thumb} alt="" className="h-9 w-16 shrink-0 rounded-[5px] object-cover" />
                          <div className="min-w-0">
                            <p className="font-mono text-[10.5px]" style={{ color: accent }}>t+{f.at.toFixed(1)}s</p>
                            <p className="truncate text-[11.5px] text-fg3">
                              {f.labels.length ? f.labels.join(', ') : 'no detections'}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-[12.5px] leading-relaxed text-fg2">
                  No image was sent with this question — the model answered from the detector log
                  alone. Capture a few keyframes to give it something to look at.
                </p>
              )}
            </div>
          )}

          {/* ── The exact prompt text ─────────────────────────────────────── */}
          {tab === 'prompt' && (
            <div className="px-4 py-3">
              {inspection ? (
                <>
                  <p className="mb-1.5 mono text-fg3">System</p>
                  <pre className="mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-[9px] border border-line bg-bg2 px-3 py-2.5 text-[11.5px] leading-relaxed text-fg2">
                    {inspection.systemPrompt}
                  </pre>
                  <p className="mb-1.5 mono text-fg3">
                    User{inspection.historyTurns > 0 && ` · after ${inspection.historyTurns} earlier turn${inspection.historyTurns === 1 ? '' : 's'}`}
                  </p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[9px] border border-line bg-bg2 px-3 py-2.5 text-[11.5px] leading-relaxed text-fg2">
                    {inspection.userText}
                  </pre>
                  {inspection.attentionAvailable === false && (
                    <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-fg3">
                      <strong className="text-fg2">Why no attention heatmap.</strong> Hosted vision
                      models return generated text and nothing else over the OpenAI-compatible API —
                      no attention weights, no per-patch saliency. A heatmap here would be drawn by
                      this page, not by the model. Showing the exact input is the claim that can
                      actually be checked.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[12.5px] text-fg2">Ask a question to populate this.</p>
              )}
            </div>
          )}

          {/* ── Detector ground truth ─────────────────────────────────────── */}
          {tab === 'log' && (
            <div className="px-4 py-3">
              <p className="mb-2 text-[12px] leading-relaxed text-fg2">
                Object labels come from YOLO running in your browser, not from the vision model.
                They are passed in as ground truth, which is what stops the model inventing
                objects — and why it is told that absence from this list is not evidence of
                absence from the scene.
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre rounded-[9px] border border-line bg-bg2 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-fg2">
                {inspection?.log || '(no log yet)'}
              </pre>
            </div>
          )}
        </>
      )}
    </section>
  );
}
