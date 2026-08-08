import type { Skill, Education, Talk } from '@/types';

// ================================================================
// SKILLS — Three-tier grouping (no percentages)
// ================================================================

export interface SkillTier {
  label: string;
  items: string[];
}

export const skillTiers: SkillTier[] = [
  {
    label: 'Production-proven',
    items: ['Python', 'FastAPI', 'SQL', 'Docker', 'Git', 'CI/CD', 'Azure', 'ETL'],
  },
  {
    label: 'Strong working knowledge',
    items: ['PyTorch', 'Scikit-learn', 'HuggingFace', 'LangChain', 'YOLOv8', 'RAG', 'MQTT', 'InfluxDB', 'Streamlit', 'C# / .NET'],
  },
  {
    label: 'Explored in projects',
    items: ['React / TypeScript', 'Kalman / Particle filters', 'SLAM / Webots', 'Diffusion models', 'KNIME', 'Power BI'],
  },
];

// Legacy export kept for type compatibility (percentages removed from UI)
export const skills: Skill[] = [];

export const education: Education[] = [
  {
    institution: 'OTH Amberg-Weiden',
    location: 'Weiden, Germany',
    degree: 'Graduate Coursework — AI for Industrial Applications (45 ECTS completed)',
    period: 'Oct 2024 – Aug 2026',
    grade: 'GPA 2.0 · 45 ECTS completed',
    details: [
      'Core: Machine Learning, Deep Learning, Computer Vision & AI, NLP & Information Retrieval',
      'Embedded Intelligence (Grade: 1.3)',
      'Autonomous Robotics, Modern Databases & NoSQL',
      'AI Project, AI Conference (Grade: 1.0)',
    ],
  },
  {
    institution: 'Charutar Vidya Mandal University',
    location: 'India',
    degree: 'M.Sc. Information Technology',
    period: '2020 – 2022',
    grade: 'Gold Medalist, Rank 1, GPA 9.55/10 (German equiv. 1.2)',
    details: [
      'Top-ranked graduate with Gold Medal',
      'Specialized in advanced computing and information systems',
    ],
  },
  {
    institution: 'Sardar Patel University',
    location: 'India',
    degree: 'B.Sc. Computer Science',
    period: '2017 – 2020',
    grade: 'GPA 8.5/10 (German equiv. 1.5)',
    details: [
      'Foundation in computer science principles',
      'Inter-University Football Champion (2018)',
    ],
  },
];

export const talks: Talk[] = [
  {
    title: '3D Shape-to-Image Brownian Bridge Diffusion (Cor2Vox)',
    event: 'AI Conference 2025',
    date: '2025',
    grade: '1.0',
    description:
      'Technical keynote on anatomically plausible 3D medical image generation from structural priors using Brownian Bridge Diffusion models.',
  },
];
