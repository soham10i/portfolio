import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { experiences } from '@/data/experience';

gsap.registerPlugin(ScrollTrigger);

export default function Experience() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      // Heading
      gsap.fromTo(
        '.exp-heading',
        { y: 60, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: '.exp-heading', start: 'top 85%', toggleActions: 'play none none none' },
        }
      );

      // Timeline items
      gsap.fromTo(
        '.exp-item',
        { y: 40, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: 'power3.out',
          scrollTrigger: { trigger: '.exp-list', start: 'top 80%', toggleActions: 'play none none none' },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section id="experience" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <div className="exp-heading">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Experience</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-2xl mb-24">
            Where I've <span className="text-gradient">worked</span>
          </h2>
        </div>

        <div className="exp-list space-y-0">
          {experiences.map((exp) => (
            <div
              key={exp.id}
              className="exp-item group border-t border-border/30 py-10 first:border-t-0"
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-16">
                <div className="lg:w-44 flex-shrink-0">
                  <p className="text-xs text-muted-foreground font-mono tracking-wide">{exp.period}</p>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold group-hover:text-foreground/80 transition-colors duration-300">
                    {exp.role}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {exp.company} · {exp.location}
                  </p>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-2xl">
                    {exp.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {exp.technologies.slice(0, 5).map((tech) => (
                      <span key={tech} className="text-[11px] px-3 py-1 rounded-full bg-muted/40 text-muted-foreground">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
