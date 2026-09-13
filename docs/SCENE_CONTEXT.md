# SceneLab — scenario context, VLM transparency, grounded Q&A

## The constraint everything else follows from

Measured against `meta/llama-3.2-11b-vision-instruct` on NVIDIA NIM,
2026-08-30. Two image parts in one prompt:

```
400  {"message": "At most 1 image(s) may be provided in one prompt."}
```

So "send the recent frames to the VLM" cannot mean N image parts. Three options
existed:

| Approach | Cost per question | Can answer "what changed?" |
|---|---|---|
| N separate calls | N× latency, N× quota | No — no call sees two moments |
| Text log only | cheap | No — model sees nothing |
| **One composite image** | **one call** | **Yes** |

The composite wins on every axis, so the architecture is: the client tiles the
recent keyframes into a single timestamped contact sheet and sends that.

Verified: a 2×2 sheet at 768×432 (36 KB JPEG) answered in **4 077 ms**, and the
model reasoned across cells — *"the robot's position changes across frames…
there is no indication that it gets stuck"* — rather than describing four
unrelated pictures. The timestamp burned into each cell is what makes that
work; without it the grid is a collage.

## Flow

```
  browser                                     server                    provider
  ───────                                     ──────                    ────────
  YOLOv8n-seg  ──► keyframes {t, thumb, labels}
       │
       ├─ text only ─────────► PUT /api/scene/session ──► in-memory, TTL 30m
       │                       (scenario + log; thumbs stripped)
       │
       ├─ buildContactSheet() ─┐
       │    tile → stamp t     │  ONE jpeg
       │                       ▼
       └─ question ──────► POST /api/scene/ask/stream
                                 │ assemble() ── scenePrompt.build()
                                 │                 system: sheet shape,
                                 │                         visitor's scenario,
                                 │                         grounding rules
                                 │                 user:   log + question + image
                                 ├─ SSE frame 1: {inspect}  → panel renders now
                                 └─ SSE frames:  {delta}    → answer streams
                                                              ▼
                                                     vision model (sheet present)
                                                     text model  (no sheet)
```

## What the user's scenario buys

Same frame, same question. Without a scenario the model returns a flat
description of the room. With `"I am looking for my keys in the living room"`
in the system role it returned:

> *"To find your keys, you should look at the objects on the coffee table and
> the floor near it."*

The pixels did not change. The question the model thought it was answering did.
That is why the scenario is server-held: every downstream call sees the same
goal without the client re-attaching it.

## Why there is no attention heatmap

The obvious version of "show me what the model is attending to" is a saliency
overlay. It is not buildable here, and shipping one would be a fabrication:
hosted vision models served over an OpenAI-compatible endpoint return generated
tokens and nothing else — no attention weights, no per-patch scores, no logit
lens. Any heatmap drawn in `VlmInspector.tsx` would be invented by
`VlmInspector.tsx`.

What the panel shows instead is the literal request:

- the exact composite image, rendered from the same data URI that was sent
- each frame in it, with its timestamp and detector labels
- the full system prompt, including the visitor's own scenario text
- the rendered keyframe log
- an approximate token count

Every claim on that panel is checkable. A heatmap would not be.

The prompt text comes from `POST /api/scene/inspect`, which shares one code
path (`assemble()` → `scenePrompt.build()`) with the answer route. A panel that
reconstructed the prompt independently would drift within a week and quietly
become a lie; this one cannot disagree with what was sent.

Real attention maps would require serving the model yourself — `scene-api/`
with `output_attentions=True` on a local BLIP or Qwen-VL. That is a GPU-hosting
decision, not a frontend one.

## Privacy boundary

The session store holds **text only**: scenario, keyframe log (timestamp,
labels, caption), Q&A turns. `sanitiseFrames()` in `sceneSession.js` strips the
client's `thumb` data URIs rather than trusting them not to arrive — verified
by sending a marker string in a `thumb` field and confirming it appears nowhere
in the resulting payload.

Frames still reach the provider as part of a question, transiently, and are not
retained by us. Detection continues to run entirely in the browser.

State is one process-local `Map`, 30-minute idle TTL, 500-session LRU cap. A
deploy or a free-instance spin-down loses it. The API reports this as
`ephemeral: true` rather than leaving it to be discovered.

## Files

| File | Role |
|---|---|
| `backend/src/services/sceneSession.js` | ephemeral text-only session store |
| `backend/src/services/scenePrompt.js` | prompt assembly + inspection payload |
| `backend/src/routes/scene.js` | `/session`, `/inspect`, `/ask`, `/ask/stream` |
| `app/.../lib/contactSheet.ts` | canvas compositor, grid + timestamps |
| `app/.../lib/sceneApi.ts` | typed client, SSE parsing, non-stream fallback |
| `app/.../components/ScenarioPanel.tsx` | scenario input, debounced autosave |
| `app/.../components/VlmInspector.tsx` | the transparency panel |

## Tuning

`cellWidth` in `contactSheet.ts` is 384 px. Vision models bill roughly one
token per 28×28 patch, so a 3×3 sheet of 384 px cells is about 1.4k image
tokens; doubling the cell size quadruples that for detail the model rarely uses
at this task. `MAX_SHEET_FRAMES` is 9 — beyond that the cells get too small to
read, and the right move is selecting which frames matter, not sending more.
