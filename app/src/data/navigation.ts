import type { NavItem } from '@/types';

export const navItems: NavItem[] = [
  { label: 'Home', href: '#hero' },
  { label: 'Projects', href: '#projects' },
  { label: 'Experience', href: '#experience' },
  { label: 'Skills', href: '#skills' },
  { label: 'About', href: '#about' },
  { label: 'Research', href: '#research' },
  { label: 'Contact', href: '#contact' },
];

// Fill these in to show the corresponding buttons across the site.
// linkedin: full profile URL; resume: e.g. '/resume.pdf' after dropping
// the file into app/public/.
export const socials = {
  github: 'https://github.com/soham10i',
  email: 'mailto:soham.patel.2201@gmail.com',
  linkedin: '',
  resume: '',
};
