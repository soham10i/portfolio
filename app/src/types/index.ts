export interface Project {
  id: string;
  title: string;
  tagline: string;
  description: string;
  longDescription: string;
  thumbnail: string;
  images: string[];
  video?: string;
  demoUrl?: string;
  githubUrl: string;
  paperUrl?: string;
  technologies: string[];
  highlights: string[];
  architecture?: string;
  timeline: string;
  role: string;
  status: 'completed' | 'ongoing';
  category: 'AI/ML' | 'Computer Vision' | 'NLP' | 'Robotics' | 'Fullstack' | 'Embedded';
}

export interface Experience {
  id: string;
  company: string;
  location: string;
  role: string;
  period: string;
  type: 'full-time' | 'part-time' | 'internship' | 'freelance';
  description: string;
  achievements: string[];
  technologies: string[];
}

export interface Skill {
  name: string;
  level: number; // 0-100
  category: 'ML/AI' | 'Engineering' | 'Data/Cloud' | 'Leadership';
  icon?: string;
}

export interface Education {
  institution: string;
  location: string;
  degree: string;
  period: string;
  grade: string;
  details: string[];
}

export interface Talk {
  title: string;
  event: string;
  date: string;
  grade?: string;
  description: string;
  link?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: string[];
}

export interface NavItem {
  label: string;
  href: string;
}
