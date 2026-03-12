export type ProjectTag = 'All' | 'AI/ML' | 'IoT' | 'Full-Stack' | 'Team';

export interface Project {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  tags: ProjectTag[];
  tech: string[];
  techColors: Record<string, string>;
  githubUrl: string;
  liveUrl?: string;
  featured: boolean;
  metrics: { label: string; value: string }[];
  language: string;
  stars: number;
  forks: number;
  category: string;
  year: number;
  isCollaboration?: boolean;
  collaborator?: string;
  collaboratorUrl?: string;
  systemFlow?: string[];
}

export const projects: Project[] = [
  {
    id: 'stf-hw',
    name: 'Digital Twin — Smart Tabletop Factory',
    description: 'High-fidelity Digital Twin for Fischertechnik cookie production factory with real-time physics simulation',
    longDescription:
      'A complete Digital Twin system simulating an industrial Fischertechnik cookie production factory. Features a 10Hz physics engine with dead-reckoning, MQTT pub/sub for bidirectional hardware-software communication, 25+ REST API endpoints, real-time Streamlit dashboard, and a full 5-stage CI/CD pipeline via GitHub Actions.',
    tags: ['IoT', 'AI/ML', 'Full-Stack'],
    tech: ['Python', 'FastAPI', 'MQTT', 'SQLAlchemy', 'Docker', 'GitHub Actions', 'Streamlit', 'WebSocket', 'Pydantic', 'pytest'],
    techColors: {
      Python: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      FastAPI: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      MQTT: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      SQLAlchemy: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      Docker: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      'GitHub Actions': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
      Streamlit: 'bg-red-500/20 text-red-300 border-red-500/30',
      WebSocket: 'bg-green-500/20 text-green-300 border-green-500/30',
      Pydantic: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      pytest: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    },
    githubUrl: 'https://github.com/soham10i/stf-hw',
    featured: true,
    metrics: [
      { label: 'Hardware Components', value: '18' },
      { label: 'Physics Engine', value: '10Hz' },
      { label: 'REST Endpoints', value: '25+' },
      { label: 'DB Tables', value: '12' },
      { label: 'Test Suites', value: '4' },
      { label: 'CI/CD Stages', value: '5' },
    ],
    language: 'Python',
    stars: 0,
    forks: 0,
    category: 'Digital Twin / IoT',
    year: 2026,
    systemFlow: ['Sensors (18)', 'MQTT Broker', 'Controller', 'FastAPI REST', 'Dashboard'],
  },
  {
    id: 'realtime-scene',
    name: 'Real-Time Scene Understanding',
    description: 'Multi-threaded real-time scene understanding combining YOLOv8 object detection with BLIP vision-language captioning',
    longDescription:
      'An AI pipeline combining YOLOv8 for real-time object detection with BLIP for vision-language image captioning. Uses multi-threading for parallel inference, feedback-enhanced confidence thresholding, and supports multi-platform deployment across Fly.io, Railway, and Render.',
    tags: ['AI/ML', 'Full-Stack'],
    tech: ['Python', 'PyTorch', 'YOLOv8', 'BLIP', 'FastAPI', 'Multi-threading', 'Fly.io'],
    techColors: {
      Python: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      PyTorch: 'bg-red-500/20 text-red-300 border-red-500/30',
      YOLOv8: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      BLIP: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
      FastAPI: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      'Multi-threading': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'Fly.io': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    },
    githubUrl: 'https://github.com/soham10i/Real-Time-Scene-Understanding',
    featured: true,
    metrics: [
      { label: 'Inference Mode', value: 'Real-time' },
      { label: 'Architecture', value: 'Multi-thread' },
      { label: 'Deployment', value: '3 Platforms' },
      { label: 'Models', value: 'YOLOv8 + BLIP' },
    ],
    language: 'Python',
    stars: 0,
    forks: 0,
    category: 'Computer Vision / AI',
    year: 2025,
  },
  {
    id: 'nlp',
    name: 'NLP — RAG Pipeline & Medical NER',
    description: 'Retrieval-Augmented QA pipeline with hybrid dense+sparse search and medical Named Entity Recognition',
    longDescription:
      'A modular NLP system featuring a full RAG (Retrieval-Augmented Generation) pipeline with FAISS dense retrieval and TF-IDF sparse search. Includes a medical NER module recognising DISEASE, DRUG, ANATOMY, and PROCEDURE entities using HuggingFace Transformers and spaCy.',
    tags: ['AI/ML'],
    tech: ['Python', 'HuggingFace', 'FAISS', 'spaCy', 'TF-IDF', 'Wikipedia API', 'Transformers'],
    techColors: {
      Python: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      HuggingFace: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      FAISS: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
      spaCy: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      'TF-IDF': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
      'Wikipedia API': 'bg-green-500/20 text-green-300 border-green-500/30',
      Transformers: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    },
    githubUrl: 'https://github.com/soham10i/nlp',
    featured: false,
    metrics: [
      { label: 'Search', value: 'Dense + Sparse' },
      { label: 'NER Classes', value: '4 Medical' },
      { label: 'Architecture', value: 'Retriever → Reader' },
    ],
    language: 'Python',
    stars: 0,
    forks: 0,
    category: 'NLP / AI',
    year: 2025,
  },
  {
    id: 'smart-home',
    name: 'Smart Home & City IoT API',
    description: 'Cloud-deployed IoT REST API backend for smart home and smart city applications with MVC architecture',
    longDescription:
      'A production-ready IoT backend built with FastAPI following MVC architecture. Supports smart home sensor data ingestion, real-time querying, and analytics. Fully containerised with Docker and deployed on Railway cloud.',
    tags: ['IoT', 'Full-Stack'],
    tech: ['Python', 'FastAPI', 'Docker', 'SQLite', 'Railway', 'MVC'],
    techColors: {
      Python: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      FastAPI: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      Docker: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      SQLite: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
      Railway: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      MVC: 'bg-green-500/20 text-green-300 border-green-500/30',
    },
    githubUrl: 'https://github.com/soham10i/oth_ai_sem_01_mdne',
    featured: false,
    metrics: [
      { label: 'Deployment', value: 'Cloud (Railway)' },
      { label: 'Architecture', value: 'MVC' },
      { label: 'Container', value: 'Docker' },
    ],
    language: 'Python',
    stars: 0,
    forks: 1,
    category: 'IoT / Backend',
    year: 2025,
  },
  {
    id: 'co2-tracker',
    name: 'CO₂ Emission Tracking System',
    description: 'Collaborative CO2 emission tracker built by a team of 4 with iterative sprint-based development',
    longDescription:
      'A team project built by 4 developers tracking CO2 emissions across different activities and industries. Features a full-stack web application with Java backend and HTML/CSS/JS frontend, developed through iterative sprints.',
    tags: ['Full-Stack', 'Team'],
    tech: ['Java', 'HTML', 'CSS', 'JavaScript', 'Team of 4'],
    techColors: {
      Java: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      HTML: 'bg-red-500/20 text-red-300 border-red-500/30',
      CSS: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      JavaScript: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'Team of 4': 'bg-green-500/20 text-green-300 border-green-500/30',
    },
    githubUrl: 'https://github.com/soham10i/CO2-racking-System',
    featured: false,
    metrics: [
      { label: 'Team Size', value: '4 Devs' },
      { label: 'Methodology', value: 'Agile Sprints' },
      { label: 'Domain', value: 'Sustainability' },
    ],
    language: 'HTML',
    stars: 0,
    forks: 0,
    category: 'Full-Stack / Team',
    year: 2025,
  },
  {
    id: 'llm-ngl-viewer',
    name: 'LLM Molecular Visualizer',
    description: 'LLM-powered 3D molecular visualization tool — collaboration with shivampatel10',
    longDescription:
      'A collaborative project combining LLM capabilities with NGL Viewer for interactive 3D molecular structure visualization. Allows natural language queries to explore and render molecular structures in real time.',
    tags: ['AI/ML', 'Full-Stack'],
    tech: ['JavaScript', 'HTML', 'CSS', 'NGL Viewer', 'LLM API'],
    techColors: {
      JavaScript: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      HTML: 'bg-red-500/20 text-red-300 border-red-500/30',
      CSS: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'NGL Viewer': 'bg-green-500/20 text-green-300 border-green-500/30',
      'LLM API': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
    githubUrl: 'https://github.com/shivampatel10/llm-ngl-viewer',
    featured: false,
    metrics: [
      { label: 'Visualization', value: '3D Molecular' },
      { label: 'Interface', value: 'Natural Language' },
      { label: 'Type', value: 'Collaboration' },
    ],
    language: 'JavaScript',
    stars: 0,
    forks: 0,
    category: 'AI / Bioinformatics',
    year: 2025,
    isCollaboration: true,
    collaborator: 'shivampatel10',
    collaboratorUrl: 'https://github.com/shivampatel10',
  },
];
