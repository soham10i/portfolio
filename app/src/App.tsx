import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ProjectDetail from './pages/ProjectDetail'
import FactoryDemo from './pages/FactoryDemo'

// The two 3D viewers pull a runtime engine and a lot of geometry code; keep
// them out of the initial bundle so the home page still paints fast.
const FactoryTwin3D = lazy(() => import('./pages/FactoryTwin3D'))
const AutonomousRobot = lazy(() => import('./pages/AutonomousRobot'))

function ViewerFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0a0f1e]">
      <div className="h-[34px] w-[34px] animate-spin rounded-full border-2 border-white/10 border-t-cyan-300" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<ViewerFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
        <Route path="/factory" element={<FactoryDemo />} />
        <Route path="/factory-twin" element={<FactoryTwin3D />} />
        <Route path="/robot" element={<AutonomousRobot />} />
      </Routes>
    </Suspense>
  )
}
