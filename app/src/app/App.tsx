import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from '@/features/home/Home';
import ProjectDetail from '@/features/projects/ProjectDetail';
import FactoryDemo from '@/features/factory-twin/FactoryDemo';
import ChatLauncher from '@/features/chat/components/ChatLauncher';

/* The 3D viewers pull a runtime engine and a lot of geometry; the notes pages
   pull KaTeX and a Markdown parser. Neither belongs in the first paint, so
   every route below the first three is loaded on demand. */
const FactoryTwin3D = lazy(() => import('@/features/factory-twin/FactoryTwin3D'));
const AutonomousRobot = lazy(() => import('@/features/robot/AutonomousRobot'));
const SceneLab = lazy(() => import('@/features/scene-lab/SceneLab'));
const Notes = lazy(() => import('@/features/notes/Notes'));
const NoteView = lazy(() => import('@/features/notes/NoteView'));
const NoteEditor = lazy(() => import('@/features/notes/NoteEditor'));
const MedqaDemo = lazy(() => import('@/features/medqa/MedqaDemo'));

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
          <Route path="/" element={<Home />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/factory" element={<FactoryDemo />} />
          <Route path="/factory-twin" element={<FactoryTwin3D />} />
          <Route path="/robot" element={<AutonomousRobot />} />
          <Route path="/scene" element={<SceneLab />} />
          <Route path="/notes" element={<Notes />} />
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
