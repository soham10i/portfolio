import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X, Github, Linkedin, Sun, Moon, Mail } from 'lucide-react';
import { navItems, socials } from '@/data/navigation';
import { useActiveSection } from '@/hooks/useScrollProgress';
import { useTheme } from '@/components/ThemeProvider';

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activeSection = useActiveSection(navItems.map((item) => item.href.slice(1)));
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  // Off the home page, section anchors must route back home first.
  const hrefFor = (hash: string) => (pathname === '/' ? hash : `/${hash}`);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'glass-nav-scrolled' : 'glass-nav'}`}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex h-16 items-center justify-between">
          <a href={hrefFor('#hero')} className="text-sm font-semibold tracking-tight text-foreground/90 hover:text-foreground transition-colors">
            Soham Patel
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => {
              const isActive = activeSection === item.href.slice(1);
              return (
                <a key={item.href} href={hrefFor(item.href)}
                  className={`relative text-sm transition-colors duration-300 ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'}`}>
                  {item.label}
                  {isActive && <span className="absolute -bottom-1 left-0 right-0 h-px bg-foreground/50" />}
                </a>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-300"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <a href={socials.github} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-foreground hover:text-foreground transition-colors" title="GitHub">
              <Github className="w-4 h-4" />
            </a>
            {socials.linkedin && (
              <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-foreground hover:text-foreground transition-colors" title="LinkedIn">
                <Linkedin className="w-4 h-4" />
              </a>
            )}
            <a href={socials.email} className="p-2 text-muted-foreground hover:text-foreground transition-colors" title="Email">
              <Mail className="w-4 h-4" />
            </a>
            {socials.resume && (
              <a href={socials.resume} target="_blank" rel="noopener noreferrer" className="text-sm font-medium px-4 py-2 rounded-full border border-border hover:bg-foreground hover:text-background transition-all duration-300">
                Resume
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button onClick={toggleTheme} className="p-2 text-muted-foreground hover:text-foreground">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-muted-foreground hover:text-foreground">
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden py-6 glass-inset rounded-b-2xl">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <a key={item.href} href={hrefFor(item.href)} onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/30">
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-4 mt-6 px-4 pt-4 border-t border-border/50">
              <a href={socials.github} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="GitHub"><Github className="w-4 h-4" /></a>
              {socials.linkedin && (
                <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="LinkedIn"><Linkedin className="w-4 h-4" /></a>
              )}
              <a href={socials.email} className="text-muted-foreground hover:text-foreground" title="Email"><Mail className="w-4 h-4" /></a>
              {socials.resume && (
                <a href={socials.resume} target="_blank" rel="noopener noreferrer" className="ml-auto text-sm px-4 py-2 rounded-full border border-border">Resume</a>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
