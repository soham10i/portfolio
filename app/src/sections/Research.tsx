import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BookOpen, Award, FileText } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const interests = [
  { icon: BookOpen, title: 'Diffusion Models', desc: '3D shape-to-image generation using Brownian Bridge Diffusion for medical imaging.' },
  { icon: Award, title: 'RAG Systems', desc: 'Retrieval-augmented generation for domain-specific question answering.' },
  { icon: FileText, title: 'Autonomous Systems', desc: 'SLAM algorithms and sensor fusion for robust indoor navigation.' },
];

export default function Research() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.research-heading', { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.research-heading', start: 'top 85%', toggleActions: 'play none none none' },
      });
      gsap.fromTo('.research-card', { y: 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: '.research-grid', start: 'top 80%', toggleActions: 'play none none none' },
      });
    }, section);
    return () => ctx.revert();
  }, []);

  return (
    <section id="research" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <div className="research-heading">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Research</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-2xl mb-20">
            Current <span className="text-gradient">Interests</span>
          </h2>
        </div>

        <div className="research-grid grid grid-cols-1 md:grid-cols-3 gap-10">
          {interests.map((item) => (
            <div key={item.title} className="research-card glass rounded-2xl p-8 group transition-transform duration-500 hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center mb-6 group-hover:bg-foreground/5 transition-colors duration-300">
                <item.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
