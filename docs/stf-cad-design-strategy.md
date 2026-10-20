# STF CAD — design strategy

How to carry the portfolio's design system into the Smart Tabletop Factory twin
(stf-hw, Cloud Run). The aim is a calm engineering tool: the 3D cell is the
content, and the UI is glass placed only where someone needs to read or act.

## 1. Principles

1. **The model is the page.** The 3D viewport fills the window edge to edge.
   Never put it inside a card or crop it with a sidebar.
2. **Glass only where there is reading or input.** Panels, inspectors and
   toolbars float over the viewport as frosted boxes. Everything between them
   stays clear so the cell is visible (same rule as the portfolio's open layout).
3. **One type scale, one accent.** Geist for UI, Geist Mono for values and IDs.
   One accent colour means "selected / live"; status colours are reserved for
   machine state only.
4. **Numbers, not adjectives.** Every overlay shows a unit and a source: `X 214.3 mm · PLC`,
   not "Position OK".
5. **Calm by default, loud only for faults.** Animation shows machine motion,
   never decoration. Faults are the only thing that pulses.

## 2. Layout zones (desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ ▢ Top bar (glass pill): cell name · cycle state · sim/live ·  │
│   theme · help                                               │
│                                                              │
│ ┌────────┐                                      ┌──────────┐ │
│ │ Tree   │          3D viewport (full bleed)    │Inspector │ │
│ │ glass  │                                      │ glass    │ │
│ │ 280 px │                                      │ 320 px   │ │
│ └────────┘                                      └──────────┘ │
│                                                              │
│   ▢ Bottom dock (glass pill): play · step · speed · scrub ·   │
│     camera presets · section/explode                         │
└──────────────────────────────────────────────────────────────┘
```

- **Left, the model tree:** stations → assemblies → parts, with a search field.
  Collapses to an icon rail at 64 px.
- **Right, the inspector:** the selected part's properties, I/O bits, PLC step
  and timer, and live values. Hidden when nothing is selected, so the viewport
  gets the space back.
- **Bottom dock, timeline and transport:** the production cycle as a scrubbable
  strip with its 8 phases as labelled segments.
- **Floating labels:** small glass tags anchored to 3D points (sensor names,
  axis values). They fade with distance and hide below a zoom threshold.
- **Mobile:** viewport on top, with the inspector as a bottom sheet (a snap
  point at 40% and one at full height). The tree moves into the sheet as a tab.

## 3. Tokens (reuse from the portfolio's `story.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#e4e9f1` | `#030509` | Viewport clear colour / page |
| `--block-fill` | `rgba(255,255,255,.70)` | `rgba(13,18,29,.66)` | Panel glass |
| `--block-line` | `rgba(255,255,255,.90)` | `rgba(255,255,255,.08)` | Panel 1 px border |
| `--fg / --fg2 / --fg3` | `#0b1322 / #434f66 / #6b7c97` | `#edf1f8 / #a0adc2 / #6f7e97` | Text levels |
| `--p` (accent) | `#2f5bea` | `#7fb0ff` | Selection, focus, live |
| `--ok / --warn / --fault` | `#16a34a / #d97706 / #dc2626` | `#4ade80 / #fbbf24 / #f87171` | Machine state only |

Glass recipe: `background: var(--block-fill); border: 1px solid var(--block-line);
backdrop-filter: blur(16px) saturate(160%); border-radius: 20px;` and a soft
shadow. Under `prefers-reduced-transparency`, use a solid `--bg` fill.

## 4. Typography

- **UI:** Geist, 13–14 px for controls and 15–16 px for inspector body text,
  with line height 1.5.
- **Values:** Geist Mono, 12–13 px, tabular figures (`font-variant-numeric: tabular-nums`),
  so live numbers don't jitter.
- **Section labels:** mono, 10–11 px, uppercase, 0.14 em tracking (the same
  style as the portfolio's chapter labels).
- **Headings:** at most two sizes, a panel title (18 px, 500) and a part name
  (22 px, 500). There's no display type inside the tool.

## 5. The 3D viewport

- **Materials:** keep the real material colours sampled from the hardware for
  the parts. Turn the environment down: a neutral ground grid with a 15 mm
  minor and 150 mm major spacing, fading out with distance.
- **Selection:** a 2 px outline in `--p` plus slight emissive. Hover is a
  1 px outline at 50%. Don't use colour fills for selection; they hide the
  material.
- **Machine state:** use state colours on the moving element only. Running
  stays neutral, and only `warn`/`fault` change colour. Faults pulse at 1 Hz
  and also show in the top bar.
- **Data views (toggle):** I/O heat (bits lit on their sensors), the travel
  envelope (the crane's reach as a faint volume), and errors (sim vs PLC
  deviation as a colour ramp, e.g. the 0.303 mm worst case).
- **Section and explode:** a clipping plane with a glass handle, and an exploded
  view that animates over 600 ms with ease-out, then holds.
- **Camera:** presets (iso, top, front, per station), double-click to focus a
  part, and transitions over 500 ms. No auto-rotate while a panel is open.

## 6. Motion

- UI transitions run 200–300 ms with `cubic-bezier(.16,1,.3,1)`, the
  portfolio's `--ease-out`.
- Machine motion is driven by the simulation clock, never by CSS.
- Honour `prefers-reduced-motion`: cut camera tweens and pulsing, and keep the
  simulation's own motion, since it is the content.

## 7. Themes

- **Light, the default for reviews and screenshots:** a cool-grey ground and white glass.
- **Dark, for long sessions and demos:** a near-black ground, smoked glass and
  slightly emissive accents.
- **Physical AI (optional):** a graphite ground and an orange accent, with the
  same layout. Use it for the live/telemetry mode so "live" is visible at a glance.

Set the theme on `html[data-theme]` before first paint (the inline-script
pattern in the portfolio's `index.html`) to avoid a flash.

## 8. Rollout in stf-hw

1. **Tokens:** copy the token block and glass recipe into one `tokens.css`.
   Replace hard-coded colours in the existing UI.
2. **Shell:** make the viewport full-bleed, then add the four glass zones as
   absolutely positioned layers (`pointer-events: none` on the container and
   `auto` on the panels).
3. **Inspector:** bind it to the existing process-image data (9 DI / 14 DO,
   step and timers). Values in mono with units and a source tag.
4. **Timeline dock:** the 8-phase cycle as segments, with scrub mapped to the
   sim clock.
5. **Viewport polish:** grid, selection outline, state colours, then the data
   views.
6. **Check:** contrast AA on glass over the brightest part of the model,
   keyboard focus order (tree → viewport → inspector → dock), and a 60 fps
   budget with the panels' blur (drop to a solid fill on low-end GPUs).
