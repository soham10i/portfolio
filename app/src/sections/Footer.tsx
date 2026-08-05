import { Github, Linkedin, ArrowUp } from 'lucide-react';

export default function Footer() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="relative py-14 border-t border-border/30">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="text-xs tracking-wide">© {new Date().getFullYear()} Soham Patel</span>
            <a href="https://github.com/soham10i" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              <Github className="w-4 h-4" />
            </a>
            <a href="https://linkedin.com/in/soham10i" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              <Linkedin className="w-4 h-4" />
            </a>
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
