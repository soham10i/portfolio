import { useRef } from 'react';
import './story.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import GlassBalls from './components/GlassBalls';
import Hero from './sections/Hero';
import Work from './sections/Work';
import Experience from './sections/Experience';
import About from './sections/About';
import Education from './sections/Education';
import Method from './sections/Method';
import Lab from './sections/Lab';
import Blog from './sections/Blog';
import Contact from './sections/Contact';
import { useScrollStory } from './lib/useScrollStory';

/* The home page. Layering, back to front:
 *   .story::before    one fixed gradient ground behind every chapter, so the
 *                     page reads as a single continuous surface
 *   GlassBalls        glass bubbles drifting with the scroll, fixed layer
 *   <main>            the chapters as transparent panels — real DOM text.
 *                     Reader order: who → work → experience → about →
 *                     education → method → live lab → writing → contact
 *   chrome            TopBar + BottomBar, fixed
 * (The WebGL point cloud was retired: it read as visual noise. CloudLayer
 *  still exists for the MedQA demo's pipeline visualisation.) */
export default function StoryHome() {
  const root = useRef<HTMLDivElement>(null);
  useScrollStory(root);

  return (
    <div ref={root} className="story">
      <a href="#about" className="story-skip">Skip to content</a>

      <TopBar />
      <GlassBalls />

      <main className="relative z-[1]">
        <Hero />
        <About />
        <Work />
        <Experience />
        <Education />
        <Method />
        <Lab />
        <Blog />
        <Contact />
      </main>

      <BottomBar />
    </div>
  );
}
