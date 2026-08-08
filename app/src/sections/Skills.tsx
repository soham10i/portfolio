import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { education, talks, skillTiers } from '@/data/skills';
import { Mic } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const tierStyles: Record<string, string> = {
  'Production-proven': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20',
  'Strong working knowledge': 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/20',
  'Explored in projects': 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30 dark:border-teal-500/20',
};

export default function Skills() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo('.skill-heading', { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.skill-heading', start: 'top 85%', toggleActions: 'play none none none' },
      });

      gsap.fromTo('.skill-tier', { y: 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: 'power3.out',
        scrollTrigger: { trigger: '.skill-tiers', start: 'top 80%', toggleActions: 'play none none none' },
      });

      gsap.fromTo('.edu-item', { y: 30, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: '.edu-list', start: 'top 85%', toggleActions: 'play none none none' },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section id="skills" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <div className="skill-heading">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Expertise</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-2xl mb-24">
            Skills & <span className="text-gradient">Technologies</span>
          </h2>
        </div>

        {/* Three-tier skill tags */}
        <div className="skill-tiers space-y-10 mb-40">
          {skillTiers.map((tier) => (
            <div key={tier.label} className="skill-tier">
              <h3 className="text-[10px] font-medium text-muted-foreground mb-4 uppercase tracking-[0.2em]">{tier.label}</h3>
              <div className="flex flex-wrap gap-2">
                {tier.items.map((skill) => (
                  <span
                    key={skill}
                    className={`px-3 py-1.5 rounded-full text-sm border ${tierStyles[tier.label] || 'bg-muted/30 text-muted-foreground border-border/30'}`}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Education */}
        <div className="mb-32">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Education</p>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-14">Academic Background</h3>
          <div className="edu-list space-y-0">
            {education.map((edu) => (
              <div key={edu.institution} className="edu-item flex flex-col sm:flex-row items-start gap-4 py-6 border-t border-border/30 first:border-t-0">
                <div className="sm:w-44 flex-shrink-0">
                  <p className="text-xs text-muted-foreground font-mono">{edu.period}</p>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="font-semibold">{edu.degree}</h4>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-muted/40 text-muted-foreground">{edu.grade}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{edu.institution} · {edu.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Talks */}
        {talks.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Research & Talks</p>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-14">Presentations</h3>
            <div className="space-y-0">
              {talks.map((talk) => (
                <div key={talk.title} className="py-6 border-t border-border/30">
                  <div className="flex items-start gap-4">
                    <Mic className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="font-semibold">{talk.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {talk.event} · {talk.date}
                        {talk.grade && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">Grade: {talk.grade}</span>}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{talk.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
