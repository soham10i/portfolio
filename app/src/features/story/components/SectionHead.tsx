/* The small "02 — About" label every chapter opens with. */
export default function SectionHead({ no, label, aside }: { no: string; label: string; aside?: string }) {
  return (
    <div data-reveal className="mb-10 flex items-center justify-between gap-4 border-b border-[color:var(--line)] pb-4">
      <p className="mono text-fg2">
        <span className="text-fg3">{no} — </span>
        {label}
      </p>
      {aside && <p className="mono text-fg3">{aside}</p>}
    </div>
  );
}
