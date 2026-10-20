import { create } from 'zustand';
import { setSmoothScroll } from '@/shared/lib/lenis';
import { detectQuality, type Quality } from './quality';

/* Shared state between the DOM sections and the (fixed, single) WebGL layer.
 * Sections write where the visitor is; the canvas reads it inside its frame
 * loop through `useStory.getState()`, so a scroll tick never re-renders React.
 *
 * `progress` changes every frame — subscribe to it imperatively, never select
 * it in a component body. */

const MOTION_KEY = 'sp-motion';
const COLLECTED_KEY = 'sp-collected';

function readMotion(): boolean {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch { /* storage blocked — fall back to the OS setting */ }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readCollected(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLLECTED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function applyMotion(on: boolean) {
  document.documentElement.dataset.motion = on ? 'on' : 'off';
  setSmoothScroll(on);
}

interface StoryState {
  /** Index into CHAPTERS of the section crossing the viewport centre. */
  chapter: number;
  /** Whole-page scroll progress, 0–1. Per-frame; read imperatively. */
  progress: number;
  /** User-facing motion switch. Initialised from storage, then the OS. */
  motion: boolean;
  quality: Quality;
  /** Project ids the visitor has opened — the "x / N explored" counter. */
  collected: string[];
  setChapter: (i: number) => void;
  setProgress: (p: number) => void;
  setMotion: (on: boolean) => void;
  collect: (id: string) => void;
}

const initialMotion = readMotion();
applyMotion(initialMotion);

export const useStory = create<StoryState>((set, get) => ({
  chapter: 0,
  progress: 0,
  motion: initialMotion,
  quality: detectQuality(),
  collected: readCollected(),
  setChapter: (chapter) => { if (get().chapter !== chapter) set({ chapter }); },
  setProgress: (progress) => set({ progress }),
  setMotion: (motion) => {
    applyMotion(motion);
    try { localStorage.setItem(MOTION_KEY, motion ? 'on' : 'off'); } catch { /* non-fatal */ }
    set({ motion });
  },
  collect: (id) => {
    const { collected } = get();
    if (collected.includes(id)) return;
    const next = [...collected, id];
    try { localStorage.setItem(COLLECTED_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
    set({ collected: next });
  },
}));
