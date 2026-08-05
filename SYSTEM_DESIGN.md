# Soham Patel Portfolio — System Design Document

## Overview
A modern, highly interactive, dark-themed portfolio web application built with React + TypeScript + Vite + Tailwind CSS + shadcn/ui. Features smooth scroll-driven animations, interactive project showcases with embedded demos, and an LLM-powered chatbot with RAG capabilities and 10% humor.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | React 19 + Vite 7 | UI framework + build tool |
| Language | TypeScript 5 | Type safety |
| Styling | Tailwind CSS 3.4 + shadcn/ui | Utility-first CSS + component primitives |
| Routing | React Router v7 | SPA navigation |
| Animations | GSAP + ScrollTrigger + Lenis | Scroll-driven animations, smooth scroll |
| React Animations | Framer Motion | Component-level animations |
| Icons | Lucide React | Iconography |
| State | React hooks + Zustand (lightweight) | Global state for chatbot, theme |
| Chatbot Backend | FastAPI (Python) + OpenAI/Anthropic API + vector store | LLM chat with RAG |
| Deployment | Vercel (Frontend) + Fly.io/Railway (Backend) | Hosting |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Portfolio   │  │  Interactive │  │      Chatbot Widget      │  │
│  │   Sections   │  │   Demos      │  │  (Floating, collapsible) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                 │                      │                  │
│         └─────────────────┴──────────────────────┘                  │
│                           │                                        │
│                    React Router (SPA)                               │
│                           │                                        │
│         ┌─────────────────┴──────────────────────┐                  │
│         │            GSAP + Lenis                │                  │
│         │       (Scroll animations, smooth)      │                  │
│         └────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CHATBOT BACKEND                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   FastAPI    │  │  LLM Service │  │    Vector Store (RAG)    │  │
│  │   Server     │  │  (OpenAI/    │  │  (ChromaDB / Pinecone)   │  │
│  │              │  │   Anthropic) │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                 │                      │                  │
│         └─────────────────┴──────────────────────┘                  │
│                           │                                        │
│              Knowledge Base: Resume + Project Docs                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
app/
├── public/
│   ├── images/           # Project screenshots, profile photos
│   ├── videos/           # Demo recordings
│   ├── resume.pdf        # Downloadable CV
│   └── favicon.ico
├── src/
│   ├── App.tsx           # Root router
│   ├── main.tsx          # Entry point
│   ├── index.css         # Global styles + CSS variables
│   ├── pages/
│   │   ├── Home.tsx      # Landing page (all sections)
│   │   └── ProjectDetail.tsx  # Individual project deep-dive
│   ├── sections/         # Page sections
│   │   ├── Hero.tsx
│   │   ├── About.tsx
│   │   ├── Experience.tsx
│   │   ├── Projects.tsx
│   │   ├── ProjectShowcase.tsx
│   │   ├── Skills.tsx
│   │   ├── Research.tsx
│   │   ├── Academics.tsx
│   │   ├── Contact.tsx
│   │   └── Footer.tsx
│   ├── components/
│   │   ├── ui/           # shadcn/ui components (auto-generated)
│   │   ├── Navigation.tsx
│   │   ├── Chatbot.tsx   # Floating LLM chatbot
│   │   ├── ChatMessage.tsx
│   │   ├── AnimatedText.tsx
│   │   ├── ParticleBackground.tsx
│   │   ├── ProjectCard.tsx
│   │   ├── TechBadge.tsx
│   │   ├── Timeline.tsx
│   │   ├── ScrollReveal.tsx
│   │   ├── SectionHeading.tsx
│   │   ├── SkillBar.tsx
│   │   └── DemoEmbed.tsx
│   ├── hooks/
│   │   ├── useScrollProgress.ts
│   │   ├── useInView.ts
│   │   ├── useChatbot.ts
│   │   └── useTheme.ts
│   ├── lib/
│   │   ├── utils.ts      # cn() helper
│   │   ├── animations.ts # GSAP animation configs
│   │   └── chat-api.ts   # Chatbot API client
│   ├── types/
│   │   └── index.ts      # Shared TypeScript types
│   └── data/
│       ├── projects.ts   # Project metadata
│       ├── experience.ts # Work experience data
│       ├── skills.ts     # Skills data
│       └── chat-knowledge.ts # RAG knowledge base
├── backend/              # FastAPI chatbot server (separate)
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── knowledge/
│       └── soham-kb.json
├── tailwind.config.js
├── vite.config.ts
└── index.html
```

---

## Data Models

### Project
```typescript
interface Project {
  id: string;
  title: string;
  tagline: string;
  description: string;
  longDescription: string;
  thumbnail: string;
  images: string[];
  video?: string;
  demoUrl?: string;          // Embedded demo (Streamlit, etc.)
  githubUrl: string;
  paperUrl?: string;
  technologies: string[];
  highlights: string[];
  architecture?: string;     // SVG diagram path
  codeSnippets?: CodeSnippet[];
  timeline: string;
  role: string;
  status: 'completed' | 'ongoing';
  category: 'AI/ML' | 'Computer Vision' | 'NLP' | 'Robotics' | 'Fullstack' | 'Embedded';
}
```

### Experience
```typescript
interface Experience {
  id: string;
  company: string;
  location: string;
  role: string;
  period: string;
  type: 'full-time' | 'part-time' | 'internship' | 'freelance';
  description: string;
  achievements: string[];
  technologies: string[];
}
```

### ChatMessage
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: string[];  // RAG source citations
}
```

---

## Animation Strategy

| Section | Animation | Library | Trigger |
|---|---|---|---|
| Hero | Text reveal, particle bg, typing effect | GSAP + custom canvas | Page load |
| About | Fade up, parallax image | GSAP ScrollTrigger | Scroll into view |
| Experience | Timeline slide-in, staggered cards | GSAP ScrollTrigger | Scroll |
| Projects | Card hover effects, 3D tilt | Framer Motion | Hover + scroll |
| Skills | Animated bars, floating badges | GSAP + Framer Motion | Scroll |
| Research | Slide-in, paper card flip | GSAP ScrollTrigger | Scroll |
| Contact | Form field animations | Framer Motion | Focus |
| Navigation | Hide/show on scroll, active section | Custom hook | Scroll |
| Page Transitions | Fade between routes | Framer Motion AnimatePresence | Route change |
| Chatbot | Slide up, message stagger | Framer Motion | Toggle + new msg |
| Cursor | Custom cursor with trail | Custom canvas | Mouse move |

---

## Color System (Dark Theme)

```css
:root {
  /* Base */
  --background: 220 20% 4%;        /* #080a0f */
  --foreground: 210 20% 96%;       /* #f1f5f9 */
  
  /* Surface */
  --card: 220 17% 8%;              /* #11131a */
  --card-foreground: 210 20% 96%;
  --popover: 220 17% 8%;
  
  /* Primary — Electric Blue */
  --primary: 217 91% 60%;          /* #3b82f6 */
  --primary-foreground: 0 0% 100%;
  
  /* Secondary — Deep Purple */
  --secondary: 262 83% 58%;        /* #7c3aed */
  --secondary-foreground: 0 0% 100%;
  
  /* Accent — Teal */
  --accent: 174 72% 56%;           /* #2dd4bf */
  --accent-foreground: 220 20% 4%;
  
  /* Muted */
  --muted: 220 14% 14%;
  --muted-foreground: 215 16% 57%; /* #94a3b8 */
  
  /* Border */
  --border: 220 14% 18%;
  --input: 220 14% 18%;
  --ring: 217 91% 60%;
  
  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%);
  --gradient-accent: linear-gradient(135deg, #2dd4bf 0%, #3b82f6 100%);
}
```

---

## Responsive Breakpoints

| Name | Width | Use |
|---|---|---|
| sm | 640px | Mobile landscape |
| md | 768px | Tablet |
| lg | 1024px | Desktop |
| xl | 1280px | Large desktop |
| 2xl | 1536px | Ultra-wide |

---

## Chatbot Design (10% Humor + RAG)

### Personality
- **Primary**: Professional, helpful, knowledgeable about Soham's work
- **Secondary**: 10% humor — occasional light wit, tech puns, friendly tone
- **Context aware**: Knows which page/section user is viewing

### RAG Pipeline
1. **Knowledge Base**: Resume, project docs, GitHub READMEs, research papers
2. **Embedding**: OpenAI text-embedding-3-small / sentence-transformers
3. **Vector Store**: ChromaDB (local) or Pinecone (cloud)
4. **Retrieval**: Top-k similarity search per query
5. **Generation**: GPT-4o-mini / Claude 3.5 Haiku with system prompt + retrieved context
6. **Citations**: Show which document/source was used

### UI
- Floating action button (bottom-right)
- Expandable chat drawer
- Typing indicator
- Message bubbles with avatar
- Source citation chips
- Suggested questions
- Clear history button

---

## Performance Targets

| Metric | Target |
|---|---|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Cumulative Layout Shift | < 0.1 |
| Lighthouse Score | 95+ all categories |
| Bundle Size (initial) | < 200KB gzipped |

---

## SEO & Meta

- Open Graph tags for LinkedIn sharing
- Twitter Card meta
- Structured data (JSON-LD): Person, CreativeWork, EducationalOccupationalCredential
- Sitemap.xml
- robots.txt
- Canonical URLs

---

## Deployment Plan

| Component | Platform | Cost |
|---|---|---|
| Frontend (Static) | Vercel (Hobby) | FREE |
| Chatbot API | Fly.io / Railway / Render | FREE tier (~$5/mo if exceeds) |
| Vector Store | ChromaDB (self-hosted) or Pinecone (free tier) | FREE |
| Domain | Namecheap / Cloudflare | ~$12/year |
| Images/Assets | Cloudinary (free tier) | FREE |
| **Total** | | **$0–$17/year** |

---

## Phase Roadmap

| Phase | Duration | Deliverables |
|---|---|---|
| 0 | 1 day | Scaffold, design system, dependencies |
| 1 | 2 days | Hero, Navigation, smooth scroll, base animations |
| 2 | 2 days | About, Experience, Skills sections |
| 3 | 3 days | Projects grid, project cards, hover effects |
| 4 | 3 days | Project detail pages, demo embeds, architecture diagrams |
| 5 | 2 days | Research/Talks, Academics, Contact, Footer |
| 6 | 3 days | Chatbot UI + FastAPI backend + RAG pipeline |
| 7 | 2 days | Advanced animations, polish, performance |
| 8 | 1 day | SEO, PWA, deployment config |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Bundle size too large | Code splitting, lazy load sections, tree shake |
| Chatbot API costs | Use GPT-4o-mini, rate limiting, client-side caching |
| Demo embeds slow pages | Lazy load iframes, placeholder images |
| Mobile performance | Reduce particle count, disable heavy effects on mobile |
| Accessibility | ARIA labels, keyboard nav, reduced motion support |
