import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import StoryHome from '@/features/story/StoryHome';
import ProjectDetail from '@/features/projects/ProjectDetail';
import ChatLauncher from '@/features/chat/components/ChatLauncher';

/* The demos pull runtime engines and model weights; the notes pages pull
   KaTeX and a Markdown parser. Neither belongs in the first paint, so every
   route below the first two is loaded on demand. */
const AutonomousRobot = lazy(() => import('@/features/robot/AutonomousRobot'));
const SceneLab = lazy(() => import('@/features/scene-lab/SceneLab'));
const Notes = lazy(() => import('@/features/notes/Notes'));
const NoteView = lazy(() => import('@/features/notes/NoteView'));
const NoteEditor = lazy(() => import('@/features/notes/NoteEditor'));
const MedqaDemo = lazy(() => import('@/features/medqa/MedqaDemo'));
const Scene = lazy(() => import('@/shaders/Scene'));

function ViewerFallback() {
  return (
    <div className="grid min-h-screen place-items-center" style={{ background: 'var(--bg)' }}>
      <div className="h-[34px] w-[34px] animate-spin rounded-full border-2 border-line border-t-[color:var(--a)]" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<ViewerFallback />}>
        <Routes>
          <Route path="/" element={<StoryHome />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          {/* The STF twin now runs on Cloud Run, not in this app. Old links
              land on its project page, which frames the live site. */}
          <Route path="/factory" element={<Navigate to="/project/digital-twin" replace />} />
          <Route path="/factory-twin" element={<Navigate to="/project/digital-twin" replace />} />
          <Route path="/stf-layout" element={<Navigate to="/project/digital-twin" replace />} />
          <Route path="/classic" element={<Navigate to="/" replace />} />
          <Route path="/robot" element={<AutonomousRobot />} />
          <Route path="/scene" element={<SceneLab />} />
          <Route path="/shaders" element={<Scene />} />
          <Route path="/glass-ai-button" element={<Scene />} />
          <Route path="/blog" element={<Notes />} />
          <Route path="/blog/:slug" element={<NoteView />} />
          <Route path="/notes" element={<Navigate to="/blog" replace />} />
          <Route path="/notes/new" element={<NoteEditor />} />
          <Route path="/notes/:slug" element={<NoteView />} />
          <Route path="/notes/:slug/edit" element={<NoteEditor />} />
          <Route path="/medqa" element={<MedqaDemo />} />
        </Routes>
      </Suspense>

      {/* Outside <Routes> on purpose: JARVIS belongs to the shell, not to any
          one page, so it survives navigation with its conversation intact
          instead of unmounting the moment you leave the home page. */}
      <ChatLauncher />
    </>
  );
}
