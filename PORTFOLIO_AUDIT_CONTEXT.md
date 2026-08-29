# Portfolio Audit & Context — Soham Patel

> **Date:** 2026-08-29  
> **Auditor:** AI Agent (read-only audit, no code changes)  
> **Status:** ✅ All builds pass, backend healthy, minor simulation fidelity gaps identified

---

## 1. Project Architecture Overview

```
Porfolio/
├── app/                          # Vite + React 19 + TypeScript + Tailwind frontend
│   ├── src/
│   │   ├── app/App.tsx           # Router shell, lazy-loaded routes
│   │   ├── features/
│   │   │   ├── home/Home.tsx     # Landing page (hero, projects, experience, skills, contact)
│   │   │   ├── projects/         # Project detail pages
│   │   │   ├── factory-twin/     # 3D STF cell viewer + 2D SVG demo
│   │   │   ├── robot/            # Autonomous robot SLAM demo (Webots reimplementation)
│   │   │   ├── scene-lab/        # YOLOv8 in-browser scene understanding
│   │   │   ├── chat/             # JARVIS LLM chat panel
│   │   │   └── notes/            # Markdown notes CRUD
│   │   └── shared/               # Data, palettes, backgrounds, headers
│   ├── public/
│   │   ├── videos/               # maze1-5.mp4, scene_classroom.mp4
│   │   ├── worlds/               # maze1-5-world.json (Webots exports)
│   │   ├── factory-twin-3d.js    # Custom element: Three.js STF renderer
│   │   ├── webots-world-3d.js    # Custom element: Webots world renderer + SLAM controller
│   │   └── vendor/               # three.min.js, OrbitControls.js, ONNX Runtime, KaTeX
│   └── dist/                     # Production build (healthy)
│
├── backend/                      # Express.js API server
│   ├── server.js                 # Entry point
│   └── src/
│       ├── routes/               # chat, contact, scene, notes
│       ├── services/             # llm, captioner
│       ├── middleware/           # security headers
│       └── config.js             # Environment config
│
└── scripts/                      # Build/deploy helpers
```

---

## 2. Build & Health Check Results

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend build (`npm run build`) | ✅ PASS | 1.65s, 2150 modules, no errors |
| TypeScript compilation | ✅ PASS | `tsc -b` clean |
| Vite dev server | ✅ RUNNING | Port 3001 (3000 taken by backend) |
| Backend server | ✅ RUNNING | Port 3000 |
| Backend health `/api/health` | ✅ HEALTHY | Model: qwen2.5:7b-instruct, Vision: qwen2.5vl:7b |
| Scene captioning `/api/scene/status` | ✅ AVAILABLE | VLM engine active, BLIP not configured |
| Notes API `/api/notes` | ✅ WORKING | 1 note present, editable |
| Contact API | ✅ CONFIGURED | POST `/api/contact` wired |
| Video assets (maze1-5) | ✅ ALL PRESENT | Public + dist folders synced |
| World JSONs (maze1-5) | ✅ ALL PRESENT | Spawn positions exported from Webots |

---

## 3. Detailed Component Audit

### 3.1 Home Page (`/`) — Score: 9/10
- **Hero:** Typewriter effect, gradient name, stats card, CTA buttons
- **Projects Grid:** 8 projects, category filter, version tabs (digital-twin), tilt cards
- **Experience Timeline:** 4 roles with tech stacks
- **Skills Matrix:** Production/Strong/Explored tier system with receipts
- **Background:** Canvas particle field with spring physics, parallax aurora, circuit traces
- **Contact Form:** Functional, posts to `/api/contact`
- **Theme Switcher:** 7 palettes (midnight, aurora, amber, terminal, cobalt, daylight, paper)
- **JARVIS Chat:** Floating button → docked/maximized panel, SSE streaming

**Strengths:**
- Exceptional visual design — glass morphism, subtle animations, coherent color system
- `text-wrap: pretty` for readable copy
- Stretched link pattern on project cards (accessible, middle-clickable)
- Reduced motion support in background canvas
- Palette persistence in localStorage

**Minor Issues:**
- `Suspense fallback={null}` at bottom of Home.tsx (line 752) serves no purpose — empty fragment
- Footer year hardcoded to 2026

---

### 3.2 Digital Twin — Factory Demo (`/factory`) — Score: 8/10
- SVG-based 2D schematic of fischertechnik 536634 cell
- Phase-driven simulation (idle → picking → moving → baking → cooling → detecting → sorting → storing)
- MQTT message log, production metrics, sensor readings
- Component selection overlay

**Strengths:**
- Clean SVG layout with interactive stations
- Real-time phase transitions with animation

**Gaps:**
- No actual 3D view here — just a schematic (3D is at `/factory-twin`)
- Color detection uses `Math.random()` (line 264) instead of deterministic cycle logic
- Disclaimer about approximate layout reduces credibility

---

### 3.3 Digital Twin — 3D Viewer (`/factory-twin`) — Score: 9.5/10
- **Custom Element:** `<factory-twin-3d>` renders procedural fischertechnik parts on 15mm grid
- **Materials:** Sampled from real 536634 reference photos (k-means on hue bands)
- **Animation:** Phase-driven HBW lift, VGR arm swing, belt dashes, oven glow, sensor beam, item transport
- **PLC Rail:** Live 9 DI / 14 DO process image from Belegungsplan
- **Telemetry:** Oven temp gauge, conveyor speed, phase progress, color detection, MQTT log
- **Station Inspector:** Click-to-select with real actuator specs (encoder motor: 214 min⁻¹, 25:1, 75 pulses/rev)

**Strengths:**
- Dimensional accuracy: 1 FT unit = 15mm = 0.075 scene units
- Procedural textures (slot pattern, building plate perforation)
- ACES filmic tone mapping, PCF soft shadows, 2048² shadow maps
- Real engineering data: motor ratings, compressor 0.7 bar, sensor 0-9V analog

**Minor Gaps:**
- Webots export tab is placeholder ("not wired")
- No actual MQTT/WebSocket connection — purely simulated

---

### 3.4 Autonomous Robot SLAM (`/robot`) — Score: 7/10

#### Video Tab
| Maze | Video Path | File Size | Status |
|------|-----------|-----------|--------|
| Maze 1 | `/videos/maze1.mp4` | 19.7 MB | ✅ Available |
| Maze 2 | `/videos/maze2.mp4` | 5.5 MB | ✅ Available |
| Maze 3 | `/videos/maze3.mp4` | 3.1 MB | ✅ Available |
| Maze 4 | `/videos/maze4.mp4` | 5.7 MB | ✅ Available |
| Maze 5 | `/videos/maze5.mp4` | 2.2 MB | ✅ Available |

**All 5 videos are present and accessible.** The user's concern about "few videos visible" may be a UI perception issue — videos load correctly when the Video tab is selected.

#### 3D World Tab (Webots Reimplementation)
- Custom element `<webots-world-3d>` with Three.js renderer
- 2D LIDAR raycast → log-odds occupancy grid → frontier detection → A* → pure pursuit
- Live HUD: state, mapped %, occupied cells, distance driven, sim time
- Controls: Play/Pause, Reset, Speed (1×/2×/4×), LIDAR toggle, Plan toggle, FPV toggle

**Controller Parameters (from `mak_04_controller/config.py`):**
```
V_MAX = 0.35 m/s, W_MAX = 2.2 rad/s
ROBOT_RADIUS = 0.128 m, LIDAR_MAX = 5.0 m, LIDAR_RAYS = 120
RES = 0.05 m, GOAL_TOL = 0.16 m, CARROT = 0.42 m
REPLAN_S = 3.0 s
```

**Identified Controller Issues:**

1. **Spawn Position Problem (Maze 4):**
   - Exported robot pos: `[-2.22817, 2.79462, 0.01]`
   - The code has `_ensureOpenSpawn()` that detects enclosed spawns and relocates
   - Maze 4's spawn IS enclosed — the relocation logic runs and shows a warning
   - This is a **data issue in the exported world JSON**, not a code bug
   - **Fix:** Edit `maze4-world.json` robot position to an open cell

2. **Controller Behavior Differences (why web run ≠ desktop Webots):**
   - The JS reimplementation uses a simplified physics model (Euler integration, no wheel slip)
   - No actual differential drive kinematics — uses holonomic-style velocity commands
   - No sensor noise in LIDAR simulation (perfect raycast)
   - A* planner uses grid centers, not continuous space
   - Pure pursuit projects robot onto path, but lookahead logic may differ from Python
   - **Key gap:** The JS controller has `UNSTICK` recovery state, but Python may use different recovery logic
   - **Key gap:** No `mak_02_controller` parameters for mazes 1,2,4,5 — only `mak_04` params are hardcoded
   - The controller params are constant across all mazes, but the real project uses different controllers (`mak_02` vs `mak_04`) with potentially different parameters

3. **Missing Controller Parameters Per Maze:**
   - `CONTROLLER_PARAMS` in `AutonomousRobot.tsx` is static
   - Maze 3 uses `mak_04_controller`, others use `mak_02_controller`
   - The JS engine always uses `mak_04` params regardless of maze

---

### 3.5 Scene Understanding (`/scene`) — Score: 9/10
- YOLOv8n runs in browser via ONNX Runtime Web (13MB model)
- Real-time detection at ~30 FPS (WASM backend)
- Keyframe extraction on scene change + heartbeat
- BLIP captioning via `/api/scene/describe` (VLM fallback available)
- Session library for saved clips
- Privacy-first: frames never leave device, only keyframes sent for captioning

**Strengths:**
- Graceful degradation when captioning service offline (local descriptions)
- Deterministic clip scanning (seek-based, not playback-based)
- Video size limits (300MB) and duration limits (4 min)
- Q&A over keyframe log

---

### 3.6 JARVIS Chat — Score: 8.5/10
- SSE streaming from `/api/chat/stream`
- Markdown rendering with KaTeX
- Suggestion chips, clear history, maximize/minimize
- Greets with personality ("zero corporate fluff")

**Strengths:**
- Lenis scroll lock when maximized
- Smooth scroll to bottom on new messages
- Error handling with retry guidance

---

### 3.7 Notes System — Score: 8/10
- Markdown notes with KaTeX math support
- Admin-token protected writes (localStorage)
- Reading time, word count, tags
- One published note: "Diffusion models from scratch" (5074 words)

---

## 4. UI/UX Rating (Detailed)

| Category | Score | Rationale |
|----------|-------|-----------|
| Visual Design | 9.5/10 | Coherent glass-morphism system, 7 palettes, thoughtful depth |
| Typography | 9/10 | JetBrains Mono + system sans, excellent hierarchy |
| Animation | 9/10 | Spring physics background, subtle card tilt, smooth transitions |
| Accessibility | 7.5/10 | Good color contrast, reduced motion support, missing some ARIA labels |
| Performance | 8.5/10 | Lazy routes, code-split 3D engines, ~490KB main bundle |
| Mobile Responsiveness | 8/10 | Most sections adapt well, some 3D viewers need scroll handling |
| Information Architecture | 9/10 | Clear project hierarchy, version tabs, skill matrix with receipts |
| Interactivity | 9/10 | Live simulations, chat, theme switching, contact form |
| **Overall UI/UX** | **8.5/10** | **Polished, professional, memorable** |

---

## 5. Market Readiness Assessment

| Factor | Status | Notes |
|--------|--------|-------|
| Production Deploy | ✅ Ready | Render/Fly.io configured (render.yaml, fly.toml) |
| Backend Resilience | ⚠️ Good | LLM dependency (qwen2.5) — graceful degradation exists |
| SEO | ✅ Good | Meta tags, OG/Twitter cards, semantic HTML |
| Performance | ✅ Good | 1.65s build, lazy loading, DPR-capped canvas |
| Content Freshness | ⚠️ OK | Notes section could have more entries |
| Project Diversity | ✅ Strong | 8 projects across AI/ML, CV, NLP, Robotics, Fullstack, Embedded |
| Call to Action | ✅ Clear | "Open to roles", contact form, email, GitHub |
| **Overall Market Score** | **8.5/10** | **Ready for job search, competitive for Industrial AI roles** |

---

## 6. P0 Issues (Critical)

### P0.1: Maze 4 Spawn Position
- **File:** `app/public/worlds/maze4-world.json`
- **Issue:** Robot spawn `[-2.22817, 2.79462]` is inside a closed pocket
- **Impact:** Browser simulation shows "Spawn relocated" warning, starts from wrong position
- **Fix:** Update robot position in JSON to an open cell near the maze entrance
- **Verification:** Check `_ensureOpenSpawn()` logs in console to find relocated position, then update JSON

### P0.2: Controller Parameters Not Per-Maze
- **File:** `app/src/features/robot/AutonomousRobot.tsx` lines 39-48
- **Issue:** `CONTROLLER_PARAMS` is static, but real project uses `mak_02` (mazes 1,2,4,5) and `mak_04` (maze 3) with different configs
- **Impact:** Simulation behavior may not match recorded videos for non-maze3 maps
- **Fix:** Load per-maze controller parameters, or at least document which controller each maze uses

---

## 7. P1 Issues (Important)

### P1.1: Three.js → CAD-Quality Simulation Upgrade Path

**Current State:**
- Factory twin uses procedural geometry (BoxGeometry, CylinderGeometry) with Canvas textures
- Parts are dimensionally accurate but visually primitive
- No actual CAD model import

**Recommended Upgrade Path to CAD-Quality:**

1. **Option A: glTF/GLB Import (Recommended)**
   - Export actual fischertechnik CAD models from SolidWorks/Fusion 360 to `.glb`
   - Use `THREE.GLTFLoader` to import detailed meshes
   - Benefits: Real part geometry, realistic materials, smaller file sizes than procedural
   - Tools: Blender (optimize), glTF-Pipeline (compress with Draco)

2. **Option B: STEP/IGES → Three.js Pipeline**
   - Convert STEP files to glTF using `step-to-gltf` or FreeCAD
   - More engineering-accurate but heavier pipeline

3. **Option C: Enhance Procedural Geometry (Lightweight)**
   - Add beveled edges (ChamferBox) to all parts
   - Add screw heads, mounting holes as geometry (not just texture)
   - Add cable routing, pneumatic tubing
   - Use environment mapping for metallic parts
   - Add part labels/annotations

4. **Lighting & Material Improvements:**
   - Add environment map (HDRI) for realistic reflections on aluminium/chrome
   - Use `MeshPhysicalMaterial` with `clearcoat` for plastic parts
   - Add ambient occlusion ( SSAO or baked AO textures)

5. **UI Enhancements for CAD Feel:**
   - Add measurement callouts (dimension lines)
   - Add exploded view mode (parts separate along axes)
   - Add section cut view (clipping planes)
   - Add BOM (Bill of Materials) panel

### P1.2: Webots Controller Fidelity
- The JS controller is a reimplementation, not the actual Python code
- **Recommendation:** Consider embedding the actual Python controller via:
  - Pyodide (WASM Python in browser) — heavy but authentic
  - Or document clearly that this is a "behavioral approximation"
  - Or pre-record all 5 maze runs as the primary demo, with 3D as secondary

### P1.3: Factory Twin WebSocket Connection
- Currently simulated MQTT log — no real connection
- **Recommendation:** Add optional WebSocket connection to actual STF gateway for live demo (when hardware is running)

---

## 8. Quick Wins (No-Code/Low-Code)

1. ✅ All maze videos already present — no action needed on video files
2. Update `maze4-world.json` robot spawn position (one-line JSON edit)
3. Add more notes to the notes section (shows ongoing learning)
4. Update footer year to be dynamic
5. Add a "Last updated" timestamp to the site

---

## 9. File Inventory (Key Files)

| File | Purpose | Health |
|------|---------|--------|
| `app/src/shared/data/portfolio.ts` | Single source of truth for all content | ✅ |
| `app/src/app/App.tsx` | Router with lazy loading | ✅ |
| `app/src/features/home/Home.tsx` | Landing page | ✅ |
| `app/src/features/factory-twin/FactoryTwin3D.tsx` | 3D twin host page | ✅ |
| `app/public/factory-twin-3d.js` | Three.js custom element renderer | ✅ |
| `app/src/features/robot/AutonomousRobot.tsx` | Robot demo host page | ⚠️ (P0.2) |
| `app/public/webots-world-3d.js` | Webots reimplementation | ⚠️ (fidelity gap) |
| `app/public/worlds/maze4-world.json` | Maze 4 world data | ⚠️ (P0.1 spawn) |
| `app/src/features/scene-lab/SceneLab.tsx` | YOLO demo | ✅ |
| `app/src/features/chat/components/ChatPanel.tsx` | JARVIS chat | ✅ |
| `backend/server.js` | Express API | ✅ |
| `backend/src/routes/chat.js` | LLM SSE streaming | ✅ |
| `backend/src/routes/scene.js` | Captioning proxy | ✅ |

---

## 10. Summary

This is a **highly polished, production-ready portfolio** that effectively communicates expertise in Industrial AI, Digital Twins, and Production Systems. The build is healthy, the backend is functional, and the visual design is exceptional.

**Top strengths:**
- Dimensional accuracy in 3D twin (15mm fischertechnik grid)
- Real engineering data (PLC I/O map, actuator specs)
- Privacy-first browser-based ML (YOLOv8n)
- Coherent design system with 7 palettes
- Live chat assistant with streaming

**Priority actions:**
1. Fix maze4 spawn position in world JSON
2. Add per-maze controller parameters
3. Consider CAD-quality upgrade path for factory twin
4. Document the Webots controller as "behavioral approximation" vs actual Python


---

## 11. Changes Made (2026-08-29)

### 11.1 Ocean Water Surface Background
**File:** `app/src/shared/components/SiteBackground.tsx`

**What changed:**
- Removed the fast particle-node system (dots, circles, link lines, ripple rings)
- Replaced with a calm water surface simulation using a 2-D heightfield grid
- Base motion: 4 interfering long-period sine waves (ocean swell), very slow and subtle
- Interaction: cursor movement creates damped radial ripples that propagate outward at 140 px/s
- Rendering: horizontal contour bands whose opacity and vertical offset follow the wave height
- No circles, no dots, no particles — just smooth flowing bands
- `prefers-reduced-motion` fallback: static gradient bands with imperceptible drift
- Kept the aurora parallax layers above the water for depth

**Parameters:**
- Grid spacing: 14 px
- Wave propagation speed: gentle (PROPAGATION = 0.22)
- Ripple decay: very slow (DAMPING = 0.985)
- Swell amplitude: 0.08 (very subtle)
- Max ripples: 60 (capped)

### 11.2 Rich Project Detail Content
**New file:** `app/src/features/projects/lib/projectDetailContent.ts`
**Updated file:** `app/src/features/projects/ProjectDetail.tsx`

**What changed:**
- Created detailed content for all 7 non-twin projects:
  - `scene` — Scene Understanding (problem, approach, architecture, results, technical notes)
  - `medqa` — MedQA RAG (problem, approach, architecture, results, technical notes)
  - `wind` — Wind Turbine PdM (problem, approach, architecture, results, technical notes)
  - `slam` — Autonomous Robot SLAM (problem, approach, architecture, results, technical notes)
  - `ble` — Indoor Localization (problem, approach, architecture, results, technical notes)
  - `cv-uad` — Brain-MRI Segmentation (problem, approach, architecture, results, technical notes)
  - `smart-home` — Smart Home IoT (problem, approach, architecture, results, technical notes)

- Each project now renders:
  - Problem statement section
  - Approach section with bullet cards
  - Architecture section with tiered component tags
  - Results/metrics strip (colored telemetry cards)
  - Technical notes section
  - Dynamic JARVIS prompt per project

- Build verified: ✅ TypeScript clean, Vite production build 1.40s

### 11.3 File Inventory (Updated)

| File | Purpose | Status |
|------|---------|--------|
| `app/src/shared/components/SiteBackground.tsx` | Ocean water surface background | ✅ Rewritten |
| `app/src/features/projects/lib/projectDetailContent.ts` | Rich content for all projects | ✅ New |
| `app/src/features/projects/ProjectDetail.tsx` | Project detail renderer | ✅ Updated |
