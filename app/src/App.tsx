import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
      </Routes>
    </Suspense>
  )
}
