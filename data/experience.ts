export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  type: 'work' | 'education';
  period: string;
  start: string;
  end: string;
  current: boolean;
  location: string;
  description: string;
  highlights: string[];
  tech?: string[];
  grade?: string;
  logo?: string;
}

export const experiences: ExperienceItem[] = [
  {
    id: 'oth',
    company: 'OTH Amberg-Weiden',
    role: 'M.Sc. Artificial Intelligence for Industrial Applications',
    type: 'education',
    period: 'Oct 2024 – Present',
    start: '2024-10',
    end: 'present',
    current: true,
    location: 'Amberg, Bavaria, Germany',
    description:
      'Pursuing a Master of Science in AI focusing on industrial automation, embedded intelligence, digital twins, and advanced deep learning. Achieved top grades including 1.0 in Autonomous Systems and AI Conference.',
    highlights: [
      'Grade 1.0 (Perfect) — Autonomous Systems',
      'Grade 1.0 (Perfect) — AI Conference',
      'Grade 1.3 (Excellent) — Digital Twin Systems',
      'Grade 1.3 (Excellent) — Embedded Intelligence I',
      'Overall average: 2.1 (Very Good)',
      'Built production-grade Digital Twin for Fischertechnik factory',
      'Research in real-time scene understanding and NLP pipelines',
    ],
    grade: '2.1',
    logo: '/oth-logo.png',
  },
  {
    id: 'altera',
    company: 'Altera Digital Health',
    role: 'Software Engineer',
    type: 'work',
    period: 'Jul 2022 – Sep 2024',
    start: '2022-07',
    end: '2024-09',
    current: false,
    location: 'India',
    description:
      'Worked as a Software Engineer for 2 years at Altera Digital Health — a leading enterprise healthcare software company. Built and maintained mission-critical healthcare software systems serving hospitals and clinics.',
    highlights: [
      'Developed enterprise healthcare software for clinical workflows',
      'Built and optimised RESTful APIs for patient data management',
      'Collaborated in agile teams on large-scale Java-based systems',
      'Contributed to system integration and data interoperability (HL7, FHIR)',
      'Performed code reviews, testing, and production deployments',
      'Gained expertise in secure, compliant software development',
    ],
    tech: ['Java', 'REST APIs', 'SQL', 'Healthcare IT', 'Agile'],
    logo: '/altera-logo.png',
  },
  {
    id: 'spu',
    company: 'Sardar Patel University',
    role: 'M.Sc. Information Technology',
    type: 'education',
    period: 'Jul 2020 – May 2022',
    start: '2020-07',
    end: '2022-05',
    current: false,
    location: 'Vallabh Vidyanagar, Gujarat, India',
    description:
      'Completed Master of Science in Information Technology with an outstanding GPA of 9.7/10 — graduating among the top of the class. Built a strong foundation in software engineering, databases, networking, and data science.',
    highlights: [
      'GPA: 9.7 / 10.0 — Top of class',
      'Specialised in advanced software engineering and data science',
      'Completed research project in machine learning applications',
      'Database design, networking, and system architecture',
    ],
    grade: '9.7/10',
    logo: '/spu-logo.png',
  },
];
