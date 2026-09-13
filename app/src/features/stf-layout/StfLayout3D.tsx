import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export default function StfLayout3D() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <header className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-line px-4 sm:h-[52px] sm:px-[22px]">
        <div className="flex items-center gap-4">
          <Link
            to="/project/digital-twin"
            className="inline-flex items-center gap-1.5 text-[13px] text-fg2 transition-colors hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Project
          </Link>
          <span className="hidden h-5 w-px bg-surf2 sm:block" />
          <div>
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-fg sm:text-[14px]">
              Smart Tabletop Factory — 3D Digital Twin
            </p>
            <p className="hidden text-[10.5px] text-fg3 sm:block">
              Real-time WebSocket Twin (30 Hz) · Kinematic simulation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/stf/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11.5px] text-fg2 transition-colors hover:text-fg"
          >
            Standalone <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>
      <div className="relative flex-1 w-full h-full bg-[#0a0d14]">
        <iframe
          src="/stf/"
          className="absolute inset-0 w-full h-full border-0"
          title="Smart Tabletop Factory 3D Digital Twin"
          allow="accelerometer; camera; gyroscope"
        />
      </div>
    </div>
  );
}
