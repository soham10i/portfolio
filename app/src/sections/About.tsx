import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const highlights = [
  {
    title: 'AI & Machine Learning',
    desc: 'Deep learning, computer vision, and NLP. PyTorch, HuggingFace, LangChain, and state-of-the-art architectures.',
  },
  {
    title: 'Production Engineering',
    desc: 'FastAPI, Docker, CI/CD pipelines. Clean code, testing, and scalable architecture at healthcare and fintech scale.',
  },
  {
    title: 'End-to-End Delivery',
    desc: 'From research prototype to cloud deployment. Azure, edge computing, and real-time data pipelines.',
  },
  {
    title: 'Continuous Growth',
    desc: 'Gold Medalist M.Sc. Information Technology (Rank 1, GPA 9.55/10). Graduate AI coursework (45 ECTS) at OTH Amberg-Weiden, Germany. Teaching Assistant for SQL & ML. Keynote speaker, AI Conference 2025 (Grade 1.0).',
  },
];

export default function About() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const heading = headingRef.current;
    if (!section || !heading) return;

    const text = heading.textContent ?? '';
    // pb/-mb gives the overflow-hidden mask room for descenders (the "g"
    // in "Bridging") without changing line spacing. The joining space is
    // the only word gap (a right margin as well would double it), and it
    // keeps textContent round-tripping so a re-run re-splits identically.
    heading.innerHTML = text
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="inline-block overflow-hidden pb-[0.2em] -mb-[0.2em]"><span class="inline-block word-inner">${w}</span></span>`)
      .join(' ');

    const ctx = gsap.context(() => {
      gsap.fromTo(
        heading.querySelectorAll('.word-inner'),
        // 130% clears the mask's extra descender padding
        { y: '130%', opacity: 0 },
        {
          y: '0%',
          opacity: 1,
          duration: 1,
          stagger: 0.06,
          ease: 'power3.out',
          scrollTrigger: { trigger: heading, start: 'top 80%', toggleActions: 'play none none none' },
        }
      );

      gsap.fromTo(
        '.about-card',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.about-grid', start: 'top 80%', toggleActions: 'play none none none' },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section id="about" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">About</p>

        <h2
          ref={headingRef}
          className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-3xl mb-20"
        >
          Bridging research and production
        </h2>

        <div className="about-grid grid grid-cols-1 md:grid-cols-2 gap-5">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="about-card glass rounded-2xl p-8 lg:p-10 group transition-transform duration-500 hover:-translate-y-1"
            >
              <h3 className="text-base font-semibold mb-3 group-hover:text-foreground/90 transition-colors duration-300">
                {item.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
