import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Github, Play, X } from 'lucide-react';
import { projects } from '@/data/projects';
import Navigation from '@/components/Navigation';
import Footer from '@/sections/Footer';
import { useState, useRef, useEffect } from 'react';

const VIDEO_SOURCES: Record<string, string> = {
  'realtime-scene-understanding': '/videos/scene_classroom.mp4',
  'autonomous-robots-slam': '/videos/maze4.mp4',
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = projects.find((p) => p.id === id);
  const [videoOpen, setVideoOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!project) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Project Not Found</h1>
          <Link to="/" className="text-muted-foreground hover:text-foreground">← Back home</Link>
        </div>
      </div>
    );
  }

  const videoSrc = VIDEO_SOURCES[project.id] || null;
  const hasVideo = !!videoSrc;

  useEffect(() => {
    if (videoOpen && videoRef.current) {
      videoRef.current.play().catch(() => {});
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [videoOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <section className="relative pt-32 pb-20">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10">
              <ArrowLeft className="w-4 h-4" />Back
            </Link>

            <div className="flex items-center gap-3 mb-6">
              <span className="text-xs font-medium px-3 py-1 rounded-full border border-border text-muted-foreground">{project.category}</span>
              <span className="text-xs text-muted-foreground">{project.timeline}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight max-w-3xl">{project.title}</h1>
            <p className="text-lg text-muted-foreground mt-4 max-w-2xl leading-relaxed">{project.tagline}</p>

            <div className="flex items-center gap-4 mt-8">
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-foreground text-background rounded-full hover:bg-foreground/90 transition-all">
                <Github className="w-4 h-4" />Source
              </a>
              {hasVideo && (
                <button onClick={() => setVideoOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-border rounded-full hover:bg-muted/30 transition-all">
                  <Play className="w-4 h-4" />Watch Demo
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="pb-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
            <div className="lg:col-span-2 space-y-12">
              <div>
                <h2 className="text-xl font-semibold mb-4">Overview</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{project.longDescription}</p>
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-4">Highlights</h2>
                <ul className="space-y-3">
                  {project.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="w-1 h-1 rounded-full bg-foreground/40 mt-2 flex-shrink-0" />{h}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-4">Tech Stack</h2>
                <div className="flex flex-wrap gap-2">
                  {project.technologies.map((tech) => (
                    <span key={tech} className="text-sm px-3 py-1.5 rounded-full bg-muted/30 text-foreground">{tech}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-8">
              <div className="p-6 rounded-2xl border border-border/50">
                <h3 className="text-[10px] font-medium text-muted-foreground mb-4 uppercase tracking-[0.2em]">Details</h3>
                <div className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Role</p><p className="font-medium mt-0.5">{project.role}</p></div>
                  <div><p className="text-muted-foreground">Status</p><p className="font-medium mt-0.5">{project.status === 'completed' ? 'Completed' : 'In Progress'}</p></div>
                  <div><p className="text-muted-foreground">Timeline</p><p className="font-medium mt-0.5">{project.timeline}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {videoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(24px)' }}
            onClick={() => setVideoOpen(false)}>
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setVideoOpen(false)} className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                <X className="w-5 h-5" />
              </button>
              {videoSrc && (
                <video ref={videoRef} src={videoSrc} controls autoPlay muted loop playsInline preload="auto" className="w-full h-full object-contain" />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
