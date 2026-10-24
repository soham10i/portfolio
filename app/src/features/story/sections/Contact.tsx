import type React from 'react';
import { useState } from 'react';
import { ArrowUpRight, Copy, Check, Download, Github, Linkedin } from 'lucide-react';
import { CONTACT, HERO_TAGS, PROJECTS } from '@/shared/data/portfolio';
import SectionHead from '../components/SectionHead';

/* Role types the work maps to — phrased the way job postings name them. */
const FIT = ['Robotics software', 'Robotics & embedded systems', 'Simulation & digital twins', 'Perception / computer vision', 'Backend & data for industrial systems'];

/* The stack, de-duplicated across every project, for the marquee band. */
const STACK = Array.from(new Set([...HERO_TAGS, ...PROJECTS.flatMap((p) => p.tech ?? [])]));

/* 08 — Contact. Big closing line, one-click email, and the stack marquee. */
export default function Contact() {
  const [copied, setCopied] = useState(false);

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
    <section id="contact" data-anchor-offset="0" className="chapter panel relative flex min-h-[100svh] flex-col justify-between !pb-28"
      style={{ '--t1': 'rgba(79,70,229,.16)', '--t2': 'rgba(37,99,235,.14)' } as React.CSSProperties}>
      <div className="px-[var(--gutter)]">
        <SectionHead label="Contact" aside={CONTACT.location.split(' — ')[0]} />

        <h2
          data-reveal
          className="t-closing"
        >
          Get in
          <br />
          <span className="serif tracking-[-.02em] text-p">touch.</span>
        </h2>

        <div data-reveal className="mt-8 max-w-[760px]">
        <p className="t-lead">
          I am looking for a software role close to physical systems: robotics, simulation, testing or industrial
          data. Email is the best way to reach me.
        </p>
        <ul className="mt-6 flex max-w-[720px] flex-wrap gap-1.5">
          {FIT.map((f) => (
            <li key={f} className="rounded-full border border-[color:var(--line)] px-3.5 py-1.5 text-[13px] text-fg2">{f}</li>
          ))}
        </ul>
        <p className="mono mt-6 !text-[10.5px] text-fg3">{CONTACT.availability}</p>

        <div className="mt-8 flex flex-wrap gap-2">
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

      <div className="story-marquee mt-[12vh] overflow-hidden border-y border-[color:var(--line)] py-5" aria-hidden>
        <div className="flex w-max gap-10 whitespace-nowrap text-[clamp(22px,2.6vw,36px)] font-medium tracking-[-.03em] text-fg2">
          {[...STACK, ...STACK].map((t, i) => (
            <span key={i} className="flex items-center gap-10">
              {t}
              <span className="serif text-fg3">✦</span>
            </span>
          ))}
        </div>
      </div>

      <p className="mono px-[var(--gutter)] pt-6 text-fg3">©2026 Soham Patel — built with React, GSAP and WebGL</p>
    </section>
  );
}
