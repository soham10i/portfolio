import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Brain, Bot, Eye, Code2, Database, Cloud } from 'lucide-react';

function TypingRole() {
  const roles = ['AI Engineer', 'Software Developer', 'Digital Twin Architect'];
  const [current, setCurrent] = useState(0);
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const role = roles[current];
    const speed = isDeleting ? 45 : 85;
    const timer = setTimeout(() => {
      if (!isDeleting) {
        setText(role.slice(0, text.length + 1));
        if (text.length + 1 === role.length) setTimeout(() => setIsDeleting(true), 2200);
      } else {
        setText(role.slice(0, text.length - 1));
        if (text.length === 1) { setIsDeleting(false); setCurrent((p) => (p + 1) % roles.length); }
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [text, isDeleting, current]);

  return (
    <span className="text-muted-foreground/80 font-mono text-xs tracking-[0.2em] uppercase">
      {text}<span className="animate-pulse">|</span>
    </span>
  );
}

const techStack = [
  { icon: Brain, label: 'AI/ML' },
  { icon: Eye, label: 'Computer Vision' },
  { icon: Bot, label: 'Robotics' },
  { icon: Code2, label: 'Full-Stack' },
  { icon: Database, label: 'Data Eng' },
  { icon: Cloud, label: 'Cloud' },
];

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo('.hero-role', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8 }, 0.3)
        .fromTo('.hero-name-1', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.0 }, 0.5)
        .fromTo('.hero-name-2', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.0 }, 0.65)
        .fromTo('.hero-desc', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 0.9)
        .fromTo('.hero-tech', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 1.1)
        .fromTo('.hero-cta', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 1.3)
        .fromTo('.hero-stats', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 1.5)
        .fromTo('.hero-scroll', { opacity: 0 }, { opacity: 1, duration: 1 }, 1.9);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Deep Blue 3D Depth Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_#163058_0%,_#0c1f38_30%,_#070f1a_70%,_#03070d_100%)]" />
      
      {/* Subtle animated gradient orbs for depth */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-500/[0.04] blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-500/[0.03] blur-[80px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan-500/[0.02] blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </div>

      {/* Subtle bottom fade for section transition */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none z-[1]" />

      <div ref={containerRef} className="relative z-10 mx-auto max-w-4xl px-6 text-center pointer-events-none">
        <div className="space-y-5">
          <div className="hero-role opacity-0">
            <TypingRole />
          </div>

          <h1 className="space-y-0">
            <span className="hero-name-1 block text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-[-0.03em] leading-[0.9] opacity-0">
              Soham
            </span>
            <span className="hero-name-2 block text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-[-0.03em] leading-[0.9] text-gradient opacity-0">
              Patel
            </span>
          </h1>

          <p className="hero-desc max-w-lg mx-auto text-sm sm:text-base text-muted-foreground/90 leading-relaxed opacity-0">
            M.Sc. AI candidate building intelligent systems at the intersection of
            machine learning, computer vision, and production engineering.
          </p>

          {/* Tech Stack Pills */}
          <div className="hero-tech flex flex-wrap items-center justify-center gap-2.5 opacity-0 pt-1">
            {techStack.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-foreground/[0.04] border border-foreground/[0.06] text-muted-foreground/80 backdrop-blur-sm"
              >
                <Icon className="w-3 h-3" />
                {label}
              </span>
            ))}
          </div>

          <div className="hero-cta flex items-center justify-center gap-4 opacity-0 pointer-events-auto pt-2">
            <a href="#projects" className="px-6 py-2.5 text-sm font-medium bg-foreground text-background rounded-full hover:bg-foreground/85 transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-foreground/10">
              View Work
            </a>
            <a href="#contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">
              Get in Touch →
            </a>
          </div>

          <div className="hero-stats flex items-center justify-center gap-10 pt-10 opacity-0">
            {[
              { value: '7', label: 'Projects' },
              { value: '3+', label: 'Years' },
              { value: '22', label: 'Repos' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight">{s.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-scroll absolute bottom-10 left-1/2 -translate-x-1/2 opacity-0 z-10">
        <div className="w-px h-14 bg-gradient-to-b from-transparent via-muted-foreground/25 to-transparent" />
      </div>
    </section>
  );
}
