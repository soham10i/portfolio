import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Copy, Check, Download, Github, Linkedin } from 'lucide-react';
import { CONTACT, HERO_TAGS, PROJECTS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* Role types the work maps to — phrased the way job postings name them. */
const FIT = ['Robotics software', 'Robotics & embedded systems', 'Simulation & digital twins', 'Perception / computer vision', 'Backend & data for industrial systems'];

/* The stack, de-duplicated across every project, for the marquee band. */
const STACK = Array.from(new Set([...HERO_TAGS, ...PROJECTS.flatMap((p) => p.tech ?? [])]));

/* Marquee speed in px/s. The duration is derived from the track's width, so
   the words travel at the same readable pace on every screen size; a fixed
   duration made the long track race past at over 200 px/s and smear. */
const MARQUEE_SPEED = 60;

/* 08 — Contact. Big closing line, one-click email, and the stack marquee. */
export default function Contact() {
  const [copied, setCopied] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const fit = () => el.style.setProperty('--marquee-dur', `${(el.scrollWidth / 2 / MARQUEE_SPEED).toFixed(1)}s`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.location.href = `mailto:${CONTACT.email}`;
    }
  };

  return (
    <section id="contact" data-anchor-offset="0" className="chapter panel relative flex flex-col !pb-28"
      style={{ '--t1': 'rgba(79,70,229,.16)', '--t2': 'rgba(37,99,235,.14)' } as React.CSSProperties}>
      <div className="px-[var(--gutter)]">
        <SectionHead label="Contact" aside={CONTACT.location.split(' — ')[0]} />

        <h2
          data-reveal
          className="t-closing text-center"
        >
          Get in <span className="serif tracking-[-.02em] text-p">touch.</span>
        </h2>

        <div data-reveal className="mx-auto mt-8 flex max-w-[960px] flex-col items-center text-center">
        <p className="t-lead">
          Building robots, factory twins or perception systems? I'd like to hear about it. I am looking for a
          software role close to physical systems, based in Paderborn and happy to relocate across Germany and
          the EU. Email reaches me fastest, and I reply to every message.
        </p>
        <ul className="mt-6 flex max-w-[960px] flex-wrap justify-center gap-1.5">
          {FIT.map((f) => (
            <li key={f} className="rounded-full border border-[color:var(--line)] px-3.5 py-1.5 text-[13px] text-fg2">{f}</li>
          ))}
        </ul>
        <p className="mono mt-6 !text-[10.5px] text-fg3">{CONTACT.availability}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-14 items-center gap-3 rounded-full bg-[color:var(--fg)] px-6 text-[15px] font-medium text-[color:var(--on-fg)]"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied to clipboard' : CONTACT.email}
          </button>
          <a href={CONTACT.github} target="_blank" rel="noopener noreferrer" className="lg-pill inline-flex h-14 items-center gap-2 px-6 text-[15px]">
            <Github className="h-4 w-4" /> GitHub <ArrowUpRight className="h-4 w-4" />
          </a>
          <a href={CONTACT.linkedin} target="_blank" rel="noopener noreferrer" className="lg-pill inline-flex h-14 items-center gap-2 px-6 text-[15px]">
            <Linkedin className="h-4 w-4" /> LinkedIn <ArrowUpRight className="h-4 w-4" />
          </a>
          <a href="/Soham_Patel_CV.pdf" download className="lg-pill inline-flex h-14 items-center gap-2 px-6 text-[15px]">
            <Download className="h-4 w-4" /> CV
          </a>
        </div>
        </div>
      </div>

      <div className="story-marquee mt-[clamp(40px,7vh,72px)] overflow-hidden border-y border-[color:var(--line)] py-5" aria-hidden>
        <div ref={track} className="flex w-max gap-10 whitespace-nowrap text-[clamp(22px,2.6vw,36px)] font-medium tracking-[-.03em] text-fg2">
          {[...STACK, ...STACK].map((t, i) => (
            <span key={i} className="flex items-center gap-10">
              {t}
              <span className="serif text-fg3">✦</span>
            </span>
          ))}
        </div>
      </div>

      <p className="mono px-[var(--gutter)] pt-6 text-center text-fg3">©2026 Soham Patel — built with React, GSAP and WebGL</p>
    </section>
  );
}
