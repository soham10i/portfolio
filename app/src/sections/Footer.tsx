import { Github, Linkedin, ArrowUp, Mail, FileText } from 'lucide-react';
import { socials } from '@/data/navigation';

export default function Footer() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="relative py-14 border-t border-border/30">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <span className="text-xs tracking-wide text-muted-foreground">© {new Date().getFullYear()} Soham Patel</span>
            <div className="flex items-center gap-3">
              <a href={socials.email} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all" title="Email">
                <Mail className="w-4 h-4" />
              </a>
              <a href={socials.github} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all" title="GitHub">
                <Github className="w-4 h-4" />
              </a>
              {socials.linkedin && (
                <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all" title="LinkedIn">
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
            </div>
            {socials.resume && (
              <a
                href={socials.resume}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border/50 hover:bg-foreground hover:text-background transition-all"
              >
                <FileText className="w-3 h-3" />
                Download CV (PDF)
              </a>
            )}
          </div>
          <button onClick={scrollToTop}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 uppercase tracking-wider">
            Back to top <ArrowUp className="w-3 h-3" />
          </button>
        </div>
      </div>
    </footer>
  );
}
