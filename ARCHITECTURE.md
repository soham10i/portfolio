# Code structure

Both halves are organised by **feature**, not by file type. The old layout
grouped every page together, every component together and every library
together, which meant a change to one project touched four directories and no
directory told you what the system did.

## Frontend — `app/src`

```
app/          the shell: routing, entry point, global stylesheet
features/
  chat/       JARVIS — launcher, panel, markdown renderer
  factory-twin/  Industry 4.0 digital twin: 3D page, cell diagram, PLC I/O
  home/       the landing page
  notes/      study notes: index, reader, editor, KaTeX renderer, API client
  projects/   project detail pages and card previews
  robot/      autonomous-robot maze viewer
  scene-lab/  real-time scene understanding: YOLO, video probing, session store
shared/
  components/ site header, background, palette menu
  data/       the portfolio profile
  lib/        palettes, smooth scrolling
```

Each feature owns its pages, its components and its own `lib/`. Anything used
by two or more features moves to `shared/`; nothing else does.

## Backend — `backend/`

```
server.js       wiring only: middleware order, route mounting, static serving
src/
  config/       every environment-derived value, in one place
  middleware/   security headers, rate limiting, admin auth
  prompts/      JARVIS's knowledge base (content, not code)
  routes/       chat, contact, scene, notes
  services/     llm (one transport for every model call), captioner, notesStore
```

`server.js` went from 1,016 lines to 70. Nothing outside `src/config` reads
`process.env`, so what the service needs in order to run is answerable by
reading one file.

## What was removed

A module-graph traversal from `main.tsx` found **71 of 103 TypeScript files
unreachable** — 53 shadcn/ui components, 8 page sections, a duplicate chatbot,
four data modules, two hooks and the type barrel. All deleted.

The same traversal showed **50 of 56 runtime dependencies unused**, including
`three` and `@react-three/*` (the 3D pages use the vendored engine in
`public/vendor`, not the npm package), `recharts`, `zustand`, `zod`,
`react-hook-form` and 26 Radix packages. The dependency list is now six:
`react`, `react-dom`, `react-router-dom`, `framer-motion`, `lenis`,
`lucide-react`. `npm install` removed 294 packages.

A second, subtler removal: `ThemeProvider` set a `data-theme` attribute that
the palette system then overrode with inline custom properties. Two theming
mechanisms were fighting over the same tokens; only the palette system remains,
and it is applied before React mounts so the first paint is already correct.
