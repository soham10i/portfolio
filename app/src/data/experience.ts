import type { Experience } from '@/types';

export const experiences: Experience[] = [
  {
    id: 'teaching-assistant',
    company: 'OTH Amberg-Weiden',
    location: 'Weiden, Germany',
    role: 'Teaching Assistant — Decision Modelling',
    period: 'Mar 2025 – Aug 2025',
    type: 'part-time',
    description:
      'Designed and delivered SQL & ML curriculum to 30 M.Sc. students; mentored applied KNIME workflows for industrial data analysis.',
    achievements: [
      'Designed and delivered SQL & ML curriculum to 30 M.Sc. students',
      'Communicated findings clearly through structured lectures and knowledge-sharing sessions',
      'Mentored applied KNIME workflows for industrial data analysis',
      'Supported students in interpreting model outputs and visualizing results',
      'Covered classification, regression, and decision-making workflows',
    ],
    technologies: ['SQL', 'Machine Learning', 'KNIME', 'Python', 'Data Visualization'],
  },
  {
    id: 'altera-digital-health',
    company: 'Altera Digital Health (Allscripts India LLP)',
    location: 'Remote / Pune, India',
    role: 'Software Engineer — Data Systems',
    period: 'Feb 2023 – Feb 2024',
    type: 'full-time',
    description:
      'Architected high-throughput ETL pipelines for healthcare logs on Microsoft Azure, ensuring HIPAA-aligned data standards.',
    achievements: [
      'Architected high-throughput ETL pipelines for healthcare logs on Microsoft Azure',
      'Cut data retrieval latency by 30% using Blob Storage and DevOps CI/CD',
      'Refactored legacy C#/.NET backend modules applying clean code and OOP principles',
      'Reduced technical debt by 25% through code reviews in cross-functional teams',
      'Built pytest-driven automated validation scripts for patient data migration',
      'Achieved 100% compliance with HIPAA-aligned healthcare data standards',
    ],
    technologies: ['C#', '.NET', 'Python', 'Microsoft Azure', 'Blob Storage', 'DevOps', 'CI/CD', 'ETL', 'pytest'],
  },
  {
    id: 'electrum-it',
    company: 'Electrum IT Solutions',
    location: 'Vadodara, India',
    role: 'Python Backend Engineer',
    period: 'Aug 2022 – Jan 2023',
    type: 'full-time',
    description:
      'Designed RESTful APIs using FastAPI/Django with JWT authentication for a Fintech platform processing 2,000+ daily transactions.',
    achievements: [
      'Designed and implemented RESTful APIs using FastAPI/Django with JWT authentication',
      'Built secure, multithreaded backend services for a Fintech platform',
      'Processed 2,000+ daily transactions with 99.9% uptime',
      'Applied OOP design patterns and wrote comprehensive unit tests',
      'Designed centralized payment-failure logging, cutting debugging time by 25%',
      'Created detailed API documentation for cross-platform compatibility',
    ],
    technologies: ['Python', 'FastAPI', 'Django', 'JWT', 'REST API', 'Multithreading', 'Fintech'],
  },
  {
    id: 'promact-intern',
    company: 'Promact Infotech Pvt. Ltd.',
    location: 'Vadodara, India',
    role: 'Full Stack Engineering Intern',
    period: 'Dec 2021 – Apr 2022',
    type: 'internship',
    description:
      'Built an Expense Management System (Angular 8, ASP.NET Core 5.0, MSSQL) with JWT auth, SHA-1 encryption, and role-based access control.',
    achievements: [
      'Built Expense Management System with Angular 8, ASP.NET Core 5.0, and MSSQL',
      'Implemented JWT auth, SHA-1 encryption, and role-based access control',
      'Designed Simplify Debt Algorithm using graph-theory based greedy optimization',
      'Reduced group settlement transactions by up to 33% (n-1 transactions for n members)',
      'Validated correctness via white-box and black-box testing across all modules',
      'Delivered real-time chat room using WebSocket',
      'Implemented multi-currency support and relational schema across 9 normalized tables',
    ],
    technologies: ['Angular 8', 'ASP.NET Core 5.0', 'MSSQL', 'JWT', 'SHA-1', 'WebSocket', 'Agile'],
  },
];
