import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { MapPin } from 'lucide-react';

const roles = ['Software Engineer', 'Industrial AI', 'Digital Twin Architect'];

function TypingRole() {
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

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo('.hero-role', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8 }, 0.3)
        .fromTo('.hero-name', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.0 }, 0.5)
        .fromTo('.hero-headline', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 0.85)
        .fromTo('.hero-desc', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 1.0)
        .fromTo('.hero-cta', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 1.2)
        .fromTo('.hero-status', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 1.4)
        .fromTo('.hero-stats', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 1.6)
        .fromTo('.hero-scroll', { opacity: 0 }, { opacity: 1, duration: 1 }, 2);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Deep Blue 3D Depth Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_#15294e_0%,_#0d1830_30%,_#080f1f_70%,_#04070f_100%)] dark:block hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_#eef3fb_0%,_#e2eaf6_30%,_#d6e1f2_70%,_#ccd9ee_100%)] dark:hidden" />

      {/* Subtle animated gradient orbs for depth */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-500/[0.04] blur-[100px] animate-pulse dark:block hidden" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-500/[0.03] blur-[80px] animate-pulse dark:block hidden" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan-500/[0.02] blur-[120px] animate-pulse dark:block hidden" style={{ animationDuration: '12s', animationDelay: '4s' }} />
        {/* Light mode orbs */}
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-400/[0.08] blur-[100px] animate-pulse dark:hidden" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-1/3 left-1/4 w-[350px] h-[350px] rounded-full bg-violet-400/[0.06] blur-[90px] animate-pulse dark:hidden" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      {/* Subtle bottom fade for section transition */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none z-[1]" />

      <div ref={containerRef} className="relative z-10 mx-auto max-w-4xl px-6 text-center pointer-events-none">
        <div className="space-y-5">
          <div className="hero-role opacity-0">
            <TypingRole />
          </div>

          {/* Single-line full name with luminous glow in dark mode */}
          <h1 className="hero-name opacity-0">
            <span className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-[-0.03em] leading-[0.95] whitespace-nowrap">
              Soham <span className="text-gradient dark:[text-shadow:0_0_40px_rgba(79,142,247,0.35),0_0_80px_rgba(166,107,255,0.15)]">Patel</span>
            </span>
          </h1>

          <p className="hero-headline max-w-2xl mx-auto text-base sm:text-lg text-foreground/90 font-medium leading-relaxed opacity-0">
            Software Engineer — Industrial AI, Digital Twins & Production Systems
          </p>

          <p className="hero-desc max-w-xl mx-auto text-sm sm:text-base text-muted-foreground/80 leading-relaxed opacity-0">
            2.5+ years building production software in healthcare and fintech, now focused on digital twins, computer vision, and predictive maintenance for industrial automation. Gold Medalist M.Sc. (IT).
          </p>

          <div className="hero-cta flex flex-col sm:flex-row items-center justify-center gap-3 opacity-0 pointer-events-auto pt-2">
            <a href="#projects" className="px-7 py-2.5 text-sm font-medium bg-foreground text-background rounded-full hover:bg-foreground/85 transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-foreground/10">
              View Projects
            </a>
            <a href="mailto:soham.patel.2201@gmail.com" className="px-7 py-2.5 text-sm font-medium border border-foreground/20 rounded-full hover:bg-foreground/5 transition-all duration-300">
              Contact Me
            </a>
          </div>

          {/* Status line */}
          <div className="hero-status flex items-center justify-center gap-2 text-xs text-muted-foreground/70 opacity-0">
            <MapPin className="w-3 h-3" />
            <span>Amberg, Germany · Open to software/automation engineering roles · English C1, German A2 (learning)</span>
          </div>

          <div className="hero-stats pt-8 opacity-0">
            <div className="glass inline-flex flex-wrap items-center justify-center gap-6 sm:gap-10 rounded-2xl px-8 py-5 pointer-events-auto">
              {[
                { value: '2+', label: 'Yrs Industry' },
                { value: '8', label: 'Projects' },
                { value: 'Rank 1', label: 'M.Sc. Gold Medalist' },
                { value: '1.0', label: 'Research Keynote Grade' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-xl sm:text-2xl font-semibold tracking-tight">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hero-scroll absolute bottom-10 left-1/2 -translate-x-1/2 opacity-0 z-10">
        <div className="w-px h-14 bg-gradient-to-b from-transparent via-muted-foreground/25 to-transparent" />
      </div>
    </section>
  );
}
