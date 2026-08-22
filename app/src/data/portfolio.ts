/* Content for the redesigned pages, transcribed from the design source
   (portfolio_source/pages/Portfolio Home v2.dc.html). Single source of truth —
   Home, Project Detail and the mobile frames all read from here. */

export type Tier = 'Production' | 'Strong' | 'Explored';

export interface ProjectVersion {
  key: string;
  label: string;
  desc: string;
  impact: string;
  tech: string[];
}

export interface Project {
  id: string;
  title: string;
  category: string;
  timeline: string;
  flagship?: boolean;
  hasVideo?: boolean;
  demoUrl?: string;
  githubUrl: string;
  description?: string;
  impact?: string;
  tech?: string[];
  versions?: ProjectVersion[];
}

export const CATEGORIES = ['All', 'AI/ML', 'Computer Vision', 'NLP', 'Robotics', 'Fullstack', 'Embedded'];

export const PROJECTS: Project[] = [
  {
    id: 'digital-twin',
    title: 'Smart Tabletop Factory — Digital Twin',
    category: 'AI/ML',
    timeline: 'Oct 2025 – Mar 2026',
    flagship: true,
    demoUrl: '/factory-twin',
    githubUrl: 'https://github.com/soham10i/stf-hw',
    versions: [
      {
        key: 'v2', label: 'v2.0',
        desc: 'Real-time 3D digital twin with live joint telemetry and error tracking, motor current & health monitoring, sensor states, and order orchestration (retrieve / store / full-cycle) over a WebSocket-connected backend. Hardware-agnostic adapter layer for MQTT and OPC-UA.',
        impact: 'Real-time 3D twin with live telemetry',
        tech: ['Three.js', 'WebSockets', 'Python', 'FastAPI', 'MQTT', 'Docker'],
      },
      {
        key: 'v1', label: 'v1.0',
        desc: 'Predictive-maintenance dashboard for warehouse automation subsystems driven by MQTT sensor pipelines at 10 Hz, time-series storage in InfluxDB, and interactive Streamlit dashboards. Fully containerised with Docker Compose.',
        impact: '85% failure-prediction accuracy',
        tech: ['Python', 'FastAPI', 'MQTT', 'Docker', 'InfluxDB', 'Streamlit'],
      },
    ],
  },
  {
    id: 'scene', title: 'Real-Time Multimodal Agentic Scene Understanding',
    category: 'Computer Vision', timeline: 'Oct 2024 – Apr 2025', hasVideo: true,
    description: 'YOLOv8 + VLM fusion for real-time scene narration via an agentic pipeline. Served through FastAPI with an automated API test suite and multi-cloud CI/CD.',
    impact: '30 FPS narration with agentic decision-making',
    tech: ['YOLOv8', 'VLM', 'FastAPI', 'LangChain', 'Docker'],
    githubUrl: 'https://github.com/soham10i/Real-Time-Scene-Understanding',
  },
  {
    id: 'medqa', title: 'MedQA RAG Pipeline & NLI Benchmarking',
    category: 'NLP', timeline: 'Mar 2025 – Aug 2025',
    description: 'Modular Python interfaces for a RAG pipeline comparing 5+ NLI models across 3 retrieval strategies on medical QA, deployed as a FastAPI container.',
    impact: '60% accuracy on unseen MedQA test data',
    tech: ['HuggingFace', 'LangChain', 'FastAPI', 'Pytest', 'Docker'],
    githubUrl: 'https://github.com/soham10i/natural-language-processing-RAG-project',
  },
  {
    id: 'wind', title: 'Wind Turbine Anomaly Detection & Energy Prediction',
    category: 'AI/ML', timeline: 'Nov 2024 – Apr 2025',
    description: 'Multi-output regression with the CARE framework for simultaneous fault detection and energy-output forecasting on wind turbine sensor data.',
    impact: '8 algorithms benchmarked for fault detection',
    tech: ['Scikit-learn', 'CARE', 'Pandas', 'NumPy'],
    githubUrl: 'https://github.com/soham10i/machine-learning-sem01-oth-aw',
  },
  {
    id: 'slam', title: 'Autonomous Robots — SLAM Navigation',
    category: 'Robotics', timeline: 'Oct 2024 – Mar 2025', hasVideo: true,
    description: 'SLAM with LIDAR + odometry sensor fusion, occupancy-grid mapping and A* path planning, driving a ROSBot through unknown environments in Webots.',
    impact: 'Autonomous navigation in Webots simulation',
    tech: ['ROS', 'Webots', 'SLAM', 'LIDAR', 'A*'],
    demoUrl: '/robot',
    githubUrl: 'https://github.com/soham10i/autonomouse_robots',
  },
  {
    id: 'ble', title: 'Indoor Localization System — Embedded BLE',
    category: 'Embedded', timeline: 'May 2025 – Jun 2025',
    description: 'IMU + BLE beacon sensor fusion with Kalman and Particle filters on an Arduino Nano BLE Sense, tracking at a 50 Hz update rate.',
    impact: 'Sub-meter accuracy on embedded hardware',
    tech: ['Arduino', 'Kalman Filter', 'Particle Filter', 'IMU', 'BLE'],
    githubUrl: 'https://github.com/soham10i/oth_ai_sem_01_mdne',
  },
  {
    id: 'cv-uad', title: 'Unsupervised Brain-MRI Lesion Segmentation',
    category: 'Computer Vision', timeline: '2026', flagship: true,
    githubUrl: 'https://github.com/soham10i/cv-project',
    versions: [
      {
        key: 'pdm', label: 'PDM',
        desc: 'From-scratch redesign in pixel space: diffusion over overlapping 96×96 patches with simplex noise, multi-scale scoring, Gaussian patch fusion and dense-CRF refinement, plus a counterfactual XAI suite. Trains on healthy tissue patches only — no lesion labels.',
        impact: 'Target DICE 0.32–0.40 (from 0.00–0.10)',
        tech: ['PyTorch', 'Patch diffusion', 'Simplex noise', 'dense-CRF', 'XAI'],
      },
      {
        key: 'brats', label: 'brats-uad',
        desc: 'Latent-diffusion UAD on BraTS-PEDs: a from-scratch 4-channel medical KL-VAE encodes all modalities, a DDPM learns the healthy latent manifold, and the residual after partial noise-and-denoise localises the lesion.',
        impact: 'Modality-weighted residual, patient-level splits',
        tech: ['PyTorch', 'KL-VAE', 'DDPM', 'DDIM', 'TensorBoard'],
      },
    ],
  },
  {
    id: 'smart-home', title: 'Smart Home & City Project',
    category: 'Fullstack', timeline: 'Oct 2024 – Mar 2025',
    description: 'IoT automation across home and city sensors with an MQTT backbone, InfluxDB time-series storage and ML-driven energy optimisation.',
    impact: '20% energy reduction via AI optimisation',
    tech: ['MQTT', 'InfluxDB', 'Machine Learning', 'Arduino'],
    githubUrl: 'https://github.com/soham10i/oth_ai_sem_01_mdne',
  },
];

export interface Experience {
  period: string; type: string; role: string; company: string; location: string;
  description: string; technologies: string[];
}

export const EXPERIENCES: Experience[] = [
  {
    period: 'Mar 2025 – Aug 2025', type: 'Part-time', role: 'Teaching Assistant — Decision Modelling',
    company: 'OTH Amberg-Weiden', location: 'Weiden, Germany',
    description: 'Designed and delivered SQL & ML curriculum to 30 M.Sc. students; mentored applied KNIME workflows for industrial data analysis.',
    technologies: ['SQL', 'Machine Learning', 'KNIME', 'Python', 'Data Visualization'],
  },
  {
    period: 'Feb 2023 – Feb 2024', type: 'Full-time', role: 'Software Engineer — Data Systems',
    company: 'Altera Digital Health', location: 'Remote / Pune, India',
    description: 'Architected high-throughput ETL pipelines for healthcare logs on Microsoft Azure, cutting retrieval latency by 30% and reaching 100% compliance with HIPAA-aligned data standards.',
    technologies: ['C#', '.NET', 'Azure', 'Blob Storage', 'CI/CD', 'ETL', 'pytest'],
  },
  {
    period: 'Aug 2022 – Jan 2023', type: 'Full-time', role: 'Python Backend Engineer',
    company: 'Electrum IT Solutions', location: 'Vadodara, India',
    description: 'Designed RESTful APIs with FastAPI/Django and JWT auth for a fintech platform processing 2,000+ daily transactions at 99.9% uptime.',
    technologies: ['Python', 'FastAPI', 'Django', 'JWT', 'REST API', 'Multithreading'],
  },
  {
    period: 'Dec 2021 – Apr 2022', type: 'Internship', role: 'Full Stack Engineering Intern',
    company: 'Promact Infotech Pvt. Ltd.', location: 'Vadodara, India',
    description: 'Built an Expense Management System (Angular 8, ASP.NET Core 5.0, MSSQL) with a graph-theory debt-simplification algorithm that cut group settlements by up to 33%.',
    technologies: ['Angular 8', 'ASP.NET Core', 'MSSQL', 'JWT', 'WebSocket', 'Agile'],
  },
];

export interface Domain { no: string; title: string; claim: string; items: string[]; proof: string[] }

export const DOMAINS: Domain[] = [
  {
    no: '01', title: 'Industrial AI & Digital Twins',
    claim: 'Built a live 3D twin of a tabletop factory with telemetry, motor-health monitoring and order orchestration over MQTT/OPC-UA.',
    items: ['MQTT', 'OPC-UA', 'InfluxDB', 'Three.js', 'WebSockets', 'Streamlit'],
    proof: ['Smart Tabletop Factory v1 & v2', 'Smart Home & City'],
  },
  {
    no: '02', title: 'Computer Vision & Perception',
    claim: 'Real-time detection and narration at 30 FPS, plus SLAM navigation with LIDAR and odometry fusion.',
    items: ['YOLOv8', 'OpenCV', 'VLM', 'SLAM', 'Kalman / Particle filters'],
    proof: ['Scene Understanding', 'SLAM Navigation', 'Indoor BLE Localization'],
  },
  {
    no: '03', title: 'NLP & Retrieval Systems',
    claim: 'Modular RAG pipeline benchmarking 5+ NLI models and 3 retrieval strategies for medical question answering.',
    items: ['HuggingFace', 'LangChain', 'RAG', 'Diffusion models'],
    proof: ['MedQA RAG Pipeline', 'Cor2Vox keynote'],
  },
  {
    no: '04', title: 'Backend & Production Delivery',
    claim: '2.5 years shipping APIs and ETL in healthcare and fintech — Azure pipelines, Docker, CI/CD and test suites that gate every deploy.',
    items: ['Python', 'FastAPI', 'SQL', 'Docker', 'CI/CD', 'Azure', 'C# / .NET'],
    proof: ['Altera Digital Health', 'Electrum IT Solutions'],
  },
];

export const MATRIX: { skill: string; tier: Tier; where: string }[] = [
  { skill: 'Python', tier: 'Production', where: 'ETL pipelines at Altera · fintech APIs at Electrum · every AI project' },
  { skill: 'FastAPI', tier: 'Production', where: 'Fintech API layer (2,000+ daily txns) · MedQA & Scene Understanding services' },
  { skill: 'Docker / CI/CD', tier: 'Production', where: 'Azure DevOps at Altera · multi-cloud deploys (fly.io, Railway, Render)' },
  { skill: 'SQL', tier: 'Production', where: 'Healthcare data migration · taught to 30 M.Sc. students at OTH' },
  { skill: 'Azure / ETL', tier: 'Production', where: 'HIPAA-aligned healthcare log pipelines — 30% latency reduction' },
  { skill: 'PyTorch / HuggingFace', tier: 'Strong', where: 'NLI benchmarking · diffusion research for Cor2Vox keynote' },
  { skill: 'MQTT / InfluxDB', tier: 'Strong', where: 'Smart Tabletop Factory telemetry at 10 Hz · Smart Home & City' },
  { skill: 'YOLOv8 / OpenCV', tier: 'Strong', where: 'Real-time agentic scene understanding at 30 FPS' },
  { skill: 'C# / .NET', tier: 'Strong', where: 'Legacy backend refactor at Altera · ASP.NET Core at Promact' },
  { skill: 'Three.js / WebSockets', tier: 'Strong', where: 'Digital Twin 2.0 live 3D visualisation' },
  { skill: 'React / TypeScript', tier: 'Explored', where: 'This portfolio · factory dashboard front-end' },
  { skill: 'SLAM / Webots / ROS', tier: 'Explored', where: 'Autonomous ROSBot navigation coursework project' },
];

export const HIGHLIGHTS = [
  { title: 'AI & Machine Learning', desc: 'Deep learning, computer vision and NLP — PyTorch, HuggingFace, LangChain and current architectures.' },
  { title: 'Production Engineering', desc: 'FastAPI, Docker, CI/CD pipelines. Clean code, testing and scalable architecture at healthcare and fintech scale.' },
  { title: 'End-to-End Delivery', desc: 'From research prototype to cloud deployment: Azure, edge computing and real-time data pipelines.' },
  { title: 'Continuous Growth', desc: 'Gold Medalist M.Sc. IT (Rank 1, GPA 9.55/10). Graduate AI coursework (45 ECTS) at OTH Amberg-Weiden. Teaching Assistant for SQL & ML. Keynote speaker, AI Conference 2025 (Grade 1.0).' },
];

export const INTERESTS = [
  { tag: 'Generative', title: 'Diffusion Models', desc: '3D shape-to-image generation using Brownian Bridge Diffusion for medical imaging.' },
  { tag: 'Retrieval', title: 'RAG Systems', desc: 'Retrieval-augmented generation for domain-specific question answering.' },
  { tag: 'Robotics', title: 'Autonomous Systems', desc: 'SLAM algorithms and sensor fusion for robust indoor navigation.' },
];

export const EDUCATION = [
  { period: 'Oct 2024 – Aug 2026', degree: 'Graduate Coursework — AI for Industrial Applications', institution: 'OTH Amberg-Weiden', location: 'Germany', grade: 'GPA 2.0 · 45 ECTS' },
  { period: '2020 – 2022', degree: 'M.Sc. Information Technology', institution: 'Charutar Vidya Mandal University', location: 'India', grade: 'Gold Medalist · Rank 1 · 9.55/10' },
  { period: '2017 – 2020', degree: 'B.Sc. Computer Science', institution: 'Sardar Patel University', location: 'India', grade: 'GPA 8.5/10' },
];

export const LANGUAGES = [
  { name: 'English', level: 'C1 — professional (IELTS 6.5)' },
  { name: 'German', level: 'A2 — actively learning, target B1' },
  { name: 'Gujarati', level: 'Native' },
  { name: 'Hindi', level: 'Fluent' },
];

export const HERO_STATS = [
  { value: '2.5+', label: 'Yrs industry' },
  { value: '8', label: 'Projects shipped' },
  { value: 'Rank 1', label: 'M.Sc. gold medalist' },
  { value: '1.0', label: 'Keynote grade' },
];

export const HERO_TAGS = ['Python', 'FastAPI', 'Docker', 'PyTorch', 'MQTT', 'Azure', 'Three.js'];

export const ROLES = ['Software Engineer', 'Industrial AI', 'Digital Twin Architect'];

export const CONTACT = {
  email: 'soham.patel.2201@gmail.com',
  github: 'https://github.com/soham10i',
  location: 'Amberg, Germany',
  availability: 'Immediately available · EU Blue Card eligible',
};
