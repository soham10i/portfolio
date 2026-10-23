import { useRef } from 'react';
import './story.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import Hero from './sections/Hero';
import About from './sections/About';
import Work from './sections/Work';
import Lab from './sections/Lab';
import Experience from './sections/Experience';
import Education from './sections/Education';
import Method from './sections/Method';
import Blog from './sections/Blog';
import Contact from './sections/Contact';
import { useScrollStory } from './lib/useScrollStory';

/* The home page. Layering, back to front:
 *   .story ground     static gradient, showing between the chapter panels
 *   <main>            the chapters as liquid-glass gallery panels — real DOM text
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

      <main className="relative z-[1]">
        <Hero />
        <About />
        <Work />
        <Lab />
        <Experience />
        <Education />
        <Method />
        <Blog />
        <Contact />
      </main>

      <BottomBar />
    </div>
  );
}
