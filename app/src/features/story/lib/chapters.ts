/* The home page's chapter index — nav, bottom bar and section ids all read
   from here, so renaming or reordering a chapter is one edit. */

export interface Chapter {
  id: string;
  no: string;
  label: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 'hey', no: '01', label: 'Hey' },
  { id: 'about', no: '02', label: 'About' },
  { id: 'work', no: '03', label: 'Work' },
  { id: 'lab', no: '04', label: 'Lab' },
  { id: 'path', no: '05', label: 'Path' },
  { id: 'method', no: '06', label: 'Method' },
  { id: 'contact', no: '07', label: 'Contact' },
];
