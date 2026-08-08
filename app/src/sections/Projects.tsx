import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { projects } from '@/data/projects';
import { ArrowUpRight, Play, X } from 'lucide-react';
import type { Project } from '@/types';

gsap.registerPlugin(ScrollTrigger);

const categories = ['All', 'AI/ML', 'Computer Vision', 'NLP', 'Robotics', 'Fullstack', 'Embedded'] as const;

// Video sources mapped by project ID
const VIDEO_SOURCES: Record<string, string> = {
  'realtime-scene-understanding': '/videos/scene_classroom.mp4',
  'autonomous-robots-slam': '/videos/maze4.mp4',
};

function VideoModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSrc = VIDEO_SOURCES[project.id] || null;

  useEffect(() => {
    const v = videoRef.current;
    if (v && videoSrc) v.play().catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose, videoSrc]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(24px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
          <X className="w-5 h-5" />
        </button>
        {videoSrc ? (
          <video ref={videoRef} src={videoSrc} controls autoPlay muted loop playsInline preload="auto" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            <p className="text-sm">Demo video coming soon</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [showVideo, setShowVideo] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const hasVideo = !!VIDEO_SOURCES[project.id];
  const isFlagship = project.impact?.startsWith('FLAGSHIP');

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { y: 50, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
      });
    });
    return () => ctx.revert();
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const inner = innerRef.current;
    if (!inner) return;
    const rect = inner.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
  };

  const handleMouseLeave = () => {
    const inner = innerRef.current;
    if (!inner) return;
    inner.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
  };

  const videoThumb = VIDEO_SOURCES[project.id];
  const hasDemo = project.demoUrl && project.demoUrl !== '#';
  const hasSource = project.githubUrl && project.githubUrl !== '#';

  return (
    <>
      <div ref={cardRef} className="group opacity-0 perspective-1000" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <div
          ref={innerRef}
          className="preserve-3d transition-transform duration-300 ease-out will-change-transform"
        >
          {/* Card Image Container */}
          <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-muted/40 mb-6 shadow-lg shadow-black/5 group-hover:shadow-xl group-hover:shadow-black/10 transition-shadow duration-500">
            {isFlagship && (
              <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-amber-500/90 text-black text-[10px] font-bold uppercase tracking-wider">
                Flagship
              </div>
            )}
            {videoThumb && (
              <video src={videoThumb} muted playsInline preload="metadata"
                className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity duration-500" />
            )}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${videoThumb ? 'opacity-0 group-hover:opacity-100' : ''}`}>
              <span className="text-8xl font-bold text-muted-foreground/[0.07] select-none">{project.title.charAt(0)}</span>
            </div>
            {hasVideo && (
              <button onClick={() => setShowVideo(true)}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 bg-black/20">
                <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center backdrop-blur-sm shadow-xl transform group-hover:scale-110 transition-transform duration-300">
                  <Play className="w-5 h-5 text-black ml-0.5" />
                </div>
              </button>
            )}
          </div>

          {/* Card Content */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">{project.category}</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground">{project.timeline}</span>
            </div>
            <h3 className="text-xl font-semibold tracking-tight group-hover:text-foreground/80 transition-colors duration-300">
              <Link to={`/project/${project.id}`} className="hover:underline underline-offset-4 decoration-foreground/30">{project.title}</Link>
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{project.description}</p>
            
            {/* Impact line */}
            {project.impact && !isFlagship && (
              <p className="text-xs text-blue-700/90 dark:text-blue-400/80 font-medium">{project.impact}</p>
            )}
            {isFlagship && project.impact && (
              <p className="text-xs text-amber-700/90 dark:text-amber-400/80 font-medium">{project.impact.replace('FLAGSHIP — ', '')}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              {hasDemo && (
                project.demoUrl!.startsWith('/') ? (
                  <Link to={project.demoUrl!} className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors">
                    Live Demo <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors">
                    Live Demo <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                )
              )}
              {hasSource && (
                <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Source <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              )}
              <Link to={`/project/${project.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Details <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showVideo && <VideoModal project={project} onClose={() => setShowVideo(false)} />}
      </AnimatePresence>
    </>
  );
}

export default function Projects() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const filtered = activeCategory === 'All' ? projects : projects.filter((p) => p.category === activeCategory);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.proj-heading', { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.proj-heading', start: 'top 85%', toggleActions: 'play none none none' },
      });
      gsap.fromTo('.proj-filter', { y: 20, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.6, delay: 0.2, ease: 'power3.out',
        scrollTrigger: { trigger: '.proj-filter', start: 'top 90%', toggleActions: 'play none none none' },
      });
    }, section);
    return () => ctx.revert();
  }, []);

  return (
    <section id="projects" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <div className="proj-heading">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Selected Work</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-2xl mb-16">
            Featured <span className="text-gradient">Projects</span>
          </h2>
        </div>
        <div className="proj-filter flex flex-wrap gap-2 mb-20 pb-8 border-b border-border/30">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 text-sm rounded-full transition-all duration-300 ${activeCategory === cat ? 'bg-foreground text-background font-medium shadow-lg' : 'glass-pill text-muted-foreground hover:text-foreground'}`}>
              {cat}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-20">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}
