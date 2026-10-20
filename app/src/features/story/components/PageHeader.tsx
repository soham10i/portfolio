import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Github } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface Props {
  back: { to: string; label: string };
  liveUrl?: string;
  githubUrl?: string;
}

/* The header for pages below the home page: the same glass capsule as the
   home TopBar, carrying a way back and the page's two outbound actions. */
export default function PageHeader({ back, liveUrl, githubUrl }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-[60] px-[var(--gutter)] pt-3">
      <div className="lg-pill lg-chrome mx-auto flex h-[52px] max-w-[1180px] items-center justify-between gap-3 px-2">
        <Link to={back.to} className="lg-btn !h-10 !bg-transparent hover:!bg-[color-mix(in_oklab,var(--fg)_7%,transparent)]">
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>

        <Link to="/" className="hidden items-center gap-2.5 sm:flex">
          <span
            className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: 'conic-gradient(from 210deg, var(--p), var(--a), var(--s), var(--p))' }}
          >
            SP
          </span>
          <span className="text-[14px] font-medium tracking-[-.01em]">Soham Patel</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <ThemeToggle className="!h-10 !w-10" placement="down" />
          {githubUrl && (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="lg-btn !h-10">
              <Github className="h-4 w-4" /> <span className="max-sm:hidden">Code</span>
            </a>
          )}
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[color:var(--fg)] px-4 text-[13px] font-medium text-[color:var(--on-fg)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" /> Live site <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
