'use client';

import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Footer from '@/components/Footer';
import BackToTop from '@/components/BackToTop';
import CommandPalette from '@/components/CommandPalette';

const About = dynamic(() => import('@/components/About'), { ssr: false });
const Experience = dynamic(() => import('@/components/Experience'), { ssr: false });
const Projects = dynamic(() => import('@/components/Projects'), { ssr: false });
const Skills = dynamic(() => import('@/components/Skills'), { ssr: false });
const Grades = dynamic(() => import('@/components/Grades'), { ssr: false });
const GitHubActivity = dynamic(() => import('@/components/GitHubActivity'), { ssr: false });
const Contact = dynamic(() => import('@/components/Contact'), { ssr: false });

export default function HomePage() {
  return (
    <>
      <CommandPalette />
      <Navbar />
      <main className="relative">
        <Hero />
        <About />
        <Experience />
        <Projects />
        <Skills />
        <Grades />
        <GitHubActivity />
        <Contact />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
