import { useRef } from 'react';
import './story.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import CloudLayer from './components/CloudLayer';
import PhysicalStage from './components/PhysicalStage';
import HilReadout from './components/HilReadout';
import Hero from './sections/Hero';
import About from './sections/About';
import Work from './sections/Work';
import Lab from './sections/Lab';
import Path from './sections/Path';
import Method from './sections/Method';
import Blog from './sections/Blog';
import Contact from './sections/Contact';
import { useScrollStory } from './lib/useScrollStory';

/* The redesigned home page (docs/REDESIGN.md). Layering, back to front:
 *   .story ground     cool grey, showing between the chapter panels
 *   CloudLayer        fixed WebGL point cloud, lazy-loaded, morphing per chapter
 *   PhysicalStage     Physical AI theme only: the frame and caption around it
 *   <main>            the chapters as translucent gallery panels — real DOM text
 *   chrome            TopBar + BottomBar, fixed */
export default function StoryHome() {
  const root = useRef<HTMLDivElement>(null);
  useScrollStory(root);

  return (
    <div ref={root} className="story">
      <a href="#about" className="story-skip">Skip to content</a>

      <CloudLayer />
      <PhysicalStage />
      <HilReadout />
      <TopBar />

      <main className="relative z-[1]">
        <Hero />
        <About />
        <Work />
        <Lab />
        <Path />
        <Method />
        <Blog />
        <Contact />
      </main>

      <BottomBar />
    </div>
  );
}
