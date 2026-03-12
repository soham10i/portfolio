export interface GradeItem {
  subject: string;
  grade: number;
  label: string;
  color: string;
  relatedProject?: string;
  semester: number;
}

// German scale: 1.0 = best, 5.0 = fail
export const grades: GradeItem[] = [
  {
    subject: 'Autonomous Systems',
    grade: 1.0,
    label: 'Perfect',
    color: '#22C55E',
    semester: 1,
  },
  {
    subject: 'AI Conference',
    grade: 1.0,
    label: 'Perfect',
    color: '#22C55E',
    semester: 1,
  },
  {
    subject: 'Digital Twin Systems',
    grade: 1.3,
    label: 'Excellent',
    color: '#10B981',
    relatedProject: 'stf-hw',
    semester: 1,
  },
  {
    subject: 'Embedded Intelligence I',
    grade: 1.3,
    label: 'Excellent',
    color: '#10B981',
    semester: 1,
  },
  {
    subject: 'Advanced Deep Learning',
    grade: 1.7,
    label: 'Very Good',
    color: '#3B82F6',
    semester: 2,
  },
  {
    subject: 'Embedded Intelligence II',
    grade: 1.7,
    label: 'Very Good',
    color: '#3B82F6',
    semester: 2,
  },
  {
    subject: 'Modern Databases & NoSQL',
    grade: 2.3,
    label: 'Good',
    color: '#F59E0B',
    semester: 2,
  },
  {
    subject: 'NLP & Information Retrieval',
    grade: 3.3,
    label: 'Satisfactory',
    color: '#F97316',
    relatedProject: 'nlp',
    semester: 2,
  },
  {
    subject: 'Machine Learning',
    grade: 0, // Passed — no numeric grade
    label: 'Passed',
    color: '#6B7280',
    semester: 1,
  },
];

export const gradeAverage = 2.1;

// Convert German grade to percentage for progress bars
export function gradeToPercent(grade: number): number {
  if (grade === 0) return 75; // Passed
  if (grade <= 1.0) return 100;
  if (grade <= 1.3) return 93;
  if (grade <= 1.7) return 85;
  if (grade <= 2.0) return 80;
  if (grade <= 2.3) return 72;
  if (grade <= 2.7) return 65;
  if (grade <= 3.0) return 58;
  if (grade <= 3.3) return 50;
  if (grade <= 3.7) return 42;
  return 35;
}
