export interface Skill {
  name: string;
  icon: string;
  level: number; // 0-100
  color: string;
}

export interface SkillCategory {
  id: string;
  title: string;
  icon: string;
  color: string;
  skills: Skill[];
}

export const skillCategories: SkillCategory[] = [
  {
    id: 'aiml',
    title: 'AI / ML',
    icon: '🧠',
    color: 'from-purple-500 to-violet-600',
    skills: [
      { name: 'PyTorch', icon: '🔥', level: 88, color: '#EF4444' },
      { name: 'scikit-learn', icon: '📊', level: 85, color: '#F97316' },
      { name: 'YOLOv8', icon: '👁️', level: 82, color: '#8B5CF6' },
      { name: 'HuggingFace', icon: '🤗', level: 80, color: '#F59E0B' },
      { name: 'BLIP / VLM', icon: '🖼️', level: 75, color: '#EC4899' },
      { name: 'FAISS', icon: '🔍', level: 78, color: '#3B82F6' },
      { name: 'spaCy', icon: '📝', level: 76, color: '#06B6D4' },
      { name: 'OpenCV', icon: '📷', level: 80, color: '#22C55E' },
      { name: 'Diffusion Models', icon: '🌊', level: 72, color: '#A855F7' },
    ],
  },
  {
    id: 'backend',
    title: 'Backend',
    icon: '⚙️',
    color: 'from-teal-500 to-cyan-600',
    skills: [
      { name: 'Python', icon: '🐍', level: 93, color: '#3B82F6' },
      { name: 'FastAPI', icon: '⚡', level: 90, color: '#06B6D4' },
      { name: 'SQLAlchemy', icon: '🗄️', level: 82, color: '#8B5CF6' },
      { name: 'REST API', icon: '🔗', level: 90, color: '#10B981' },
      { name: 'WebSocket', icon: '🔌', level: 80, color: '#F59E0B' },
      { name: 'Pydantic', icon: '✅', level: 85, color: '#EF4444' },
      { name: 'Java', icon: '☕', level: 75, color: '#F97316' },
      { name: 'JavaScript', icon: '📜', level: 72, color: '#EAB308' },
      { name: 'async/await', icon: '⏳', level: 85, color: '#A855F7' },
    ],
  },
  {
    id: 'iot',
    title: 'IoT / Hardware',
    icon: '🏭',
    color: 'from-orange-500 to-amber-600',
    skills: [
      { name: 'MQTT (paho)', icon: '📡', level: 88, color: '#F97316' },
      { name: 'Sensor Simulation', icon: '🔧', level: 85, color: '#EF4444' },
      { name: 'Digital Twin', icon: '🏗️', level: 87, color: '#06B6D4' },
      { name: 'Physics Engine', icon: '⚙️', level: 80, color: '#8B5CF6' },
      { name: 'Real-time Systems', icon: '⏱️', level: 83, color: '#22C55E' },
      { name: 'Fischertechnik', icon: '🤖', level: 82, color: '#F59E0B' },
    ],
  },
  {
    id: 'devops',
    title: 'DevOps / CI-CD',
    icon: '🚀',
    color: 'from-blue-500 to-indigo-600',
    skills: [
      { name: 'Docker', icon: '🐳', level: 85, color: '#06B6D4' },
      { name: 'GitHub Actions', icon: '⚙️', level: 83, color: '#6B7280' },
      { name: 'pytest', icon: '🧪', level: 82, color: '#22C55E' },
      { name: 'docker-compose', icon: '📦', level: 80, color: '#3B82F6' },
      { name: 'flake8 / black', icon: '🎨', level: 85, color: '#8B5CF6' },
      { name: 'bandit / safety', icon: '🔒', level: 75, color: '#EF4444' },
      { name: 'Git', icon: '📋', level: 92, color: '#F97316' },
      { name: 'Linux / Bash', icon: '🐧', level: 78, color: '#EAB308' },
    ],
  },
  {
    id: 'databases',
    title: 'Databases',
    icon: '🗄️',
    color: 'from-green-500 to-emerald-600',
    skills: [
      { name: 'PostgreSQL', icon: '🐘', level: 80, color: '#3B82F6' },
      { name: 'SQLite', icon: '💾', level: 85, color: '#6B7280' },
      { name: 'FAISS Vector DB', icon: '🔍', level: 78, color: '#8B5CF6' },
      { name: 'NoSQL Concepts', icon: '📊', level: 72, color: '#22C55E' },
      { name: 'SQL', icon: '📋', level: 83, color: '#06B6D4' },
    ],
  },
  {
    id: 'cloud',
    title: 'Cloud / Tools',
    icon: '☁️',
    color: 'from-pink-500 to-rose-600',
    skills: [
      { name: 'Vercel', icon: '▲', level: 82, color: '#111827' },
      { name: 'Railway', icon: '🚂', level: 80, color: '#8B5CF6' },
      { name: 'Fly.io', icon: '✈️', level: 75, color: '#3B82F6' },
      { name: 'Azure (Fundamentals)', icon: '🌐', level: 65, color: '#06B6D4' },
      { name: 'Streamlit', icon: '📊', level: 83, color: '#EF4444' },
      { name: 'Uvicorn', icon: '⚡', level: 85, color: '#06B6D4' },
      { name: 'ngrok', icon: '🔀', level: 78, color: '#F97316' },
    ],
  },
];

export const topSkills = [
  'Python', 'FastAPI', 'Docker', 'MQTT', 'Digital Twin',
  'PyTorch', 'YOLOv8', 'HuggingFace', 'GitHub Actions', 'REST API',
  'WebSocket', 'SQLAlchemy', 'pytest', 'Streamlit', 'FAISS',
];
