import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { skills, education, talks } from '@/data/skills';
import { Mic } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const categoryGradients: Record<string, string> = {
  'ML/AI': 'from-blue-500/50 to-indigo-500/50',
  'Engineering': 'from-violet-500/50 to-fuchsia-500/50',
  'Data/Cloud': 'from-teal-500/50 to-cyan-500/50',
  'Leadership': 'from-amber-500/50 to-orange-500/50',
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

      gsap.fromTo('.skill-card', { y: 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: '.skill-grid', start: 'top 80%', toggleActions: 'play none none none' },
      });

      gsap.fromTo('.skill-bar', { width: 0 }, {
        width: 'var(--target-width)',
        duration: 1.2,
        stagger: 0.03,
        ease: 'power2.out',
        scrollTrigger: { trigger: '.skill-grid', start: 'top 75%', toggleActions: 'play none none none' },
      });

      gsap.fromTo('.edu-item', { y: 30, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: '.edu-list', start: 'top 85%', toggleActions: 'play none none none' },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  const grouped = skills.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, typeof skills>);

  return (
    <section id="skills" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <div className="skill-heading">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Expertise</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-2xl mb-24">
            Skills & <span className="text-gradient">Technologies</span>
          </h2>
        </div>

        <div className="skill-grid grid grid-cols-1 lg:grid-cols-2 gap-10 mb-40">
          {Object.entries(grouped).map(([category, items]) => {
            const grad = categoryGradients[category] || 'from-foreground/30 to-foreground/10';
            return (
              <div key={category} className="skill-card">
                <h3 className="text-[10px] font-medium text-muted-foreground mb-6 uppercase tracking-[0.2em]">{category}</h3>
                <div className="space-y-4">
                  {items.map((skill) => (
                    <div key={skill.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm">{skill.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{skill.level}%</span>
                      </div>
                      <div className="h-[3px] rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={`skill-bar h-full rounded-full bg-gradient-to-r ${grad}`}
                          style={{ '--target-width': `${skill.level}%` } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
                        {talk.grade && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">Grade: {talk.grade}</span>}
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
