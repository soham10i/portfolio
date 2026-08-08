import { Suspense, lazy } from 'react';
import Navigation from '@/components/Navigation';
import Hero from '@/sections/Hero';
import About from '@/sections/About';
import Experience from '@/sections/Experience';
import Projects from '@/sections/Projects';
import Skills from '@/sections/Skills';
import Research from '@/sections/Research';
import Contact from '@/sections/Contact';
import Footer from '@/sections/Footer';

const Chatbot = lazy(() => import('@/components/Chatbot'));

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Navigation />
      <main>
        <Hero />
        <About />
        <Experience />
        <Projects />
        <Skills />
        <Research />
        <Contact />
      </main>
      <Footer />
      <Suspense fallback={null}>
        <Chatbot />
      </Suspense>
    </div>
  );
}
