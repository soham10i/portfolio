/* The home page's chapter index — nav, bottom bar and section ids all read
   from here, so renaming or reordering a chapter is one edit.
 *
 * Order is tuned for a first-time reader (often a recruiter): who → short
 * bio → proof of work → employment record → education → process → live demos →
 * writing → contact. */

export interface Chapter {
  id: string;
  no: string;
  label: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 'hey', no: '01', label: 'Intro' },
  { id: 'about', no: '02', label: 'About' },
  { id: 'work', no: '03', label: 'Work' },
  { id: 'experience', no: '04', label: 'Experience' },
  { id: 'education', no: '05', label: 'Education' },
  { id: 'method', no: '06', label: 'Method' },
  { id: 'lab', no: '07', label: 'Lab' },
  { id: 'blog', no: '08', label: 'Blog' },
  { id: 'contact', no: '09', label: 'Contact' },
];
