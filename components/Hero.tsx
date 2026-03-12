'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Github, Linkedin, Mail, ChevronDown, Download, ArrowRight } from 'lucide-react';
import Image from 'next/image';

const AVATAR_URL = 'https://avatars.githubusercontent.com/u/58809540?v=4';

const techStack = [
  'Python', 'FastAPI', 'MQTT', 'Docker', 'PyTorch', 'Digital Twin',
  'WebSocket', 'YOLOv8', 'GitHub Actions', 'FAISS', 'Streamlit', 'SQLAlchemy',
  'HuggingFace', 'Pydantic', 'pytest', 'spaCy', 'OpenCV', 'Next.js',
];

const stats = [
  { value: '2+', label: 'Years Experience' },
  { value: '16', label: 'GitHub Repos' },
  { value: '2', label: "Master's Degrees" },
  { value: '18', label: 'HW Components Simulated' },
];

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [typedText, setTypedText] = useState('');
  const roles = ['Software Engineer', 'AI Researcher', 'Digital Twin Architect'];
  const [roleIndex, setRoleIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; opacity: number; size: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.4 + 0.1,
        size: Math.random() * 1.5 + 0.5,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${p.opacity})`;
        ctx.fill();
      });
      // Lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Typewriter
  useEffect(() => {
    const current = roles[roleIndex];
    const timeout = setTimeout(
      () => {
        if (!deleting) {
          if (charIndex < current.length) {
            setTypedText(current.slice(0, charIndex + 1));
            setCharIndex((c) => c + 1);
          } else {
            setTimeout(() => setDeleting(true), 1800);
          }
        } else {
          if (charIndex > 0) {
            setTypedText(current.slice(0, charIndex - 1));
            setCharIndex((c) => c - 1);
          } else {
            setDeleting(false);
            setRoleIndex((r) => (r + 1) % roles.length);
          }
        }
      },
      deleting ? 50 : 80
    );
    return () => clearTimeout(timeout);
  }, [charIndex, deleting, roleIndex, roles]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden dot-grid"
      aria-label="Hero section"
    >
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      {/* Main content */}
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
        {/* Avatar */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
          className="flex justify-center mb-8"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full ring-2 ring-blue-500/50 ring-offset-4 ring-offset-[#0a0a0f] overflow-hidden animate-pulse-glow">
              <Image
                src={AVATAR_URL}
                alt="Soham Patel"
                width={96}
                height={96}
                className="rounded-full object-cover"
                priority
              />
            </div>
            <span className="absolute bottom-0 right-0 w-5 h-5 bg-green-400 rounded-full border-2 border-[#0a0a0f]" title="Available for opportunities" />
          </div>
        </motion.div>

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Open to Werkstudent positions in Bavaria, Germany
        </motion.div>

        {/* Name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-4"
        >
          <span className="gradient-text-hero">Soham Patel</span>
        </motion.h1>

        {/* Typewriter */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="h-10 flex items-center justify-center mb-4"
        >
          <p className="text-xl sm:text-2xl font-semibold text-gray-300">
            <span className="gradient-text-blue">{typedText}</span>
            <span className="inline-block w-0.5 h-6 bg-blue-400 ml-0.5 animate-pulse" />
          </p>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-10"
        >
          Building intelligent systems at the intersection of{' '}
          <span className="text-blue-400 font-medium">hardware</span> and{' '}
          <span className="text-violet-400 font-medium">software</span>
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-wrap justify-center gap-3 mb-12"
        >
          <button
            onClick={() => scrollTo('projects')}
            className="group flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5"
          >
            View Projects
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <a
            href="/cv.pdf"
            download
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-gray-200 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all hover:-translate-y-0.5"
          >
            <Download size={16} />
            Download CV
          </a>
          <button
            onClick={() => scrollTo('contact')}
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-gray-200 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all hover:-translate-y-0.5"
          >
            <Mail size={16} />
            Contact Me
          </button>
        </motion.div>

        {/* Social links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
          className="flex justify-center gap-4 mb-16"
        >
          <a
            href="https://github.com/soham10i"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all hover:-translate-y-0.5"
            aria-label="GitHub profile"
          >
            <Github size={20} />
          </a>
          <a
            href="https://linkedin.com/in/soham-patel"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all hover:-translate-y-0.5"
            aria-label="LinkedIn profile"
          >
            <Linkedin size={20} />
          </a>
          <a
            href="mailto:soham.patel@example.com"
            className="p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all hover:-translate-y-0.5"
            aria-label="Send email"
          >
            <Mail size={20} />
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto"
        >
          {stats.map((s) => (
            <div key={s.label} className="glass-card p-4 text-center">
              <div className="text-2xl font-bold gradient-text-blue">{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Tech marquee */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-20 left-0 right-0 marquee-container"
        aria-hidden="true"
      >
        <div className="flex gap-6 animate-marquee whitespace-nowrap">
          {[...techStack, ...techStack].map((tech, i) => (
            <span
              key={i}
              className="text-xs font-medium text-gray-600 px-3 py-1 border border-white/5 rounded-full bg-white/[0.02]"
            >
              {tech}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        onClick={() => scrollTo('about')}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-600 hover:text-gray-400 transition-colors"
        aria-label="Scroll down"
      >
        <ChevronDown size={24} className="animate-bounce" />
      </motion.button>
    </section>
  );
}
