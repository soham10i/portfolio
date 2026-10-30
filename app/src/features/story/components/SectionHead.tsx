/* The chapter label every chapter opens with. */
export default function SectionHead({ label, aside }: { label: string; aside?: string }) {
  return (
    <div data-reveal className="mb-6 flex md:mb-8 items-center justify-between gap-4 border-b border-[color:var(--line)] pb-4">
      <p className="mono text-fg2">
        {label}
      </p>
      {aside && <p className="mono text-fg3">{aside}</p>}
    </div>
  );
}
