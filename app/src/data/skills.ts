import type { Skill, Education, Talk } from '@/types';

export const skills: Skill[] = [
  // ML / AI
  { name: 'PyTorch', level: 85, category: 'ML/AI' },
  { name: 'Scikit-learn', level: 90, category: 'ML/AI' },
  { name: 'HuggingFace', level: 80, category: 'ML/AI' },
  { name: 'LangChain', level: 82, category: 'ML/AI' },
  { name: 'YOLOv8', level: 78, category: 'ML/AI' },
  { name: 'RAG', level: 85, category: 'ML/AI' },
  { name: 'LLMs', level: 83, category: 'ML/AI' },
  { name: 'Model Benchmarking', level: 80, category: 'ML/AI' },
  { name: 'Computer Vision', level: 82, category: 'ML/AI' },
  { name: 'Deep Learning', level: 80, category: 'ML/AI' },

  // Engineering
  { name: 'Python', level: 95, category: 'Engineering' },
  { name: 'FastAPI', level: 90, category: 'Engineering' },
  { name: 'Django', level: 75, category: 'Engineering' },
  { name: 'C#', level: 80, category: 'Engineering' },
  { name: 'Java', level: 70, category: 'Engineering' },
  { name: 'SQL', level: 88, category: 'Engineering' },
  { name: 'Docker', level: 85, category: 'Engineering' },
  { name: 'Git', level: 90, category: 'Engineering' },
  { name: 'CI/CD', level: 82, category: 'Engineering' },
  { name: 'Clean Code / OOP', level: 90, category: 'Engineering' },
  { name: 'React / TypeScript', level: 78, category: 'Engineering' },

  // Data / Cloud
  { name: 'MSSQL', level: 85, category: 'Data/Cloud' },
  { name: 'MySQL', level: 88, category: 'Data/Cloud' },
  { name: 'NoSQL', level: 75, category: 'Data/Cloud' },
  { name: 'ETL', level: 85, category: 'Data/Cloud' },
  { name: 'Azure', level: 78, category: 'Data/Cloud' },
  { name: 'Power BI', level: 70, category: 'Data/Cloud' },
  { name: 'Streamlit', level: 85, category: 'Data/Cloud' },
  { name: 'InfluxDB', level: 80, category: 'Data/Cloud' },
  { name: 'MQTT', level: 82, category: 'Data/Cloud' },

  // Leadership
  { name: 'Technical Communication', level: 90, category: 'Leadership' },
  { name: 'Team Collaboration', level: 92, category: 'Leadership' },
  { name: 'Mentoring', level: 85, category: 'Leadership' },
  { name: 'Public Speaking', level: 82, category: 'Leadership' },
];

export const education: Education[] = [
  {
    institution: 'OTH Amberg-Weiden',
    location: 'Weiden, Germany',
    degree: 'M.Sc. AI for Industrial Applications',
    period: 'Oct 2024 – Present',
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
