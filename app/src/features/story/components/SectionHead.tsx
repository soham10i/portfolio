/* The chapter label every chapter opens with, centered like the hero. */
export default function SectionHead({ label, aside }: { label: string; aside?: string }) {
  return (
    <div data-reveal className="measure mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[color:var(--line)] pb-4 text-center md:mb-8">
      <p className="mono text-fg2">
        {label}
      </p>
      {aside && <p className="mono text-fg3"><span aria-hidden className="mr-3">·</span>{aside}</p>}
    </div>
  );
}
