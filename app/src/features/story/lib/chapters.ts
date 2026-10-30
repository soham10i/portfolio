/* The home page's chapter index — nav, bottom bar and section ids all read
   from here, so renaming or reordering a chapter is one edit.
 *
 * Order is tuned for a first-time reader (often a recruiter): who → proof of
 * work → employment record → short bio → education → process → live demos →
 * writing → contact. */

export interface Chapter {
  id: string;
  no: string;
  label: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 'hey', no: '01', label: 'Intro' },
  { id: 'work', no: '02', label: 'Work' },
  { id: 'experience', no: '03', label: 'Experience' },
  { id: 'about', no: '04', label: 'About' },
  { id: 'education', no: '05', label: 'Education' },
  { id: 'method', no: '06', label: 'Method' },
  { id: 'lab', no: '07', label: 'Lab' },
  { id: 'blog', no: '08', label: 'Blog' },
  { id: 'contact', no: '09', label: 'Contact' },
];
