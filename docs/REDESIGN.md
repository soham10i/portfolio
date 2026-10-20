# Portfolio Redesign — System Design

Status: proposal · 2026-10-20

A from-scratch redesign of the public portfolio front end: a scroll-told story
with a 3D centrepiece, glass UI chrome, and projects presented as collectible
cards. The demos (`/scene`, `/medqa`, `/robot`, `/notes`) and the backend stay
as they are. The STF digital twin moves out to its Google Cloud deployment and
the portfolio links to it.

---

## 1. Requirements

### What the references actually contribute

| Site | What we take | What we leave |
|---|---|---|
| **evanfasquelle.com** (primary) | Projects as physical **cards** you pick up and drag; giant name set in grotesk behind the cards; serif italic accents (Neue Haas + Instrument Serif); a floating "Open to new opportunities" pill with click-to-copy email; "x / N collected" progress counter; a playful 404. It is a Vite SPA with 3D via Spline. | The warm beige palette (we want cool), the Spline runtime |
| **shapeofintelligence.com** (layout) | **Chapter structure**: oversized hero type with a 3D form threaded through it, numbered chapters `01 / 08`, a persistent **bottom bar** (chapter counter, motion toggle, sound toggle), line-by-line text reveal on scroll, an "inside the archive" list under each chapter | The museum/audio-narration depth |
| **designisfunny.co** | Numbered anchor nav (`01/Hey 02/About 03/Work 04/Contact`), roman + *italic* mix in headings, preloader with % count | — |
| **nivora.framer.website** | Section rhythm: services/capabilities → process steps → work → FAQ-style closing | Template filler (team, testimonials) |
| **weevolveit.com** | Marquee band, animated counters, phase navigator for a step method | Mega-menus, review widgets |

### Functional

1. A visitor understands who Soham is and what he builds within the first viewport.
2. Every project is reachable as a card on the home page and as a case-study page.
3. The STF digital twin is one click from the home page, opening the live Google Cloud deployment.
4. The existing live demos stay reachable and unchanged.
5. Contact in one click (copy email, CV download, LinkedIn/GitHub).
6. Visitors can switch off motion; the site stays complete without WebGL.

### Non-functional

| Target | Budget |
|---|---|
| LCP (4G, mid-range phone) | < 2.5 s, with the hero text, not the 3D, as the LCP element |
| Initial JS, gzipped | < 180 KB (React, router, Lenis, GSAP core). The 3D chunk loads after first paint |
| 3D chunk, gzipped | < 350 KB (three + R3F + drei subset) plus models < 1.5 MB (Draco/Meshopt) |
| Frame rate | 60 fps desktop, ≥ 45 fps mid-range mobile; lower quality automatically before dropping frames |
| Accessibility | WCAG 2.1 AA contrast on glass, full keyboard nav, `prefers-reduced-motion` honoured |
| SEO | All copy is real DOM text, never rendered inside the canvas |
| Cost | Stays on the current free Render instance |

### Constraints

- One developer. Existing stack: React 19, Vite 7, Tailwind 3, Framer Motion, Lenis (already installed).
- Content already lives in `app/src/shared/data/portfolio.ts`. Reuse it.
- `Home.tsx` is 923 lines. It is replaced, not refactored.

---

## 2. High-level design

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│                                                                          │
│  ┌──────────── DOM layer (z: 10+) ─────────────┐                         │
│  │ GlassNav  · BottomBar (chapter, motion, %)  │  ← backdrop-filter glass │
│  │ Sections: Hero · About · Work · Lab · Contact│  ← real text, SEO, a11y  │
│  └─────────────────────┬───────────────────────┘                         │
│                        │ scroll progress, active chapter, hovered card   │
│                        ▼                                                 │
│  ┌──────── Motion core (single RAF loop) ──────┐                         │
│  │ Lenis (smooth scroll)  ──► GSAP ScrollTrigger│                         │
│  │        └──────────► zustand store ◄──────────┘                         │
│  └─────────────────────┬────────────────────────┘                        │
│                        ▼                                                 │
│  ┌──────── WebGL layer (z: 0, fixed, lazy) ────┐                         │
│  │ R3F <Canvas> · Hero glass form · Card deck  │                         │
│  │ Environment/HDRI · post-processing (bloom)  │                         │
│  │ Quality tiers via detect-gpu + PerfMonitor  │                         │
│  └──────────────────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────┘
          │ static assets (immutable, hashed)        │ /api/* (unchanged)
          ▼                                          ▼
   Render web service: express serves app/dist + API     Google Cloud
                                                          STF twin (external link)
```

**The key idea:** one fixed, full-screen WebGL canvas sits behind the whole
page, and the DOM scrolls over it. Sections don't own 3D scenes. They publish
"where we are" (scroll progress, active chapter, hovered project) to a small
store, and the single canvas reacts. That keeps it to one GL context, one render
loop, and no context loss when navigating. This is the same model Shape of
Intelligence and most Awwwards sites use.

### Page anatomy (home `/`)

```
00  Preloader         0% → 100% counter, Instrument Serif italic; fades into hero
01  Hero              "Soham Patel" in grotesk at ~18vw, glass form threading
                      through the letters (drag to deform: rules → learning →
                      context, like SoI). Roles rotate below. "Begin ↓"
02  About             Line-by-line masked text reveal. Stats as counters
                      (weevolveit). Domains as glass chips.
03  Work (pinned)     The card deck (Evan). Section pins for ~N×100vh; scroll
                      fans the cards out one by one in 3D; each card shows
                      01/05, title, year, tag, "featured". Click → case study.
                      Drag to toss on desktop. "3 / 5 explored" in the bottom bar.
04  Live lab          STF digital twin hero card: looping MP4 of the cycle
                      (already in app/public/stf/*.mp4) + "Launch live twin ↗"
                      to Google Cloud. Then smaller glass tiles for /scene,
                      /medqa, /robot.
05  Experience        Timeline as a horizontal scroll band (pinned).
06  Method            Four-step phase navigator (weevolveit): Model → Simulate
                      → Deploy → Measure, driven by real project examples.
07  Contact           Giant "Let's build *something*." Glass pill: copy email,
                      CV, LinkedIn, GitHub. Marquee band of the stack.
──  BottomBar (fixed) Chapter 03 / 07 · progress line · Motion on/off · Theme
──  Floating pill     "● Open to new opportunities" — click copies email
```

### Routes

| Route | Change |
|---|---|
| `/` | New story page (above) |
| `/work/:id` | New case-study template. Replaces `/project/:id`, which redirects |
| `/about` | Optional long-form page with CV, education, languages |
| `/stf-layout` | Redirects to the Google Cloud URL (`VITE_STF_URL`) |
| `/scene` `/medqa` `/robot` `/factory*` `/notes*` | Unchanged; adopt the new GlassNav only |
| `*` | 404 with a "trap card" (Evan homage) |

Card → case-study navigation uses the **View Transitions API** (Chrome/Edge/Safari 18+)
so the card morphs into the case-study header, with a plain cross-fade fallback.

---

## 3. Deep dive

### 3.1 Technology choices

| Concern | Choice | Why / trade-off |
|---|---|---|
| 3D | **three + @react-three/fiber + drei** | Full control, tree-shakeable, fits React. *Spline* (Evan's choice) is quicker to author but ships a ~1 MB runtime and caps control over performance. Models can still be authored in Spline/Blender and exported as `.glb`. |
| Glass in 3D | drei `MeshTransmissionMaterial` | Real refraction and chromatic aberration. Expensive: limit to 1–2 meshes and lower `samples`/`resolution` on lower tiers. |
| Glass in UI | CSS `backdrop-filter: blur() saturate()` + 1px inner highlight + noise texture | Apple-style "liquid glass". Works over the canvas because the canvas is a normal layer below. Fallback to a solid translucent fill where unsupported. |
| Smooth scroll | **Lenis** (already installed) | Drives GSAP's ticker so scroll, ScrollTrigger and R3F share one RAF |
| Scroll choreography | **GSAP + ScrollTrigger + SplitText** (all free since 2025) | Pinning, scrubbing and text splitting are its strength. Framer Motion stays for component-level state: hover, presence, layout. |
| Shared state | **zustand** (~1 KB) | R3F reads it inside `useFrame` without React re-renders |
| Card physics (desktop) | Custom spring (no physics engine) | Rapier adds ~400 KB for a drag-and-toss effect a damped spring imitates well |
| Styling | Tailwind 3 + CSS variables for tokens | Already in place |

### 3.2 Visual system ("cool premium")

Dark-first, with a light "Frost" theme behind the existing palette toggle.

| Token | Midnight (default) | Frost (light) |
|---|---|---|
| `--bg` | `#06080C` | `#E8ECF1` |
| `--bg-2` (gradient mesh) | `#0B1220 → #101A2E` | `#F4F7FA → #DCE4EE` |
| `--ink` | `#EEF2F7` | `#0C1016` |
| `--ink-dim` | `#8A94A6` | `#5A6576` |
| `--accent` (ice) | `#7FB2FF` | `#2F6BFF` |
| `--accent-2` (cyan) | `#6EE7F0` | `#0EA5B7` |
| `--accent-3` (violet) | `#A78BFA` | `#6D4AFF` |
| `--glass-fill` | `rgba(255,255,255,.06)` | `rgba(255,255,255,.55)` |
| `--glass-stroke` | `rgba(255,255,255,.14)` | `rgba(255,255,255,.8)` |

- **Type:** a neo-grotesk for display (Neue Haas is licensed; free stand-ins are
  *Inter Display* or *Geist*) + **Instrument Serif** italic for accent words
  (free, Google Fonts) + *Geist Mono* for labels like `01 / 07`. Self-host
  and preload the display weight only.
- **Glass recipe:** `backdrop-filter: blur(24px) saturate(160%)`, fill
  `--glass-fill`, 1px stroke, an inset top highlight
  (`inset 0 1px 0 rgba(255,255,255,.25)`), 2% SVG noise, radius 20–28px.
  Body text never sits on glass without a contrast check: keep the fill dense
  enough for 4.5:1.
- **Motion language:** one easing family (`expo.out` for reveals, spring for
  drag), durations 0.6–1.2 s, stagger 40–60 ms per line. Nothing loops
  except the marquee and the hero idle.

### 3.3 Content model

Extend the existing `Project` type rather than invent a CMS. A CMS is
unnecessary for about 6 projects edited by one person.

```ts
interface Project {
  // existing fields …
  slug: string;              // URL id, replaces `id` in routes
  number: string;            // "01"
  year: string;              // card face
  featured?: boolean;        // card badge
  card: {
    cover: string;           // /media/cards/<slug>.avif, 900×1260
    tint: string;            // per-card accent for the 3D rim light
  };
  liveUrl?: string;          // external deployment (STF → Google Cloud)
  demoRoute?: string;        // internal demo (/scene, /medqa …)
  loopVideo?: string;        // muted autoplay preview
  caseStudy?: { problem: string; approach: string; result: string; metrics: string[] };
}
```

The STF URL comes from `import.meta.env.VITE_STF_URL`, so it can change without a code edit.

### 3.4 Performance and degradation

```
on load:  detect-gpu tier + navigator.hardwareConcurrency + prefers-reduced-motion
          + saveData + viewport width
            │
   ┌────────┼──────────────┬─────────────────────┐
 tier 3   tier 2          tier 1 / mobile        reduced-motion / no WebGL
 full     DPR≤1.5,        DPR 1, no             no canvas: poster AVIF of the
 transm.  transm. low     transmission (use     hero form, CSS-only reveals,
 + bloom  samples, no     physical mat), cards  no Lenis (native scroll)
          bloom           as DOM swipe carousel
```

- `<PerformanceMonitor>` (drei) steps the tier down at runtime if fps drops.
- `frameloop="demand"` when the hero is off-screen and no card is animating.
- The canvas chunk is imported after `requestIdleCallback`. The hero text is
  the LCP element and never waits on WebGL.
- Models: `gltf-transform` → Meshopt + KTX2 textures. Covers are AVIF with a WebP fallback.
- The `/demo` routes keep lazy loading as they do today.

### 3.5 Accessibility

- Skip link; `01/Hey`-style nav uses real anchors.
- The motion toggle in the bottom bar persists to `localStorage` and overrides the OS setting both ways.
- Draggable cards are also focusable buttons; Enter opens the case study.
- The canvas is `aria-hidden`. Everything it conveys exists in the DOM.

---

## 4. Deployment and reliability

Unchanged topology: one Render service serves `app/dist` and `/api/*` from a single origin.

- **Caching:** hashed assets `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` `no-cache`. Already supported by express static. Just set it.
- **Cold starts:** the free Render instance sleeps. The home page is static, so
  the real fix is to put it on a CDN. Options are in §5.
- **STF link health:** the Live lab card pings `VITE_STF_URL` with a `no-cors`
  HEAD on hover. If unreachable, the card shows "Live twin waking up…" and
  offers the recorded cycle video instead of a dead link. Cloud Run cold starts
  make this worth doing.
- **Monitoring:** Vercel/Cloudflare Web Analytics or a tiny `web-vitals` beacon
  to `/api/vitals` to watch LCP/INP on real devices after launch.

---

## 5. Trade-offs and decisions

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Framework | Keep **Vite SPA** | Next.js / Astro | The demos are SPA-heavy and already work. Real DOM text gives enough SEO for a portfolio. Astro would win on first paint, but the migration cost isn't justified now. |
| 3D authoring | **R3F in code**, models from Blender/Spline as glb | Spline viewer | Bundle size and fps control |
| One canvas vs per-section | **One fixed canvas** | Canvas per section | One GL context, no context-loss bugs, shared assets |
| Scroll engine | **Lenis + GSAP** | Framer `useScroll` only | Pinning and scrubbed timelines are much easier in GSAP |
| STF | **External link + video preview** | `<iframe>` embed | An embedded 3D twin inside a 3D page means two GL apps, double the GPU load, and cross-origin focus traps. Link out instead. |
| Hosting the static site | **Stay on Render** (v1) | Cloudflare Pages for `dist`, Render for API | CDN edge plus no cold start on the home page, at the cost of CORS and a split deploy. **Revisit first.** |
| Gamified "collected" counter | **Include, lightweight** (localStorage) | Skip | It is Evan's signature, cheap to build, and gives visitors a reason to open every project |

---

## 6. Delivery plan

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundations** | Tokens, fonts, GlassNav, BottomBar, Lenis+GSAP+zustand wiring, `useQuality()` hook, content-model extension | Empty sections scroll smoothly; theme and motion toggles work |
| **1. Hero** | Preloader, giant type, R3F canvas with the glass form, drag-to-deform, poster fallback | LCP < 2.5 s on a throttled Moto G profile; reduced-motion shows the poster |
| **2. Work deck** | Pinned card fan-out, drag/toss, collected counter, mobile swipe carousel, card covers | Cards keyboard-reachable; 60 fps on M-series, ≥ 45 on mid Android |
| **3. Case study + transitions** | `/work/:id` template, View Transition morph, redirects from `/project/:id` | Every project has a case-study page |
| **4. Live lab, Experience, Method, Contact** | STF card with health ping + video, horizontal timeline, phase navigator, marquee, copy-email pill | STF link verified against Google Cloud |
| **5. Polish and ship** | 404 trap card, Lighthouse/axe pass, model compression, cache headers, vitals beacon | Lighthouse ≥ 90 perf on desktop, ≥ 80 on mobile; axe clean |

New dependencies: `three`, `@react-three/fiber`, `@react-three/drei`,
`@react-three/postprocessing`, `gsap`, `zustand`, `detect-gpu`.

---

## 6a. Design direction (revision, 2026-10-20)

A critique of the first build, and what changed:

| Problem | Change |
|---|---|
| Six floating pills (three top, three bottom) competed with the content, and the header had no relationship to the hero | **One header in two tiers.** A monospace *status line* (name decoding in, coordinates, live Paderborn time, "Open to work" with copy-email) folds away on scroll and leaves a single glass capsule: identity, chapters, actions. The bottom bar is one capsule. |
| Every chapter was the same navy, so nothing stood out | **Rhythm.** The Work chapter is a light "gallery" panel with rounded corners (Apple alternates grounds the same way). Project colours read as colour there, not glow. |
| Glass chrome turned into a grey smear over the light chapter | **Adaptive chrome.** The header and bottom bar each switch to light glass while a light chapter passes beneath them. |
| Anchor jumps landed with a large empty band above the chapter label | Chapters pad for the header themselves (`.chapter`) and opt out of the global 80px anchor offset (`data-anchor-offset="0"`). |
| Cards were empty gradients | Cards carry the impact line, the first three technologies and a status badge (Featured / Soon / explored dot). |

Still to come in Phase 1–2, and the moves that make it feel premium:
the 3D glass hero form, the pinned card deck, a magnetic cursor on primary
actions, and real project imagery (a still or loop per card). The site
should earn its "wow" from one signature 3D moment and restraint everywhere
else, not from more glass.

## 6b. Gallery art direction (revision, 2026-10-20)

The Work chapter's light "gallery" look is now the site's single art
direction, on the home page and the project pages:

- a cool grey ground (`--ground`) with every chapter as a rounded, inset panel
  carrying two soft colour fields (`--t1`/`--t2`, set per section or from the
  project's `tint`);
- white liquid-glass cards, near-black ink, an ink pill for primary actions,
  and Instrument Serif italics for accent words;
- tokens fixed on `.story` (story.css), so there is no theme picker on these
  pages. The palette default elsewhere is now Daylight, so the demos and notes
  open light as well.

The STF digital twin is no longer built or served from this repository. Its
project page frames the Cloud Run deployment and links to
github.com/soham10i/stf-hw; the old `/factory`, `/factory-twin` and
`/stf-layout` routes redirect to that page.

## 6c. Dark mode, JARVIS, chat storage, project visuals (2026-10-20)

- **Dark mode.** The gallery tokens have a dark variant under
  `html[data-theme="dark"]` (set before first paint by index.html: stored
  choice, else the OS). The sun/moon switch lives in the bottom bar and the
  project-page header; choosing a theme also moves the demos' palette
  (Midnight / Daylight) so every page agrees.
- **JARVIS** is rebuilt in the same system (`.jarvis` scope shares the
  tokens): an animated conic orb, an editorial transcript with ink bubbles for
  the visitor, suggestion rows, and a capsule composer; voice is unchanged.
- **Chat storage.** The backend stores each turn in Supabase
  (`backend/src/services/chatStore.js`, schema in
  `supabase/migrations/20261020_jarvis_chat.sql`) under a random conversation
  id the browser keeps, and `GET /api/chat/history` restores it on reload.
  Server-side only, best-effort: a Supabase failure never breaks the chat.
- **No iframe.** The STF service forbids framing, so the live twin is shown
  as a real screenshot in a browser-window frame that opens the site
  (`LiveShot`). Projects without a screenshot get generative cover art
  (`ProjectCover`); cards and covers tilt toward the pointer (`useTilt`).

### Live twin embedding

The STF service currently sends `X-Frame-Options: DENY` and
`frame-ancestors 'none'`, so no browser will show it in a frame.
`docs/stf-allow-embed.patch` (for the stf-hw repo) makes framing opt-in through
`STF_FRAME_ANCESTORS`. Deploy that to Cloud Run with the portfolio's origins,
then build the portfolio with `VITE_STF_EMBED=true`. Until then the Lab button
opens the twin in a new tab. Inside a cross-site frame the twin's guest
cookie (`SameSite=Lax`) is not sent, so per-guest features (chat, copilot
history) start fresh on each request. The 3D view itself is unaffected.

## 7. What to revisit as it grows

1. **Static hosting on a CDN.** This comes first, because the Render cold start is the biggest UX risk on a portfolio.
2. **Astro or SSR** if SEO or first paint becomes the priority. The section components port cleanly if they stay presentational.
3. **A headless CMS** (Prismic, like both Evan and Design is Funny) only if updates become frequent or non-code.
4. **Sound design** (SoI has it). It is cheap to add behind the existing toggle once the motion is final.

## 8. Open inputs needed

- [x] Google Cloud URL for the STF twin (defaulted in `shared/lib/env.ts`)
- [ ] Deploy `docs/stf-allow-embed.patch` to Cloud Run, then set `VITE_STF_EMBED=true`
- [ ] Embedded Intelligence (project 9): source code and a description
- [ ] Paderborn M.Sc. start date and expected end, and whether the OTH entry's Aug 2026 end still holds
- [ ] Portrait or avatar for the hero/profile card (Evan's "Digital Designer" card) — or go typographic only
- [ ] Which 5–6 projects get cards, and which one is "featured"
- [ ] Default theme: Midnight (dark, recommended for glass) or Frost (light)
