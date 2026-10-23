/* The home page's chapter index — nav, bottom bar and section ids all read
   from here, so renaming or reordering a chapter is one edit. */

export interface Chapter {
  id: string;
  no: string;
  label: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 'hey', no: '01', label: 'Intro' },
  { id: 'about', no: '02', label: 'About' },
  { id: 'work', no: '03', label: 'Work' },
  { id: 'lab', no: '04', label: 'Lab' },
  { id: 'experience', no: '05', label: 'Experience' },
  { id: 'education', no: '06', label: 'Education' },
  { id: 'method', no: '07', label: 'Method' },
  { id: 'blog', no: '08', label: 'Blog' },
  { id: 'contact', no: '09', label: 'Contact' },
];
