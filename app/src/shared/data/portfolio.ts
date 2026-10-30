import { STF_LIVE_URL } from '@/shared/lib/env';

/* Site content — the single source of truth for the home page, the project
   pages and (mirrored by hand) JARVIS's prompt in backend/src/prompts.
   Tone: plain engineering writing. State what was built and how it was
   measured; no adjectives doing the work a number should do. */

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
  /** Absent while the source is not public yet. */
  githubUrl?: string;
  /** Badge on the home-page card; one project at most. */
  featured?: boolean;
  /** External live deployment (the STF twin on Google Cloud). */
  liveUrl?: string;
  /** Per-card accent; drives the card's colour field and cover art. */
  tint?: string;
  /** Cover photo (a real screenshot of the running system). Without one the
      card draws generative cover art from the tint and category. */
  image?: string;
  /** Extra images for the project page, shown as a captioned strip. */
  gallery?: { src: string; caption: string }[];
  /** A live 3-D cover instead of the photo: 'lidar' runs the SLAM controller
      in the robot engine's point-cloud mode (LidarCover). */
  cover3d?: 'lidar';
  /** Interactive run viewer (the <ei-viewer> web component) on the project page. */
  viewer?: { runs: { label: string; src: string }[] };
  description?: string;
  impact?: string;
  tech?: string[];
  versions?: ProjectVersion[];
}

export const PROJECTS: Project[] = [
  {
    id: 'digital-twin',
    title: 'Smart Tabletop Factory — Physics Digital Twin',
    category: 'Simulation',
    timeline: 'Oct 2025 – Mar 2026',
    githubUrl: 'https://github.com/soham10i/stf-hw',
    featured: true,
    liveUrl: STF_LIVE_URL,
    image: '/media/work/stf-live.jpg',
    tint: '#4d8dff',
    description: 'A digital twin of the fischertechnik 536634 training factory, built in three versions. v1 streamed the cell\'s sensors over MQTT into InfluxDB with a failure predictor on top. v2 drew the cell in the browser and drove it from the real PLC process image. v3 simulates all four stations in Python from the manufacturer\'s PLC step tables, timer values and datasheets, and checks the simulation against the controller.',
    impact: '56/56 checks passed · 85% failure-prediction accuracy',
    tech: ['Python', 'Siemens SCL', 'MQTT', 'InfluxDB', 'Streamlit'],
    versions: [
      {
        key: 'v3', label: 'v3.0',
        desc: 'Python simulation of all four stations of the fischertechnik 536634 cell, built from the controller rather than from a photograph: the manufacturer\'s own PLC step tables, TON timer literals, and component datasheets. The suction gripper has no soft limits in the PLC, so its three pulse-to-metre scales were solved from the sorting line\'s three collinear bays.',
        impact: '56/56 checks passed · 1.2 mm RMS prediction',
        tech: ['Python', 'Siemens SCL', 'NumPy'],
      },
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
    id: 'slam', title: 'Autonomous Robots — SLAM Navigation',
    category: 'Robotics', timeline: 'Oct 2024 – Mar 2025', hasVideo: true,
    description: 'A ROSBot in Webots that maps unknown mazes with 2-D LIDAR and wheel odometry (log-odds occupancy grid), plans with A* and follows the path with pure pursuit. The controller is ported to the browser, and the card replays a recorded run: 27,612 LIDAR points along 831 poses.',
    impact: 'Five maze worlds · recorded run replayed in 3D',
    tech: ['ROS', 'Webots', 'SLAM', 'LIDAR', 'A*'],
    demoUrl: '/robot',
    githubUrl: 'https://github.com/soham10i/autonomouse_robots',
    image: '/media/work/slam-robot.jpg',
    cover3d: 'lidar',
    tint: '#8b7bff',
  },
  {
    id: 'scene',
    title: 'Real-Time Multimodal Agentic Scene Understanding',
    category: 'Perception',
    timeline: 'Oct 2024 – Apr 2025',
    hasVideo: true,
    description: 'Object detection plus a vision-language model that describes what is happening in a video. The demo runs YOLOv8n in the browser with ONNX Runtime, so camera frames stay on the device; only keyframes picked by a scene-change test go to a FastAPI captioning service.',
    impact: 'Detection runs on-device in the browser',
    tech: ['YOLOv8', 'ONNX Runtime Web', 'BLIP', 'FastAPI', 'WebGPU', 'Docker'],
    demoUrl: '/scene',
    githubUrl: 'https://github.com/soham10i/Real-Time-Scene-Understanding',
    tint: '#2fe0f0',
  },
  {
    id: 'cv-uad',
    title: 'Unsupervised Brain-MRI Lesion Segmentation (BraTS-PEDs)',
    category: 'Medical imaging', timeline: '2026',
    description: 'Finds tumours in paediatric brain MRI without labels: a diffusion model learns only healthy tissue, and the parts it cannot reconstruct are flagged as anomalies.',
    impact: 'DICE 0.076 · AUROC 0.713 — weak, reported as a baseline',
    tech: ['PyTorch', 'DDPM / DDIM', 'Patch diffusion', 'dense-CRF'],
    githubUrl: 'https://github.com/soham10i/cv-project',
    image: '/media/brats-anomaly.webp',
    gallery: [
      { src: '/media/brats-input.webp', caption: 'Input slice' },
      { src: '/media/brats-noised.webp', caption: 'Partially noised' },
      { src: '/media/brats-healthy.webp', caption: 'Healthy reconstruction' },
      { src: '/media/brats-anomaly.webp', caption: 'Anomaly map' },
    ],
    tint: '#a78bfa',
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
    id: 'smart-home', title: 'Smart Home & City — Sensor and Device API',
    category: 'Backend · IoT', timeline: 'Oct 2024 – Mar 2025',
    description: 'The backend for a smart-home course project: a FastAPI service that stores sensor readings (temperature, humidity, pressure, electricity, gas), authenticates users with JWT and accepts device-control commands. Documented API, Docker Compose for local runs, deployed on Railway.',
    impact: 'Sensor ingest, JWT auth and device control in one service',
    tech: ['Python', 'FastAPI', 'JWT', 'SQLite', 'Docker', 'Railway'],
    githubUrl: 'https://github.com/soham10i/oth_ai_sem_01_mdne',
    tint: '#7fb2ff',
  },
  {
    id: 'wind-pdm',
    title: 'Predictive Maintenance for Wind Turbines',
    category: 'Predictive maintenance', timeline: '2025 – 2026',
    description: 'Early failure detection on wind-turbine SCADA data (CARE-to-Compare benchmark, Wind Farm C). Healthy operation is separated out first with DBSCAN, a fitted power curve and a 3σ band. An XGBoost model then flags which events are failures (leave-one-out CV), and residual scoring with an Isolation Forest turns that into alarm timestamps.',
    impact: 'Evaluated with the CARE score, including detection lead time',
    tech: ['Python', 'XGBoost', 'Isolation Forest', 'DBSCAN', 'scikit-learn', 'pandas'],
    githubUrl: 'https://github.com/soham10i/preventive--maintenance',
    tint: '#34d399',
  },
  {
    id: 'co2-tracker',
    title: 'CO₂ Footprint Tracker',
    category: 'Full-stack', timeline: 'WS 2024/25',
    description: 'A team web app for tracking personal CO₂ emissions from transport and household energy: a Spring Boot REST API with JWT sign-up, sign-in and token refresh, emission calculators per activity, and a dashboard. Built in two iterations for the OTH software-engineering course.',
    impact: 'Team project · two iterations · JWT REST API',
    tech: ['Java', 'Spring Boot', 'Maven', 'JWT', 'SQL', 'JavaScript'],
    githubUrl: 'https://github.com/soham10i/CO2-racking-System',
    tint: '#a3e635',
  },
  {
    id: 'medqa-nlp',
    title: 'Medical Question Answering over Wikipedia',
    category: 'NLP', timeline: '2025',
    description: 'Answers USMLE-style multiple-choice questions (MedQA) using Wikipedia as the knowledge source. SciSpacy entity recognition picks the articles, Sentence-Transformers embeds the passages, FAISS retrieves evidence for each option and a selector scores the candidates. Each stage is a tested module; the /medqa demo here is the follow-up with NLI verification.',
    impact: 'Retrieval pipeline with a unit-tested module per stage',
    tech: ['Python', 'Sentence-Transformers', 'FAISS', 'SciSpacy', 'PyTorch'],
    demoUrl: '/medqa',
    githubUrl: 'https://github.com/soham10i/natural-language-processing-project',
    tint: '#f472b6',
  },
  {
    id: 'embedded-intelligence',
    title: 'Indoor Localization — BLE + IMU Particle Filter',
    category: 'State estimation', timeline: 'Jul 2025 · v2 2026',
    description: 'Tracks a person walking through a 10 × 10 m room by fusing three BLE beacons with the IMU of an Arduino Nano 33 BLE Sense in a particle filter. The course version was a notebook; v2 is a tested Python package with a ground-truth simulator, a benchmark, a fixed 50 Hz data logger and the run viewer on this page.',
    impact: '1.8 m RMSE vs 11.1 m for the course version (10 simulated walks)',
    tech: ['Python', 'NumPy', 'Particle filter', 'Kalman filter', 'Arduino', 'BLE', 'IMU'],
    tint: '#fbbf24',
    viewer: { runs: [
      { label: 'Recorded walk', src: '/media/work/ei-recorded.json' },
      { label: 'Simulated · 50 Hz', src: '/media/work/ei-sim-50hz.json' },
    ] },
  },
];

export interface Experience {
  period: string; type: string; role: string; company: string; location: string;
  /** One sentence of context: what the role was for, and at what scale. */
  description: string;
  /** The situation the role stepped into — why the work mattered. */
  context: string;
  /** What was actually delivered, each task in detail: what was built and how.
      A recruiter should be able to read only the titles and know what to ask about. */
  tasks: { title: string; detail: string }[];
  /** The constraint that shaped the work — what made it hard. */
  tension: string;
  /** The numbers the role moved. Only figures stated elsewhere on the site. */
  outcomes: { value: string; label: string }[];
  /** What carried into later work. */
  thread: string;
  technologies: string[];
}

/* Every fact below is also in backend/src/prompts/systemPrompt.js; the prose
   around the facts explains the technology, it does not add results.
   TODO(Soham): details that would strengthen these stories if you want to add
   them — the Azure services behind the Altera pipelines (e.g. Data Factory,
   Functions, SQL), what the 30% / 25% were measured against, team sizes, and
   the name of the settlement approach at Promact. */
export const EXPERIENCES: Experience[] = [
  {
    period: 'Mar 2025 – Aug 2025', type: 'Part-time', role: 'Teaching Assistant — Decision Modelling & Data Analysis',
    company: 'OTH Amberg-Weiden', location: 'Weiden, Germany',
    description: 'Ran lab sessions for the data-analysis part of a Master’s module with 30 students.',
    context:
      'My first role in Germany, alongside graduate AI coursework at the same university. Decision Modelling & Data Analysis is a Master’s module; I ran its data-analysis half — the weekly labs where 30 students turned the lecture material into working analyses.',
    tasks: [
      {
        title: 'Weekly labs from query to prediction',
        detail:
          'The labs covered one chain of skills: SQL to pull and shape raw tables, statistical modelling to describe what the data shows, and supervised learning to predict from it — so each session built on the output of the last.',
      },
      {
        title: 'KNIME reference workflows',
        detail:
          'KNIME builds an analysis as a visual graph of nodes: read, filter, join, train, score. I built the workflows used as the reference solutions, so every exercise had a working pipeline students could compare theirs against, step by step.',
      },
      {
        title: 'Office hours and reviews',
        detail:
          'Held office hours and reviewed student work — tracing where an analysis went wrong in someone else’s pipeline, which is the same debugging habit production work needs.',
      },
    ],
    tension:
      'A reference solution has to be more than correct: every node in it has to be explainable to a room of 30 people who will copy its structure.',
    outcomes: [
      { value: '30', label: 'Master’s students in weekly labs' },
    ],
    thread: 'Ran alongside the graduate AI programme that produced the robotics and simulation projects on this site.',
    technologies: ['SQL', 'Machine Learning', 'KNIME', 'Python', 'Statistics'],
  },
  {
    period: 'Feb 2023 – Feb 2024', type: 'Full-time', role: 'Software Engineer — Data Systems',
    company: 'Altera Digital Health', location: 'Remote / Pune, India',
    description: 'Backend data pipelines for a clinical software platform.',
    context:
      'A clinical software platform keeps audit logs: the record of who accessed which data, and when. In healthcare those logs are evidence and sensitive data at the same time — they have to be quick to search when someone needs answers, and locked down the rest of the time.',
    tasks: [
      {
        title: 'ETL pipelines on Azure',
        detail:
          'Built the pipelines that extract the platform’s audit-log data, transform it into a shape that can be queried efficiently, and load it into storage on Azure. Retrieval of that data became about 30% faster.',
      },
      {
        title: 'Compliance built into the data path',
        detail:
          'Implemented the encryption, access logging and retention rules required for health data: records are encrypted, every access to them leaves its own trace, and data is kept and removed on the schedule the rules set.',
      },
      {
        title: 'Refactoring older C#/.NET services',
        detail:
          'Refactored older C#/.NET services in the platform’s backend, making existing code easier to change safely before building on it.',
      },
      {
        title: 'Tests that gate every deployment',
        detail:
          'Added pytest checks that run in the CI/CD pipeline before each deployment, so a change that breaks something is stopped before it ships rather than found after.',
      },
    ],
    tension:
      'Speed and compliance pull in opposite directions: encryption and access logging add work to every read. Retrieval had to get faster without loosening any of the rules.',
    outcomes: [
      { value: '~30%', label: 'Faster data retrieval' },
    ],
    thread: 'Testing before shipping stayed: the localisation package and the MedQA modules on this site are tested the same way.',
    technologies: ['C#', '.NET', 'Azure', 'ETL', 'CI/CD', 'pytest', 'SQL'],
  },
  {
    period: 'Aug 2022 – Jan 2023', type: 'Full-time', role: 'Python Backend Engineer',
    company: 'Electrum IT Solutions', location: 'Vadodara, India',
    description: 'REST APIs for a payments platform.',
    context:
      'A payments platform handling about 2,000 transactions a day. In payments every request moves money, so an API has to know who is calling, what they are allowed to do, and — when a payment fails — exactly why.',
    tasks: [
      {
        title: 'FastAPI and Django services',
        detail:
          'Built REST services in FastAPI and Django for the platform’s transaction traffic, about 2,000 transactions a day, backed by PostgreSQL.',
      },
      {
        title: 'JWT authentication and role-based access',
        detail:
          'Added JWT authentication and role-based access control. A signed token proves who the caller is on every request without a server-side session lookup; their role then decides which endpoints they can reach.',
      },
      {
        title: 'Central logging for failed payments',
        detail:
          'Brought the logs for failed payments into one central place, so a failure can be traced from a single view instead of pieced together. Debugging became about 25% faster.',
      },
    ],
    tension:
      'Authentication runs on every call, so it has to be strict and cheap at once — the trade-off stateless, signed tokens are designed for.',
    outcomes: [
      { value: '~2,000', label: 'Transactions a day' },
      { value: '~25%', label: 'Faster debugging of failed payments' },
    ],
    thread: 'JWT auth and role checks came back in the Smart Home sensor API and the CO₂ tracker.',
    technologies: ['Python', 'FastAPI', 'Django', 'JWT', 'REST', 'PostgreSQL'],
  },
  {
    period: 'Dec 2021 – Apr 2022', type: 'Internship', role: 'Full Stack Engineering Intern',
    company: 'Promact Infotech Pvt. Ltd.', location: 'Vadodara, India',
    description: 'A full-stack expense-sharing app.',
    context:
      'Where it started: a full-stack expense-sharing app, built in two-week sprints with code review. Recording who paid for what is the easy part. The interesting problem is settling up.',
    tasks: [
      {
        title: 'Full stack, end to end',
        detail:
          'Built the app across all three layers: an Angular front end, an ASP.NET Core API and an MSSQL database, with login secured by JWT.',
      },
      {
        title: 'Live updates over WebSocket',
        detail:
          'When one member adds an expense, the others see balances change without refreshing: the server pushes the update over a WebSocket connection.',
      },
      {
        title: 'A graph-based settlement algorithm',
        detail:
          'A group’s debts form a directed graph: people as nodes, who-owes-whom as weighted edges. I wrote an algorithm that simplifies that graph so the group settles with fewer transfers — up to 33% fewer payments.',
      },
    ],
    tension:
      'A simplified settlement still has to be exactly right: everyone must end up square, with fewer payments than before and none of them wrong.',
    outcomes: [
      { value: 'Up to 33%', label: 'Fewer payments to settle a group' },
    ],
    thread: 'Graph search returned later as A* path planning in the SLAM robot.',
    technologies: ['Angular', 'ASP.NET Core', 'MSSQL', 'JWT', 'WebSocket'],
  },
];

export interface Domain { no: string; title: string; claim: string; items: string[]; proof: string[] }

export const DOMAINS: Domain[] = [
  {
    no: '01', title: 'Sensing & state estimation',
    claim: 'Kalman and particle filters for BLE and IMU data, and LIDAR mapping with odometry. A simulator with ground truth shows how large the error really is.',
    items: ['Particle filter', 'Kalman filter', 'SLAM', 'LIDAR', 'IMU', 'BLE'],
    proof: ['Indoor Localization v2', 'SLAM Navigation'],
  },
  {
    no: '02', title: 'Perception',
    claim: 'Object detection in the browser with YOLOv8 and ONNX Runtime, image captioning, and diffusion-based anomaly detection on brain MRI (a weak result, reported as such).',
    items: ['PyTorch', 'YOLOv8', 'ONNX Runtime', 'VLM', 'DDPM / DDIM'],
    proof: ['Scene Understanding', 'Brain-MRI UAD'],
  },
  {
    no: '03', title: 'Modelling & simulation',
    claim: 'A simulation of a factory cell built from its PLC code and checked against it. Anomaly detection on wind-turbine sensor data.',
    items: ['Python', 'Siemens SCL', 'MQTT', 'OPC-UA', 'XGBoost', 'Three.js'],
    proof: ['Smart Tabletop Factory', 'Wind-turbine PdM'],
  },
  {
    no: '04', title: 'Production software',
    claim: 'Backend and data work in healthcare and payments: Python and .NET services, Azure pipelines, Docker and tests in CI.',
    items: ['Python', 'FastAPI', 'SQL', 'Docker', 'CI/CD', 'Azure', 'C# / .NET'],
    proof: ['Altera Digital Health', 'Electrum IT Solutions'],
  },
];

/* Plain and technical: what each programme covered. The graduate AI
   coursework lists its subjects rather than its grades. */
export const EDUCATION: { period: string; degree: string; institution: string; location: string; grade?: string; focus: string; points?: string[] }[] = [
  {
    period: 'Current',
    degree: 'M.Sc. Computer Engineering',
    institution: 'Paderborn University',
    location: 'Paderborn, Germany',
    grade: 'In progress',
    focus:
      'Robotics and embedded systems: state estimation, perception, planning and control. ' +
      'AI hardware: accelerators for inference and digital chip design.',
  },
  {
    period: 'Oct 2024 – Aug 2026',
    degree: 'Graduate Coursework — Artificial Intelligence for Industrial Applications',
    institution: 'Ostbayerische Technische Hochschule Amberg-Weiden',
    location: 'Amberg, Germany',
    focus: 'Projects from this coursework: the tabletop-factory digital twin, the Webots SLAM robot, the diffusion-based MRI segmentation.',
    points: [
      'Deep learning and advanced learning algorithms',
      'Computer vision; generative and diffusion models',
      'Digital twins and Industry 4.0; autonomous systems; embedded intelligence',
      'AI Conference 2025 talk: 3D shape-to-image Brownian bridge diffusion (Cor2Vox)',
    ],
  },
  {
    period: '2020 – 2022',
    degree: 'M.Sc. Information Technology',
    institution: 'Charutar Vidya Mandal University',
    location: 'Gujarat, India',
    grade: 'Rank 1 of cohort · gold medal',
    focus: 'Software engineering, databases, distributed systems. Thesis in applied machine learning.',
  },
  {
    period: '2017 – 2020',
    degree: 'B.Sc. Computer Science',
    institution: 'Sardar Patel University',
    location: 'Gujarat, India',
    focus: 'Algorithms and data structures, operating systems, computer networks, programming.',
  },
];

export const LANGUAGES = [
  { name: 'English', level: 'C1 · Professional working proficiency' },
  { name: 'German', level: 'A2 · in active study toward B1, living in Germany' },
  { name: 'Gujarati', level: 'Native' },
  { name: 'Hindi', level: 'Fluent' },
];

export const HERO_TAGS = ['Python', 'FastAPI', 'Docker', 'PyTorch', 'MQTT', 'Azure', 'Three.js'];

export const CONTACT = {
  email: 'soham.patel.2201@gmail.com',
  github: 'https://github.com/soham10i',
  linkedin: 'https://www.linkedin.com/in/soham-patel-10i/',
  location: 'Paderborn, Germany — open to relocation across Germany and the EU',
  availability: 'Available now · EU Blue Card eligible · no visa sponsorship required for Germany',
};
