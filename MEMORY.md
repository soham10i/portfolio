# Portfolio Memory — Soham Patel

## Project Structure
```
/Users/sohampatel/workspace/Porfolio/
├── backend/                       # Chatbot API server
│   ├── server.js                  # Express + self-hosted LLM integration
│   ├── package.json               # Backend dependencies
│   ├── .env.example               # API key template
│   └── node_modules/
├── app/                          # React + Vite portfolio app
│   ├── src/
│   │   ├── sections/            # Page sections (Hero, Projects, About, etc.)
│   │   ├── components/          # Reusable components (ThemeProvider, WaterRipple, etc.)
│   │   ├── pages/               # Route pages (ProjectDetail)
│   │   ├── data/                # Static data (projects.ts)
│   │   ├── types/               # TypeScript types
│   │   ├── App.tsx              # Main app with routing
│   │   ├── main.tsx             # Entry point
│   │   └── index.css            # Global styles + theme CSS variables
│   ├── public/
│   │   ├── videos/              # Demo videos
│   │   │   ├── maze4.mp4        # 11.9MB — Autonomous Robots SLAM project
│   │   │   ├── scene_classroom.mp4  # 13.5MB — Scene Understanding project
│   │   │   └── scene_processed.mp4  # 258 bytes — EMPTY, unusable
│   │   └── images/              # Project thumbnails
│   ├── index.html
│   ├── vite.config.ts           # base: './' for static export
│   ├── tailwind.config.js
│   └── package.json
└── MEMORY.md                    # This file
```

## Tech Stack
- **Framework:** React 19 + Vite 7 + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Animation:** GSAP (ScrollTrigger) + Framer Motion
- **Smooth Scroll:** Lenis
- **3D (unused in hero):** React Three Fiber + Three.js (installed but neural network bg replaced)
- **Icons:** Lucide React
- **Routing:** React Router DOM
- **State:** Zustand (installed, may be unused)

## Color System (CSS Variables)
### Dark Theme
- Background: `hsl(222, 30%, 5%)` → `#080c14`
- Foreground: `hsl(210, 20%, 96%)`
- Primary: `hsl(217, 91%, 60%)` → blue
- Gradient: `#3b82f6` → `#8b5cf6` (blue → purple)

### Light Theme
- Background: `hsl(210, 30%, 97%)` → very light blue `#f5f7fa`
- Foreground: `hsl(220, 20%, 10%)`
- Primary: `hsl(217, 80%, 50%)`
- Gradient: `#2563eb` → `#7c3aed`

## Video Sources Map
| Project ID | Video File | Size | Status |
|------------|-----------|------|--------|
| `autonomous-robots-slam` | `/videos/maze4.mp4` | 11.9MB | Valid |
| `realtime-scene-understanding` | `/videos/scene_classroom.mp4` | 13.5MB | Valid |
| `scene_processed.mp4` | — | 258B | EMPTY — do not use |

## Project List (7 projects)
1. **Digital Twin Smart Factory** — AI/ML — MQTT, Docker, Streamlit, InfluxDB
2. **Real-Time Scene Understanding** — Computer Vision — YOLOv8, VLM, FastAPI
3. **MedQA RAG Pipeline** — NLP — HuggingFace, LangChain, FastAPI
4. **Wind Turbine Anomaly Detection** — AI/ML — Scikit-learn, CARE Framework
5. **Autonomous Robots SLAM** — Robotics — ROS, Webots, LIDAR
6. **Indoor Localization BLE** — Embedded — Arduino, Kalman/Particle Filters
7. **Smart Home & City** — Fullstack — MQTT, IoT, ML

## Known Blockers
- **STF Factory Layout:** Binary PDF (`536634-Fabrik_Simulation_24V-Belegungsplan.pdf`) and ODS files in `soham10i/stf-hw` repo are unparseable via GitHub API. Component positions are unknown. Need user to provide layout diagram or description.
- **scene_processed.mp4** is empty (258 bytes). Using `scene_classroom.mp4` instead.

## Build Commands
```bash
cd /Users/sohampatel/workspace/Porfolio/app
npm run build      # Static export to dist/
npm run dev        # Dev server on port 3000
```

## Deployment
- **Frontend:** Static export (`base: './'` in vite.config.ts) → Vercel/Netlify/GitHub Pages
- **Backend:** Express server on port 3001, serves both API + static frontend
- **Full deploy:** Build frontend → backend serves `../app/dist/` + `/api/chat`
- **Estimated cost:** $0/month if the model runs on Soham's own machine; a hosted GPU endpoint is the only line item if the demo must be public 24/7

## Chatbot Architecture
- **Model:** self-hosted, OpenAI-compatible (`LLM_API_BASE`). Default local stack: Ollama + `qwen2.5:7b-instruct` (text) and `qwen2.5vl:7b` (vision)
- **Backend:** Express + CORS, calls the model's `/chat/completions`
- **Frontend:** Floating chat widget, calls `/api/chat` endpoint
- **RAG:** System prompt contains complete resume + all projects + experience + skills (~3,000 tokens)
- **No vector DB needed:** the whole profile is ~6k tokens, so it fits in one prompt on any modern context window

## Design Decisions Log
- **Hero background:** Blue radial gradient with 3D depth (replaced water ripple and 3D neural network)
- **Hero name size:** Reduced from `text-[11rem]` to `text-8xl` max
- **Project cards:** CSS 3D transforms with perspective + preserve-3d + hover rotate
- **Light theme:** Blue-tinted instead of pure white for eye comfort
- **Water ripple:** Component kept in codebase but not used in hero
- **Chatbot:** Full LLM integration replacing hardcoded keyword responses
- Static export (`base: './'` in vite.config.ts)
- Can deploy to Vercel, Netlify, GitHub Pages, or any static host
- Estimated cost: $0–$5/month (free tier on most platforms)

## Design Decisions Log
- **Hero background:** Blue radial gradient with 3D depth (replaced water ripple and 3D neural network)
- **Hero name size:** Reduced from `text-[11rem]` to `text-8xl` max
- **Project cards:** CSS 3D transforms with perspective + preserve-3d + hover rotate
- **Light theme:** Blue-tinted instead of pure white for eye comfort
- **Water ripple:** Component kept in codebase but not used in hero
