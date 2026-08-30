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
    demoUrl: '/factory-twin',
    githubUrl: 'https://github.com/soham10i/stf-hw',
    versions: [
      {
        key: 'v2', label: 'v2.0',
        desc: 'Browser-native 3D twin of the fischertechnik 536634 cell, modelled on the real 15 mm construction grid with material colours sampled from the hardware. Drives the full 8-phase production cycle and mirrors the controller: all 9 digital inputs and 14 digital outputs from the Belegungsplan update live beside the geometry, with real drive ratings (encoder motor 214 min⁻¹, 25:1, 75 pulses per output revolution).',
        impact: 'Live 3D cell with a 9 DI / 14 DO process image',
        tech: ['Three.js', 'WebGL', 'WebSockets', 'MQTT', 'OPC-UA', 'FastAPI', 'Docker'],
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
    description: 'YOLOv8 detection fused with a vision-language model for scene narration. The live demo runs the same YOLOv8n weights in the browser through ONNX Runtime — camera frames never leave your device — and sends only scene-change keyframes to the FastAPI captioning service.',
    impact: 'Try it live — detection runs in your browser',
    tech: ['YOLOv8', 'ONNX Runtime Web', 'BLIP', 'FastAPI', 'WebGPU', 'Docker'],
    demoUrl: '/scene',
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
    id: 'wind', title: 'Predictive Maintenance for Wind Turbines — Sensor Time-Series',
    category: 'AI/ML', timeline: 'Nov 2024 – Apr 2025',
    description: 'Condition monitoring on wind-turbine SCADA time-series: multi-channel sensor histories (vibration, gearbox temperature, power output) drive a fused health index, so degradation is flagged from the data before a scheduled inspection would catch it. Multi-output regression with the CARE framework predicts fault state and energy output from the same feature set, benchmarked across 8 algorithms.',
    impact: 'Condition-based fault flagging from sensor histories',
    tech: ['Time-series', 'Scikit-learn', 'CARE', 'Feature engineering', 'Pandas', 'NumPy'],
    githubUrl: 'https://github.com/soham10i/machine-learning-sem01-oth-aw',
  },
  {
    id: 'slam', title: 'Autonomous Robots — SLAM Navigation',
    category: 'Robotics', timeline: 'Oct 2024 – Mar 2025', hasVideo: true,
    description: 'SLAM with LIDAR + odometry fusion, log-odds occupancy mapping and A* planning, driving a ROSBot through five Webots maps. The controller pipeline is re-implemented in the browser, so the runs are live rather than recorded.',
    impact: 'Five maps, live in-browser re-implementation',
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
    id: 'cv-uad',
    title: 'Unsupervised Brain-MRI Lesion Segmentation (BraTS-PEDs)',
    category: 'Computer Vision', timeline: '2026',
    githubUrl: 'https://github.com/soham10i/cv-project',
    versions: [
      {
        key: 'pdm', label: 'PDM',
        desc: 'Multi-scale patch diffusion in pixel space on BraTS-PEDs: a UNet2DModel is trained with a DDPM objective on healthy 96×96 patches only, then DDIM partially noises and reconstructs each of the 121 patches per slice. Gaussian fusion removes edge artefacts, and a dense-CRF guided by T1c sharpens the residual into a mask. 60 epochs, AdamW 2e-4, EMA decay 0.9999.',
        impact: 'DICE 0.076 calibrated · AUROC 0.713 pixel-wise',
        tech: ['PyTorch', 'DDPM / DDIM', 'Patch diffusion', 'dense-CRF', 'EMA'],
      },
      {
        key: 'brats', label: 'brats-uad',
        desc: 'Latent-diffusion UAD on BraTS-PEDs: a from-scratch 4-channel medical KL-VAE encodes all modalities, a DDPM learns the healthy latent manifold, and the residual after partial noise-and-denoise localises the lesion. Underperformed, which is what motivated the pixel-space PDM redesign.',
        impact: 'Superseded by PDM — kept as the negative result',
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
  /** One sentence of context: what the role was for, and at what scale. */
  description: string;
  /** What was actually delivered. Each line states an action and its result —
      a recruiter should be able to read only these and know what to ask about. */
  highlights: string[];
  technologies: string[];
}

export const EXPERIENCES: Experience[] = [
  {
    period: 'Mar 2025 – Aug 2025', type: 'Part-time', role: 'Teaching Assistant — Decision Modelling & Data Analysis',
    company: 'OTH Amberg-Weiden', location: 'Weiden, Germany',
    description:
      'Facilitated the applied data analysis curriculum for a graduate cohort of 30 students, concurrently managing personal Master\u2019s coursework.',
    highlights: [
      'Architected and led comprehensive laboratory sessions on advanced SQL, statistical modelling, and supervised machine learning, bridging theoretical concepts with practical application on complex industrial datasets.',
      'Engineered and maintained robust KNIME workflows serving as reference implementations for the module, demonstrating best practices in data preprocessing, feature engineering, and model validation.',
      'Conducted academic mentoring and rigorous evaluation of student submissions, fostering analytical problem-solving skills and refining the communication of complex technical concepts.',
    ],
    technologies: ['SQL', 'Machine Learning', 'KNIME', 'Python', 'Statistics', 'Data Visualisation'],
  },
  {
    period: 'Feb 2023 – Feb 2024', type: 'Full-time', role: 'Software Engineer — Data Systems',
    company: 'Altera Digital Health', location: 'Remote / Pune, India',
    description:
      'Owned backend data infrastructure for a clinical platform, where the data is regulated, the volume is large and downtime is not an option.',
    highlights: [
      'Architected high-throughput ETL pipelines on Microsoft Azure for healthcare audit logs, cutting retrieval latency by 30% against the previous implementation.',
      'Brought the pipeline to full compliance with HIPAA-aligned data-handling standards — encryption in transit and at rest, access auditing, and retention rules enforced in code rather than by convention.',
      'Refactored legacy C#/.NET services and added a pytest suite that gates every deployment, turning a manual release checklist into an automated one.',
      'Worked across time zones in a distributed team, which is where I learned that a clear written handover is worth more than a long meeting.',
    ],
    technologies: ['C#', '.NET', 'Azure', 'Blob Storage', 'ETL', 'CI/CD', 'pytest', 'SQL'],
  },
  {
    period: 'Aug 2022 – Jan 2023', type: 'Full-time', role: 'Python Backend Engineer',
    company: 'Electrum IT Solutions', location: 'Vadodara, India',
    description:
      'Built and ran the API layer of a fintech platform where a failed request is a failed payment.',
    highlights: [
      'Designed RESTful services in FastAPI and Django handling 2,000+ transactions a day at 99.9% uptime.',
      'Implemented JWT authentication and role-based access control across the service boundary, and multithreaded the settlement path to keep response times flat under load.',
      'Instrumented the stack so failures surfaced as alerts rather than as customer complaints.',
    ],
    technologies: ['Python', 'FastAPI', 'Django', 'JWT', 'REST', 'Multithreading', 'PostgreSQL'],
  },
  {
    period: 'Dec 2021 – Apr 2022', type: 'Internship', role: 'Full Stack Engineering Intern',
    company: 'Promact Infotech Pvt. Ltd.', location: 'Vadodara, India',
    description:
      'First professional role: a full-stack expense management product, taken from requirements to a working deployment.',
    highlights: [
      'Built the application end to end — Angular 8 front end, ASP.NET Core 5.0 API, MSSQL schema — with JWT auth and WebSocket updates for live balances.',
      'Designed a debt-simplification algorithm from graph theory that reduced the number of transfers needed to settle a group by up to 33%, which remains the piece of work I most enjoyed reasoning about.',
      'Worked in two-week Agile cycles with code review, which is where the habit of writing for the next reader started.',
    ],
    technologies: ['Angular 8', 'ASP.NET Core', 'MSSQL', 'JWT', 'WebSocket', 'Agile'],
  },
];

export interface Domain { no: string; title: string; claim: string; items: string[]; proof: string[] }

export const DOMAINS: Domain[] = [
  {
    no: '01', title: 'Industrial AI & Digital Twins',
    claim: 'Built a live 3D twin of a tabletop factory with telemetry, motor-health monitoring and order orchestration over MQTT/OPC-UA, plus condition-based maintenance models on turbine sensor time-series.',
    items: ['MQTT', 'OPC-UA', 'InfluxDB', 'Three.js', 'WebSockets', 'Streamlit'],
    proof: ['Smart Tabletop Factory v1 & v2', 'Wind Turbine PdM', 'Smart Home & City'],
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
  { skill: 'Computer Vision (YOLO/OpenCV)', tier: 'Strong', where: 'Real-time agentic scene understanding at 30 FPS' },
  { skill: 'C# / .NET', tier: 'Strong', where: 'Legacy backend refactor at Altera · ASP.NET Core at Promact' },
  { skill: 'Three.js / WebSockets', tier: 'Strong', where: 'Digital Twin 2.0 live 3D visualisation' },
  { skill: 'React / TypeScript', tier: 'Explored', where: 'This portfolio · factory dashboard front-end' },
  { skill: 'SLAM / Webots / ROS', tier: 'Explored', where: 'Autonomous ROSBot navigation coursework project' },
];

export const HIGHLIGHTS = [
  {
    title: 'Production engineering, not prototypes',
    desc: 'Two and a half years shipping systems other people depend on — regulated healthcare data at Altera, payment APIs at Electrum. FastAPI and .NET services, Azure ETL, Docker, CI/CD, and test suites that block a bad deploy rather than documenting one.',
  },
  {
    title: 'Industrial AI and digital twins',
    desc: 'A browser-native 3D twin of a fischertechnik Industry 4.0 cell, modelled on the real 15 mm construction grid and driven by the actual PLC process image — 9 digital inputs and 14 digital outputs from the Belegungsplan, over MQTT and OPC-UA. Predictive maintenance on turbine sensor time-series alongside it.',
  },
  {
    title: 'Computer vision and autonomy',
    desc: 'YOLOv8 exported to ONNX and run in the browser so camera frames never leave the visitor\u2019s device, paired with a self-hosted vision-language model for narration. LIDAR SLAM with an occupancy grid, A* planning and pure-pursuit control, ported from a Python Webots controller to the web.',
  },
  {
    title: 'Depth, honestly reported',
    desc: 'M.Sc. IT as Gold Medalist, Rank 1 of the cohort (9.55/10), followed by graduate AI coursework at OTH Amberg-Weiden. Keynote speaker at the 2025 AI Research Conference on Brownian Bridge diffusion for 3D medical image synthesis, graded 1.0. Where a result was negative — the unsupervised brain-MRI work reached DICE 0.076 — the site says so, because a portfolio that only reports wins tells you nothing about judgement.',
  },
];

export const INTERESTS = [
  { tag: 'Generative', title: 'Diffusion Models', desc: '3D shape-to-image generation using Brownian Bridge Diffusion for medical imaging.' },
  { tag: 'Retrieval', title: 'RAG Systems', desc: 'Retrieval-augmented generation for domain-specific question answering.' },
  { tag: 'Robotics', title: 'Autonomous Systems', desc: 'SLAM algorithms and sensor fusion for robust indoor navigation.' },
];

export const EDUCATION = [
  {
    period: 'Oct 2024 – Aug 2026',
    degree: 'Graduate Coursework — Artificial Intelligence for Industrial Applications',
    institution: 'Ostbayerische Technische Hochschule Amberg-Weiden',
    location: 'Amberg, Germany',
    grade: '45 ECTS · GPA 2.0',
    focus: 'Digital twins and Industry 4.0, computer vision, generative models, autonomous systems. Coursework is project-led: the tabletop-factory twin, the Webots SLAM robot and the diffusion work on this site are all outputs of it.',
  },
  {
    period: '2020 – 2022',
    degree: 'M.Sc. Information Technology',
    institution: 'Charutar Vidya Mandal University',
    location: 'Gujarat, India',
    grade: 'Gold Medalist · Rank 1 of cohort · 9.55/10',
    focus: 'Software engineering, databases and distributed systems, with the thesis work in applied machine learning. Graduated first in the cohort.',
  },
  {
    period: '2017 – 2020',
    degree: 'B.Sc. Computer Science',
    institution: 'Sardar Patel University',
    location: 'Gujarat, India',
    grade: '8.5/10',
    focus: 'Foundations — algorithms and data structures, operating systems, networks, and the first serious programming.',
  },
];

export const LANGUAGES = [
  { name: 'English', level: 'C1 · professional working proficiency (IELTS 6.5)' },
  { name: 'German', level: 'A2 · in active study toward B1, living in Bavaria' },
  { name: 'Gujarati', level: 'Native' },
  { name: 'Hindi', level: 'Fluent' },
];

export const HERO_STATS = [
  { value: '2.5 yrs', label: 'Production experience' },
  { value: '8', label: 'Projects, end to end' },
  { value: 'Rank 1', label: 'M.Sc. — Gold Medalist' },
  { value: '1.0', label: 'Keynote grade, AI Conference' },
];

export const HERO_TAGS = ['Python', 'FastAPI', 'Docker', 'PyTorch', 'MQTT', 'Azure', 'Three.js'];

export const ROLES = ['Software Engineer', 'Industrial AI Engineer', 'Digital Twin Developer', 'Computer Vision Engineer'];

export const CONTACT = {
  email: 'soham.patel.2201@gmail.com',
  github: 'https://github.com/soham10i',
  location: 'Germany — open to relocation across the EU',
  availability: 'Available from September 2026 · EU Blue Card eligible · no visa sponsorship required for Germany',
};
