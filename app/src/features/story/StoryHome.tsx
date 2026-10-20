import { useRef } from 'react';
import './story.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import Hero from './sections/Hero';
import About from './sections/About';
import Work from './sections/Work';
import Lab from './sections/Lab';
import Path from './sections/Path';
import Method from './sections/Method';
import Contact from './sections/Contact';
import { useScrollStory } from './lib/useScrollStory';

/* The redesigned home page (docs/REDESIGN.md). Layering, back to front:
 *   .story ground     cool grey, showing between the chapter panels
 *   [Phase 1]         fixed WebGL canvas, lazy-loaded
 *   <main>            the chapters as rounded gallery panels — real DOM text
 *   chrome            TopBar + BottomBar, fixed */
export default function StoryHome() {
  const root = useRef<HTMLDivElement>(null);
  useScrollStory(root);

  return (
    <div ref={root} className="story">
      <a href="#about" className="story-skip">Skip to content</a>

      <TopBar />

      <main className="relative z-[1]">
        <Hero />
        <About />
        <Work />
        <Lab />
        <Path />
        <Method />
        <Contact />
      </main>

      <BottomBar />
    </div>
  );
}
